import { describe, expect, it } from 'vitest';

import { Booking, Review, User, WorkerProfile } from '../src/models/index.js';
import { BOOKING_STATUS, ROLES } from '../src/constants/index.js';
import { ratingsFor, recomputeWorkerStats, seedWorkerHistory } from '../src/scripts/history.js';

/** One worker whose counters are the targets the generated history has to reproduce. */
async function makeWorker(stats, i = 0) {
  const user = await User.create({
    name: `Worker ${i}`,
    email: `hist-worker${i}@worknest.test`,
    password: 'Password123',
    role: ROLES.WORKER,
  });
  const profile = await WorkerProfile.create({
    user: user._id,
    headline: 'Test worker',
    categories: ['plumbing'],
    skills: ['leak repair'],
    rates: { daily: 3000 },
    location: { type: 'Point', coordinates: [74.3587, 31.5204] },
    city: 'Lahore',
    stats,
  });
  return { user, profile };
}

describe('ratingsFor', () => {
  it('reproduces the stated average to the displayed decimal place', () => {
    for (const [n, avg] of [[38, 4.8], [49, 4.6], [21, 4.3], [6, 4.2], [12, 4.7], [1, 5]]) {
      const ratings = ratingsFor(n, avg);
      const mean = ratings.reduce((a, b) => a + b, 0) / n;
      expect(Math.round(mean * 10) / 10).toBe(avg);
    }
  });

  it('never produces a rating the schema would reject', () => {
    for (const ratings of [ratingsFor(40, 4.9), ratingsFor(40, 3.1), ratingsFor(5, 1.2)]) {
      for (const r of ratings) {
        expect(r).toBeGreaterThanOrEqual(1);
        expect(r).toBeLessThanOrEqual(5);
        expect(Number.isInteger(r)).toBe(true);
      }
    }
  });

  it('returns nothing for a worker with no reviews', () => {
    expect(ratingsFor(0, 0)).toEqual([]);
  });
});

describe('seeded work history', () => {
  it('backs every counter on the profile with real documents', async () => {
    const stats = {
      totalJobs: 46, completedJobs: 44, cancelledJobs: 2, repeatHires: 11,
      disputes: 0, avgRating: 4.8, reviewCount: 38, avgResponseMinutes: 22,
    };
    const worker = await makeWorker(stats);

    await seedWorkerHistory([worker]);
    await recomputeWorkerStats();

    const [completed, cancelled, reviews] = await Promise.all([
      Booking.countDocuments({ worker: worker.user._id, status: BOOKING_STATUS.COMPLETED }),
      Booking.countDocuments({ worker: worker.user._id, status: BOOKING_STATUS.CANCELLED }),
      Review.countDocuments({ to: worker.user._id }),
    ]);

    expect(completed).toBe(stats.completedJobs);
    expect(cancelled).toBe(stats.cancelledJobs);
    expect(completed + cancelled).toBe(stats.totalJobs);
    expect(reviews).toBe(stats.reviewCount);

    // Every counter is now reported from the documents, not asserted by the seed
    const profile = await WorkerProfile.findOne({ user: worker.user._id });
    expect(profile.stats.reviewCount).toBe(stats.reviewCount);
    expect(profile.stats.avgRating).toBe(stats.avgRating);
    expect(profile.stats.completedJobs).toBe(stats.completedJobs);
    expect(profile.stats.cancelledJobs).toBe(stats.cancelledJobs);
    expect(profile.stats.totalJobs).toBe(stats.totalJobs);
    expect(profile.stats.repeatHires).toBe(stats.repeatHires);
  });

  it('counts bookings the seed created elsewhere, which asserted numbers would miss', async () => {
    const worker = await makeWorker(
      { totalJobs: 10, completedJobs: 10, cancelledJobs: 0, repeatHires: 0, disputes: 0, avgRating: 5, reviewCount: 5 },
      4,
    );
    await seedWorkerHistory([worker]);

    // An extra completed booking, the way the seed's hand-built demo booking arrives
    const existing = await Booking.findOne({ worker: worker.user._id });
    await Booking.create({
      ...existing.toObject(), _id: undefined, job: existing.job, offer: existing.offer,
      status: BOOKING_STATUS.COMPLETED, completedAt: new Date(),
    });

    await recomputeWorkerStats();
    const profile = await WorkerProfile.findOne({ user: worker.user._id });
    expect(profile.stats.completedJobs).toBe(11);
    expect(profile.stats.totalJobs).toBe(11);
  });

  it('produces exactly the stated number of repeat hires', async () => {
    const worker = await makeWorker(
      { totalJobs: 30, completedJobs: 30, cancelledJobs: 0, repeatHires: 8, disputes: 0, avgRating: 4.5, reviewCount: 20 },
      1,
    );

    await seedWorkerHistory([worker]);

    const bookings = await Booking.find({ worker: worker.user._id, status: BOOKING_STATUS.COMPLETED })
      .sort({ startDate: 1 })
      .select('client');

    const seen = new Set();
    let repeats = 0;
    for (const b of bookings) {
      const id = String(b.client);
      if (seen.has(id)) repeats += 1;
      seen.add(id);
    }
    expect(repeats).toBe(8);
  });

  it('dates the history in the past rather than stamping it with now', async () => {
    const worker = await makeWorker(
      { totalJobs: 10, completedJobs: 10, cancelledJobs: 0, repeatHires: 0, disputes: 0, avgRating: 5, reviewCount: 10 },
      2,
    );

    await seedWorkerHistory([worker]);

    const reviews = await Review.find({ to: worker.user._id }).sort({ createdAt: 1 });
    expect(reviews.at(-1).createdAt.getTime()).toBeLessThan(Date.now());
    // The oldest and newest must differ, or every review would carry the same timestamp
    expect(reviews.at(0).createdAt.getTime()).toBeLessThan(reviews.at(-1).createdAt.getTime());
  });

  it('writes nothing for a worker with no history', async () => {
    const worker = await makeWorker(
      { totalJobs: 0, completedJobs: 0, cancelledJobs: 0, repeatHires: 0, disputes: 0, avgRating: 0, reviewCount: 0 },
      3,
    );

    await seedWorkerHistory([worker]);

    expect(await Booking.countDocuments({ worker: worker.user._id })).toBe(0);
    expect(await Review.countDocuments({ to: worker.user._id })).toBe(0);
  });
});
