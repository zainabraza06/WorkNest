import { describe, expect, it } from 'vitest';

import { api, bearer, registerUser } from './helpers.js';
import { Booking, Job, Offer, User, WorkerProfile } from '../src/models/index.js';
import { BOOKING_STATUS, ROLES } from '../src/constants/index.js';

/** Admins cannot self-register — the role is granted, so tests grant it the same way. */
async function registerAdmin() {
  const admin = await registerUser({ role: 'client' });
  await User.updateOne({ _id: admin.user._id }, { role: ROLES.ADMIN });
  const res = await api().post('/api/auth/login').send({ email: admin.user.email, password: admin.password });
  return { ...admin, token: res.body.data.token };
}

async function workerWithPendingId() {
  const w = await registerUser({ role: 'worker' });
  await WorkerProfile.create({
    user: w.user._id,
    headline: 'Electrician',
    categories: ['electrical'],
    skills: ['wiring'],
    rates: { daily: 3000 },
    location: { type: 'Point', coordinates: [74.3587, 31.5204] },
    city: 'Lahore',
    idVerification: { status: 'pending', document: { url: 'x', publicId: 'doc_1' }, submittedAt: new Date() },
  });
  return w;
}

describe('admin API access', () => {
  it('refuses anonymous callers', async () => {
    expect((await api().get('/api/admin/overview')).status).toBe(401);
  });

  it('refuses signed-in non-admins', async () => {
    const client = await registerUser({ role: 'client' });
    for (const path of ['/api/admin/overview', '/api/admin/verifications', '/api/admin/disputes']) {
      const res = await api().get(path).set(bearer(client.token));
      expect(res.status).toBe(403);
    }
  });
});

describe('verification queue', () => {
  it('lists workers awaiting a decision, and says whether a document exists', async () => {
    const admin = await registerAdmin();
    await workerWithPendingId();

    const res = await api().get('/api/admin/verifications').set(bearer(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.items[0].status).toBe('pending');
    expect(res.body.data.items[0].hasDocument).toBe(true);
    expect(res.body.data.items[0].user.name).toBeDefined();
  });

  it('defaults to pending and can be pointed at other states', async () => {
    const admin = await registerAdmin();
    const w = await workerWithPendingId();
    await WorkerProfile.updateOne({ user: w.user._id }, { 'idVerification.status': 'verified' });

    expect((await api().get('/api/admin/verifications').set(bearer(admin.token))).body.data.total).toBe(0);
    const verified = await api().get('/api/admin/verifications?status=verified').set(bearer(admin.token));
    expect(verified.body.data.total).toBe(1);
  });

  it('never exposes the ID document itself in the queue', async () => {
    const admin = await registerAdmin();
    await workerWithPendingId();

    const res = await api().get('/api/admin/verifications').set(bearer(admin.token));
    expect(JSON.stringify(res.body)).not.toContain('doc_1');
  });
});

describe('dispute queue', () => {
  it('lists disputed bookings with the reason and the parties', async () => {
    const admin = await registerAdmin();
    const client = await registerUser({ role: 'client' });
    const worker = await registerUser({ role: 'worker' });

    const job = await Job.create({
      client: client.user._id,
      title: 'Fix the wiring',
      description: 'The lights in the lounge keep tripping the breaker.',
      category: 'electrical',
      budget: { min: 2000, max: 4000 },
      durationType: 'one_day',
      startDate: new Date(),
      city: 'Lahore',
      location: { type: 'Point', coordinates: [74.3587, 31.5204] },
    });
    const offer = await Offer.create({
      job: job._id,
      worker: worker.user._id,
      client: client.user._id,
      rounds: [{ by: worker.user._id, byRole: ROLES.WORKER, amount: 3000, durationType: 'one_day', durationCount: 1, startDate: new Date() }],
    });
    await Booking.create({
      job: job._id,
      offer: offer._id,
      worker: worker.user._id,
      client: client.user._id,
      agreedPrice: 3000,
      durationType: 'one_day',
      durationCount: 1,
      startDate: new Date(),
      endDate: new Date(),
      status: BOOKING_STATUS.DISPUTED,
      timeline: [{ status: BOOKING_STATUS.DISPUTED, at: new Date(), note: 'Work was left unfinished' }],
    });

    const res = await api().get('/api/admin/disputes').set(bearer(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(1);

    const [dispute] = res.body.data.items;
    expect(dispute.reason).toBe('Work was left unfinished');
    expect(dispute.job.title).toBe('Fix the wiring');
    expect(dispute.worker.name).toBeDefined();
    expect(dispute.client.name).toBeDefined();
    expect(dispute.agreedPrice).toBe(3000);
  });

  it('is empty when nothing is disputed', async () => {
    const admin = await registerAdmin();
    const res = await api().get('/api/admin/disputes').set(bearer(admin.token));
    expect(res.body.data.total).toBe(0);
  });
});

describe('platform overview', () => {
  it('counts from the collections rather than a stored figure', async () => {
    const admin = await registerAdmin();
    await workerWithPendingId();

    const res = await api().get('/api/admin/overview').set(bearer(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.data.users.workers).toBe(1);
    expect(res.body.data.verification.pending).toBe(1);
    expect(res.body.data.bookings.disputed).toBe(0);
    expect(res.body.data.escrow.held).toBe(0);
  });
});
