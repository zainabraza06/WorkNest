import mongoose from 'mongoose';

import { Booking, ClientProfile, Job, Review, WorkerProfile } from '../models/index.js';
import { BOOKING_STATUS, JOB_STATUS, ROLES } from '../constants/index.js';
import { emitToUser } from '../socket/index.js';
import { refreshTrustScore } from '../services/trust.service.js';
import { ApiError } from '../utils/ApiError.js';

async function recomputeRatingStats(userId) {
  const [agg] = await Review.aggregate([
    { $match: { to: new mongoose.Types.ObjectId(String(userId)) } },
    { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  return { avgRating: agg ? Math.round(agg.avg * 10) / 10 : 0, reviewCount: agg?.count ?? 0 };
}

export async function createReview(req, res) {
  const booking = await Booking.findById(req.valid.params.id);
  const role = booking?.worker.equals(req.user._id) ? ROLES.WORKER : booking?.client.equals(req.user._id) ? ROLES.CLIENT : null;
  if (!booking || !role) throw ApiError.notFound('Booking not found');
  if (booking.status !== BOOKING_STATUS.COMPLETED) throw ApiError.conflict('You can only review a completed booking');

  const flag = role === ROLES.CLIENT ? 'byClient' : 'byWorker';
  if (booking.reviewed[flag]) throw ApiError.conflict('You have already reviewed this booking');

  const to = role === ROLES.CLIENT ? booking.worker : booking.client;
  const review = await Review.create({ ...req.valid.body, booking: booking._id, job: booking.job, from: req.user._id, to, fromRole: role });

  booking.reviewed[flag] = true;
  await booking.save();

  const stats = await recomputeRatingStats(to);
  if (role === ROLES.CLIENT) {
    await WorkerProfile.updateOne({ user: to }, { 'stats.avgRating': stats.avgRating, 'stats.reviewCount': stats.reviewCount });
    await refreshTrustScore(to);
  } else {
    await ClientProfile.updateOne({ user: to }, { 'stats.avgRating': stats.avgRating, 'stats.reviewCount': stats.reviewCount });
  }

  if (booking.reviewed.byClient && booking.reviewed.byWorker) {
    await Job.updateOne({ _id: booking.job, status: JOB_STATUS.COMPLETED }, { status: JOB_STATUS.REVIEWED });
  }

  await review.populate('from', 'name avatar');
  emitToUser(to, 'review:new', review);
  res.status(201).json({ success: true, data: review });
}

export async function listUserReviews(req, res) {
  const { userId } = req.valid.params;
  const { page, limit } = req.valid.query;
  const filter = { to: userId };

  const [items, total, stats] = await Promise.all([
    Review.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('from', 'name avatar')
      .populate('job', 'title category'),
    Review.countDocuments(filter),
    recomputeRatingStats(userId),
  ]);

  res.json({ success: true, data: { items, page, limit, total, totalPages: Math.ceil(total / limit), ...stats } });
}
