/**
 * Back-fills the work history that each seeded worker's counters claim.
 *
 * The counters on a seeded profile (46 jobs, 44 completed, 11 repeat hires, 38 reviews at 4.8)
 * used to be bare numbers with nothing behind them, so a profile could advertise 38 reviews
 * and display exactly one. Worse, the app recomputes a rating from the Review collection
 * whenever someone posts a review — so the first real review would have collapsed 38 to 2.
 *
 * Every counter now has documents behind it:
 *
 *   totalJobs      = completed + cancelled bookings generated here
 *   completedJobs  = bookings with status completed
 *   cancelledJobs  = bookings with status cancelled
 *   repeatHires    = completed bookings whose client had hired this worker before
 *   reviewCount    = Review documents, and avgRating is recomputed from their ratings
 *
 * The one counter still asserted rather than derived is `disputes`: it is a lifetime tally,
 * and a resolved dispute leaves a booking looking completed, so there is nothing distinct to
 * generate. It is noted here rather than quietly ignored.
 */
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

import { Booking, Job, Offer, Review, User, WorkerProfile } from '../models/index.js';
import { BOOKING_STATUS, JOB_STATUS, OFFER_STATUS, ROLES } from '../constants/index.js';
import { computeEndDate } from '../utils/dates.js';

const DAY = 86_400_000;
const oid = () => new mongoose.Types.ObjectId();
const pick = (arr, i) => arr[Math.abs(i) % arr.length];

const FIRST_NAMES = [
  'Sadia', 'Kamran', 'Nadia', 'Faisal', 'Rabia', 'Tariq', 'Mehwish', 'Shahid', 'Uzma', 'Asif',
  'Sobia', 'Junaid', 'Nasreen', 'Waqas', 'Amna', 'Rizwan', 'Saima', 'Adnan', 'Farah', 'Imtiaz',
  'Lubna', 'Salman', 'Kiran', 'Arif', 'Hina', 'Zubair', 'Ayesha', 'Nauman', 'Sania', 'Khalid',
];
const LAST_NAMES = [
  'Noor', 'Sheikh', 'Iqbal', 'Mahmood', 'Aslam', 'Javed', 'Anwar', 'Nawaz', 'Riaz', 'Kamal',
  'Farooq', 'Akhtar', 'Siddiqui', 'Qureshi', 'Pervez', 'Bashir', 'Zafar', 'Rafiq', 'Sultan', 'Hussain',
];

/** Enough distinct past clients that repeat hires are a deliberate choice, not a collision. */
const PAST_CLIENT_COUNT = 60;
const PAST_CLIENT_PASSWORD = 'Password123';

/**
 * Ratings whose mean reproduces `avg` to the one decimal place the profile displays.
 *
 * A worker averaging 4.8 must be mostly fives — that lopsidedness is the honest distribution,
 * and scattering ones and twos around it would contradict the average it has to hit. Pairs are
 * split where there is headroom ((4,4) -> (3,5)) so the histogram isn't just two bars.
 */
export function ratingsFor(n, avg) {
  const target = Math.round(avg * n);
  const base = Math.max(1, Math.min(5, Math.floor(target / n)));
  const promoted = Math.max(0, Math.min(n, target - base * n));
  const ratings = Array.from({ length: n }, (_, i) => (i < promoted ? Math.min(5, base + 1) : base));

  for (let k = 0; k < Math.floor(n * 0.12); k++) {
    const lo = ratings.indexOf(base);
    const hi = ratings.lastIndexOf(base);
    if (lo === -1 || lo === hi || base - 1 < 1 || base + 1 > 5) break;
    ratings[lo] = base - 1;
    ratings[hi] = base + 1;
  }

  // Deterministic shuffle — the same seed run twice produces the same history
  for (let i = ratings.length - 1; i > 0; i--) {
    const j = (i * 7 + 3) % (i + 1);
    [ratings[i], ratings[j]] = [ratings[j], ratings[i]];
  }
  return ratings;
}

