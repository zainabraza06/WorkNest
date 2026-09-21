/**
 * Demo data seeder.
 *
 *   npm run seed          # wipes the configured database and inserts demo data
 *
 * Every account uses the password: Password123
 * Refuses to run against NODE_ENV=production.
 */
import mongoose from 'mongoose';

import { env } from '../config/env.js';
import { connectDB, disconnectDB } from '../config/db.js';
import { Booking, ClientProfile, Job, Message, Offer, Payment, Review, User, WorkerProfile } from '../models/index.js';
import { BOOKING_STATUS, JOB_STATUS, OFFER_STATUS, PAYMENT_STATUS, PLATFORM_FEE_RATE, ROLES } from '../constants/index.js';
import { computeEndDate } from '../utils/dates.js';
import { refreshTrustScore } from '../services/trust.service.js';
import { recomputeWorkerStats, seedWorkerHistory } from './history.js';

const PASSWORD = 'Password123';

const CITY_COORDS = {
  Lahore: [74.3587, 31.5204],
  Karachi: [67.0011, 24.8607],
  Islamabad: [73.0479, 33.6844],
};

const point = (city, jitter = 0.05) => {
  const [lng, lat] = CITY_COORDS[city];
  return { type: 'Point', coordinates: [lng + (Math.random() - 0.5) * jitter, lat + (Math.random() - 0.5) * jitter] };
};

const daysFromNow = (n) => new Date(Date.now() + n * 86_400_000);

const WORKERS = [
  {
    name: 'Ahmed Raza', city: 'Lahore', headline: 'Licensed electrician — wiring, UPS & DB boards',
    bio: 'Nine years of residential and small-commercial electrical work. I handle complete house wiring, UPS and solar inverter installation, DB board upgrades and fault finding.',
    categories: ['electrical'], skills: ['wiring', 'ups installation', 'db boards', 'fault finding'],
    experienceYears: 9, rates: { hourly: 700, daily: 3500, monthly: 65000 }, verified: true,
    stats: { totalJobs: 46, completedJobs: 44, cancelledJobs: 2, repeatHires: 11, disputes: 0, avgRating: 4.8, reviewCount: 38, avgResponseMinutes: 22 },
  },
  {
    name: 'Muhammad Yousaf', city: 'Lahore', headline: 'Plumber for leaks, geysers and sanitary fittings',
    bio: 'Fast response for leaking pipes, blocked drains, geyser installation and bathroom fittings. I bring my own tools and give a written estimate before starting.',
    categories: ['plumbing'], skills: ['pipe fitting', 'leak repair', 'geyser installation', 'drain cleaning'],
    experienceYears: 12, rates: { hourly: 600, daily: 2800, monthly: 52000 }, verified: true,
    stats: { totalJobs: 61, completedJobs: 58, cancelledJobs: 3, repeatHires: 16, disputes: 1, avgRating: 4.6, reviewCount: 49, avgResponseMinutes: 35 },
  },
  {
    name: 'Fatima Bibi', city: 'Lahore', headline: 'House help — cleaning, dishes and laundry',
    bio: 'Reliable daily help for cleaning, dishes, laundry and general tidying. Available mornings six days a week. References from three families in Johar Town.',
    categories: ['house_help', 'cleaning'], skills: ['cleaning', 'dishes', 'laundry'],
    experienceYears: 6, rates: { daily: 1400, monthly: 26000 }, verified: true,
    stats: { totalJobs: 22, completedJobs: 22, cancelledJobs: 0, repeatHires: 9, disputes: 0, avgRating: 4.9, reviewCount: 18, avgResponseMinutes: 45 },
  },
  {
    name: 'Imran Khan', city: 'Karachi', headline: 'AC technician — service, gas filling and repair',
    bio: 'Split and window AC servicing, gas refilling, PCB repair and installation. Same-day service across Karachi.',
    categories: ['ac_repair', 'appliance_repair'], skills: ['ac service', 'gas filling', 'installation'],
    experienceYears: 7, rates: { hourly: 800, daily: 3200 }, verified: false,
    stats: { totalJobs: 30, completedJobs: 27, cancelledJobs: 3, repeatHires: 5, disputes: 1, avgRating: 4.3, reviewCount: 21, avgResponseMinutes: 90 },
  },
  {
    name: 'Sana Bashir', city: 'Karachi', headline: 'Cook for daily home meals (desi & continental)',
    bio: 'Home cooking for families — daily roti, salan, and continental dishes on request. Clean kitchen practices and flexible timings.',
    categories: ['cooking', 'house_help'], skills: ['desi cooking', 'meal prep', 'baking'],
    experienceYears: 5, rates: { daily: 2000, monthly: 38000 }, verified: true,
    stats: { totalJobs: 14, completedJobs: 14, cancelledJobs: 0, repeatHires: 6, disputes: 0, avgRating: 4.7, reviewCount: 12, avgResponseMinutes: 60 },
  },
  {
    name: 'Bilal Ahmed', city: 'Islamabad', headline: 'Painter — interior emulsion and exterior weather coat',
    bio: 'Neat interior and exterior painting with proper surface preparation. Team of two available for larger jobs.',
    categories: ['painting'], skills: ['emulsion', 'weather coat', 'putty work'],
    experienceYears: 8, rates: { daily: 2600, monthly: 48000 }, verified: false,
    stats: { totalJobs: 19, completedJobs: 17, cancelledJobs: 2, repeatHires: 3, disputes: 0, avgRating: 4.4, reviewCount: 15, avgResponseMinutes: 120 },
  },
  {
    name: 'Zahid Hussain', city: 'Islamabad', headline: 'Carpenter — furniture repair, doors and fittings',
    bio: 'Custom wardrobes, door fitting and repair, kitchen cabinets and furniture polishing.',
    categories: ['carpentry'], skills: ['furniture repair', 'door fitting', 'polish'],
    experienceYears: 15, rates: { daily: 3000, monthly: 58000 }, verified: true,
    stats: { totalJobs: 38, completedJobs: 36, cancelledJobs: 2, repeatHires: 8, disputes: 0, avgRating: 4.5, reviewCount: 29, avgResponseMinutes: 55 },
  },
  {
    name: 'Rehana Kausar', city: 'Lahore', headline: 'Babysitter and elderly care attendant',
    bio: 'Caring for children and elderly family members — meals, medication reminders and companionship. First-aid trained.',
    categories: ['babysitting', 'elderly_care'], skills: ['child care', 'elderly care', 'first aid'],
    experienceYears: 4, rates: { daily: 1800, monthly: 34000 }, verified: false,
    stats: { totalJobs: 8, completedJobs: 7, cancelledJobs: 1, repeatHires: 2, disputes: 0, avgRating: 4.2, reviewCount: 6, avgResponseMinutes: 75 },
  },
  {
    name: 'Naveed Akhtar', city: 'Lahore', headline: 'New on WorkNest — general handyman',
    bio: 'Recently joined. Happy to take on small repairs, assembly and odd jobs around the house.',
    categories: ['other', 'moving_labor'], skills: ['handyman', 'assembly', 'shifting'],
    experienceYears: 2, rates: { daily: 1800 }, verified: false,
    stats: { totalJobs: 0, completedJobs: 0, cancelledJobs: 0, repeatHires: 0, disputes: 0, avgRating: 0, reviewCount: 0, avgResponseMinutes: null },
  },
];

