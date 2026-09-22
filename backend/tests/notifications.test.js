import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/services/payment.service.js', () => ({
  toMinorUnits: (a) => a * 100,
  createEscrowIntent: vi.fn(async () => ({ id: 'pi_n_1', client_secret: 'pi_n_1_secret', status: 'requires_payment_method' })),
  retrieveIntent: vi.fn(async (id) => ({ id, client_secret: `${id}_secret`, status: 'requires_capture' })),
  captureIntent: vi.fn(async (id) => ({ id, status: 'succeeded' })),
  cancelIntent: vi.fn(async (id) => ({ id, status: 'canceled' })),
  constructWebhookEvent: vi.fn(),
}));

const { api, bearer, registerUser } = await import('./helpers.js');
const { Notification } = await import('../src/models/index.js');

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

async function setup() {
  const client = await registerUser({ role: 'client' });
  const worker = await registerUser({ role: 'worker' });
  await api()
    .post('/api/workers/me')
    .set(bearer(worker.token))
    .send({ categories: ['plumbing'], rates: { daily: 3000 }, location: { lat: 31.52, lng: 74.35 }, city: 'Lahore' });
  return { client, worker };
}

const inbox = (user) => api().get('/api/notifications').set(bearer(user.token));

describe('notifications', () => {
  let ctx;
  beforeEach(async () => {
    ctx = await setup();
  });

  it('requires signing in', async () => {
    expect((await api().get('/api/notifications')).status).toBe(401);
  });

  it('starts empty', async () => {
    const res = await inbox(ctx.client);
    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual([]);
    expect(res.body.data.unread).toBe(0);
  });

  it('records a hire request for the worker, and nothing for the client who sent it', async () => {
    const { client, worker } = ctx;
    await api()
      .post('/api/jobs')
      .set(bearer(client.token))
      .send({ ...JOB, invitedWorker: worker.user._id, offerAmount: 3500 });

    const res = await inbox(worker);
    expect(res.body.data.unread).toBe(1);
    expect(res.body.data.items[0].type).toBe('hire_request');
    expect(res.body.data.items[0].title).toContain('wants to hire you');
    expect(res.body.data.items[0].link).toMatch(/^\/negotiations\//);

    // The person who caused it does not need telling
    expect((await inbox(client)).body.data.unread).toBe(0);
  });

  it('records a worker bid for the client', async () => {
    const { client, worker } = ctx;
    const job = await api().post('/api/jobs').set(bearer(client.token)).send(JOB);
    await api().post(`/api/jobs/${job.body.data._id}/offers`).set(bearer(worker.token)).send({ amount: 3800 });

    const res = await inbox(client);
    expect(res.body.data.unread).toBe(1);
    expect(res.body.data.items[0].type).toBe('offer_new');
    expect(res.body.data.items[0].body).toContain('Rs 3,800');
  });

  it('tells the other party about a counter, not the person countering', async () => {
    const { client, worker } = ctx;
    const job = await api().post('/api/jobs').set(bearer(client.token)).send(JOB);
    const offer = await api().post(`/api/jobs/${job.body.data._id}/offers`).set(bearer(worker.token)).send({ amount: 3800 });

    await api().post(`/api/offers/${offer.body.data._id}/counter`).set(bearer(client.token)).send({ amount: 3000 });

    const workerInbox = await inbox(worker);
    expect(workerInbox.body.data.items[0].type).toBe('offer_countered');
    expect(workerInbox.body.data.items[0].title).toContain('Rs 3,000');

    // The client caused it, so their only notification is still the original bid
    const clientInbox = await inbox(client);
    expect(clientInbox.body.data.items.map((n) => n.type)).toEqual(['offer_new']);
  });

  it('records a message to its recipient', async () => {
    const { client, worker } = ctx;
    const job = await api().post('/api/jobs').set(bearer(client.token)).send(JOB);
    const offer = await api().post(`/api/jobs/${job.body.data._id}/offers`).set(bearer(worker.token)).send({ amount: 3800 });

    await api().post(`/api/offers/${offer.body.data._id}/messages`).set(bearer(client.token)).send({ text: 'Can you come at 9am?' });

    const res = await inbox(worker);
    expect(res.body.data.items[0].type).toBe('message_new');
    expect(res.body.data.items[0].body).toBe('Can you come at 9am?');
  });

  it('notifies both sides when a booking is confirmed', async () => {
    const { client, worker } = ctx;
    const job = await api().post('/api/jobs').set(bearer(client.token)).send(JOB);
    const offer = await api().post(`/api/jobs/${job.body.data._id}/offers`).set(bearer(worker.token)).send({ amount: 3800 });
    await api().post(`/api/offers/${offer.body.data._id}/accept`).set(bearer(client.token));

    // Accepting is news to the worker
    expect((await inbox(worker)).body.data.items.some((n) => n.type === 'offer_accepted')).toBe(true);

    const booking = (await api().get('/api/bookings').set(bearer(client.token))).body.data.items[0];
    await api().post(`/api/bookings/${booking._id}/payment`).set(bearer(client.token));
    await api().post(`/api/bookings/${booking._id}/payment/sync`).set(bearer(client.token));

    for (const u of [worker, client]) {
      const types = (await inbox(u)).body.data.items.map((n) => n.type);
      expect(types).toContain('booking_confirmed');
    }
  });

  it('marks one read, then all of them', async () => {
    const { client, worker } = ctx;
    const job = await api().post('/api/jobs').set(bearer(client.token)).send(JOB);
    const offer = await api().post(`/api/jobs/${job.body.data._id}/offers`).set(bearer(worker.token)).send({ amount: 3800 });
    await api().post(`/api/offers/${offer.body.data._id}/messages`).set(bearer(worker.token)).send({ text: 'Available tomorrow' });

    const before = await inbox(client);
    expect(before.body.data.unread).toBe(2);

    const one = await api().post('/api/notifications/read').set(bearer(client.token)).send({ id: before.body.data.items[0]._id });
    expect(one.body.data.marked).toBe(1);
    expect(one.body.data.unread).toBe(1);

    const all = await api().post('/api/notifications/read').set(bearer(client.token)).send({});
    expect(all.body.data.unread).toBe(0);
    expect((await inbox(client)).body.data.items.every((n) => n.readAt)).toBe(true);
  });

  it('keeps one account out of another account inbox', async () => {
    const { client, worker } = ctx;
    await api()
      .post('/api/jobs')
      .set(bearer(client.token))
      .send({ ...JOB, invitedWorker: worker.user._id, offerAmount: 3500 });

    const stranger = await registerUser({ role: 'client' });
    expect((await inbox(stranger)).body.data.items).toEqual([]);

    // …and marking read cannot reach across accounts either
    const theirs = await Notification.findOne({ user: worker.user._id });
    const res = await api().post('/api/notifications/read').set(bearer(stranger.token)).send({ id: String(theirs._id) });
    expect(res.body.data.marked).toBe(0);
    expect((await Notification.findById(theirs._id)).readAt).toBeNull();
  });
});
