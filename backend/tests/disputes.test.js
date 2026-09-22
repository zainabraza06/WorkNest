import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/services/payment.service.js', () => ({
  toMinorUnits: (a) => a * 100,
  createEscrowIntent: vi.fn(async () => ({ id: 'pi_d_1', client_secret: 'pi_d_1_secret', status: 'requires_payment_method' })),
  retrieveIntent: vi.fn(async (id) => ({ id, client_secret: `${id}_secret`, status: 'requires_capture' })),
  captureIntent: vi.fn(async (id) => ({ id, status: 'succeeded' })),
  cancelIntent: vi.fn(async (id) => ({ id, status: 'canceled' })),
  constructWebhookEvent: vi.fn(),
}));

// Cloudinary is not called in tests; evidence uploads return a predictable stub
vi.mock('../src/services/upload.service.js', async (importOriginal) => ({
  ...(await importOriginal()),
  uploadBuffer: vi.fn(async () => ({ url: 'https://cdn.test/evidence.jpg', publicId: 'disputes/evidence' })),
}));

const { api, bearer, registerUser } = await import('./helpers.js');
const { Booking, Payment, User } = await import('../src/models/index.js');
const { ROLES } = await import('../src/constants/index.js');

const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString();
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'); // just enough to be a png

const JOB = {
  title: 'AC not cooling properly',
  description: 'The split unit in the bedroom runs but does not cool. Needs servicing and gas.',
  category: 'ac_repair',
  budget: { min: 3000, max: 5000 },
  durationType: 'one_day',
  startDate: tomorrow(),
  location: { lat: 31.52, lng: 74.35 },
  city: 'Lahore',
};

async function registerAdmin() {
  const admin = await registerUser({ role: 'client' });
  await User.updateOne({ _id: admin.user._id }, { role: ROLES.ADMIN });
  const res = await api().post('/api/auth/login').send({ email: admin.user.email, password: admin.password });
  return { ...admin, token: res.body.data.token };
}

/** A booking in progress with Rs 4,000 held, plus the thread that got them there. */
async function disputable() {
  const client = await registerUser({ role: 'client' });
  const worker = await registerUser({ role: 'worker' });
  await api()
    .post('/api/workers/me')
    .set(bearer(worker.token))
    .send({ categories: ['ac_repair'], rates: { daily: 3500 }, location: { lat: 31.52, lng: 74.35 }, city: 'Lahore' });

  const job = await api().post('/api/jobs').set(bearer(client.token)).send(JOB);
  const offer = await api()
    .post(`/api/jobs/${job.body.data._id}/offers`)
    .set(bearer(worker.token))
    .send({ amount: 4000, coverNote: 'Can come tomorrow morning with gas' });
  await api().post(`/api/offers/${offer.body.data._id}/messages`).set(bearer(client.token)).send({ text: 'Please bring the gas cylinder' });
  await api().post(`/api/offers/${offer.body.data._id}/accept`).set(bearer(client.token));

  const booking = (await api().get('/api/bookings').set(bearer(client.token))).body.data.items[0];
  await api().post(`/api/bookings/${booking._id}/payment`).set(bearer(client.token));
  await api().post(`/api/bookings/${booking._id}/payment/sync`).set(bearer(client.token));
  await api().post(`/api/bookings/${booking._id}/start`).set(bearer(worker.token));

  return { client, worker, bookingId: booking._id, offerId: offer.body.data._id };
}

const openDispute = (ctx, reason = 'The unit still is not cooling after he serviced it.', withPhoto = true) => {
  const req = api().post(`/api/bookings/${ctx.bookingId}/dispute`).set(bearer(ctx.client.token)).field('reason', reason);
  return withPhoto ? req.attach('evidence', PNG, 'before.png') : req;
};

describe('opening a dispute', () => {
  let ctx;
  beforeEach(async () => {
    ctx = await disputable();
  });

  it('records the client statement with its photographs', async () => {
    const res = await openDispute(ctx);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('disputed');

    const [statement] = res.body.data.dispute.statements;
    expect(statement.byRole).toBe('client');
    expect(statement.text).toMatch(/not cooling/);
    expect(statement.evidence).toHaveLength(1);
    expect(statement.evidence[0].url).toBe('https://cdn.test/evidence.jpg');
  });

  it('works without photographs', async () => {
    const res = await openDispute(ctx, 'He never turned up on the day at all.', false);
    expect(res.status).toBe(200);
    expect(res.body.data.dispute.statements[0].evidence).toHaveLength(0);
  });

  it('leaves the money exactly where it is', async () => {
    await openDispute(ctx);
    expect((await Payment.findOne({ booking: ctx.bookingId })).status).toBe('held');
  });
});

