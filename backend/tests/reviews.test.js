import { beforeEach, describe, expect, it, vi } from 'vitest';

const intentState = { status: 'requires_capture' };
vi.mock('../src/services/payment.service.js', () => ({
  toMinorUnits: (a) => a * 100,
  createEscrowIntent: vi.fn(async () => ({ id: 'pi_rev_1', client_secret: 'pi_rev_1_secret', status: 'requires_payment_method' })),
  retrieveIntent: vi.fn(async (id) => ({ id, client_secret: `${id}_secret`, ...intentState })),
  captureIntent: vi.fn(async (id) => ({ id, status: 'succeeded' })),
  cancelIntent: vi.fn(async (id) => ({ id, status: 'canceled' })),
  constructWebhookEvent: vi.fn(),
}));

const { api, bearer, registerUser } = await import('./helpers.js');
const { Job, WorkerProfile } = await import('../src/models/index.js');
const { computePlaceholderTrust } = await import('../src/services/trust.service.js');

const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString();

/** Drives a job all the way to a completed booking. */
async function completedBooking() {
  const client = await registerUser({ role: 'client' });
  const worker = await registerUser({ role: 'worker' });

  await api()
    .post('/api/workers/me')
    .set(bearer(worker.token))
    .send({ categories: ['plumbing'], rates: { daily: 3000 }, location: { lat: 31.52, lng: 74.35 }, city: 'Lahore' });

  const job = await api()
    .post('/api/jobs')
    .set(bearer(client.token))
    .send({
      title: 'Replace bathroom taps',
      description: 'Two bathroom taps are dripping and need replacing with new fittings.',
      category: 'plumbing',
      budget: { min: 2000, max: 4000 },
      durationType: 'one_day',
      startDate: tomorrow(),
      location: { lat: 31.52, lng: 74.35 },
      city: 'Lahore',
    });
  const jobId = job.body.data._id;

  const offer = await api().post(`/api/jobs/${jobId}/offers`).set(bearer(worker.token)).send({ amount: 3000 });
  const accepted = await api().post(`/api/offers/${offer.body.data._id}/accept`).set(bearer(client.token));
  const bookingId = accepted.body.data.booking._id;

  await api().post(`/api/bookings/${bookingId}/payment`).set(bearer(client.token));
  await api().post(`/api/bookings/${bookingId}/payment/sync`).set(bearer(client.token));
  await api().post(`/api/bookings/${bookingId}/start`).set(bearer(worker.token));
  await api().post(`/api/bookings/${bookingId}/complete`).set(bearer(client.token));

  return { client, worker, jobId, bookingId };
}

