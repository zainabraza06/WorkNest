import { beforeEach, describe, expect, it, vi } from 'vitest';

// Stripe is mocked: tests drive the PaymentIntent status the way Stripe would
const intentState = { status: 'requires_payment_method' };
vi.mock('../src/services/payment.service.js', () => ({
  toMinorUnits: (a) => a * 100,
  createEscrowIntent: vi.fn(async () => ({ id: 'pi_test_123', client_secret: 'pi_test_123_secret', status: 'requires_payment_method' })),
  retrieveIntent: vi.fn(async (id) => ({ id, client_secret: `${id}_secret`, ...intentState })),
  captureIntent: vi.fn(async (id) => ({ id, status: 'succeeded' })),
  cancelIntent: vi.fn(async (id) => ({ id, status: 'canceled' })),
  constructWebhookEvent: vi.fn(),
}));

const { api, bearer, registerUser } = await import('./helpers.js');
const { Job, Offer, Payment, WorkerProfile } = await import('../src/models/index.js');

const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString();

async function setup() {
  const client = await registerUser({ role: 'client', phone: '03001234567' });
  const workerA = await registerUser({ role: 'worker', phone: '03111111111' });
  const workerB = await registerUser({ role: 'worker' });

  for (const w of [workerA, workerB]) {
    await api()
      .post('/api/workers/me')
      .set(bearer(w.token))
      .send({ categories: ['plumbing'], rates: { daily: 3000 }, location: { lat: 31.52, lng: 74.35 }, city: 'Lahore' });
  }

  const job = await api()
    .post('/api/jobs')
    .set(bearer(client.token))
    .send({
      title: 'Fix leaking kitchen pipe',
      description: 'Pipe under the kitchen sink is leaking and needs to be replaced today.',
      category: 'plumbing',
      budget: { min: 2000, max: 4000 },
      durationType: 'one_day',
      startDate: tomorrow(),
      location: { lat: 31.52, lng: 74.35 },
      city: 'Lahore',
      address: 'House 7, Model Town',
    });

  return { client, workerA, workerB, jobId: job.body.data._id };
}

describe('negotiation', () => {
  let ctx;
  beforeEach(async () => {
    intentState.status = 'requires_payment_method';
    ctx = await setup();
  });

  it('runs offer → counter → accept and closes competing offers', async () => {
    const { client, workerA, workerB, jobId } = ctx;

    const a = await api().post(`/api/jobs/${jobId}/offers`).set(bearer(workerA.token)).send({ amount: 3800, coverNote: 'Can come in the morning' });
    expect(a.status).toBe(201);
    expect(a.body.data.awaitingRole).toBe('client');
    const b = await api().post(`/api/jobs/${jobId}/offers`).set(bearer(workerB.token)).send({ amount: 3500 });
    expect(b.status).toBe(201);

    expect((await api().post(`/api/jobs/${jobId}/offers`).set(bearer(workerA.token)).send({ amount: 3000 })).status).toBe(409);
    expect((await Job.findById(jobId)).status).toBe('negotiating');

    const offerId = a.body.data._id;

    // Worker can't counter their own offer — it's the client's turn
    expect((await api().post(`/api/offers/${offerId}/counter`).set(bearer(workerA.token)).send({ amount: 3600 })).status).toBe(409);

    const counter = await api().post(`/api/offers/${offerId}/counter`).set(bearer(client.token)).send({ amount: 3000, message: 'Rs 3000 is my budget' });
    expect(counter.status).toBe(200);
    expect(counter.body.data.rounds).toHaveLength(2);
    expect(counter.body.data.awaitingRole).toBe('worker');

    // Client can't accept their own counter
    expect((await api().post(`/api/offers/${offerId}/accept`).set(bearer(client.token))).status).toBe(409);

    const accepted = await api().post(`/api/offers/${offerId}/accept`).set(bearer(workerA.token));
    expect(accepted.status).toBe(200);
    expect(accepted.body.data.booking).toMatchObject({ agreedPrice: 3000, status: 'pending_payment' });

    const job = await Job.findById(jobId);
    expect(job.status).toBe('confirmed');
    expect(job.hiredWorker.toString()).toBe(workerA.user._id);
    expect((await Offer.findById(b.body.data._id)).status).toBe('closed');

    const thread = await api().get(`/api/offers/${offerId}/messages`).set(bearer(client.token));
    expect(thread.body.data.items.map((m) => m.type)).toEqual(['offer', 'offer', 'system']);

    const list = await api().get('/api/offers').set(bearer(client.token));
    expect(list.body.data.total).toBe(2);
    expect(list.body.data.items[0].workerSummary).toBeDefined();
  });

  it('guards thread access and supports chat + read receipts', async () => {
    const { client, workerA, workerB, jobId } = ctx;
    const { body } = await api().post(`/api/jobs/${jobId}/offers`).set(bearer(workerA.token)).send({ amount: 3500 });
    const offerId = body.data._id;

    expect((await api().get(`/api/offers/${offerId}`).set(bearer(workerB.token))).status).toBe(404);

    const msg = await api().post(`/api/offers/${offerId}/messages`).set(bearer(client.token)).send({ text: 'Can you bring your own tools?' });
    expect(msg.status).toBe(201);

    const unread = await api().get('/api/offers').set(bearer(workerA.token));
    expect(unread.body.data.items[0].unreadCount).toBe(1);

    await api().post(`/api/offers/${offerId}/read`).set(bearer(workerA.token));
    const after = await api().get('/api/offers').set(bearer(workerA.token));
    expect(after.body.data.items[0].unreadCount).toBe(0);

    expect((await api().post(`/api/offers/${offerId}/messages`).set(bearer(client.token)).send({ text: '' })).status).toBe(400);
  });

  it('lets a worker withdraw and returns the job to posted', async () => {
    const { workerA, jobId } = ctx;
    const { body } = await api().post(`/api/jobs/${jobId}/offers`).set(bearer(workerA.token)).send({ amount: 3500 });
    const res = await api().post(`/api/offers/${body.data._id}/withdraw`).set(bearer(workerA.token)).send({});
    expect(res.body.data.status).toBe('withdrawn');
    expect((await Job.findById(jobId)).status).toBe('posted');
  });
});

