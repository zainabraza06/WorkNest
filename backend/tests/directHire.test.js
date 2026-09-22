import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/services/payment.service.js', () => ({
  toMinorUnits: (a) => a * 100,
  createEscrowIntent: vi.fn(async () => ({ id: 'pi_test_1', client_secret: 'pi_test_1_secret', status: 'requires_payment_method' })),
  retrieveIntent: vi.fn(async (id) => ({ id, client_secret: `${id}_secret`, status: 'requires_capture' })),
  captureIntent: vi.fn(async (id) => ({ id, status: 'succeeded' })),
  cancelIntent: vi.fn(async (id) => ({ id, status: 'canceled' })),
  constructWebhookEvent: vi.fn(),
}));

const { api, bearer, registerUser } = await import('./helpers.js');
const { Booking, Job, Offer } = await import('../src/models/index.js');

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
  const other = await registerUser({ role: 'worker' });

  for (const w of [worker, other]) {
    await api()
      .post('/api/workers/me')
      .set(bearer(w.token))
      .send({ categories: ['plumbing'], rates: { daily: 3000 }, location: { lat: 31.52, lng: 74.35 }, city: 'Lahore' });
  }
  return { client, worker, other };
}

const hire = (client, workerId, body = {}) =>
  api()
    .post('/api/jobs')
    .set(bearer(client.token))
    .send({ ...JOB, invitedWorker: workerId, offerAmount: 3500, ...body });

describe('hiring a worker directly', () => {
  let ctx;
  beforeEach(async () => {
    ctx = await setup();
  });

  it('sends the worker an offer instead of posting an open job', async () => {
    const { client, worker } = ctx;

    const res = await hire(client, worker.user._id, { offerTerms: 'Can you come tomorrow morning?' });
    expect(res.status).toBe(201);

    // The job exists, but it is addressed to one person and already in negotiation
    expect(res.body.data.invitedWorker).toBe(worker.user._id);
    expect(res.body.data.status).toBe('negotiating');

    // …and the request itself is the client's opening round, waiting on the worker
    const offer = res.body.data.offer;
    expect(offer.awaitingRole).toBe('worker');
    expect(offer.rounds).toHaveLength(1);
    expect(offer.rounds[0].byRole).toBe('client');
    expect(offer.rounds[0].amount).toBe(3500);
    expect(offer.rounds[0].terms).toBe('Can you come tomorrow morning?');
  });

  it('shows the invited worker the offer in their negotiations', async () => {
    const { client, worker } = ctx;
    await hire(client, worker.user._id);

    const list = await api().get('/api/offers').set(bearer(worker.token));
    expect(list.status).toBe(200);
    expect(list.body.data.items).toHaveLength(1);
    expect(list.body.data.items[0].awaitingRole).toBe('worker');
  });

  it('keeps the job out of the public browse list', async () => {
    const { client, worker, other } = ctx;
    await hire(client, worker.user._id);

    const browse = await api().get('/api/jobs').set(bearer(other.token));
    expect(browse.body.data.total).toBe(0);
  });

  it('refuses a bid from any worker it was not sent to', async () => {
    const { client, worker, other } = ctx;
    const res = await hire(client, worker.user._id);

    const bid = await api().post(`/api/jobs/${res.body.data._id}/offers`).set(bearer(other.token)).send({ amount: 3000 });
    expect(bid.status).toBe(403);
  });

  it('lets the invited worker accept, which books the job', async () => {
    const { client, worker } = ctx;
    const res = await hire(client, worker.user._id);

    const accepted = await api().post(`/api/offers/${res.body.data.offer._id}/accept`).set(bearer(worker.token));
    expect(accepted.status).toBe(200);
    expect(accepted.body.data.offer.status).toBe('accepted');

    const job = await Job.findById(res.body.data._id);
    expect(job.status).toBe('confirmed');
    expect(job.hiredWorker.equals(worker.user._id)).toBe(true);
    expect(await Booking.countDocuments({ job: job._id })).toBe(1);
  });

  it('lets the invited worker counter instead, handing the turn back', async () => {
    const { client, worker } = ctx;
    const res = await hire(client, worker.user._id);

    const counter = await api()
      .post(`/api/offers/${res.body.data.offer._id}/counter`)
      .set(bearer(worker.token))
      .send({ amount: 4200, message: 'Parts will cost more than that.' });

    expect(counter.status).toBe(200);
    expect(counter.body.data.awaitingRole).toBe('client');
    expect(counter.body.data.rounds).toHaveLength(2);
  });

  it('rejects a direct hire that names a worker without an amount', async () => {
    const { client, worker } = ctx;
    const res = await api()
      .post('/api/jobs')
      .set(bearer(client.token))
      .send({ ...JOB, invitedWorker: worker.user._id });

    expect(res.status).toBe(400); // the app's convention for a failed validator
    expect(res.body.details.some((d) => d.path === 'offerAmount')).toBe(true);
  });

  it('refuses to address a job to someone with no worker profile', async () => {
    const { client } = ctx;
    const stranger = await registerUser({ role: 'worker' }); // registered, never onboarded

    const res = await hire(client, stranger.user._id);
    expect(res.status).toBe(404);
  });

  it('still posts an ordinary open job when no worker is named', async () => {
    const { client, other } = ctx;

    const res = await api().post('/api/jobs').set(bearer(client.token)).send(JOB);
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('posted');
    expect(res.body.data.invitedWorker).toBeUndefined();
    expect(res.body.data.offer).toBeUndefined();

    expect((await api().get('/api/jobs').set(bearer(other.token))).body.data.total).toBe(1);
    expect(await Offer.countDocuments({ job: res.body.data._id })).toBe(0);
  });
});