const CLIENTS = [
  { name: 'Ayesha Malik', city: 'Lahore', address: 'House 12, Street 4, Johar Town', about: 'Family of four in Johar Town.' },
  { name: 'Usman Tariq', city: 'Karachi', address: 'Flat 3B, Clifton Block 5', about: 'Apartment owner, usually need help on weekends.' },
  { name: 'Hina Shah', city: 'Islamabad', address: 'House 44, F-11/3', about: null },
];

const JOBS = [
  {
    clientIndex: 0, title: 'Fix leaking kitchen sink pipe',
    description: 'The pipe under the kitchen sink has been leaking since yesterday morning and water is collecting in the cabinet. Needs replacing today if possible.',
    category: 'plumbing', skills: ['pipe fitting', 'leak repair'], budget: { min: 2000, max: 4000 },
    durationType: 'one_day', durationCount: 1, startDate: daysFromNow(1), urgency: 'urgent',
  },
  {
    clientIndex: 0, title: 'Monthly house help for cleaning and dishes',
    description: 'Looking for reliable daily house help for cleaning, dishes and laundry, six days a week in the mornings. Long-term arrangement preferred.',
    category: 'house_help', skills: ['cleaning', 'laundry'], budget: { min: 22000, max: 30000 },
    durationType: 'monthly', durationCount: 1, startDate: daysFromNow(5), urgency: 'normal',
  },
  {
    clientIndex: 1, title: 'AC not cooling — needs service and gas',
    description: 'Split AC in the bedroom is running but not cooling properly. Probably needs servicing and a gas refill. Two units in total if the first goes well.',
    category: 'ac_repair', skills: ['ac service', 'gas filling'], budget: { min: 3000, max: 6000 },
    durationType: 'one_day', durationCount: 1, startDate: daysFromNow(2), urgency: 'urgent',
  },
  {
    clientIndex: 2, title: 'Paint two bedrooms and a lounge',
    description: 'Two bedrooms and a small lounge need a fresh coat of emulsion. Walls are in good condition, minor putty work may be needed around the windows.',
    category: 'painting', skills: ['emulsion'], budget: { min: 15000, max: 25000 },
    durationType: 'weekly', durationCount: 1, startDate: daysFromNow(7), urgency: 'flexible',
  },
  {
    clientIndex: 2, title: 'Wardrobe door repair and shelf fitting',
    description: 'One wardrobe door is off its hinges and I need two extra shelves fitted inside. Material can be arranged by the carpenter.',
    category: 'carpentry', skills: ['door fitting'], budget: { min: 3500, max: 6000 },
    durationType: 'one_day', durationCount: 2, startDate: daysFromNow(4), urgency: 'normal',
  },
];