const REVIEW_TEXT = {
  5: [
    'Arrived on time, worked cleanly and finished the same day. Would hire again.',
    'Knew exactly what the problem was within minutes. Fair price, no surprises.',
    'Very professional and tidy. Explained everything before starting.',
    'Excellent work and polite throughout. Highly recommended.',
    'Came on short notice and sorted it out properly. Very satisfied.',
    'Second time hiring and the standard has not slipped.',
  ],
  4: [
    'Good work overall. Arrived a little late but finished properly.',
    'Job done well. Had to remind him about the second item, otherwise fine.',
    'Solid work and a reasonable rate. Cleanup could have been better.',
    'Happy with the result. Communication could be a bit quicker.',
  ],
  3: [
    'Work was acceptable but took longer than agreed.',
    'Did the job, though I had to follow up twice about the finishing.',
    'Average experience — the repair holds but the area was left messy.',
  ],
  2: ['Work felt rushed and I had to call someone else for the finishing.'],
  1: ['Did not complete the work as agreed.'],
};

const JOB_TEMPLATES = {
  plumbing: ['Leaking pipe under the sink', 'Geyser installation', 'Blocked drain clearing', 'Bathroom tap replacement'],
  electrical: ['House wiring fault', 'UPS installation', 'DB board upgrade', 'Ceiling fan and light fitting'],
  carpentry: ['Wardrobe door repair', 'Kitchen shelf fitting', 'Furniture polishing', 'Bed frame repair'],
  painting: ['Bedroom repaint', 'Exterior weather coat', 'Lounge emulsion work', 'Putty and touch-up work'],
  house_help: ['Daily cleaning and dishes', 'Monthly house help', 'Deep clean before guests', 'Laundry and ironing help'],
  cleaning: ['Post-construction cleaning', 'Sofa and carpet cleaning', 'Weekly apartment cleaning', 'Kitchen deep clean'],
  cooking: ['Daily home meals', 'Cook for a family dinner', 'Monthly meal preparation', 'Weekend cooking help'],
  babysitting: ['Evening babysitting', 'Childcare during work hours', 'Weekend child minding', 'School run and minding'],
  elderly_care: ['Daytime attendant for my father', 'Elderly care and medication reminders', 'Companion for my mother', 'Overnight elderly care'],
  ac_repair: ['AC not cooling', 'Split AC service and gas refill', 'AC installation', 'AC PCB repair'],
  appliance_repair: ['Washing machine repair', 'Fridge not cooling', 'Microwave repair', 'Water dispenser service'],
  moving_labor: ['Shifting to a new flat', 'Furniture moving help', 'Loading and unloading', 'Office shifting labour'],
  masonry: ['Wall plaster repair', 'Tile fixing', 'Boundary wall repair', 'Floor levelling'],
  gardening: ['Lawn trimming and cleanup', 'Monthly garden maintenance', 'Hedge cutting', 'Plant potting and care'],
  driving: ['Driver for the week', 'Airport drop and pickup', 'Monthly driver', 'Driver for family outings'],
  welding: ['Gate welding repair', 'Grill fabrication', 'Window grill repair', 'Steel frame welding'],
  security_guard: ['Night guard for the street', 'Event security for a day', 'Monthly security guard', 'Weekend guard duty'],
  other: ['General handyman work', 'Small repairs around the house', 'Furniture assembly', 'Odd jobs for a day'],
};

/**
 * Clients for one worker's completed bookings, arranged so that exactly `repeatHires` of them
 * are a client who has hired this worker before.
 */
function clientSequence(pastClients, completed, repeatHires, offset) {
  const distinct = Math.max(1, completed - repeatHires);
  // Walk one at a time: any larger stride can revisit a client before the list is exhausted
  // (when the stride shares a factor with the pool size), which would silently add repeats.
  const firstTime = Array.from({ length: distinct }, (_, i) => pastClients[(offset + i) % pastClients.length]);
  const repeats = Array.from({ length: completed - distinct }, (_, i) => firstTime[i % firstTime.length]);
  return [...firstTime, ...repeats];
}