describe('reviews', () => {
  let ctx;
  beforeEach(async () => {
    intentState.status = 'requires_capture';
    ctx = await completedBooking();
  });

  it('lets both sides review once and marks the job reviewed', async () => {
    const { client, worker, jobId, bookingId } = ctx;

    const byClient = await api()
      .post(`/api/bookings/${bookingId}/reviews`)
      .set(bearer(client.token))
      .send({ rating: 5, text: 'Arrived on time and did a clean job.', aspects: { quality: 5, punctuality: 5 } });
    expect(byClient.status).toBe(201);
    expect(byClient.body.data.to).toBe(worker.user._id);

    expect((await api().post(`/api/bookings/${bookingId}/reviews`).set(bearer(client.token)).send({ rating: 4 })).status).toBe(409);
    expect((await Job.findById(jobId)).status).toBe('completed');

    const byWorker = await api().post(`/api/bookings/${bookingId}/reviews`).set(bearer(worker.token)).send({ rating: 4, text: 'Clear instructions, paid promptly.' });
    expect(byWorker.status).toBe(201);
    expect((await Job.findById(jobId)).status).toBe('reviewed');

    const profile = await WorkerProfile.findOne({ user: worker.user._id });
    expect(profile.stats.avgRating).toBe(5);
    expect(profile.stats.reviewCount).toBe(1);

    const publicReviews = await api().get(`/api/users/${worker.user._id}/reviews`);
    expect(publicReviews.body.data.total).toBe(1);
    expect(publicReviews.body.data.avgRating).toBe(5);
    expect(publicReviews.body.data.items[0].from.name).toBe(client.user.name);

    const publicProfile = await api().get(`/api/workers/${worker.user._id}`);
    expect(publicProfile.body.data.recentReviews).toHaveLength(1);
  });

  it('validates the rating and blocks strangers', async () => {
    const { client, bookingId } = ctx;
    expect((await api().post(`/api/bookings/${bookingId}/reviews`).set(bearer(client.token)).send({ rating: 9 })).status).toBe(400);
    expect((await api().post(`/api/bookings/${bookingId}/reviews`).set(bearer(client.token)).send({})).status).toBe(400);

    const stranger = await registerUser({ role: 'client' });
    expect((await api().post(`/api/bookings/${bookingId}/reviews`).set(bearer(stranger.token)).send({ rating: 5 })).status).toBe(404);
  });

  it('rejects reviews before the booking is completed', async () => {
    const client = await registerUser({ role: 'client' });
    const worker = await registerUser({ role: 'worker' });
    await api()
      .post('/api/workers/me')
      .set(bearer(worker.token))
      .send({ categories: ['cleaning'], rates: { daily: 1500 }, location: { lat: 31.52, lng: 74.35 }, city: 'Lahore' });

    const job = await api().post('/api/jobs').set(bearer(client.token)).send({
      title: 'Weekly house cleaning',
      description: 'Need help with general cleaning and dishes once a week for a month.',
      category: 'cleaning',
      budget: { min: 4000, max: 6000 },
      durationType: 'weekly',
      startDate: tomorrow(),
      location: { lat: 31.52, lng: 74.35 },
      city: 'Lahore',
    });
    const offer = await api().post(`/api/jobs/${job.body.data._id}/offers`).set(bearer(worker.token)).send({ amount: 5000 });
    const accepted = await api().post(`/api/offers/${offer.body.data._id}/accept`).set(bearer(client.token));

    const res = await api().post(`/api/bookings/${accepted.body.data.booking._id}/reviews`).set(bearer(client.token)).send({ rating: 5 });
    expect(res.status).toBe(409);
  });
});

describe('placeholder trust score', () => {
  it('recomputes after a completed job and a review', async () => {
    const { client, worker, bookingId } = await completedBooking();

    const afterJob = await WorkerProfile.findOne({ user: worker.user._id });
    expect(afterJob.trustScore.source).toBe('placeholder');
    expect(afterJob.trustScore.updatedAt).toBeInstanceOf(Date);
    expect(afterJob.trustScore.breakdown.get('completion')).toBeGreaterThan(0);

    await api().post(`/api/bookings/${bookingId}/reviews`).set(bearer(client.token)).send({ rating: 5 });

    const afterReview = await WorkerProfile.findOne({ user: worker.user._id });
    expect(afterReview.trustScore.score).toBeGreaterThan(afterJob.trustScore.score);
    expect(afterReview.trustScore.label).toBeTypeOf('string');
  });

  it('scores a strong history above a weak one and stays within 0-100', () => {
    const strong = computePlaceholderTrust({
      completed_jobs: 40,
      total_jobs: 42,
      cancelled_jobs: 2,
      avg_rating: 4.9,
      review_count: 35,
      repeat_hires: 12,
      disputes: 0,
      avg_response_minutes: 15,
      account_age_days: 500,
      id_verified: true,
      portfolio_count: 6,
    });
    const weak = computePlaceholderTrust({
      completed_jobs: 3,
      total_jobs: 10,
      cancelled_jobs: 7,
      avg_rating: 2.4,
      review_count: 6,
      repeat_hires: 0,
      disputes: 3,
      avg_response_minutes: 900,
      account_age_days: 20,
      id_verified: false,
      portfolio_count: 0,
    });

    expect(strong.score).toBeGreaterThan(weak.score);
    expect(strong.score).toBeGreaterThanOrEqual(85);
    expect(strong.label).toBe('Highly Trusted');
    expect(weak.score).toBeGreaterThanOrEqual(0);
    expect(weak.score).toBeLessThan(50);

    // A brand-new worker sits near the neutral middle, not at zero
    const fresh = computePlaceholderTrust({
      completed_jobs: 0,
      total_jobs: 0,
      cancelled_jobs: 0,
      avg_rating: 0,
      review_count: 0,
      repeat_hires: 0,
      disputes: 0,
      avg_response_minutes: null,
      account_age_days: 0,
      id_verified: false,
      portfolio_count: 0,
    });
    expect(fresh.score).toBeGreaterThanOrEqual(45);
    expect(fresh.score).toBeLessThanOrEqual(55);
    expect(fresh.label).toBe('New');
  });
});
