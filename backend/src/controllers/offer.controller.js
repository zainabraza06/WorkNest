import mongoose from 'mongoose';

import { Booking, Job, Message, Offer, WorkerProfile } from '../models/index.js';
import { BOOKING_STATUS, JOB_STATUS, OFFER_STATUS, ROLES } from '../constants/index.js';
import { emitToOffer, emitToUser } from '../socket/index.js';
import { OFFER_POPULATE, postMessage } from '../services/negotiation.service.js';
import { ApiError } from '../utils/ApiError.js';
import { computeEndDate } from '../utils/dates.js';
import { recordHire } from '../services/ranking.service.js';

const OPEN_JOB = [JOB_STATUS.POSTED, JOB_STATUS.NEGOTIATING];
const POPULATE = OFFER_POPULATE;

const other = (role) => (role === ROLES.WORKER ? ROLES.CLIENT : ROLES.WORKER);

async function loadParticipantOffer(offerId, user) {
  const offer = await Offer.findById(offerId);
  if (!offer) throw ApiError.notFound('Negotiation not found');
  const role = offer.worker.equals(user._id) ? ROLES.WORKER : offer.client.equals(user._id) ? ROLES.CLIENT : null;
  // 404 rather than 403 so thread ids can't be probed
  if (!role) throw ApiError.notFound('Negotiation not found');
  return { offer, role };
}

function assertMyTurn(offer, role) {
  if (offer.status !== OFFER_STATUS.PENDING) {
    throw ApiError.conflict(`This negotiation is already ${offer.status}`);
  }
  if (offer.awaitingRole !== role) {
    throw ApiError.conflict('Waiting for the other party to respond to your latest offer');
  }
}

function notifyBoth(offer, event, payload = offer) {
  emitToUser(offer.worker, event, payload);
  emitToUser(offer.client, event, payload);
}

/** Exponential moving average of how quickly a worker responds to client moves (feeds Trust Score). */
async function trackWorkerResponse(offer, role) {
  if (role !== ROLES.WORKER) return;
  const previous = offer.rounds.at(-1);
  if (previous?.byRole !== ROLES.CLIENT) return;
  const minutes = Math.max(0, (Date.now() - previous.createdAt.getTime()) / 60_000);
  const profile = await WorkerProfile.findOne({ user: offer.worker }).select('stats.avgResponseMinutes');
  if (!profile) return;
  const old = profile.stats.avgResponseMinutes;
  profile.stats.avgResponseMinutes = Math.round(old == null ? minutes : old * 0.8 + minutes * 0.2);
  await profile.save();
}

/** After an offer leaves "pending", a job with no remaining live offers drops back to "posted". */
async function refreshJobNegotiationState(jobId) {
  const pending = await Offer.exists({ job: jobId, status: OFFER_STATUS.PENDING });
  if (!pending) await Job.updateOne({ _id: jobId, status: JOB_STATUS.NEGOTIATING }, { status: JOB_STATUS.POSTED });
}

export async function createOffer(req, res) {
  const job = await Job.findById(req.valid.params.id);
  if (!job) throw ApiError.notFound('Job not found');
  if (!OPEN_JOB.includes(job.status)) throw ApiError.conflict('This job is no longer accepting offers');
  // A direct hire is a private request to one person; nobody else may bid their way into it
  if (job.invitedWorker && !job.invitedWorker.equals(req.user._id)) {
    throw ApiError.forbidden('This job was sent directly to another worker');
  }
  if (!(await WorkerProfile.exists({ user: req.user._id }))) {
    throw ApiError.badRequest('Create your worker profile before sending offers');
  }
  if (await Offer.exists({ job: job._id, worker: req.user._id })) {
    throw ApiError.conflict('You have already sent an offer for this job');
  }

  const { amount, durationType, durationCount, startDate, terms, coverNote } = req.valid.body;
  const offer = await Offer.create({
    job: job._id,
    worker: req.user._id,
    client: job.client,
    coverNote,
    awaitingRole: ROLES.CLIENT,
    rounds: [
      {
        by: req.user._id,
        byRole: ROLES.WORKER,
        amount,
        durationType: durationType ?? job.durationType,
        durationCount: durationCount ?? job.durationCount,
        startDate: startDate ?? job.startDate,
        terms,
      },
    ],
  });

  await Job.updateOne({ _id: job._id }, { $inc: { offersCount: 1 } });
  await Job.updateOne({ _id: job._id, status: JOB_STATUS.POSTED }, { status: JOB_STATUS.NEGOTIATING });

  await postMessage(offer, { sender: req.user._id, type: 'offer', text: coverNote, roundId: offer.rounds[0]._id });
  await offer.populate(POPULATE);
  emitToUser(job.client, 'offer:new', offer);

  res.status(201).json({ success: true, data: offer });
}