/**
 * @param workers  [{ user, profile }] as built by seed.js; profile.stats are the targets
 * @returns        counts for the seed summary
 */
export async function seedWorkerHistory(workers) {
  // These accounts all share one password, so hash it once rather than paying bcrypt's
  // deliberate cost sixty times — that alone took longer than the rest of the seed.
  // insertMany skips the pre-save hook, so the hash has to be applied here.
  const password = await bcrypt.hash(PAST_CLIENT_PASSWORD, 12);
  const needed = Math.min(
    PAST_CLIENT_COUNT,
    Math.max(1, ...workers.map(({ profile }) => (profile.stats.completedJobs ?? 0) - (profile.stats.repeatHires ?? 0))),
  );

  const pastClients = await User.insertMany(
    Array.from({ length: needed }, (_, i) => ({
      name: `${pick(FIRST_NAMES, i)} ${pick(LAST_NAMES, i * 3 + 1)}`,
      email: `past${i + 1}@worknest.test`,
      password,
      role: ROLES.CLIENT,
      phone: `0322${String(i + 1).padStart(7, '0')}`,
    })),
  );

  const jobs = [];
  const offers = [];
  const bookings = [];
  const reviews = [];

  workers.forEach(({ user, profile }, w) => {
    const { completedJobs = 0, cancelledJobs = 0, repeatHires = 0, reviewCount = 0, avgRating = 0 } = profile.stats;
    if (!completedJobs && !cancelledJobs) return;

    const ratings = ratingsFor(reviewCount, avgRating);
    const clients = clientSequence(pastClients, completedJobs, repeatHires, w * 11);
    const dailyRate = profile.rates?.daily ?? 2500;

    const makeRecord = (i, status) => {
      const client = status === BOOKING_STATUS.COMPLETED ? clients[i] : pick(pastClients, i * 13 + w);
      const category = pick(profile.categories, i);
      const title = pick(JOB_TEMPLATES[category] ?? JOB_TEMPLATES.other, i * 3 + w);

      // Spread over roughly the past two years, so review dates and "Member since" agree
      const endedAt = new Date(Date.now() - (9 + i * 15 + (w % 6)) * DAY);
      const startDate = new Date(endedAt.getTime() - 2 * DAY);
      const price = Math.round((dailyRate * (0.85 + (i % 7) * 0.05)) / 50) * 50;

      const jobId = oid();
      const offerId = oid();
      const bookingId = oid();
      const completed = status === BOOKING_STATUS.COMPLETED;

      jobs.push({
        _id: jobId,
        client: client._id,
        title,
        description: `${title}. Posted through WorkNest and handled by the hired worker.`,
        category,
        skills: profile.skills.slice(0, 2),
        budget: { min: Math.round(price * 0.8), max: Math.round(price * 1.2) },
        durationType: 'one_day',
        durationCount: 1,
        startDate,
        urgency: 'normal',
        // Past work happened where the worker works — near enough for geo queries to behave
        city: profile.city,
        location: profile.location,
        status: completed ? JOB_STATUS.REVIEWED : JOB_STATUS.CANCELLED,
        hiredWorker: user._id,
        booking: bookingId,
        offersCount: 1,
        createdAt: new Date(startDate.getTime() - 3 * DAY),
        updatedAt: endedAt,
      });

      offers.push({
        _id: offerId,
        job: jobId,
        worker: user._id,
        client: client._id,
        status: OFFER_STATUS.ACCEPTED,
        rounds: [{ by: user._id, byRole: ROLES.WORKER, amount: price, durationType: 'one_day', durationCount: 1, startDate }],
        lastActivityAt: startDate,
        createdAt: new Date(startDate.getTime() - 2 * DAY),
        updatedAt: startDate,
      });

      bookings.push({
        _id: bookingId,
        job: jobId,
        offer: offerId,
        worker: user._id,
        client: client._id,
        agreedPrice: price,
        durationType: 'one_day',
        durationCount: 1,
        startDate,
        endDate: computeEndDate(startDate, 'one_day', 1),
        status,
        ...(completed && { completedAt: endedAt }),
        ...(!completed && { cancelledAt: endedAt, cancellationReason: 'Client postponed the work' }),
        reviewed: { byClient: completed && i < reviewCount, byWorker: false },
        createdAt: new Date(startDate.getTime() - DAY),
        updatedAt: endedAt,
      });

      // Not every completed job earns a review — that gap is why completedJobs > reviewCount
      if (completed && i < reviewCount) {
        const rating = ratings[i];
        reviews.push({
          booking: bookingId,
          job: jobId,
          from: client._id,
          to: user._id,
          fromRole: ROLES.CLIENT,
          rating,
          text: pick(REVIEW_TEXT[rating], i + w),
          createdAt: endedAt,
          updatedAt: endedAt,
        });
      }
    };

    for (let i = 0; i < completedJobs; i++) makeRecord(i, BOOKING_STATUS.COMPLETED);
    for (let i = 0; i < cancelledJobs; i++) makeRecord(completedJobs + i, BOOKING_STATUS.CANCELLED);
  });

  // timestamps: false so the generated dates survive — Mongoose would otherwise stamp every
  // document with "now" and the entire history would appear to have happened this morning.
  const opts = { timestamps: false };
  await Job.insertMany(jobs, opts);
  await Offer.insertMany(offers, opts);
  await Booking.insertMany(bookings, opts);
  await Review.insertMany(reviews, opts);

  return { pastClients: pastClients.length, jobs: jobs.length, bookings: bookings.length, reviews: reviews.length };
}