describe('the worker right of reply', () => {
  let ctx;
  beforeEach(async () => {
    ctx = await disputable();
    await openDispute(ctx);
  });

  it('lets the worker answer with their own evidence', async () => {
    const res = await api()
      .post(`/api/bookings/${ctx.bookingId}/dispute/statements`)
      .set(bearer(ctx.worker.token))
      .field('text', 'I serviced and gassed the unit; the compressor itself has failed and needs replacing.')
      .attach('evidence', PNG, 'gauge.png');

    expect(res.status).toBe(200);
    expect(res.body.data.dispute.statements).toHaveLength(2);
    expect(res.body.data.dispute.statements[1].byRole).toBe('worker');
    expect(res.body.data.dispute.statements[1].evidence).toHaveLength(1);
  });

  it('lets the client answer back, so it is a conversation', async () => {
    await api()
      .post(`/api/bookings/${ctx.bookingId}/dispute/statements`)
      .set(bearer(ctx.worker.token))
      .field('text', 'The compressor has failed, which is not something I can fix.');
    await api()
      .post(`/api/bookings/${ctx.bookingId}/dispute/statements`)
      .set(bearer(ctx.client.token))
      .field('text', 'He never said the compressor was the problem before taking the job on.');

    const booking = await Booking.findById(ctx.bookingId);
    expect(booking.dispute.statements.map((s) => s.byRole)).toEqual(['client', 'worker', 'client']);
  });

  it('refuses a statement from anyone else', async () => {
    const stranger = await registerUser({ role: 'client' });
    const res = await api()
      .post(`/api/bookings/${ctx.bookingId}/dispute/statements`)
      .set(bearer(stranger.token))
      .field('text', 'I have opinions about this booking.');
    expect(res.status).toBe(404);
  });

  it('refuses a statement once the dispute is closed', async () => {
    const admin = await registerAdmin();
    await api()
      .post(`/api/bookings/${ctx.bookingId}/resolve`)
      .set(bearer(admin.token))
      .send({ outcome: 'refund', note: 'The unit was not repaired, so the client keeps their money.' });

    const res = await api()
      .post(`/api/bookings/${ctx.bookingId}/dispute/statements`)
      .set(bearer(ctx.worker.token))
      .field('text', 'I would like to add something after the fact.');
    expect(res.status).toBe(409);
  });
});

describe('what the admin can see', () => {
  let ctx;
  let admin;
  beforeEach(async () => {
    ctx = await disputable();
    await openDispute(ctx);
    admin = await registerAdmin();
  });

  it('reads the negotiation thread they are not part of', async () => {
    const res = await api().get(`/api/offers/${ctx.offerId}/messages`).set(bearer(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.data.items.some((m) => m.text === 'Please bring the gas cylinder')).toBe(true);
  });

  it('still cannot negotiate in it', async () => {
    const counter = await api().post(`/api/offers/${ctx.offerId}/counter`).set(bearer(admin.token)).send({ amount: 1 });
    expect(counter.status).toBeGreaterThanOrEqual(400);

    const message = await api().post(`/api/offers/${ctx.offerId}/messages`).set(bearer(admin.token)).send({ text: 'hello' });
    expect(message.status).toBeGreaterThanOrEqual(400);
  });

  it('keeps ordinary users out of threads that are not theirs', async () => {
    const stranger = await registerUser({ role: 'worker' });
    const res = await api().get(`/api/offers/${ctx.offerId}/messages`).set(bearer(stranger.token));
    expect(res.status).toBe(404);
  });

  it('sees both statements in the dispute queue entry', async () => {
    await api()
      .post(`/api/bookings/${ctx.bookingId}/dispute/statements`)
      .set(bearer(ctx.worker.token))
      .field('text', 'The compressor has failed and that is a separate job.');

    const booking = await api().get(`/api/bookings/${ctx.bookingId}`).set(bearer(admin.token));
    expect(booking.status).toBe(200);
    expect(booking.body.data.dispute.statements).toHaveLength(2);
  });
});

describe('resolving with a reason', () => {
  let ctx;
  let admin;
  beforeEach(async () => {
    ctx = await disputable();
    await openDispute(ctx);
    admin = await registerAdmin();
  });

  it('refuses a decision with no explanation', async () => {
    const res = await api().post(`/api/bookings/${ctx.bookingId}/resolve`).set(bearer(admin.token)).send({ outcome: 'refund' });
    expect(res.status).toBe(400);
    expect((await Payment.findOne({ booking: ctx.bookingId })).status).toBe('held');
  });

  it('records who decided, which way, and why', async () => {
    const note = 'Photos show the unit was serviced but not cooling; the worker is paid for the service call only.';
    const res = await api().post(`/api/bookings/${ctx.bookingId}/resolve`).set(bearer(admin.token)).send({ outcome: 'release', note });

    expect(res.status).toBe(200);
    const booking = await Booking.findById(ctx.bookingId);
    expect(booking.dispute.resolution.outcome).toBe('release');
    expect(booking.dispute.resolution.note).toBe(note);
    expect(booking.dispute.resolution.by.equals(admin.user._id)).toBe(true);
    expect(booking.dispute.resolution.at).toBeInstanceOf(Date);

    // …and the statements are still there to be read afterwards
    expect(booking.dispute.statements).toHaveLength(1);
    expect((await Payment.findOne({ booking: ctx.bookingId })).status).toBe('released');
  });

  it('refunds the client when it goes the other way', async () => {
    await api()
      .post(`/api/bookings/${ctx.bookingId}/resolve`)
      .set(bearer(admin.token))
      .send({ outcome: 'refund', note: 'No evidence the work was carried out.' });

    expect((await Payment.findOne({ booking: ctx.bookingId })).status).toBe('refunded');
  });
});
