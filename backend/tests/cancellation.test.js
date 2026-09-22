import { beforeEach, describe, expect, it, vi } from 'vitest';

// Stripe is mocked; the assertions below check which intent calls we made
const cancelIntent = vi.fn(async (id) => ({ id, status: 'canceled' }));
const captureIntent = vi.fn(async (id) => ({ id, status: 'succeeded' }));

vi.mock('../src/services/payment.service.js', () => ({
  toMinorUnits: (a) => a * 100,
  createEscrowIntent: vi.fn(async () => ({ id: 'pi_c_1', client_secret: 'pi_c_1_secret', status: 'requires_payment_method' })),
  retrieveIntent: vi.fn(async (id) => ({ id, client_secret: `${id}_secret`, status: 'requires_capture' })),
  captureIntent: (id) => captureIntent(id),
  cancelIntent: (id) => cancelIntent(id),
  constructWebhookEvent: vi.fn(),
}));

const { api, bearer, registerUser } = await import('./helpers.js');
const { Booking, Job, Payment } = await import('../src/models/index.js');

const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString();

const JOB = {
  title: 'Fix leaking kitchen pipe',
  description: 'Pipe under the kitchen sink is leaking and needs to be replaced today.',
  category: 'plumbing',
  budget: { min: 2000, max: 4000 },
  durationType: 'one_day',
  startDate: tomorrow(),
  location: { lat: 31.52, lng: 74.35 },
  city: 'Lahore',
};

/** A booking with Rs 3,800 authorised and held in escrow. */
async function heldBooking() {
  const client = await registerUser({ role: 'client' });
  const worker = await registerUser({ role: 'worker' });
  await api()
    .post('/api/workers/me')
    .set(bearer(worker.token))
    .send({ categories: ['plumbing'], rates: { daily: 3000 }, location: { lat: 31.52, lng: 74.35 }, city: 'Lahore' });

  const job = await api().post('/api/jobs').set(bearer(client.token)).send(JOB);
  const offer = await api().post(`/api/jobs/${job.body.data._id}/offers`).set(bearer(worker.token)).send({ amount: 3800 });
  await api().post(`/api/offers/${offer.body.data._id}/accept`).set(bearer(client.token));

  const booking = (await api().get('/api/bookings').set(bearer(client.token))).body.data.items[0];
  await api().post(`/api/bookings/${booking._id}/payment`).set(bearer(client.token));
  await api().post(`/api/bookings/${booking._id}/payment/sync`).set(bearer(client.token));

  return { client, worker, jobId: job.body.data._id, bookingId: booking._id };
}

const start = (ctx) => api().post(`/api/bookings/${ctx.bookingId}/start`).set(bearer(ctx.worker.token));

describe('cancelling before work starts', () => {
  beforeEach(() => {
    cancelIntent.mockClear();
    captureIntent.mockClear();
  });

  it('refunds the held payment when the client cancels', async () => {
    const ctx = await heldBooking();
    expect((await Payment.findOne({ booking: ctx.bookingId })).status).toBe('held');

    const res = await api().post(`/api/bookings/${ctx.bookingId}/cancel`).set(bearer(ctx.client.token)).send({ reason: 'No longer needed' });
    expect(res.status).toBe(200);

    expect(cancelIntent).toHaveBeenCalledOnce();
    expect(captureIntent).not.toHaveBeenCalled();

    const payment = await Payment.findOne({ booking: ctx.bookingId });
    expect(payment.status).toBe('refunded');
    expect(payment.refundedAt).toBeInstanceOf(Date);
    expect((await Booking.findById(ctx.bookingId)).status).toBe('cancelled');
  });

  it('reopens the job when the worker is the one who backs out', async () => {
    const ctx = await heldBooking();
    await api().post(`/api/bookings/${ctx.bookingId}/cancel`).set(bearer(ctx.worker.token)).send({ reason: 'Family emergency' });

    expect((await Payment.findOne({ booking: ctx.bookingId })).status).toBe('refunded');
    // The client should be able to hire someone else rather than be left with a dead job
    expect((await Job.findById(ctx.jobId)).status).toBe('posted');
  });
});

