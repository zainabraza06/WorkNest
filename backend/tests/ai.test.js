import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The AI service itself is tested in ai-service/tests. Here we check the backend's
 * integration: does it send the right shape, use the response, and degrade gracefully?
 */
const aiState = { available: true, ranking: new Map(), price: null };

vi.mock('../src/services/ai.service.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    isAiEnabled: () => aiState.available,
    rankWorkers: vi.fn(async ({ candidates }) => {
      if (!aiState.available) return null;
      aiState.lastCandidates = candidates;
      return aiState.ranking;
    }),
    scoreTrust: vi.fn(async () => (aiState.available ? { score: 91, label: 'Highly Trusted', breakdown: { rating: 24 }, source: 'dummy-weighted-v1' } : null)),
    suggestPrice: vi.fn(async () => (aiState.available ? aiState.price : null)),
  };
});

const { api, bearer, registerUser } = await import('./helpers.js');
const { WorkerProfile } = await import('../src/models/index.js');
const { refreshTrustScore } = await import('../src/services/trust.service.js');

const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString();

async function makeWorker(overrides = {}) {
  const w = await registerUser({ role: 'worker' });
  const profile = await WorkerProfile.create({
    user: w.user._id,
    headline: 'Worker',
    categories: ['plumbing'],
    skills: [],
    rates: { daily: 3000 },
    location: { type: 'Point', coordinates: [74.3587, 31.5204] },
    city: 'Lahore',
    ...overrides,
  });
  return { ...w, profile };
}

describe('AI-ranked worker discovery', () => {
  beforeEach(() => {
    aiState.available = true;
    aiState.ranking = new Map();
    aiState.price = null;
  });

  it('reorders results by AI score and returns match reasons', async () => {
    const plumber = await makeWorker({ headline: 'Plumber for leaks', trustScore: { score: 40 } });
    const electrician = await makeWorker({ headline: 'Electrician', categories: ['electrical'], trustScore: { score: 95 } });

    // The AI ranks the plumber first even though the electrician has the higher Trust Score
    aiState.ranking = new Map([
      [String(plumber.profile._id), { score: 0.92, reasons: ['Skills match what you described'] }],
      [String(electrician.profile._id), { score: 0.31, reasons: [] }],
    ]);

    const res = await api().get('/api/workers?mode=smart&q=my kitchen pipe is leaking');
    expect(res.status).toBe(200);
    expect(res.body.data.mode).toBe('smart');
    expect(res.body.data.items.map((w) => w.user._id)).toEqual([plumber.user._id, electrician.user._id]);
    expect(res.body.data.items[0].matchScore).toBe(0.92);
    expect(res.body.data.items[0].matchReasons).toContain('Skills match what you described');

    // Candidates are sent in the AI service's snake_case contract, without private fields
    const sent = aiState.lastCandidates[0];
    expect(sent).toHaveProperty('worker_id');
    expect(sent).toHaveProperty('trust_score');
    expect(sent).not.toHaveProperty('idVerification');
  });

  it('still applies hard filters in smart mode', async () => {
    const cheap = await makeWorker({ rates: { daily: 1500 } });
    const pricey = await makeWorker({ rates: { daily: 9000 } });
    aiState.ranking = new Map([
      [String(pricey.profile._id), { score: 0.99, reasons: [] }],
      [String(cheap.profile._id), { score: 0.4, reasons: [] }],
    ]);

    const res = await api().get('/api/workers?mode=smart&q=plumbing help&maxRate=2000');
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].user._id).toBe(cheap.user._id);
  });

  it('falls back to keyword search when the AI service is down', async () => {
    await makeWorker({ headline: 'Plumber for leaks and pipes', skills: ['leak repair'] });
    aiState.available = false;

    const res = await api().get('/api/workers?mode=smart&q=leak');
    expect(res.status).toBe(200);
    expect(res.body.data.mode).toBe('keyword');
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.degraded).toBe(true);
  });

  it('drops the free text rather than returning nothing when the AI is down', async () => {
    // The whole point of the AI path: these words appear in no profile, so the text index
    // finds nothing. An empty page would claim no such worker exists.
    await makeWorker({ headline: 'Licensed electrician', categories: ['electrical'] });
    aiState.available = false;

    const res = await api().get('/api/workers?mode=smart&q=the lights keep tripping when I turn on the heater');
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.relaxedQuery).toBe(true);
    expect(res.body.data.degraded).toBe(true);
  });

  it('keeps hard filters when it relaxes the free text', async () => {
    await makeWorker({ headline: 'Licensed electrician', categories: ['electrical'], city: 'Lahore' });
    aiState.available = false;

    const res = await api().get('/api/workers?mode=smart&city=Karachi&q=the lights keep tripping');
    expect(res.body.data.relaxedQuery).toBe(true);
    expect(res.body.data.items).toHaveLength(0);
  });

  it('leaves an explicit keyword search empty rather than second-guessing it', async () => {
    await makeWorker({ headline: 'Licensed electrician', categories: ['electrical'] });

    const res = await api().get('/api/workers?mode=keyword&q=the lights keep tripping');
    expect(res.body.data.items).toHaveLength(0);
    expect(res.body.data.relaxedQuery).toBe(false);
    expect(res.body.data.degraded).toBe(false);
  });

  it('uses keyword mode when no query is given', async () => {
    await makeWorker({});
    const res = await api().get('/api/workers?mode=smart');
    expect(res.body.data.mode).toBe('keyword');
  });
});