export async function listOffers(req, res) {
  const { job, status, page, limit } = req.valid.query;
  const me = req.user._id;
  const filter = req.user.role === ROLES.WORKER ? { worker: me } : { client: me };
  if (job) filter.job = job;
  if (status?.length) filter.status = { $in: status };

  const [items, total] = await Promise.all([
    Offer.find(filter).sort({ lastActivityAt: -1 }).skip((page - 1) * limit).limit(limit).populate(POPULATE),
    Offer.countDocuments(filter),
  ]);

  const offerIds = items.map((o) => o._id);
  const workerIds = items.map((o) => o.worker._id);
  const [unread, profiles] = await Promise.all([
    Message.aggregate([
      { $match: { offer: { $in: offerIds }, sender: { $ne: me }, readBy: { $ne: me } } },
      { $group: { _id: '$offer', count: { $sum: 1 } } },
    ]),
    WorkerProfile.find({ user: { $in: workerIds } }).select('user headline trustScore.score trustScore.label stats.avgRating stats.reviewCount idVerification.status'),
  ]);
  const unreadBy = new Map(unread.map((u) => [u._id.toString(), u.count]));
  const profileBy = new Map(profiles.map((p) => [p.user.toString(), p]));

  const data = items.map((o) => {
    const p = profileBy.get(o.worker._id.toString());
    return {
      ...o.toJSON(),
      unreadCount: unreadBy.get(o._id.toString()) ?? 0,
      workerSummary: p && {
        headline: p.headline,
        trustScore: p.trustScore?.score,
        avgRating: p.stats.avgRating,
        reviewCount: p.stats.reviewCount,
        idVerified: p.idVerification?.status === 'verified',
      },
    };
  });

  res.json({ success: true, data: { items: data, page, limit, total, totalPages: Math.ceil(total / limit) } });
}

export async function getOffer(req, res) {
  const { offer, role } = await loadParticipantOffer(req.valid.params.id, req.user);
  await offer.populate(POPULATE);

  const [profile, booking] = await Promise.all([
    WorkerProfile.findOne({ user: offer.worker._id }).select('headline rates trustScore stats idVerification.status city'),
    offer.status === OFFER_STATUS.ACCEPTED ? Booking.findOne({ offer: offer._id }).select('status agreedPrice startDate endDate') : null,
  ]);

  res.json({
    success: true,
    data: {
      ...offer.toJSON(),
      myRole: role,
      isMyTurn: offer.status === OFFER_STATUS.PENDING && offer.awaitingRole === role,
      workerSummary: profile && {
        headline: profile.headline,
        rates: profile.rates,
        city: profile.city,
        trustScore: profile.trustScore?.score,
        trustLabel: profile.trustScore?.label,
        avgRating: profile.stats.avgRating,
        reviewCount: profile.stats.reviewCount,
        completedJobs: profile.stats.completedJobs,
        idVerified: profile.idVerification?.status === 'verified',
      },
      booking,
    },
  });
}

export async function counterOffer(req, res) {
  const { offer, role } = await loadParticipantOffer(req.valid.params.id, req.user);
  assertMyTurn(offer, role);

  const job = await Job.findById(offer.job).select('status');
  if (!OPEN_JOB.includes(job?.status)) throw ApiError.conflict('This job is no longer open for negotiation');
  if (offer.rounds.length >= 20) throw ApiError.conflict('Negotiation round limit reached — accept or decline the current offer');

  const last = offer.rounds.at(-1);
  const { amount, durationCount, startDate, terms, message } = req.valid.body;

  await trackWorkerResponse(offer, role);
  offer.rounds.push({
    by: req.user._id,
    byRole: role,
    amount,
    durationType: last.durationType,
    durationCount: durationCount ?? last.durationCount,
    startDate: startDate ?? last.startDate,
    terms: terms ?? last.terms,
  });
  offer.awaitingRole = other(role);
  offer.lastActivityAt = new Date();
  await offer.save();

  await postMessage(offer, { sender: req.user._id, type: 'offer', text: message, roundId: offer.rounds.at(-1)._id });
  await offer.populate(POPULATE);
  notifyBoth(offer, 'offer:updated');

  res.json({ success: true, data: offer });
}

