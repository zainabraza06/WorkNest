import { ClientProfile, Job, Offer } from '../models/index.js';
import { JOB_STATUS, OFFER_STATUS, ROLES } from '../constants/index.js';
import { ApiError } from '../utils/ApiError.js';
import { toPoint } from '../validators/common.js';
import { KM_TO_RADIANS, keywordRegexFilter, paginateAggregate } from '../utils/query.js';
import { suggestPrice } from '../services/ai.service.js';

const OPEN_STATUSES = [JOB_STATUS.POSTED, JOB_STATUS.NEGOTIATING];
const EDITABLE_STATUSES = OPEN_STATUSES;
const CANCELLABLE_STATUSES = [JOB_STATUS.POSTED, JOB_STATUS.NEGOTIATING, JOB_STATUS.CONFIRMED];

function toModelFields(body) {
  const { location, ...rest } = body;
  return location ? { ...rest, location: toPoint(location) } : rest;
}

async function getOwnedJob(jobId, userId) {
  const job = await Job.findById(jobId);
  if (!job) throw ApiError.notFound('Job not found');
  if (!job.client.equals(userId)) throw ApiError.forbidden('You can only manage your own jobs');
  return job;
}

export async function createJob(req, res) {
  const body = req.valid.body;

  // Best-effort fair-price snapshot stored with the job; null when the AI service is unavailable
  const suggested = await suggestPrice(body);

  const job = await Job.create({
    ...toModelFields(body),
    client: req.user._id,
    ...(suggested && {
      suggestedPrice: { min: suggested.min, max: suggested.max, median: suggested.median, source: suggested.source },
    }),
  });

  await ClientProfile.updateOne(
    { user: req.user._id },
    { $inc: { 'stats.jobsPosted': 1 }, $push: { jobHistory: job._id } },
  );

  res.status(201).json({ success: true, data: job });
}

export async function listJobs(req, res) {
  const { q, category, city, durationType, urgency, minBudget, maxBudget, lat, lng, radiusKm, sort, page, limit } =
    req.valid.query;

  const filter = { status: { $in: OPEN_STATUSES } };
  if (category?.length) filter.category = { $in: category };
  if (durationType?.length) filter.durationType = { $in: durationType };
  if (city) filter.city = city;
  if (urgency) filter.urgency = urgency;
  // Overlapping budget ranges: job.max >= minBudget and job.min <= maxBudget
  if (minBudget !== undefined) filter['budget.max'] = { $gte: minBudget };
  if (maxBudget !== undefined) filter['budget.min'] = { $lte: maxBudget };

  const hasGeo = lat !== undefined;
  const pipeline = [];

  if (sort === 'nearest') {
    // $geoNear must be the first stage and cannot be combined with $text, so keywords fall back to regex
    if (q) Object.assign(filter, keywordRegexFilter(q, ['title', 'description', 'skills']));
    pipeline.push({
      $geoNear: {
        near: { type: 'Point', coordinates: [lng, lat] },
        distanceField: 'distanceMeters',
        maxDistance: radiusKm * 1000,
        query: filter,
        spherical: true,
      },
    });
  } else {
    if (q) filter.$text = { $search: q };
    if (hasGeo) {
      filter.location = { $geoWithin: { $centerSphere: [[lng, lat], radiusKm * KM_TO_RADIANS] } };
    }
    pipeline.push({ $match: filter });
    if (q) pipeline.push({ $addFields: { relevance: { $meta: 'textScore' } } });

    const sorts = {
      newest: { createdAt: -1 },
      budget_high: { 'budget.max': -1, createdAt: -1 },
      budget_low: { 'budget.min': 1, createdAt: -1 },
      relevance: q ? { relevance: -1, createdAt: -1 } : { createdAt: -1 },
    };
    pipeline.push({ $sort: sorts[sort] });
  }

  pipeline.push(
    { $lookup: { from: 'users', localField: 'client', foreignField: '_id', as: 'client', pipeline: [{ $project: { name: 1, avatar: 1 } }] } },
    { $unwind: '$client' },
    { $project: { __v: 0, address: 0 } }, // exact address is only revealed on the job detail endpoint
  );

  const result = await paginateAggregate(Job, pipeline, { page, limit });
  for (const job of result.items) {
    if (job.distanceMeters !== undefined) {
      job.distanceKm = Math.round(job.distanceMeters / 100) / 10;
      delete job.distanceMeters;
    }
  }

  res.json({ success: true, data: result });
}

export async function listMyJobs(req, res) {
  const { status, page, limit } = req.valid.query;
  const filter = { client: req.user._id };
  if (status) filter.status = { $in: status.split(',') };

  const [items, total] = await Promise.all([
    Job.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('hiredWorker', 'name avatar'),
    Job.countDocuments(filter),
  ]);

  res.json({ success: true, data: { items, page, limit, total, totalPages: Math.ceil(total / limit) } });
}

export async function getJob(req, res) {
  const job = await Job.findById(req.valid.params.id)
    .populate('client', 'name avatar createdAt')
    .populate('hiredWorker', 'name avatar');
  if (!job) throw ApiError.notFound('Job not found');

  const data = job.toJSON();
  const viewer = req.user;
  const isOwner = viewer && job.client._id.equals(viewer._id);

  // Exact address is only visible to the owner and the hired worker
  const isHired = viewer && job.hiredWorker?._id.equals(viewer._id);
  if (!isOwner && !isHired) delete data.address;

  if (viewer?.role === ROLES.WORKER) {
    const myOffer = await Offer.findOne({ job: job._id, worker: viewer._id }).select('_id status');
    data.myOffer = myOffer;
  }

  res.json({ success: true, data });
}

export async function updateJob(req, res) {
  const job = await getOwnedJob(req.valid.params.id, req.user._id);
  if (!EDITABLE_STATUSES.includes(job.status)) {
    throw ApiError.conflict(`A job that is ${job.status.replace('_', ' ')} can no longer be edited`);
  }
  job.set(toModelFields(req.valid.body));
  await job.save();
  res.json({ success: true, data: job });
}

export async function cancelJob(req, res) {
  const job = await getOwnedJob(req.valid.params.id, req.user._id);
  if (!CANCELLABLE_STATUSES.includes(job.status)) {
    throw ApiError.conflict(`A job that is ${job.status.replace('_', ' ')} cannot be cancelled`);
  }
  if (job.booking) {
    throw ApiError.conflict('This job has a booking — cancel the booking instead');
  }

  job.status = JOB_STATUS.CANCELLED;
  await job.save();
  await Offer.updateMany(
    { job: job._id, status: OFFER_STATUS.PENDING },
    { status: OFFER_STATUS.CLOSED, lastActivityAt: new Date() },
  );

  res.json({ success: true, data: job });
}