describe('booking & escrow', () => {
  let ctx;
  let bookingId;

  beforeEach(async () => {
    intentState.status = 'requires_payment_method';
    ctx = await setup();
    const { client, workerA, workerB, jobId } = ctx;
    await api().post(`/api/jobs/${jobId}/offers`).set(bearer(workerB.token)).send({ amount: 3900 });
    const { body } = await api().post(`/api/jobs/${jobId}/offers`).set(bearer(workerA.token)).send({ amount: 3200 });
    const accepted = await api().post(`/api/offers/${body.data._id}/accept`).set(bearer(client.token));
    bookingId = accepted.body.data.booking._id;
  });

  it('hides contact details until paid, then runs pay → start → complete', async () => {
    const { client, workerA } = ctx;

    const before = await api().get(`/api/bookings/${bookingId}`).set(bearer(workerA.token));
    expect(before.body.data.client.phone).toBeUndefined();
    expect(before.body.data.job.address).toBeUndefined();

    expect((await api().post(`/api/bookings/${bookingId}/payment`).set(bearer(workerA.token))).status).toBe(403);
    expect((await api().post(`/api/bookings/${bookingId}/start`).set(bearer(workerA.token))).status).toBe(409);

    const pay = await api().post(`/api/bookings/${bookingId}/payment`).set(bearer(client.token));
    expect(pay.status).toBe(200);
    expect(pay.body.data).toMatchObject({ clientSecret: 'pi_test_123_secret', amount: 3200, platformFee: 160 });

    // Client confirms the card in Stripe Elements → intent now holds the funds
    intentState.status = 'requires_capture';
    const synced = await api().post(`/api/bookings/${bookingId}/payment/sync`).set(bearer(client.token));
    expect(synced.body.data.status).toBe('confirmed');
    expect(synced.body.data.payment.status).toBe('held');

    const revealed = await api().get(`/api/bookings/${bookingId}`).set(bearer(workerA.token));
    expect(revealed.body.data.client.phone).toBe('03001234567');
    expect(revealed.body.data.job.address).toBe('House 7, Model Town');

    const started = await api().post(`/api/bookings/${bookingId}/start`).set(bearer(workerA.token));
    expect(started.body.data.status).toBe('in_progress');

    expect((await api().post(`/api/bookings/${bookingId}/complete`).set(bearer(workerA.token))).status).toBe(403);
    const done = await api().post(`/api/bookings/${bookingId}/complete`).set(bearer(client.token));
    expect(done.body.data.status).toBe('completed');
    expect(done.body.data.payment.status).toBe('released');

    const profile = await WorkerProfile.findOne({ user: workerA.user._id });
    expect(profile.stats.completedJobs).toBe(1);
    expect((await Job.findById(ctx.jobId)).status).toBe('completed');
  });

  it('refunds and reopens the job when the worker cancels a confirmed booking', async () => {
    const { client, workerA, jobId } = ctx;
    await api().post(`/api/bookings/${bookingId}/payment`).set(bearer(client.token));
    intentState.status = 'requires_capture';
    await api().post(`/api/bookings/${bookingId}/payment/sync`).set(bearer(client.token));

    const cancelled = await api().post(`/api/bookings/${bookingId}/cancel`).set(bearer(workerA.token)).send({ reason: 'Family emergency' });
    expect(cancelled.body.data.status).toBe('cancelled');
    expect((await Payment.findOne({ booking: bookingId })).status).toBe('refunded');

    const job = await Job.findById(jobId);
    expect(job.status).toBe('negotiating'); // worker B's offer is live again
    expect(job.hiredWorker).toBeUndefined();

    const profile = await WorkerProfile.findOne({ user: workerA.user._id });
    expect(profile.stats.cancelledJobs).toBe(1);
  });

  it('lists bookings per role', async () => {
    const { client, workerA, workerB } = ctx;
    expect((await api().get('/api/bookings').set(bearer(client.token))).body.data.total).toBe(1);
    expect((await api().get('/api/bookings').set(bearer(workerA.token))).body.data.total).toBe(1);
    expect((await api().get('/api/bookings').set(bearer(workerB.token))).body.data.total).toBe(0);
    expect((await api().get(`/api/bookings/${bookingId}`).set(bearer(workerB.token))).status).toBe(404);
  });
});