describe('fair-price suggestions', () => {
  beforeEach(() => {
    aiState.available = true;
    aiState.price = {
      min: 2100,
      median: 2600,
      max: 3100,
      perUnit: 2600,
      currency: 'PKR',
      confidence: 0.9,
      source: 'dummy-rulebased-v1',
      explanation: 'Typical rate for plumbing in Lahore is about Rs 2,600 per day.',
    };
  });

  it('returns a suggestion for a category and city', async () => {
    const res = await api().get('/api/price/suggest?category=plumbing&city=Lahore');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ min: 2100, median: 2600, max: 3100, currency: 'PKR' });
  });

  it('validates the query', async () => {
    expect((await api().get('/api/price/suggest')).status).toBe(400);
    expect((await api().get('/api/price/suggest?category=astrology')).status).toBe(400);
    expect((await api().get('/api/price/suggest?category=plumbing&durationType=yearly')).status).toBe(400);
  });

  it('reports 503 rather than inventing a number when the AI service is down', async () => {
    aiState.available = false;
    aiState.price = null;
    const res = await api().get('/api/price/suggest?category=plumbing&city=Lahore');
    expect(res.status).toBe(503);
  });

  it('snapshots the suggested price on a new job, and posts fine without one', async () => {
    const client = await registerUser({ role: 'client' });
    const body = {
      title: 'Fix leaking kitchen pipe',
      description: 'The pipe under the kitchen sink has been leaking since this morning.',
      category: 'plumbing',
      budget: { min: 2000, max: 4000 },
      durationType: 'one_day',
      startDate: tomorrow(),
      location: { lat: 31.5204, lng: 74.3587 },
      city: 'Lahore',
    };

    const withAi = await api().post('/api/jobs').set(bearer(client.token)).send(body);
    expect(withAi.status).toBe(201);
    expect(withAi.body.data.suggestedPrice).toMatchObject({ min: 2100, median: 2600, max: 3100 });

    aiState.available = false;
    aiState.price = null;
    const withoutAi = await api().post('/api/jobs').set(bearer(client.token)).send(body);
    expect(withoutAi.status).toBe(201);
    expect(withoutAi.body.data.suggestedPrice?.min).toBeUndefined();
  });
});

describe('trust scoring via the AI service', () => {
  beforeEach(() => {
    aiState.available = true;
  });

  it('stores the AI score when available', async () => {
    const worker = await makeWorker({});
    const trust = await refreshTrustScore(worker.user._id);
    expect(trust).toMatchObject({ score: 91, label: 'Highly Trusted', source: 'dummy-weighted-v1' });
  });

  it('falls back to the placeholder scorer when the AI service is down', async () => {
    const worker = await makeWorker({});
    aiState.available = false;

    const trust = await refreshTrustScore(worker.user._id);
    expect(trust.source).toBe('placeholder');
    expect(trust.score).toBeGreaterThanOrEqual(0);
    expect(trust.score).toBeLessThanOrEqual(100);
  });
});
