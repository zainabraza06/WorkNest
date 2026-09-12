import { beforeEach, describe, expect, it } from 'vitest';
import { api, bearer, registerUser } from './helpers.js';
import { WorkerProfile } from '../src/models/index.js';

const tomorrow = () => new Date(Date.now() + 24 * 3600 * 1000).toISOString();

const jobBody = (overrides = {}) => ({
  title: 'Fix leaking kitchen pipe',
  description: 'The pipe under the kitchen sink has been leaking since morning, needs replacing.',
  category: 'plumbing',
  skills: ['pipe fitting'],
  budget: { min: 2000, max: 4000 },
  durationType: 'one_day',
  startDate: tomorrow(),
  urgency: 'urgent',
  location: { lat: 31.5204, lng: 74.3587 }, // Lahore
  city: 'Lahore',
  address: 'House 12, Street 4, Johar Town',
  ...overrides,
});

describe('jobs', () => {
  let client;
  let worker;

  beforeEach(async () => {
    client = await registerUser({ role: 'client' });
    worker = await registerUser({ role: 'worker' });
  });

  it('lets a client post a job and rejects bad input', async () => {
    const ok = await api().post('/api/jobs').set(bearer(client.token)).send(jobBody());
    expect(ok.status).toBe(201);
    expect(ok.body.data.status).toBe('posted');

    const bad = await api()
      .post('/api/jobs')
      .set(bearer(client.token))
      .send(jobBody({ budget: { min: 5000, max: 1000 }, startDate: '2000-01-01', title: 'x' }));
    expect(bad.status).toBe(400);
    expect(bad.body.details.map((d) => d.path)).toEqual(expect.arrayContaining(['budget.max', 'startDate', 'title']));

    const asWorker = await api().post('/api/jobs').set(bearer(worker.token)).send(jobBody());
    expect(asWorker.status).toBe(403);
  });

  it('filters, keyword-searches and geo-sorts open jobs', async () => {
    const post = (b) => api().post('/api/jobs').set(bearer(client.token)).send(jobBody(b));
    await post({});
    await post({
      title: 'Monthly house cleaning help',
      description: 'Looking for reliable house help for daily cleaning and dishes, six days a week.',
      category: 'house_help',
      skills: ['cleaning'],
      durationType: 'monthly',
      budget: { min: 25000, max: 35000 },
      location: { lat: 31.47, lng: 74.27 }, // ~9 km away
    });
    await post({
      title: 'Paint two bedrooms',
      description: 'Two bedrooms need a fresh coat of emulsion paint, walls already prepared.',
      category: 'painting',
      skills: [],
      location: { lat: 24.8607, lng: 67.0011 }, // Karachi
      city: 'Karachi',
    });

    const all = await api().get('/api/jobs');
    expect(all.body.data.total).toBe(3);
    expect(all.body.data.items[0].address).toBeUndefined();

    const byCategory = await api().get('/api/jobs?category=plumbing,painting');
    expect(byCategory.body.data.total).toBe(2);

    const monthly = await api().get('/api/jobs?durationType=monthly');
    expect(monthly.body.data.items.map((j) => j.category)).toEqual(['house_help']);

    const keyword = await api().get('/api/jobs?q=pipe');
    expect(keyword.body.data.items[0].title).toMatch(/pipe/i);

    const budget = await api().get('/api/jobs?minBudget=20000');
    expect(budget.body.data.total).toBe(1);

    const near = await api().get('/api/jobs?lat=31.5204&lng=74.3587&radiusKm=20&sort=nearest');
    expect(near.status).toBe(200);
    expect(near.body.data.total).toBe(2);
    expect(near.body.data.items[0].distanceKm).toBe(0);
    expect(near.body.data.items[1].distanceKm).toBeGreaterThan(5);

    const nearKeyword = await api().get('/api/jobs?lat=31.5204&lng=74.3587&radiusKm=20&sort=nearest&q=cleaning');
    expect(nearKeyword.body.data.total).toBe(1);

    const badGeo = await api().get('/api/jobs?sort=nearest');
    expect(badGeo.status).toBe(400);
  });

  it('shows the exact address only to the owner', async () => {
    const { body } = await api().post('/api/jobs').set(bearer(client.token)).send(jobBody());
    const id = body.data._id;

    const asOwner = await api().get(`/api/jobs/${id}`).set(bearer(client.token));
    expect(asOwner.body.data.address).toBe('House 12, Street 4, Johar Town');

    const asWorker = await api().get(`/api/jobs/${id}`).set(bearer(worker.token));
    expect(asWorker.body.data.address).toBeUndefined();
    expect(asWorker.body.data.myOffer).toBeNull();
  });

  it('only the owner can edit or cancel, and cancelled jobs leave the listing', async () => {
    const { body } = await api().post('/api/jobs').set(bearer(client.token)).send(jobBody());
    const id = body.data._id;
    const other = await registerUser({ role: 'client' });

    expect((await api().patch(`/api/jobs/${id}`).set(bearer(other.token)).send({ urgency: 'flexible' })).status).toBe(403);

    const edited = await api().patch(`/api/jobs/${id}`).set(bearer(client.token)).send({ urgency: 'flexible' });
    expect(edited.body.data.urgency).toBe('flexible');

    const cancelled = await api().post(`/api/jobs/${id}/cancel`).set(bearer(client.token)).send({});
    expect(cancelled.body.data.status).toBe('cancelled');

    expect((await api().patch(`/api/jobs/${id}`).set(bearer(client.token)).send({ urgency: 'urgent' })).status).toBe(409);
    expect((await api().get('/api/jobs')).body.data.total).toBe(0);

    const mine = await api().get('/api/jobs/mine').set(bearer(client.token));
    expect(mine.body.data.total).toBe(1);
  });
});

