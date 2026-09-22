import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/services/payment.service.js', () => ({
  toMinorUnits: (a) => a * 100,
  createEscrowIntent: vi.fn(async () => ({ id: 'pi_w_1', client_secret: 'pi_w_1_secret', status: 'requires_payment_method' })),
  retrieveIntent: vi.fn(async (id) => ({ id, client_secret: `${id}_secret`, status: 'requires_capture' })),
  captureIntent: vi.fn(async (id) => ({ id, status: 'succeeded' })),
  cancelIntent: vi.fn(async (id) => ({ id, status: 'canceled' })),
  constructWebhookEvent: vi.fn(),
}));

const { api, bearer, registerUser } = await import('./helpers.js');
const { User, Withdrawal } = await import('../src/models/index.js');
const { ROLES } = await import('../src/constants/index.js');

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

const BANK = { type: 'bank', accountTitle: 'Muhammad Yousaf', accountNumber: 'PK36SCBL0000001123456702', bankName: 'HBL' };

async function registerAdmin() {
  const admin = await registerUser({ role: 'client' });
  await User.updateOne({ _id: admin.user._id }, { role: ROLES.ADMIN });
  const res = await api().post('/api/auth/login').send({ email: admin.user.email, password: admin.password });
  return { ...admin, token: res.body.data.token };
}

/** Run a job end to end so the worker has genuinely earned something. */
async function earn(amount = 4000) {
  const client = await registerUser({ role: 'client' });
  const worker = await registerUser({ role: 'worker' });
  await api()
    .post('/api/workers/me')
    .set(bearer(worker.token))
    .send({ categories: ['plumbing'], rates: { daily: 3000 }, location: { lat: 31.52, lng: 74.35 }, city: 'Lahore' });

  const job = await api().post('/api/jobs').set(bearer(client.token)).send(JOB);
  const offer = await api().post(`/api/jobs/${job.body.data._id}/offers`).set(bearer(worker.token)).send({ amount });
  await api().post(`/api/offers/${offer.body.data._id}/accept`).set(bearer(client.token));

  const booking = (await api().get('/api/bookings').set(bearer(client.token))).body.data.items[0];
  await api().post(`/api/bookings/${booking._id}/payment`).set(bearer(client.token));
  await api().post(`/api/bookings/${booking._id}/payment/sync`).set(bearer(client.token));

  return { client, worker, bookingId: booking._id, amount };
}

