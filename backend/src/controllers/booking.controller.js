import { Booking, Job, Offer, Payment, WorkerProfile } from '../models/index.js';
import { BOOKING_STATUS, JOB_STATUS, OFFER_STATUS, PAYMENT_STATUS, PLATFORM_FEE_RATE, ROLES } from '../constants/index.js';
import { ApiError } from '../utils/ApiError.js';
import * as payments from '../services/payment.service.js';
import { notify } from '../services/notification.service.js';
import {
  applyIntentStatus,
  findPayment,
  notifyBooking,
  pushTimeline,
  recordCompletion,
  recordDispute,
  recordWorkerCancellation,
} from '../services/booking.service.js';

const REVEAL_CONTACT = [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.IN_PROGRESS, BOOKING_STATUS.COMPLETED, BOOKING_STATUS.DISPUTED];

async function loadParticipantBooking(id, user) {
  const booking = await Booking.findById(id);
  const role = booking?.worker.equals(user._id) ? ROLES.WORKER : booking?.client.equals(user._id) ? ROLES.CLIENT : null;
  if (!booking || (!role && user.role !== ROLES.ADMIN)) throw ApiError.notFound('Booking not found');
  return { booking, role };
}

function assertStatus(booking, allowed, action) {
  if (!allowed.includes(booking.status)) {
    throw ApiError.conflict(`Cannot ${action} a booking that is ${booking.status.replace('_', ' ')}`);
  }
}

async function respond(res, booking, role, status = 200) {
  await booking.populate([
    { path: 'job', select: 'title category city address location status' },
    { path: 'worker', select: 'name avatar phone email' },
    { path: 'client', select: 'name avatar phone email' },
  ]);
  const payment = await findPayment(booking);
  const data = { ...booking.toJSON(), payment, myRole: role };

  // Contact details and exact address are only revealed once the client has paid into escrow
  if (!REVEAL_CONTACT.includes(booking.status)) {
    for (const party of ['worker', 'client']) {
      if (data[party]) {
        delete data[party].phone;
        delete data[party].email;
      }
    }
    if (data.job) {
      delete data.job.address;
      delete data.job.location;
    }
  }
  res.status(status).json({ success: true, data });
}

export async function listBookings(req, res) {
  const { status, page, limit } = req.valid.query;
  const filter = req.user.role === ROLES.WORKER ? { worker: req.user._id } : { client: req.user._id };
  if (status?.length) filter.status = { $in: status };

  const [items, total] = await Promise.all([
    Booking.find(filter)
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate([
        { path: 'job', select: 'title category city' },
        { path: 'worker', select: 'name avatar' },
        { path: 'client', select: 'name avatar' },
      ]),
    Booking.countDocuments(filter),
  ]);
  res.json({ success: true, data: { items, page, limit, total, totalPages: Math.ceil(total / limit) } });
}

export async function getBooking(req, res) {
  const { booking, role } = await loadParticipantBooking(req.valid.params.id, req.user);
  await respond(res, booking, role);
}