async function wipe() {
  await Promise.all(
    [User, WorkerProfile, ClientProfile, Job, Offer, Booking, Payment, Review, Message].map((m) => m.deleteMany({})),
  );
}

async function seed() {
  if (env.isProd) {
    console.error('Refusing to seed a production database.');
    process.exit(1);
  }

  await connectDB(env.MONGODB_URI);
  console.log(`Seeding ${mongoose.connection.name}…`);
  await wipe();

  // ── Users & profiles ────────────────────────────────────────────
  const workers = [];
  for (const [i, w] of WORKERS.entries()) {
    const user = await User.create({
      name: w.name,
      email: `worker${i + 1}@worknest.test`,
      password: PASSWORD,
      role: ROLES.WORKER,
      phone: `0300000${String(i + 1).padStart(4, '0')}`,
    });
    const profile = await WorkerProfile.create({
      user: user._id,
      headline: w.headline,
      bio: w.bio,
      categories: w.categories,
      skills: w.skills,
      experienceYears: w.experienceYears,
      rates: w.rates,
      location: point(w.city),
      city: w.city,
      serviceRadiusKm: 20,
      isAvailable: true,
      availability: [1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, startTime: '09:00', endTime: '18:00' })),
      stats: w.stats,
      idVerification: w.verified ? { status: 'verified', document: { url: 'seed', publicId: 'seed' }, reviewedAt: new Date() } : { status: 'none' },
    });
    await refreshTrustScore(user._id);
    workers.push({ user, profile });
  }

  const clients = [];
  for (const [i, c] of CLIENTS.entries()) {
    const user = await User.create({
      name: c.name,
      email: `client${i + 1}@worknest.test`,
      password: PASSWORD,
      role: ROLES.CLIENT,
      phone: `0311000${String(i + 1).padStart(4, '0')}`,
    });
    const profile = await ClientProfile.create({
      user: user._id,
      location: point(c.city),
      city: c.city,
      address: c.address,
      about: c.about,
      stats: { jobsPosted: 0, hires: 0 },
    });
    clients.push({ user, profile });
  }

  const admin = await User.create({
    name: 'WorkNest Admin',
    email: 'admin@worknest.test',
    password: PASSWORD,
    role: ROLES.ADMIN,
  });

  // ── Jobs ────────────────────────────────────────────────────────
  const jobs = [];
  for (const j of JOBS) {
    const client = clients[j.clientIndex];
    const job = await Job.create({
      client: client.user._id,
      title: j.title,
      description: j.description,
      category: j.category,
      skills: j.skills,
      budget: j.budget,
      durationType: j.durationType,
      durationCount: j.durationCount,
      startDate: j.startDate,
      urgency: j.urgency,
      location: point(client.profile.city),
      city: client.profile.city,
      address: client.profile.address,
    });
    await ClientProfile.updateOne({ user: client.user._id }, { $inc: { 'stats.jobsPosted': 1 }, $push: { jobHistory: job._id } });
    jobs.push(job);
  }

  // ── An open negotiation on the plumbing job ─────────────────────
  const plumber = workers[1];
  const plumbingJob = jobs[0];
  const offer = await Offer.create({
    job: plumbingJob._id,
    worker: plumber.user._id,
    client: plumbingJob.client,
    coverNote: 'I can come tomorrow morning and bring the replacement fittings with me.',
    awaitingRole: ROLES.CLIENT,
    status: OFFER_STATUS.PENDING,
    rounds: [
      {
        by: plumber.user._id,
        byRole: ROLES.WORKER,
        amount: 3800,
        durationType: 'one_day',
        durationCount: 1,
        startDate: plumbingJob.startDate,
        terms: 'Includes labour and standard fittings. Any extra parts billed at cost.',
      },
      {
        by: plumbingJob.client,
        byRole: ROLES.CLIENT,
        amount: 3000,
        durationType: 'one_day',
        durationCount: 1,
        startDate: plumbingJob.startDate,
        terms: 'Rs 3,000 is my budget if you can finish it in one visit.',
      },
    ],
  });
  offer.awaitingRole = ROLES.WORKER;
  await offer.save();
  await Job.updateOne({ _id: plumbingJob._id }, { status: JOB_STATUS.NEGOTIATING, offersCount: 1 });

  await Message.create([
    { offer: offer._id, job: plumbingJob._id, sender: plumber.user._id, type: 'offer', text: offer.coverNote, roundId: offer.rounds[0]._id },
    { offer: offer._id, job: plumbingJob._id, sender: plumbingJob.client, type: 'offer', text: 'Can you do it for Rs 3,000?', roundId: offer.rounds[1]._id },
  ]);

  // ── A completed booking with reviews (gives the electrician history) ──
  const electrician = workers[0];
  const acJob = jobs[2];
  const acClient = clients[1];
  const wonOffer = await Offer.create({
    job: acJob._id,
    worker: electrician.user._id,
    client: acClient.user._id,
    awaitingRole: undefined,
    status: OFFER_STATUS.ACCEPTED,
    rounds: [
      { by: electrician.user._id, byRole: ROLES.WORKER, amount: 4500, durationType: 'one_day', durationCount: 1, startDate: daysFromNow(-6) },
    ],
  });
  wonOffer.acceptedRound = wonOffer.rounds[0]._id;
  await wonOffer.save();

  const booking = await Booking.create({
    job: acJob._id,
    offer: wonOffer._id,
    worker: electrician.user._id,
    client: acClient.user._id,
    agreedPrice: 4500,
    durationType: 'one_day',
    durationCount: 1,
    startDate: daysFromNow(-6),
    endDate: computeEndDate(daysFromNow(-6), 'one_day', 1),
    status: BOOKING_STATUS.COMPLETED,
    completedAt: daysFromNow(-5),
    timeline: [
      { status: BOOKING_STATUS.PENDING_PAYMENT, at: daysFromNow(-7) },
      { status: BOOKING_STATUS.CONFIRMED, at: daysFromNow(-7), note: 'Payment held in escrow' },
      { status: BOOKING_STATUS.IN_PROGRESS, at: daysFromNow(-6) },
      { status: BOOKING_STATUS.COMPLETED, at: daysFromNow(-5), note: 'Client confirmed completion; payment released' },
    ],
    reviewed: { byClient: true, byWorker: true },
  });

  const platformFee = Math.round(4500 * PLATFORM_FEE_RATE);
  const payment = await Payment.create({
    booking: booking._id,
    client: acClient.user._id,
    worker: electrician.user._id,
    amount: 4500,
    platformFee,
    workerPayout: 4500 - platformFee,
    providerPaymentId: 'pi_seed_demo',
    status: PAYMENT_STATUS.RELEASED,
    heldAt: daysFromNow(-7),
    releasedAt: daysFromNow(-5),
  });
  booking.payment = payment._id;
  await booking.save();
  await Job.updateOne({ _id: acJob._id }, { status: JOB_STATUS.REVIEWED, hiredWorker: electrician.user._id, booking: booking._id, offersCount: 1 });

  await Review.create([
    {
      booking: booking._id, job: acJob._id, from: acClient.user._id, to: electrician.user._id, fromRole: ROLES.CLIENT,
      rating: 5, text: 'Arrived on time, explained the problem clearly and cleaned up afterwards. Highly recommended.',
      aspects: { quality: 5, punctuality: 5, communication: 5 },
    },
    {
      booking: booking._id, job: acJob._id, from: electrician.user._id, to: acClient.user._id, fromRole: ROLES.WORKER,
      rating: 5, text: 'Clear instructions and payment released immediately. A pleasure to work with.',
    },
  ]);
  await ClientProfile.updateOne({ user: acClient.user._id }, { 'stats.hires': 1, 'stats.avgRating': 5, 'stats.reviewCount': 1 });

  // ── Back-fill the history the counters claim ────────────────────
  // Without this, a profile advertises 38 reviews and can show one, and the first real review
  // posted recomputes the average from the Review collection and collapses it.
  const history = await seedWorkerHistory(workers);
  await recomputeWorkerStats();

  // Trust depends on those counters, so it is scored last, against the finished picture
  for (const { user } of workers) await refreshTrustScore(user._id);

  console.log(`
Seed complete:
  ${workers.length} workers, ${clients.length} clients, 1 admin
  ${jobs.length} jobs (1 open negotiation, 1 completed booking with reviews)
  ${history.bookings} historical bookings and ${history.reviews} reviews from ${history.pastClients} past clients

  Log in with any of these — password: ${PASSWORD}
    worker1@worknest.test   (Ahmed Raza, electrician, strong history)
    worker9@worknest.test   (Naveed Akhtar, brand new — "New" Trust Score)
    client1@worknest.test   (Ayesha Malik, Lahore)
    admin@worknest.test     (${admin.name})
`);

  await disconnectDB();
}

seed().catch(async (err) => {
  console.error('Seed failed:', err);
  await disconnectDB().catch(() => {});
  process.exit(1);
});