/**
 * Rewrites every worker's counters from the documents that now exist.
 *
 * This is what makes the numbers trustworthy: the seed does not get to assert a profile's
 * history, it gets to create one, and the counters are then read back off it. The demo booking
 * created elsewhere in the seed is counted here too, which asserted numbers would have missed.
 */
export async function recomputeWorkerStats() {
  const [ratings, bookingStats] = await Promise.all([
    Review.aggregate([{ $group: { _id: '$to', avg: { $avg: '$rating' }, count: { $sum: 1 } } }]),
    Booking.aggregate([
      { $match: { status: { $in: [BOOKING_STATUS.COMPLETED, BOOKING_STATUS.CANCELLED] } } },
      // Count per client first, so a client's second completed booking is a repeat hire
      { $group: { _id: { worker: '$worker', client: '$client', status: '$status' }, n: { $sum: 1 } } },
      {
        $group: {
          _id: '$_id.worker',
          completedJobs: { $sum: { $cond: [{ $eq: ['$_id.status', BOOKING_STATUS.COMPLETED] }, '$n', 0] } },
          cancelledJobs: { $sum: { $cond: [{ $eq: ['$_id.status', BOOKING_STATUS.CANCELLED] }, '$n', 0] } },
          repeatHires: {
            $sum: { $cond: [{ $eq: ['$_id.status', BOOKING_STATUS.COMPLETED] }, { $subtract: ['$n', 1] }, 0] },
          },
        },
      },
    ]),
  ]);

  const byUser = new Map();
  for (const { _id, avg, count } of ratings) {
    byUser.set(String(_id), { 'stats.avgRating': Math.round(avg * 10) / 10, 'stats.reviewCount': count });
  }
  for (const { _id, completedJobs, cancelledJobs, repeatHires } of bookingStats) {
    const key = String(_id);
    byUser.set(key, {
      ...byUser.get(key),
      'stats.completedJobs': completedJobs,
      'stats.cancelledJobs': cancelledJobs,
      'stats.totalJobs': completedJobs + cancelledJobs,
      'stats.repeatHires': repeatHires,
    });
  }

  await Promise.all([...byUser].map(([user, set]) => WorkerProfile.updateOne({ user }, set)));
  return byUser.size;
}
