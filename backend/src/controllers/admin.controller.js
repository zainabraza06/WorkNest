/**
 * Read models for the admin console.
 *
 * The two things an admin can actually *do* — decide an ID verification and resolve a dispute —
 * already live with the resources they act on (workers, bookings). What was missing was any way
 * to find the items needing a decision, so this file is queues and a summary, nothing more.
 */
import { Booking, ClientProfile, Job, Payment, Review, User, WorkerProfile } from '../models/index.js';
import { BOOKING_STATUS, PAYMENT_STATUS, ROLES } from '../constants/index.js';
import { paginateAggregate } from '../utils/query.js';

const USER_LOOKUP = (as = 'user', localField = 'user') => [
  {
    $lookup: {
      from: 'users',
      localField,
      foreignField: '_id',
      as,
      pipeline: [{ $project: { name: 1, email: 1, avatar: 1, createdAt: 1 } }],
    },
  },
  { $unwind: `$${as}` },
];

/** Workers waiting on an ID decision, oldest submission first — a queue, not a list. */
export async function listVerifications(req, res) {
  const { status, page, limit } = req.valid.query;

  const pipeline = [
    { $match: { 'idVerification.status': status } },
    ...USER_LOOKUP(),
    {
      $project: {
        user: 1,
        headline: 1,
        city: 1,
        categories: 1,
        experienceYears: 1,
        trustScore: { score: 1, label: 1 },
        stats: { totalJobs: 1, completedJobs: 1, avgRating: 1, reviewCount: 1 },
        status: '$idVerification.status',
        submittedAt: '$idVerification.submittedAt',
        reviewedAt: '$idVerification.reviewedAt',
        hasDocument: { $gt: [{ $strLenCP: { $ifNull: ['$idVerification.document.publicId', ''] } }, 0] },
      },
    },
    { $sort: { submittedAt: 1, _id: 1 } },
  ];

  res.json({ success: true, data: await paginateAggregate(WorkerProfile, pipeline, { page, limit }) });
}

/**
 * Open disputes with the escrow amount attached, because the decision is about money and an
 * admin should not have to open each booking to see how much is held.
 */
export async function listDisputes(req, res) {
  const { page, limit } = req.valid.query;

  const pipeline = [
    { $match: { status: BOOKING_STATUS.DISPUTED } },
    ...USER_LOOKUP('worker', 'worker'),
    ...USER_LOOKUP('client', 'client'),
    {
      $lookup: {
        from: 'jobs',
        localField: 'job',
        foreignField: '_id',
        as: 'job',
        pipeline: [{ $project: { title: 1, category: 1, city: 1 } }],
      },
    },
    { $unwind: { path: '$job', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'payments',
        localField: 'payment',
        foreignField: '_id',
        as: 'payment',
        pipeline: [{ $project: { amount: 1, status: 1, heldAt: 1 } }],
      },
    },
    { $unwind: { path: '$payment', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        job: 1, worker: 1, client: 1, payment: 1,
        agreedPrice: 1, startDate: 1, endDate: 1, updatedAt: 1,
        // The dispute reason is the note on the entry that moved it to disputed
        reason: {
          $let: {
            vars: {
              entry: {
                $last: {
                  $filter: { input: '$timeline', as: 't', cond: { $eq: ['$$t.status', BOOKING_STATUS.DISPUTED] } },
                },
              },
            },
            in: { $ifNull: ['$$entry.note', null] },
          },
        },
        disputedAt: {
          $let: {
            vars: {
              entry: {
                $last: {
                  $filter: { input: '$timeline', as: 't', cond: { $eq: ['$$t.status', BOOKING_STATUS.DISPUTED] } },
                },
              },
            },
            in: { $ifNull: ['$$entry.at', '$updatedAt'] },
          },
        },
      },
    },
    { $sort: { disputedAt: 1, _id: 1 } },
  ];

  res.json({ success: true, data: await paginateAggregate(Booking, pipeline, { page, limit }) });
}

/**
 * Platform summary. Every number is a count or a sum over the collections — nothing here is
 * stored or cached, so it cannot drift from what the rest of the app reports.
 */
export async function getOverview(_req, res) {
  const [
    workers, clients, pendingVerifications, verifiedWorkers,
    jobsPosted, openJobs, bookings, activeBookings, disputes, reviews, escrow,
  ] = await Promise.all([
    User.countDocuments({ role: ROLES.WORKER }),
    User.countDocuments({ role: ROLES.CLIENT }),
    WorkerProfile.countDocuments({ 'idVerification.status': 'pending' }),
    WorkerProfile.countDocuments({ 'idVerification.status': 'verified' }),
    Job.countDocuments({}),
    Job.countDocuments({ status: { $in: ['posted', 'negotiating'] } }),
    Booking.countDocuments({}),
    Booking.countDocuments({ status: { $in: [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.IN_PROGRESS] } }),
    Booking.countDocuments({ status: BOOKING_STATUS.DISPUTED }),
    Review.countDocuments({}),
    Payment.aggregate([
      { $match: { status: PAYMENT_STATUS.HELD } },
      { $group: { _id: null, amount: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
  ]);

  res.json({
    success: true,
    data: {
      users: { workers, clients, profiles: await ClientProfile.countDocuments({}) },
      verification: { pending: pendingVerifications, verified: verifiedWorkers },
      jobs: { total: jobsPosted, open: openJobs },
      bookings: { total: bookings, active: activeBookings, disputed: disputes },
      reviews,
      escrow: { held: escrow[0]?.amount ?? 0, count: escrow[0]?.count ?? 0 },
    },
  });
}