export async function acceptOffer(req, res) {
  const { offer, role } = await loadParticipantOffer(req.valid.params.id, req.user);
  assertMyTurn(offer, role);
  const round = offer.rounds.at(-1);

  // Atomic guards instead of a transaction: only one accept can win the offer, and only one offer can win the job
  const claimed = await Offer.findOneAndUpdate(
    { _id: offer._id, status: OFFER_STATUS.PENDING, awaitingRole: role },
    { $set: { status: OFFER_STATUS.ACCEPTED, acceptedRound: round._id, lastActivityAt: new Date() }, $unset: { awaitingRole: 1 } },
    { returnDocument: 'after' },
  );
  if (!claimed) throw ApiError.conflict('This offer changed while you were viewing it — please refresh');

  const job = await Job.findOneAndUpdate(
    { _id: offer.job, status: { $in: OPEN_JOB } },
    { status: JOB_STATUS.CONFIRMED, hiredWorker: offer.worker },
    { returnDocument: 'after' },
  );
  if (!job) {
    await Offer.updateOne({ _id: offer._id }, { $set: { status: OFFER_STATUS.PENDING, awaitingRole: role }, $unset: { acceptedRound: 1 } });
    throw ApiError.conflict('This job is no longer open — someone else may already have been hired');
  }

  await trackWorkerResponse(offer, role);

  const booking = await Booking.create({
    job: job._id,
    offer: offer._id,
    worker: offer.worker,
    client: offer.client,
    agreedPrice: round.amount,
    durationType: round.durationType,
    durationCount: round.durationCount,
    startDate: round.startDate,
    endDate: computeEndDate(round.startDate, round.durationType, round.durationCount),
    terms: round.terms,
    status: BOOKING_STATUS.PENDING_PAYMENT,
    timeline: [{ status: BOOKING_STATUS.PENDING_PAYMENT, by: req.user._id, note: 'Offer accepted' }],
  });
  job.booking = booking._id;
  await job.save();

  // Label any recent search that showed this worker to this client
  await recordHire({ clientId: offer.client, workerId: offer.worker });

  // Close every other live offer on this job and let those workers know
  const losers = await Offer.find({ job: job._id, _id: { $ne: offer._id }, status: OFFER_STATUS.PENDING }).select('_id worker');
  if (losers.length) {
    await Offer.updateMany({ _id: { $in: losers.map((l) => l._id) } }, { status: OFFER_STATUS.CLOSED, lastActivityAt: new Date() });
    for (const l of losers) {
      await postMessage({ _id: l._id, job: job._id }, { type: 'system', text: 'The client hired another worker for this job.' });
      emitToUser(l.worker, 'offer:updated', { _id: l._id, status: OFFER_STATUS.CLOSED });
    }
  }

  await postMessage(claimed, {
    type: 'system',
    text: `Offer of Rs ${round.amount.toLocaleString('en-PK')} accepted. The client now pays into escrow to confirm the booking.`,
  });
  await claimed.populate(POPULATE);
  notifyBoth(claimed, 'offer:updated');
  notifyBoth(claimed, 'booking:updated', booking);

  res.json({ success: true, data: { offer: claimed, booking } });
}

async function closeWithStatus(req, res, { status, allowedRole, requireTurn, systemText }) {
  const { offer, role } = await loadParticipantOffer(req.valid.params.id, req.user);
  if (allowedRole && role !== allowedRole) throw ApiError.forbidden();
  if (requireTurn) assertMyTurn(offer, role);
  else if (offer.status !== OFFER_STATUS.PENDING) throw ApiError.conflict(`This negotiation is already ${offer.status}`);

  offer.status = status;
  offer.awaitingRole = undefined;
  offer.lastActivityAt = new Date();
  await offer.save();

  await refreshJobNegotiationState(offer.job);
  const reason = req.valid.body?.reason;
  await postMessage(offer, { type: 'system', text: reason ? `${systemText} Reason: ${reason}` : systemText });
  await offer.populate(POPULATE);
  notifyBoth(offer, 'offer:updated');

  res.json({ success: true, data: offer });
}

export const rejectOffer = (req, res) =>
  closeWithStatus(req, res, {
    status: OFFER_STATUS.REJECTED,
    requireTurn: true,
    systemText: `${req.user.role === ROLES.WORKER ? 'The worker' : 'The client'} declined the offer.`,
  });

export const withdrawOffer = (req, res) =>
  closeWithStatus(req, res, { status: OFFER_STATUS.WITHDRAWN, allowedRole: ROLES.WORKER, systemText: 'The worker withdrew their offer.' });

export async function listMessages(req, res) {
  const { offer } = await loadParticipantOffer(req.valid.params.id, req.user);
  const { before, limit } = req.valid.query;
  const filter = { offer: offer._id, ...(before && { createdAt: { $lt: before } }) };

  const newestFirst = await Message.find(filter).sort({ createdAt: -1 }).limit(limit + 1);
  const hasMore = newestFirst.length > limit;
  res.json({ success: true, data: { items: newestFirst.slice(0, limit).reverse(), hasMore } });
}

export async function sendMessage(req, res) {
  const { offer } = await loadParticipantOffer(req.valid.params.id, req.user);
  if ([OFFER_STATUS.CLOSED, OFFER_STATUS.WITHDRAWN, OFFER_STATUS.REJECTED].includes(offer.status)) {
    throw ApiError.conflict('This conversation is closed');
  }
  const message = await postMessage(offer, { sender: req.user._id, type: 'text', text: req.valid.body.text });
  await Offer.updateOne({ _id: offer._id }, { lastActivityAt: new Date() });

  const recipient = offer.worker.equals(req.user._id) ? offer.client : offer.worker;
  emitToUser(recipient, 'thread:activity', { offerId: offer._id, message });

  res.status(201).json({ success: true, data: message });
}

export async function markRead(req, res) {
  const { offer } = await loadParticipantOffer(req.valid.params.id, req.user);
  const me = new mongoose.Types.ObjectId(String(req.user._id));
  const { modifiedCount } = await Message.updateMany(
    { offer: offer._id, sender: { $ne: me }, readBy: { $ne: me } },
    { $addToSet: { readBy: me } },
  );
  if (modifiedCount) emitToOffer(offer._id, 'thread:read', { offerId: offer._id, userId: req.user._id });
  res.json({ success: true, data: { marked: modifiedCount } });
}