describe('cancelling work already in progress', () => {
  beforeEach(() => {
    cancelIntent.mockClear();
    captureIntent.mockClear();
  });

  it('refuses a unilateral cancel once work has started', async () => {
    const ctx = await heldBooking();
    await start(ctx);

    for (const who of [ctx.client, ctx.worker]) {
      const res = await api().post(`/api/bookings/${ctx.bookingId}/cancel`).set(bearer(who.token)).send({ reason: 'Changed my mind' });
      expect(res.status).toBe(409);
    }
    expect(cancelIntent).not.toHaveBeenCalled();
    expect((await Booking.findById(ctx.bookingId)).status).toBe('in_progress');
  });

  it('lets either side ask, and the other side accept — which refunds in full', async () => {
    const ctx = await heldBooking();
    await start(ctx);

    const asked = await api()
      .post(`/api/bookings/${ctx.bookingId}/cancellation`)
      .set(bearer(ctx.worker.token))
      .send({ reason: 'I have been taken ill and cannot finish today' });
    expect(asked.status).toBe(200);
    expect(asked.body.data.cancellationRequest.status).toBe('pending');
    expect(asked.body.data.status).toBe('in_progress'); // nothing is decided yet

    const answered = await api()
      .post(`/api/bookings/${ctx.bookingId}/cancellation/respond`)
      .set(bearer(ctx.client.token))
      .send({ accept: true });
    expect(answered.status).toBe(200);
    expect(answered.body.data.status).toBe('cancelled');

    expect(cancelIntent).toHaveBeenCalledOnce();
    expect((await Payment.findOne({ booking: ctx.bookingId })).status).toBe('refunded');
  });

  it('sends it to dispute when the request is declined, rather than forcing the work on', async () => {
    const ctx = await heldBooking();
    await start(ctx);

    await api().post(`/api/bookings/${ctx.bookingId}/cancellation`).set(bearer(ctx.client.token)).send({ reason: 'The work is not what I asked for' });
    const declined = await api()
      .post(`/api/bookings/${ctx.bookingId}/cancellation/respond`)
      .set(bearer(ctx.worker.token))
      .send({ accept: false, reason: 'I did the work that was agreed' });

    expect(declined.status).toBe(200);
    expect(declined.body.data.status).toBe('disputed');
    expect(declined.body.data.cancellationRequest.status).toBe('declined');

    // The money is still held: an admin decides where it goes, nobody is refunded automatically
    expect(cancelIntent).not.toHaveBeenCalled();
    expect((await Payment.findOne({ booking: ctx.bookingId })).status).toBe('held');
  });

  it('will not let the requester answer their own request', async () => {
    const ctx = await heldBooking();
    await start(ctx);
    await api().post(`/api/bookings/${ctx.bookingId}/cancellation`).set(bearer(ctx.worker.token)).send({ reason: 'Cannot finish this today' });

    const res = await api().post(`/api/bookings/${ctx.bookingId}/cancellation/respond`).set(bearer(ctx.worker.token)).send({ accept: true });
    expect(res.status).toBe(403);
    expect((await Booking.findById(ctx.bookingId)).status).toBe('in_progress');
  });

  it('refuses a second request while one is waiting', async () => {
    const ctx = await heldBooking();
    await start(ctx);
    await api().post(`/api/bookings/${ctx.bookingId}/cancellation`).set(bearer(ctx.worker.token)).send({ reason: 'Cannot finish this today' });

    const again = await api().post(`/api/bookings/${ctx.bookingId}/cancellation`).set(bearer(ctx.client.token)).send({ reason: 'I also want to cancel' });
    expect(again.status).toBe(409);
  });

  it('has nothing to answer when no request was made', async () => {
    const ctx = await heldBooking();
    await start(ctx);

    const res = await api().post(`/api/bookings/${ctx.bookingId}/cancellation/respond`).set(bearer(ctx.client.token)).send({ accept: true });
    expect(res.status).toBe(409);
  });

  it('cannot be requested on a booking that has not started', async () => {
    const ctx = await heldBooking();
    const res = await api().post(`/api/bookings/${ctx.bookingId}/cancellation`).set(bearer(ctx.client.token)).send({ reason: 'Changed my mind about this' });
    expect(res.status).toBe(409);
  });
});

describe('cancelling completed work', () => {
  it('is refused outright once the work is done', async () => {
    const ctx = await heldBooking();
    await start(ctx);
    // Completion is the client's call, and it captures the payment in the same step
    const done = await api().post(`/api/bookings/${ctx.bookingId}/complete`).set(bearer(ctx.client.token));
    expect(done.status).toBe(200);
    expect(done.body.data.status).toBe('completed');

    const cancelled = await api().post(`/api/bookings/${ctx.bookingId}/cancel`).set(bearer(ctx.client.token)).send({ reason: 'Actually I want a refund' });
    expect(cancelled.status).toBe(409);

    const requested = await api().post(`/api/bookings/${ctx.bookingId}/cancellation`).set(bearer(ctx.client.token)).send({ reason: 'Actually I want a refund now' });
    expect(requested.status).toBe(409);
  });
});