/** Worker starts, client confirms — the client's confirmation is what captures the escrow. */
async function release(ctx) {
  await api().post(`/api/bookings/${ctx.bookingId}/start`).set(bearer(ctx.worker.token));
  const res = await api().post(`/api/bookings/${ctx.bookingId}/complete`).set(bearer(ctx.client.token));
  if (res.status !== 200) throw new Error(`release failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res;
}
const earnings = (worker) => api().get('/api/withdrawals/earnings').set(bearer(worker.token));

describe('earnings', () => {
  it('counts escrow as pending, not as earned', async () => {
    const ctx = await earn(4000);

    const res = await earnings(ctx.worker);
    expect(res.status).toBe(200);
    expect(res.body.data.inEscrow).toBe(3800); // 4000 less the 5% platform fee
    expect(res.body.data.earned).toBe(0);
    expect(res.body.data.available).toBe(0);
  });

  it('moves it to available once the client releases the payment', async () => {
    const ctx = await earn(4000);
    await release(ctx);

    const res = await earnings(ctx.worker);
    expect(res.body.data.earned).toBe(3800);
    expect(res.body.data.inEscrow).toBe(0);
    expect(res.body.data.available).toBe(3800);
    expect(res.body.data.jobsPaid).toBe(1);
  });

  it('is worker-only', async () => {
    const client = await registerUser({ role: 'client' });
    expect((await api().get('/api/withdrawals/earnings').set(bearer(client.token))).status).toBe(403);
  });
});

describe('requesting a withdrawal', () => {
  let ctx;
  beforeEach(async () => {
    ctx = await earn(4000);
    await release(ctx);
  });

  it('refuses before any payout details are saved', async () => {
    const res = await api().post('/api/withdrawals').set(bearer(ctx.worker.token)).send({ amount: 1000 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/bank or wallet/i);
  });

  it('takes bank details and then allows a request', async () => {
    const saved = await api().put('/api/withdrawals/method').set(bearer(ctx.worker.token)).send(BANK);
    expect(saved.status).toBe(200);

    const res = await api().post('/api/withdrawals').set(bearer(ctx.worker.token)).send({ amount: 3000 });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('requested');
    // Snapshotted, so changing the account later cannot rewrite where this one went
    expect(res.body.data.method.accountNumber).toBe(BANK.accountNumber);

    const after = await earnings(ctx.worker);
    expect(after.body.data.requested).toBe(3000);
    expect(after.body.data.available).toBe(800);
  });

  it('refuses more than the available balance', async () => {
    await api().put('/api/withdrawals/method').set(bearer(ctx.worker.token)).send(BANK);

    const res = await api().post('/api/withdrawals').set(bearer(ctx.worker.token)).send({ amount: 5000 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/up to Rs 3,800/);
  });

  it('refuses a second request while one is still waiting', async () => {
    await api().put('/api/withdrawals/method').set(bearer(ctx.worker.token)).send(BANK);
    await api().post('/api/withdrawals').set(bearer(ctx.worker.token)).send({ amount: 1000 });

    const second = await api().post('/api/withdrawals').set(bearer(ctx.worker.token)).send({ amount: 1000 });
    expect(second.status).toBe(409);
  });

  it('cannot be used to withdraw the same money twice at once', async () => {
    await api().put('/api/withdrawals/method').set(bearer(ctx.worker.token)).send(BANK);

    // Both read the same balance; the unique index is what stops the second being written
    const results = await Promise.allSettled([
      api().post('/api/withdrawals').set(bearer(ctx.worker.token)).send({ amount: 3800 }),
      api().post('/api/withdrawals').set(bearer(ctx.worker.token)).send({ amount: 3800 }),
    ]);
    const created = results.filter((r) => r.value?.status === 201);
    expect(created).toHaveLength(1);
    expect(await Withdrawal.countDocuments({ worker: ctx.worker.user._id })).toBe(1);
  });

  it('enforces the minimum', async () => {
    await api().put('/api/withdrawals/method').set(bearer(ctx.worker.token)).send(BANK);
    const res = await api().post('/api/withdrawals').set(bearer(ctx.worker.token)).send({ amount: 100 });
    expect(res.status).toBe(400);
  });
});

describe('settling a withdrawal', () => {
  let ctx;
  let admin;
  let withdrawalId;

  beforeEach(async () => {
    ctx = await earn(4000);
    await release(ctx);
    admin = await registerAdmin();
    await api().put('/api/withdrawals/method').set(bearer(ctx.worker.token)).send(BANK);
    const res = await api().post('/api/withdrawals').set(bearer(ctx.worker.token)).send({ amount: 3000 });
    withdrawalId = res.body.data._id;
  });

  it('shows the admin the queue with the worker attached', async () => {
    const res = await api().get('/api/withdrawals?status=requested').set(bearer(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.data.items[0].worker.name).toBeDefined();
    expect(res.body.data.items[0].method.accountNumber).toBe(BANK.accountNumber);

    const summary = await api().get('/api/withdrawals/summary').set(bearer(admin.token));
    expect(summary.body.data).toMatchObject({ count: 1, total: 3000 });
  });

  it('requires a reference before it can be marked paid', async () => {
    const res = await api().post(`/api/withdrawals/${withdrawalId}/settle`).set(bearer(admin.token)).send({ paid: true });
    expect(res.status).toBe(400);
  });

  it('marks it paid and takes the amount out of the balance for good', async () => {
    const res = await api()
      .post(`/api/withdrawals/${withdrawalId}/settle`)
      .set(bearer(admin.token))
      .send({ paid: true, reference: 'HBL-88213004' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('paid');

    const after = await earnings(ctx.worker);
    expect(after.body.data.paid).toBe(3000);
    expect(after.body.data.requested).toBe(0);
    expect(after.body.data.available).toBe(800);
  });

  it('returns the money to the balance when rejected', async () => {
    await api()
      .post(`/api/withdrawals/${withdrawalId}/settle`)
      .set(bearer(admin.token))
      .send({ paid: false, note: 'Account title does not match your CNIC' });

    const after = await earnings(ctx.worker);
    expect(after.body.data.requested).toBe(0);
    expect(after.body.data.paid).toBe(0);
    expect(after.body.data.available).toBe(3800);
  });

  it('cannot be settled twice', async () => {
    await api().post(`/api/withdrawals/${withdrawalId}/settle`).set(bearer(admin.token)).send({ paid: true, reference: 'HBL-1' });
    const again = await api().post(`/api/withdrawals/${withdrawalId}/settle`).set(bearer(admin.token)).send({ paid: true, reference: 'HBL-2' });
    expect(again.status).toBe(409);
  });

  it('is refused to a worker trying to settle their own', async () => {
    const res = await api().post(`/api/withdrawals/${withdrawalId}/settle`).set(bearer(ctx.worker.token)).send({ paid: true, reference: 'X' });
    expect(res.status).toBe(403);
  });

  it('masks the account number when the worker reads their own list', async () => {
    const res = await api().get('/api/withdrawals').set(bearer(ctx.worker.token));
    expect(res.body.data.items[0].method.accountNumber).not.toBe(BANK.accountNumber);
    expect(res.body.data.items[0].method.accountNumber).toMatch(/6702$/);
  });
});

describe('payout details are private', () => {
  it('never appear on the public worker profile', async () => {
    const ctx = await earn(4000);
    await api().put('/api/withdrawals/method').set(bearer(ctx.worker.token)).send(BANK);

    const res = await api().get(`/api/workers/${ctx.worker.user._id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.payoutMethod).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain(BANK.accountNumber);
  });
});
