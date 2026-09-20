import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/services/ai.service.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, isAiEnabled: () => false, rankWorkers: vi.fn(async () => null), suggestPrice: vi.fn(async () => null), scoreTrust: vi.fn(async () => null) };
});

const { api, bearer, registerUser } = await import('./helpers.js');
const { SearchImpression, WorkerProfile } = await import('../src/models/index.js');

const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString();

async function makeWorker(overrides = {}) {
  const w = await registerUser({ role: 'worker' });
  await WorkerProfile.create({
    user: w.user._id,
    headline: 'Plumber for leaks',
    categories: ['plumbing'],
    skills: ['leak repair'],
    rates: { daily: 3000 },
    location: { type: 'Point', coordinates: [74.3587, 31.5204] },
    city: 'Lahore',
    stats: { avgRating: 4.5, reviewCount: 10, completedJobs: 8 },
    trustScore: { score: 77 },
    ...overrides,
  });
  return w;
}

describe('ranking feedback loop', () => {
  let client;
  let workerA;
  let workerB;

  beforeEach(async () => {
    client = await registerUser({ role: 'client' });
    workerA = await makeWorker({ headline: 'Plumber for leaks', trustScore: { score: 80 } });
    workerB = await makeWorker({ headline: 'Electrician', categories: ['electrical'], trustScore: { score: 60 } });
  });

  it('logs every search with the features each worker was ranked on', async () => {
    const res = await api().get('/api/workers?q=leak').set(bearer(client.token));
    expect(res.status).toBe(200);
    expect(res.body.data.impressionId).toBeTypeOf('string');

    const impression = await SearchImpression.findById(res.body.data.impressionId);
    expect(impression.client.toString()).toBe(client.user._id);
    expect(impression.query).toBe('leak');
    expect(impression.results.length).toBeGreaterThan(0);

    // Features must be snapshotted, not looked up later — profiles change over time
    const first = impression.results[0];
    expect(first.position).toBe(0);
    expect(first.trustScore).toBeGreaterThan(0);
    expect(first).toHaveProperty('avgRating');
    expect(first.opened).toBe(false);
  });

  it('logs anonymous searches too', async () => {
    const res = await api().get('/api/workers?q=leak');
    const impression = await SearchImpression.findById(res.body.data.impressionId);
    expect(impression.client).toBeNull();
  });

  it('records an open and a hire intent against the right worker', async () => {
    const { body } = await api().get('/api/workers').set(bearer(client.token));
    const impressionId = body.data.impressionId;

    const opened = await api()
      .post('/api/ranking/events')
      .set(bearer(client.token))
      .send({ impressionId, workerId: workerB.user._id, type: 'open' });
    expect(opened.status).toBe(200);
    expect(opened.body.data.recorded).toBe(true);

    await api()
      .post('/api/ranking/events')
      .set(bearer(client.token))
      .send({ impressionId, workerId: workerB.user._id, type: 'hire_intent' });

    const impression = await SearchImpression.findById(impressionId);
    const labelled = impression.results.find((r) => r.worker.toString() === workerB.user._id);
    const other = impression.results.find((r) => r.worker.toString() === workerA.user._id);
    expect(labelled.opened).toBe(true);
    expect(labelled.hireIntent).toBe(true);
    expect(other.opened).toBe(false); // only the clicked worker is a positive
  });

  it('rejects labels from a different client and invalid input', async () => {
    const { body } = await api().get('/api/workers').set(bearer(client.token));
    const stranger = await registerUser({ role: 'client' });

    const res = await api()
      .post('/api/ranking/events')
      .set(bearer(stranger.token))
      .send({ impressionId: body.data.impressionId, workerId: workerA.user._id, type: 'open' });
    expect(res.status).toBe(200);
    expect(res.body.data.recorded).toBe(false); // silently ignored, never an error the UI must handle

    expect((await api().post('/api/ranking/events').send({ impressionId: 'nope', workerId: 'nope', type: 'open' })).status).toBe(400);
    expect((await api().post('/api/ranking/events').send({ impressionId: body.data.impressionId, workerId: workerA.user._id, type: 'purchase' })).status).toBe(400);
  });

  it('attributes a real booking back to the search that surfaced the worker', async () => {
    const search = await api().get('/api/workers?q=leak').set(bearer(client.token));
    const impressionId = search.body.data.impressionId;

    // Full flow: post a job, worker offers, client accepts
    const job = await api().post('/api/jobs').set(bearer(client.token)).send({
      title: 'Fix leaking kitchen pipe',
      description: 'The pipe under the kitchen sink is leaking and needs replacing today.',
      category: 'plumbing',
      budget: { min: 2000, max: 4000 },
      durationType: 'one_day',
      startDate: tomorrow(),
      location: { lat: 31.52, lng: 74.35 },
      city: 'Lahore',
    });
    const offer = await api().post(`/api/jobs/${job.body.data._id}/offers`).set(bearer(workerA.token)).send({ amount: 3000 });
    const accepted = await api().post(`/api/offers/${offer.body.data._id}/accept`).set(bearer(client.token));
    expect(accepted.status).toBe(200);

    const impression = await SearchImpression.findById(impressionId);
    const hired = impression.results.find((r) => r.worker.toString() === workerA.user._id);
    expect(hired.hired).toBe(true);
  });

  it('exports flat training rows', async () => {
    const { body } = await api().get('/api/workers?q=leak').set(bearer(client.token));
    await api()
      .post('/api/ranking/events')
      .set(bearer(client.token))
      .send({ impressionId: body.data.impressionId, workerId: workerA.user._id, type: 'open' });

    const { exportTrainingRows } = await import('../src/services/ranking.service.js');
    const rows = await exportTrainingRows();

    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toHaveProperty('semantic');
    expect(rows[0]).toHaveProperty('trust_score');
    expect(rows[0]).toHaveProperty('position');
    expect(rows.some((r) => r.opened === 1)).toBe(true);
  });

  it('never breaks search when logging fails', async () => {
    const spy = vi.spyOn(SearchImpression, 'create').mockRejectedValueOnce(new Error('mongo down'));

    const res = await api().get('/api/workers?q=leak').set(bearer(client.token));
    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBeGreaterThan(0);
    expect(res.body.data.impressionId).toBeNull();

    spy.mockRestore();
  });
});