describe('worker search', () => {
  async function makeWorker(overrides) {
    const w = await registerUser({ role: 'worker' });
    await WorkerProfile.create({
      user: w.user._id,
      headline: 'Worker',
      categories: ['plumbing'],
      skills: [],
      rates: { daily: 3000 },
      location: { type: 'Point', coordinates: [74.3587, 31.5204] },
      city: 'Lahore',
      ...overrides,
    });
    return w;
  }

  it('filters and sorts workers', async () => {
    await makeWorker({ headline: 'Expert plumber for leaks', skills: ['pipe fitting', 'leak repair'], rates: { daily: 2500 }, trustScore: { score: 90, label: 'Highly Trusted' } });
    await makeWorker({ headline: 'Electrician', categories: ['electrical'], skills: ['wiring'], rates: { daily: 4000 }, trustScore: { score: 70 }, idVerification: { status: 'verified' } });
    await makeWorker({ headline: 'Karachi painter', categories: ['painting'], city: 'Karachi', location: { type: 'Point', coordinates: [67.0011, 24.8607] }, rates: { daily: 3000 }, trustScore: { score: 60 } });

    const all = await api().get('/api/workers');
    expect(all.body.data.total).toBe(3);
    expect(all.body.data.items.map((w) => w.trustScore.score)).toEqual([90, 70, 60]);
    expect(all.body.data.items[0].idVerification).toBeUndefined();

    const cheap = await api().get('/api/workers?sort=price_low&maxRate=3500');
    expect(cheap.body.data.items.map((w) => w.rates.daily)).toEqual([2500, 3000]);

    const verified = await api().get('/api/workers?verified=true');
    expect(verified.body.data.items).toHaveLength(1);
    expect(verified.body.data.items[0].idVerified).toBe(true);

    const keyword = await api().get('/api/workers?q=leak&sort=relevance');
    expect(keyword.body.data.items[0].headline).toMatch(/plumber/);

    const near = await api().get('/api/workers?lat=31.52&lng=74.35&radiusKm=30&sort=nearest');
    expect(near.body.data.total).toBe(2);
    expect(near.body.data.items[0].distanceKm).toBeTypeOf('number');
  });
});