/** Client starts (or resumes) paying into escrow. Returns a Stripe client secret for Stripe Elements. */
export async function createPayment(req, res) {
  const { booking, role } = await loadParticipantBooking(req.valid.params.id, req.user);
  if (role !== ROLES.CLIENT) throw ApiError.forbidden('Only the client pays for a booking');
  assertStatus(booking, [BOOKING_STATUS.PENDING_PAYMENT], 'pay for');

  let payment = await findPayment(booking);
  if (!payment) {
    const platformFee = Math.round(booking.agreedPrice * PLATFORM_FEE_RATE);
    payment = await Payment.create({
      booking: booking._id,
      client: booking.client,
      worker: booking.worker,
      amount: booking.agreedPrice,
      platformFee,
      workerPayout: booking.agreedPrice - platformFee,
    });
    booking.payment = payment._id;
    await booking.save();
  }

  let intent = payment.providerPaymentId ? await payments.retrieveIntent(payment.providerPaymentId) : null;
  const reusable = intent && ['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(intent.status);

  if (intent?.status === 'requires_capture') {
    await applyIntentStatus(payment, intent);
    throw ApiError.conflict('This booking is already paid and held in escrow');
  }
  if (!reusable) {
    intent = await payments.createEscrowIntent({
      amount: payment.amount,
      bookingId: booking._id,
      clientId: booking.client,
      workerId: booking.worker,
    });
    payment.providerPaymentId = intent.id;
    payment.status = PAYMENT_STATUS.REQUIRES_PAYMENT;
    await payment.save();
  }

  res.json({
    success: true,
    data: {
      clientSecret: intent.client_secret,
      amount: payment.amount,
      platformFee: payment.platformFee,
      currency: payment.currency,
    },
  });
}

/** Pulls the latest PaymentIntent status from Stripe — lets local dev work without the webhook CLI. */
export async function syncPayment(req, res) {
  const { booking, role } = await loadParticipantBooking(req.valid.params.id, req.user);
  const payment = await findPayment(booking);
  if (!payment?.providerPaymentId) throw ApiError.notFound('No payment started for this booking');

  const intent = await payments.retrieveIntent(payment.providerPaymentId);
  const { booking: updated } = await applyIntentStatus(payment, intent);
  await respond(res, updated ?? booking, role);
}

export async function startBooking(req, res) {
  const { booking, role } = await loadParticipantBooking(req.valid.params.id, req.user);
  if (role !== ROLES.WORKER) throw ApiError.forbidden('Only the hired worker can start the job');
  assertStatus(booking, [BOOKING_STATUS.CONFIRMED], 'start');

  pushTimeline(booking, BOOKING_STATUS.IN_PROGRESS, req.user._id, 'Worker started the job');
  booking.startedAt = new Date();
  await booking.save();
  await Job.updateOne({ _id: booking.job }, { status: JOB_STATUS.IN_PROGRESS });

  notifyBooking(booking);
  await respond(res, booking, role);
}

/** Client confirms the work is done → escrow is captured and released to the worker. */
export async function completeBooking(req, res) {
  const { booking, role } = await loadParticipantBooking(req.valid.params.id, req.user);
  if (role !== ROLES.CLIENT) throw ApiError.forbidden('Only the client can confirm the job is complete');
  assertStatus(booking, [BOOKING_STATUS.IN_PROGRESS], 'complete');

  const payment = await findPayment(booking);
  if (payment?.status !== PAYMENT_STATUS.HELD) throw ApiError.conflict('No escrow payment is held for this booking');

  const intent = await payments.captureIntent(payment.providerPaymentId);
  payment.status = PAYMENT_STATUS.RELEASED;
  payment.releasedAt = new Date();
  await payment.save();
  if (intent.status !== 'succeeded') console.warn(`Capture for ${intent.id} returned status ${intent.status}`);

  pushTimeline(booking, BOOKING_STATUS.COMPLETED, req.user._id, 'Client confirmed completion; payment released');
  booking.completedAt = new Date();
  await booking.save();
  await recordCompletion(booking);

  notifyBooking(booking);
  await respond(res, booking, role);
}

/**
 * Void any money still on the hook and close the booking.
 *
 * Shared by the unilateral cancel (before work starts) and an agreed cancellation of work in
 * progress, so the money is released identically whichever route got here. Nothing was ever
 * captured -- escrow holds an authorisation -- so this voids it rather than reversing a charge.
 */
async function refundAndClose(booking, { by, byRole, reason }) {
  const payment = await findPayment(booking);
  if (payment?.providerPaymentId && [PAYMENT_STATUS.HELD, PAYMENT_STATUS.REQUIRES_PAYMENT, PAYMENT_STATUS.FAILED].includes(payment.status)) {
    await payments.cancelIntent(payment.providerPaymentId);
    const wasHeld = payment.status === PAYMENT_STATUS.HELD;
    payment.status = wasHeld ? PAYMENT_STATUS.REFUNDED : PAYMENT_STATUS.CANCELLED;
    if (wasHeld) payment.refundedAt = new Date();
    await payment.save();
  }

  const wasCommitted = [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.IN_PROGRESS].includes(booking.status);
  pushTimeline(booking, BOOKING_STATUS.CANCELLED, by, reason);
  booking.cancelledAt = new Date();
  booking.cancellationReason = reason;
  await booking.save();

  if (byRole === ROLES.WORKER) {
    // The worker backed out: reopen the job so the client can hire someone else
    if (wasCommitted) await recordWorkerCancellation(booking);
    await Offer.updateOne({ _id: booking.offer }, { status: OFFER_STATUS.WITHDRAWN });
    await Offer.updateMany({ job: booking.job, status: OFFER_STATUS.CLOSED }, { status: OFFER_STATUS.PENDING, awaitingRole: ROLES.CLIENT });
    const reopened = await Offer.exists({ job: booking.job, status: OFFER_STATUS.PENDING });
    await Job.updateOne(
      { _id: booking.job },
      { status: reopened ? JOB_STATUS.NEGOTIATING : JOB_STATUS.POSTED, $unset: { hiredWorker: 1, booking: 1 } },
    );
  } else {
    await Job.updateOne({ _id: booking.job }, { status: JOB_STATUS.CANCELLED });
  }

  notifyBooking(booking);
}

export async function cancelBooking(req, res) {
  const { booking, role } = await loadParticipantBooking(req.valid.params.id, req.user);
  // Once work is under way the other side has committed time or money, so it takes both of
  // them to call it off -- see requestCancellation.
  assertStatus(booking, [BOOKING_STATUS.PENDING_PAYMENT, BOOKING_STATUS.CONFIRMED], 'cancel');

  await refundAndClose(booking, { by: req.user._id, byRole: role, reason: req.valid.body.reason });
  await respond(res, booking, role);
}

/**
 * Ask the other party to call off work that has already started.
 *
 * Neither side may simply walk away at this point: the worker may have travelled and bought
 * materials, and the client's money is held against a job they expect done. So this is a
 * request, and the answer to it decides what happens to the money.
 */
export async function requestCancellation(req, res) {
  const { booking, role } = await loadParticipantBooking(req.valid.params.id, req.user);
  assertStatus(booking, [BOOKING_STATUS.IN_PROGRESS], 'request cancellation of');
  if (booking.cancellationRequest?.status === 'pending') {
    throw ApiError.conflict('A cancellation request is already waiting for an answer');
  }

  const { reason } = req.valid.body;
  booking.cancellationRequest = { by: req.user._id, byRole: role, reason, status: 'pending', requestedAt: new Date() };
  pushTimeline(booking, BOOKING_STATUS.IN_PROGRESS, req.user._id, `Cancellation requested: ${reason}`);
  await booking.save();

  notifyBooking(booking);
  await notify(role === ROLES.WORKER ? booking.client : booking.worker, {
    type: 'cancellation_requested',
    title: `${req.user.name} asked to cancel this booking`,
    body: reason,
    link: `/bookings/${booking._id}`,
  });

  await respond(res, booking, role);
}

/**
 * Answer a cancellation request.
 *
 * Accepting refunds the client in full and closes the booking. Declining does not force the
 * work to continue -- it moves the booking to a dispute, where an admin decides who the held
 * money belongs to. That is what holding it was for.
 */
export async function respondToCancellation(req, res) {
  const { booking, role } = await loadParticipantBooking(req.valid.params.id, req.user);
  assertStatus(booking, [BOOKING_STATUS.IN_PROGRESS], 'respond to a cancellation on');

  const request = booking.cancellationRequest;
  if (request?.status !== 'pending') throw ApiError.conflict('There is no cancellation request to answer');
  if (request.by.equals(req.user._id)) throw ApiError.forbidden('The other party has to answer your request');

  const { accept, reason } = req.valid.body;
  booking.cancellationRequest.status = accept ? 'accepted' : 'declined';
  booking.cancellationRequest.respondedAt = new Date();
  if (!accept) booking.cancellationRequest.declineReason = reason;

  if (accept) {
    // Cancelled by agreement, but attributed to whoever asked -- it was their doing
    await refundAndClose(booking, {
      by: req.user._id,
      byRole: request.byRole,
      reason: `Cancellation agreed: ${request.reason}`,
    });
  } else {
    pushTimeline(booking, BOOKING_STATUS.DISPUTED, req.user._id, reason ?? 'Cancellation request declined');
    await booking.save();
    await recordDispute(booking);
    notifyBooking(booking);
  }

  await notify(request.by, {
    type: accept ? 'cancellation_accepted' : 'cancellation_declined',
    title: accept ? 'Your cancellation was accepted' : 'Your cancellation request was declined',
    body: accept
      ? 'The booking is cancelled and the payment has been returned to the client.'
      : 'The booking is now in dispute -- an admin will decide what happens to the payment.',
    link: `/bookings/${booking._id}`,
  });

  await respond(res, booking, role);
}

export async function disputeBooking(req, res) {
  const { booking, role } = await loadParticipantBooking(req.valid.params.id, req.user);
  if (role !== ROLES.CLIENT) throw ApiError.forbidden('Only the client can open a dispute');
  assertStatus(booking, [BOOKING_STATUS.IN_PROGRESS], 'dispute');

  pushTimeline(booking, BOOKING_STATUS.DISPUTED, req.user._id, req.valid.body.reason);
  await booking.save();
  await recordDispute(booking);

  notifyBooking(booking);
  await respond(res, booking, role);
}

/** Admin resolves a dispute by releasing funds to the worker or refunding the client. */
export async function resolveDispute(req, res) {
  const { booking } = await loadParticipantBooking(req.valid.params.id, req.user);
  assertStatus(booking, [BOOKING_STATUS.DISPUTED], 'resolve');
  const { outcome, note } = req.valid.body;
  const payment = await findPayment(booking);

  if (payment?.status === PAYMENT_STATUS.HELD) {
    if (outcome === 'release') {
      await payments.captureIntent(payment.providerPaymentId);
      Object.assign(payment, { status: PAYMENT_STATUS.RELEASED, releasedAt: new Date() });
    } else {
      await payments.cancelIntent(payment.providerPaymentId);
      Object.assign(payment, { status: PAYMENT_STATUS.REFUNDED, refundedAt: new Date() });
    }
    await payment.save();
  }

  if (outcome === 'release') {
    pushTimeline(booking, BOOKING_STATUS.COMPLETED, req.user._id, note ?? 'Dispute resolved in favour of worker');
    booking.completedAt = new Date();
    await booking.save();
    await recordCompletion(booking);
  } else {
    pushTimeline(booking, BOOKING_STATUS.CANCELLED, req.user._id, note ?? 'Dispute resolved in favour of client');
    booking.cancelledAt = new Date();
    await booking.save();
    await WorkerProfile.updateOne({ user: booking.worker }, { $inc: { 'stats.totalJobs': 1, 'stats.cancelledJobs': 1 } });
    await Job.updateOne({ _id: booking.job }, { status: JOB_STATUS.CANCELLED });
  }

  notifyBooking(booking);
  await respond(res, booking, null);
}

/** Stripe → us. Mounted with express.raw() so the signature can be verified. */
export async function stripeWebhook(req, res) {
  const event = payments.constructWebhookEvent(req.body, req.headers['stripe-signature']);
  const intent = event.data?.object;

  if (event.type.startsWith('payment_intent.') && intent?.id) {
    const payment = await Payment.findOne({ providerPaymentId: intent.id });
    if (payment) await applyIntentStatus(payment, intent);
  }
  res.json({ received: true });
}
