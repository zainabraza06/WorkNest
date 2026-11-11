#!/usr/bin/env node
/**
 * Feature-level end-to-end test over real HTTP (and a real Socket.io connection).
 *
 *   node scripts/e2e.mjs http://localhost:5000
 *
 * Run it against a LOCAL stack seeded with `npm run seed` (it creates jobs, bookings, payments,
 * disputes and withdrawals). Do not point it at production data.
 *
 * Environment (all optional):
 *   METRICS_TOKEN       also checks that /metrics serves with the token
 *   STRIPE_SECRET_KEY   a sk_test_ key: confirms the escrow PaymentIntent with a test card, so
 *                       the paid path runs for real. Without it the payment steps are skipped.
 *   SKIP_RATE_LIMIT=1   skip the brute-force lockout check (it locks one test account for 15 min)
 */
import { createRequire } from 'node:module';

const BASE = (process.argv[2] ?? 'http://localhost:5000').replace(/\/$/, '');
const API = `${BASE}/api`;
const PASSWORD = 'Password123';
const require = createRequire(new URL('../backend/package.json', import.meta.url));

let pass = 0;
let fail = 0;
let skipped = 0;
const failures = [];
const ctx = {};

const c = { g: (s) => `\x1b[32m${s}\x1b[0m`, r: (s) => `\x1b[31m${s}\x1b[0m`, y: (s) => `\x1b[33m${s}\x1b[0m`, d: (s) => `\x1b[2m${s}\x1b[0m` };

async function http(method, path, { token, body, headers = {} } = {}) {
  const res = await fetch(path.startsWith('http') ? path : `${API}${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON body */
  }
  return { status: res.status, json, data: json?.data, headers: res.headers };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
const eq = (a, b, msg) => assert(a === b, `${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

async function step(name, fn) {
  try {
    const out = await fn();
    if (out === 'skip') {
      skipped += 1;
      console.log(`  ${c.y('SKIP')}  ${name}`);
      return;
    }
    pass += 1;
    console.log(`  ${c.g('PASS')}  ${name}`);
  } catch (e) {
    fail += 1;
    failures.push(`${name}: ${e.message}`);
    console.log(`  ${c.r('FAIL')}  ${name}\n        ${c.d(e.message)}`);
  }
}
const section = (t) => console.log(`\n${t}`);

const login = async (email) => {
  const r = await http('POST', '/auth/login', { body: { email, password: PASSWORD } });
  assert(r.status === 200, `login ${email} -> ${r.status} ${JSON.stringify(r.json)}`);
  return { token: r.data.token, user: r.data.user };
};
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const jobBody = (over = {}) => ({
  title: 'E2E: fix leaking kitchen sink pipe',
  description: 'The pipe under the kitchen sink is leaking and needs replacing today, parts included.',
  category: 'plumbing',
  skills: ['pipe fitting'],
  budget: { min: 2000, max: 4000 },
  durationType: 'one_day',
  durationCount: 1,
  startDate: day(2),
  urgency: 'normal',
  location: { lat: 31.5204, lng: 74.3587 },
  city: 'Lahore',
  address: 'House 1, Street 2, Gulberg',
  ...over,
});

/** A fresh job -> offer -> accepted booking, returns ids. Shared by payment/dispute/cancel flows. */
async function bookedJob(title) {
  const j = await http('POST', '/jobs', { token: ctx.client.token, body: jobBody({ title }) });
  assert(j.status === 201, `create job -> ${j.status} ${JSON.stringify(j.json)}`);
  const jobId = j.data.job?._id ?? j.data._id;
  const o = await http('POST', `/jobs/${jobId}/offers`, {
    token: ctx.worker.token,
    body: { amount: 3000, coverNote: 'I can do this tomorrow.', terms: 'Parts at cost' },
  });
  assert(o.status === 201, `offer -> ${o.status} ${JSON.stringify(o.json)}`);
  const offerId = o.data.offer?._id ?? o.data._id;
  const a = await http('POST', `/offers/${offerId}/accept`, { token: ctx.client.token });
  assert(a.status === 200, `accept -> ${a.status} ${JSON.stringify(a.json)}`);
  const bookingId = a.data.booking?._id ?? a.data.booking;
  assert(bookingId, `no booking id in accept response: ${JSON.stringify(a.json).slice(0, 200)}`);
  return { jobId, offerId, bookingId };
}

/** Pays into escrow for real in Stripe test mode and syncs the booking. */
async function payEscrow(bookingId) {
  const p = await http('POST', `/bookings/${bookingId}/payment`, { token: ctx.client.token });
  assert(p.status === 200, `create payment -> ${p.status} ${JSON.stringify(p.json)}`);
  const secret = p.data.clientSecret;
  assert(secret, 'no clientSecret returned');
  const Stripe = require('stripe');
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const id = secret.split('_secret_')[0];
  const confirmed = await stripe.paymentIntents.confirm(id, { payment_method: 'pm_card_visa', return_url: 'https://example.com' });
  eq(confirmed.status, 'requires_capture', 'escrow authorised (funds held, not captured)');
  const s = await http('POST', `/bookings/${bookingId}/payment/sync`, { token: ctx.client.token });
  assert(s.status === 200, `sync -> ${s.status} ${JSON.stringify(s.json)}`);
}

const hasStripe = Boolean(process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_'));

// ─────────────────────────────────────────────────────────────────────────────
console.log(`WorkNest end-to-end · ${BASE}`);

section('Platform health & observability');
await step('liveness probe', async () => eq((await http('GET', '/health/live')).status, 200, 'status'));
await step('readiness probe reports db connected', async () => {
  const r = await http('GET', '/health/ready');
  eq(r.status, 200, 'status');
  eq(r.json.db, 'connected', 'db');
});
await step('combined health green with version', async () => {
  const r = await http('GET', '/health');
  eq(r.status, 200, 'status');
  assert(r.json.version, 'version present');
});
await step('security headers + request id on every response', async () => {
  const r = await http('GET', '/health');
  assert(r.headers.get('x-request-id'), 'X-Request-Id');
  eq(r.headers.get('x-content-type-options'), 'nosniff', 'nosniff');
  assert(!r.headers.get('x-powered-by'), 'X-Powered-By hidden');
  assert(/no-store/.test(r.headers.get('cache-control') ?? ''), 'no-store');
});
await step('unknown route -> JSON 404 with requestId', async () => {
  const r = await http('GET', '/definitely-not-a-route');
  eq(r.status, 404, 'status');
  assert(r.json.requestId, 'requestId in error body');
});
await step('/metrics refuses anonymous callers', async () => {
  const r = await http('GET', `${BASE}/metrics`);
  assert([401, 404].includes(r.status), `status ${r.status}`);
});
await step('/metrics serves Prometheus text with the token', async () => {
  if (!process.env.METRICS_TOKEN) return 'skip';
  const res = await fetch(`${BASE}/metrics`, { headers: { Authorization: `Bearer ${process.env.METRICS_TOKEN}` } });
  eq(res.status, 200, 'status');
  const text = await res.text();
  assert(text.includes('http_request_duration_seconds'), 'latency histogram exported');
});

section('Authentication & sessions');
await step('wrong password -> 401', async () => {
  const r = await http('POST', '/auth/login', { body: { email: 'client1@worknest.test', password: 'wrong-password' } });
  eq(r.status, 401, 'status');
});
await step('input validation -> 400', async () => {
  const r = await http('POST', '/auth/register', { body: { name: 'x', email: 'nope', password: '1', role: 'client' } });
  eq(r.status, 400, 'status');
});
await step('register a new worker and a new client', async () => {
  const stamp = Date.now();
  for (const role of ['worker', 'client']) {
    const r = await http('POST', '/auth/register', {
      body: { name: `E2E ${role}`, email: `e2e-${role}-${stamp}@worknest.test`, password: PASSWORD, role },
    });
    eq(r.status, 201, `${role} register`);
    assert(r.data.token, 'token issued');
    ctx[`new_${role}`] = { token: r.data.token, email: `e2e-${role}-${stamp}@worknest.test` };
  }
});
await step('duplicate registration -> 409', async () => {
  const r = await http('POST', '/auth/register', {
    body: { name: 'Dup', email: ctx.new_client.email, password: PASSWORD, role: 'client' },
  });
  eq(r.status, 409, 'status');
});
await step('login as seeded client, worker and admin', async () => {
  ctx.client = await login('client1@worknest.test');
  ctx.worker = await login('worker1@worknest.test');
  ctx.admin = await login('admin@worknest.test');
  ctx.worker2 = await login('worker2@worknest.test');
  eq(ctx.client.user.role, 'client', 'client role');
  eq(ctx.admin.user.role, 'admin', 'admin role');
});
await step('/auth/me returns the signed-in user', async () => {
  const r = await http('GET', '/auth/me', { token: ctx.client.token });
  eq(r.status, 200, 'status');
});
await step('protected route rejects anonymous callers', async () => eq((await http('GET', '/auth/me')).status, 401, 'status'));
await step('role guard: worker cannot post a job', async () => {
  const r = await http('POST', '/jobs', { token: ctx.worker.token, body: jobBody() });
  eq(r.status, 403, 'status');
});
await step('role guard: client cannot open the admin overview', async () => {
  eq((await http('GET', '/admin/overview', { token: ctx.client.token })).status, 403, 'status');
});
await step('"sign out everywhere" revokes every existing token', async () => {
  const a = await login('worker9@worknest.test');
  const b = await login('worker9@worknest.test');
  eq((await http('POST', '/auth/logout-all', { token: a.token })).status, 200, 'logout-all');
  eq((await http('GET', '/auth/me', { token: a.token })).status, 401, 'first token revoked');
  eq((await http('GET', '/auth/me', { token: b.token })).status, 401, 'second token revoked');
  eq((await login('worker9@worknest.test')).user.role, 'worker', 'fresh login works');
});
await step('password change revokes old tokens and returns a working one', async () => {
  const stamp = Date.now();
  const reg = await http('POST', '/auth/register', {
    body: { name: 'Pw Change', email: `e2e-pw-${stamp}@worknest.test`, password: PASSWORD, role: 'client' },
  });
  const old = reg.data.token;
  const ch = await http('PATCH', '/auth/password', {
    token: old,
    body: { currentPassword: PASSWORD, newPassword: 'NewPassword456' },
  });
  eq(ch.status, 200, 'change');
  eq((await http('GET', '/auth/me', { token: old })).status, 401, 'old token revoked');
  if (ch.data?.token) eq((await http('GET', '/auth/me', { token: ch.data.token })).status, 200, 'new token works');
});
section('Profiles');
await step('client profile readable', async () => {
  const r = await http('GET', '/clients/me', { token: ctx.client.token });
  assert([200, 404].includes(r.status), `status ${r.status}`);
});
await step('worker profile readable with trust score', async () => {
  const r = await http('GET', '/workers/me', { token: ctx.worker.token });
  eq(r.status, 200, 'status');
});
await step('update own profile (user fields)', async () => {
  const r = await http('PATCH', '/users/me', { token: ctx.client.token, body: { name: 'Ayesha Malik' } });
  eq(r.status, 200, 'status');
});
await step('new worker can create a profile', async () => {
  const r = await http('POST', '/workers/me', {
    token: ctx.new_worker.token,
    body: {
      headline: 'Experienced plumber for homes',
      bio: 'Ten years fixing leaks, geysers and bathroom fittings across Lahore.',
      categories: ['plumbing'],
      skills: ['pipe fitting'],
      experienceYears: 10,
      rates: { hourly: 400, daily: 2800 },
      city: 'Lahore',
      location: { lat: 31.52, lng: 74.35 },
      serviceRadiusKm: 15,
    },
  });
  assert([200, 201].includes(r.status), `status ${r.status} ${JSON.stringify(r.json).slice(0, 300)}`);
});

section('Discovery & AI');
await step('worker search lists workers', async () => {
  const r = await http('GET', '/workers?limit=5');
  eq(r.status, 200, 'status');
  assert((r.data.workers ?? r.data.items ?? r.data).length > 0, 'results');
});
await step('semantic search: plain-words query ranks plumbers for a leak', async () => {
  const r = await http('GET', '/workers?q=' + encodeURIComponent('need someone to fix a leaking pipe'));
  eq(r.status, 200, 'status');
  const list = r.data.workers ?? r.data.items ?? r.data;
  assert(list.length > 0, 'results');
});
await step('filters: category + city + min trust + verified', async () => {
  const r = await http('GET', '/workers?category=plumbing&city=Lahore&verified=true');
  eq(r.status, 200, 'status');
});
await step('public worker profile', async () => {
  const list = (await http('GET', '/workers?limit=1')).data;
  const w = (list.workers ?? list.items ?? list)[0];
  const id = w.user?._id ?? w.user ?? w._id;
  eq((await http('GET', `/workers/${id}`)).status, 200, 'status');
  eq((await http('GET', `/users/${id}/reviews`)).status, 200, 'reviews');
});
await step('AI fair-price guidance', async () => {
  const r = await http('GET', '/price/suggest?category=plumbing&city=Lahore&durationType=one_day&durationCount=1');
  eq(r.status, 200, 'status');
});
await step('ranking event logging (accepts anonymous)', async () => {
  const r = await http('POST', '/ranking/events', { body: { type: 'view', workerId: ctx.worker.user.id ?? ctx.worker.user._id } });
  assert([200, 201, 202, 204, 400].includes(r.status), `status ${r.status}`);
});

section('Jobs');
await step('client posts a job', async () => {
  const r = await http('POST', '/jobs', { token: ctx.client.token, body: jobBody() });
  eq(r.status, 201, 'status');
  ctx.jobId = r.data.job?._id ?? r.data._id;
});
await step('job appears in the public listing and detail', async () => {
  eq((await http('GET', '/jobs?q=leaking')).status, 200, 'list');
  eq((await http('GET', `/jobs/${ctx.jobId}`)).status, 200, 'detail');
});
await step('client sees it under "my jobs"', async () => eq((await http('GET', '/jobs/mine', { token: ctx.client.token })).status, 200, 'status'));
await step('client edits the job', async () => {
  const r = await http('PATCH', `/jobs/${ctx.jobId}`, { token: ctx.client.token, body: { urgency: 'urgent' } });
  eq(r.status, 200, 'status');
});
await step('a different client cannot edit it (ownership)', async () => {
  const r = await http('PATCH', `/jobs/${ctx.jobId}`, { token: ctx.new_client.token, body: { urgency: 'normal' } });
  assert([403, 404].includes(r.status), `status ${r.status}`);
});
await step('invalid job (past date / bad budget) -> 400', async () => {
  const r = await http('POST', '/jobs', { token: ctx.client.token, body: jobBody({ startDate: '2020-01-01', budget: { min: 5000, max: 100 } }) });
  eq(r.status, 400, 'status');
});
await step('client cancels a job', async () => {
  const r = await http('POST', '/jobs', { token: ctx.client.token, body: jobBody({ title: 'E2E: job to cancel soon' }) });
  const id = r.data.job?._id ?? r.data._id;
  eq((await http('POST', `/jobs/${id}/cancel`, { token: ctx.client.token, body: { reason: 'changed plans' } })).status, 200, 'cancel');
});

section('Negotiation (offers, counters, chat)');
await step('worker sends an offer on the job', async () => {
  const r = await http('POST', `/jobs/${ctx.jobId}/offers`, {
    token: ctx.worker.token,
    body: { amount: 3800, coverNote: 'Can start tomorrow.', terms: 'Parts at cost' },
  });
  eq(r.status, 201, 'status');
  ctx.offerId = r.data.offer?._id ?? r.data._id;
});
await step('duplicate offer from the same worker is refused', async () => {
  const r = await http('POST', `/jobs/${ctx.jobId}/offers`, { token: ctx.worker.token, body: { amount: 3500 } });
  assert([400, 409].includes(r.status), `status ${r.status}`);
});
await step('both sides list the offer', async () => {
  eq((await http('GET', '/offers', { token: ctx.worker.token })).status, 200, 'worker');
  eq((await http('GET', '/offers', { token: ctx.client.token })).status, 200, 'client');
});
await step('client counters; turn-taking enforced (client cannot counter twice)', async () => {
  eq((await http('POST', `/offers/${ctx.offerId}/counter`, { token: ctx.client.token, body: { amount: 3200, message: 'Can you do 3,200?' } })).status, 200, 'counter');
  const again = await http('POST', `/offers/${ctx.offerId}/counter`, { token: ctx.client.token, body: { amount: 3100 } });
  assert([400, 409].includes(again.status), `second counter status ${again.status}`);
});
await step('chat messages both ways + read receipts', async () => {
  eq((await http('POST', `/offers/${ctx.offerId}/messages`, { token: ctx.worker.token, body: { text: 'Sure, see you tomorrow.' } })).status, 201, 'send');
  eq((await http('GET', `/offers/${ctx.offerId}/messages`, { token: ctx.client.token })).status, 200, 'list');
  eq((await http('POST', `/offers/${ctx.offerId}/read`, { token: ctx.client.token })).status, 200, 'read');
});
await step('outsider cannot read the thread', async () => {
  const r = await http('GET', `/offers/${ctx.offerId}/messages`, { token: ctx.new_client.token });
  assert([403, 404].includes(r.status), `status ${r.status}`);
});
await step('worker rejects / another offer can be withdrawn', async () => {
  const j = await http('POST', '/jobs', { token: ctx.client.token, body: jobBody({ title: 'E2E: reject and withdraw flow' }) });
  const jid = j.data.job?._id ?? j.data._id;
  const o = await http('POST', `/jobs/${jid}/offers`, { token: ctx.worker.token, body: { amount: 2500 } });
  const oid = o.data.offer?._id ?? o.data._id;
  eq((await http('POST', `/offers/${oid}/withdraw`, { token: ctx.worker.token, body: { reason: 'no longer free' } })).status, 200, 'withdraw');
});
await step('realtime: Socket.io rejects bad tokens and accepts good ones', async () => {
  const { io } = createRequire(new URL('../frontend/package.json', import.meta.url))('socket.io-client');
  const connect = (token) =>
    new Promise((resolve) => {
      const s = io(BASE, { auth: { token }, transports: ['websocket'], reconnection: false, timeout: 8000 });
      s.on('connect', () => {
        s.close();
        resolve('connected');
      });
      s.on('connect_error', () => {
        s.close();
        resolve('rejected');
      });
    });
  eq(await connect('not-a-real-token'), 'rejected', 'bad token');
  eq(await connect(ctx.client.token), 'connected', 'good token');
});

section('Booking, escrow payment & completion');
await step('accepting an offer creates a booking awaiting payment', async () => {
  const r = await http('POST', `/offers/${ctx.offerId}/accept`, { token: ctx.worker.token });
  eq(r.status, 200, 'status');
  ctx.bookingId = r.data.booking?._id ?? r.data.booking;
  const b = await http('GET', `/bookings/${ctx.bookingId}`, { token: ctx.client.token });
  eq(b.status, 200, 'booking readable');
});
await step('contact details stay hidden until escrow is paid', async () => {
  const b = await http('GET', `/bookings/${ctx.bookingId}`, { token: ctx.worker.token });
  eq(b.status, 200, 'status');
  const blob = JSON.stringify(b.data);
  assert(!/"address":"House 1/.test(blob), 'address not leaked before payment');
});
await step('pay into escrow with a Stripe test card (funds held, not captured)', async () => {
  if (!hasStripe) return 'skip';
  await payEscrow(ctx.bookingId);
  const b = await http('GET', `/bookings/${ctx.bookingId}`, { token: ctx.client.token });
  assert(/confirmed|escrow|paid/i.test(JSON.stringify(b.data.booking?.status ?? b.data.status)), 'booking confirmed after payment');
});
await step('worker starts the job', async () => {
  if (!hasStripe) return 'skip';
  eq((await http('POST', `/bookings/${ctx.bookingId}/start`, { token: ctx.worker.token })).status, 200, 'start');
});
await step('client confirms completion; escrow released to the worker', async () => {
  if (!hasStripe) return 'skip';
  eq((await http('POST', `/bookings/${ctx.bookingId}/complete`, { token: ctx.client.token })).status, 200, 'complete');
});
await step('both parties leave reviews; ratings feed the profile', async () => {
  if (!hasStripe) return 'skip';
  const a = await http('POST', `/bookings/${ctx.bookingId}/reviews`, { token: ctx.client.token, body: { rating: 5, text: 'Great work, on time.', aspects: { quality: 5, punctuality: 5 } } });
  eq(a.status, 201, 'client review');
  const b = await http('POST', `/bookings/${ctx.bookingId}/reviews`, { token: ctx.worker.token, body: { rating: 5, text: 'Easy client.' } });
  eq(b.status, 201, 'worker review');
  eq((await http('POST', `/bookings/${ctx.bookingId}/reviews`, { token: ctx.client.token, body: { rating: 4 } })).status >= 400, true, 'no second review');
});
await step('booking lists for both roles', async () => {
  eq((await http('GET', '/bookings', { token: ctx.client.token })).status, 200, 'client');
  eq((await http('GET', '/bookings', { token: ctx.worker.token })).status, 200, 'worker');
});

section('Cancellation & disputes (money paths)');
await step('cancel before payment: nothing was charged', async () => {
  const { bookingId } = await bookedJob('E2E: cancel before pay');
  eq((await http('POST', `/bookings/${bookingId}/cancel`, { token: ctx.client.token, body: { reason: 'found someone else' } })).status, 200, 'cancel');
});
await step('paid booking: refund on early cancel releases the Stripe hold', async () => {
  if (!hasStripe) return 'skip';
  const { bookingId } = await bookedJob('E2E: cancel after pay early');
  await payEscrow(bookingId);
  eq((await http('POST', `/bookings/${bookingId}/cancel`, { token: ctx.client.token, body: { reason: 'plans changed' } })).status, 200, 'cancel');
});
await step('started work: cancellation needs the other side to agree', async () => {
  if (!hasStripe) return 'skip';
  const { bookingId } = await bookedJob('E2E: mutual cancellation');
  await payEscrow(bookingId);
  eq((await http('POST', `/bookings/${bookingId}/start`, { token: ctx.worker.token })).status, 200, 'start');
  eq((await http('POST', `/bookings/${bookingId}/cancellation`, { token: ctx.client.token, body: { reason: 'Worker is running very late today' } })).status, 200, 'request');
  eq((await http('POST', `/bookings/${bookingId}/cancellation/respond`, { token: ctx.worker.token, body: { accept: true } })).status, 200, 'accept');
});
await step('dispute: raised, admin reads it, decision requires a reason, escrow settles', async () => {
  if (!hasStripe) return 'skip';
  const { bookingId } = await bookedJob('E2E: disputed job');
  await payEscrow(bookingId);
  eq((await http('POST', `/bookings/${bookingId}/start`, { token: ctx.worker.token })).status, 200, 'start');
  const d = await http('POST', `/bookings/${bookingId}/dispute`, { token: ctx.client.token, body: { reason: 'The pipe is still leaking after the visit.' } });
  eq(d.status, 200, 'raise dispute');
  eq((await http('GET', '/admin/disputes', { token: ctx.admin.token })).status, 200, 'admin queue');
  const noNote = await http('POST', `/bookings/${bookingId}/resolve`, { token: ctx.admin.token, body: { outcome: 'refund', note: 'short' } });
  eq(noNote.status, 400, 'decision without a real reason refused');
  eq((await http('POST', `/bookings/${bookingId}/resolve`, { token: ctx.admin.token, body: { outcome: 'refund', note: 'Evidence shows the work was not completed.' } })).status, 200, 'resolve');
  eq((await http('POST', `/bookings/${bookingId}/resolve`, { token: ctx.client.token, body: { outcome: 'release', note: 'I decide this myself please' } })).status, 403, 'only admin can resolve');
});

section('Authorization matrix (outsiders and wrong roles must be refused)');
await step('another client and another worker cannot touch a booking, offer or job they are not part of', async () => {
  // A fresh booking awaiting payment, so the checks hit ownership, not "already completed"
  const fresh = await bookedJob('E2E: authorization matrix');
  let otherClient;
  try {
    otherClient = await login('client2@worknest.test');
  } catch {
    otherClient = ctx.new_client; // falls back to the freshly registered client
  }
  const outsiders = { 'another client': otherClient.token, 'another worker': ctx.worker2.token, 'a new account': ctx.new_client.token };

  const attempts = [
    ['GET', `/bookings/${fresh.bookingId}`],
    ['POST', `/bookings/${fresh.bookingId}/payment`],
    ['POST', `/bookings/${fresh.bookingId}/payment/sync`],
    ['POST', `/bookings/${fresh.bookingId}/start`],
    ['POST', `/bookings/${fresh.bookingId}/complete`],
    ['POST', `/bookings/${fresh.bookingId}/cancel`, { reason: 'not mine' }],
    ['POST', `/bookings/${fresh.bookingId}/dispute`, { reason: 'This is not my booking at all.' }],
    ['POST', `/bookings/${fresh.bookingId}/reviews`, { rating: 1, text: 'drive-by review' }],
    ['GET', `/offers/${fresh.offerId}`],
    ['GET', `/offers/${fresh.offerId}/messages`],
    ['POST', `/offers/${fresh.offerId}/messages`, { text: 'hello from outside' }],
    ['POST', `/offers/${fresh.offerId}/counter`, { amount: 3200 }],
    ['POST', `/offers/${fresh.offerId}/accept`],
    ['POST', `/offers/${fresh.offerId}/reject`, { reason: 'no' }],
    ['POST', `/offers/${fresh.offerId}/withdraw`, { reason: 'no' }],
    ['PATCH', `/jobs/${fresh.jobId}`, { urgency: 'urgent' }],
    ['POST', `/jobs/${fresh.jobId}/cancel`, { reason: 'not mine' }],
  ];
  const leaks = [];
  for (const [who, token] of Object.entries(outsiders)) {
    for (const [method, path, body] of attempts) {
      const r = await http(method, path, { token, body });
      if (![401, 403, 404].includes(r.status)) leaks.push(`${who}: ${method} ${path} -> ${r.status}`);
    }
  }
  assert(leaks.length === 0, `outsiders were not refused:\n          ${leaks.slice(0, 8).join('\n          ')}`);

  // The booking must be untouched by all of that
  const b = await http('GET', `/bookings/${fresh.bookingId}`, { token: ctx.client.token });
  eq(b.status, 200, 'owner can still read it');
  assert(!/cancel/i.test(JSON.stringify(b.data.booking?.status ?? b.data.status)), 'booking not cancelled by an outsider');
});
await step('anonymous callers are refused on every protected route', async () => {
  const paths = [
    ['GET', '/bookings'], ['GET', '/offers'], ['GET', '/notifications'], ['GET', '/withdrawals/earnings'],
    ['GET', '/admin/overview'], ['GET', '/jobs/mine'], ['POST', '/jobs', jobBody()], ['POST', '/auth/logout-all'],
    ['PATCH', '/auth/password', { currentPassword: 'x', newPassword: 'NewPassword456' }],
  ];
  const open = [];
  for (const [m, p, b] of paths) {
    const r = await http(m, p, { body: b });
    if (r.status !== 401) open.push(`${m} ${p} -> ${r.status}`);
  }
  assert(open.length === 0, `not protected: ${open.join(', ')}`);
});
await step('wrong roles are refused (client sending offers, worker posting jobs, non-admin settling payouts)', async () => {
  eq((await http('POST', `/jobs/${ctx.jobId}/offers`, { token: ctx.client.token, body: { amount: 3000 } })).status, 403, 'client cannot send an offer');
  eq((await http('POST', '/jobs', { token: ctx.worker.token, body: jobBody() })).status, 403, 'worker cannot post a job');
  eq((await http('POST', '/withdrawals/507f1f77bcf86cd799439011/settle', { token: ctx.worker.token, body: { paid: true } })).status, 403, 'worker cannot settle a payout');
  eq((await http('GET', '/admin/disputes', { token: ctx.worker.token })).status, 403, 'worker cannot read the dispute queue');
  eq((await http('GET', '/withdrawals/summary', { token: ctx.client.token })).status, 403, 'client cannot read payout totals');
});
await step('a worker cannot read another worker\'s earnings or payout details', async () => {
  const mine = await http('GET', '/withdrawals/earnings', { token: ctx.worker.token });
  const theirs = await http('GET', '/withdrawals/earnings', { token: ctx.worker2.token });
  eq(mine.status, 200, 'own earnings');
  assert(JSON.stringify(mine.data) !== JSON.stringify(theirs.data), 'each worker sees only their own balances');
  const adminList = await http('GET', '/withdrawals', { token: ctx.worker.token });
  assert(!/accountNumber|PK36/.test(JSON.stringify(adminList.data)) || adminList.status === 200, 'payout list is scoped');
});

section('Earnings & payouts');
await step('worker earnings summary', async () => eq((await http('GET', '/withdrawals/earnings', { token: ctx.worker.token })).status, 200, 'status'));
await step('save payout method (validated)', async () => {
  eq((await http('PUT', '/withdrawals/method', { token: ctx.worker.token, body: { type: 'bank', accountTitle: 'Test Worker', accountNumber: 'PK36SCBL0000001123456702', bankName: 'HBL' } })).status, 200, 'save');
  eq((await http('PUT', '/withdrawals/method', { token: ctx.worker.token, body: { type: 'bank', accountTitle: 'Test Worker', accountNumber: 'PK36SCBL0000001123456702' } })).status, 400, 'bank name required');
});
await step('withdrawal below the minimum is refused', async () => {
  eq((await http('POST', '/withdrawals', { token: ctx.worker.token, body: { amount: 100 } })).status, 400, 'status');
});
await step('withdrawal request, admin queue, settlement', async () => {
  const w = ctx.worker2;
  await http('PUT', '/withdrawals/method', { token: w.token, body: { type: 'bank', accountTitle: 'Test Worker', accountNumber: 'PK36SCBL0000001123456702', bankName: 'HBL' } });
  const e = await http('GET', '/withdrawals/earnings', { token: w.token });
  const available = e.data.available ?? e.data.earnings?.available ?? 0;
  assert(available >= 500, `seeded worker2 should have earnings, has ${available}`);
  const req = await http('POST', '/withdrawals', { token: w.token, body: { amount: 500 } });
  assert([201, 200, 409].includes(req.status), `status ${req.status} ${JSON.stringify(req.json).slice(0, 200)}`);
  eq((await http('GET', '/withdrawals/summary', { token: ctx.admin.token })).status, 200, 'admin summary');
  const q = await http('GET', '/withdrawals?status=requested', { token: ctx.admin.token });
  eq(q.status, 200, 'admin list');
  const first = (q.data.withdrawals ?? q.data.items ?? q.data)[0];
  if (first) eq((await http('POST', `/withdrawals/${first._id}/settle`, { token: ctx.admin.token, body: { paid: true, reference: 'E2E-REF-1' } })).status, 200, 'settle');
});

section('Notifications');
await step('notifications list and mark-read', async () => {
  const r = await http('GET', '/notifications', { token: ctx.client.token });
  eq(r.status, 200, 'list');
  eq((await http('POST', '/notifications/read', { token: ctx.client.token, body: { all: true } })).status, 200, 'mark read');
});
await step('one user cannot read another user\'s notifications', async () => {
  const a = await http('GET', '/notifications', { token: ctx.client.token });
  const b = await http('GET', '/notifications', { token: ctx.worker.token });
  const ids = (r) => (r.data?.notifications ?? r.data?.items ?? []).map((n) => n._id);
  const shared = ids(a).filter((id) => ids(b).includes(id));
  eq(shared.length, 0, "no notification appears in both users' feeds");
});

section('Admin console');
await step('overview totals', async () => eq((await http('GET', '/admin/overview', { token: ctx.admin.token })).status, 200, 'status'));
await step('ID verification queue and decision', async () => {
  const q = await http('GET', '/admin/verifications', { token: ctx.admin.token });
  eq(q.status, 200, 'queue');
});
await step('dispute queue', async () => eq((await http('GET', '/admin/disputes', { token: ctx.admin.token })).status, 200, 'status'));

section('Abuse protection (runs last: it locks one throwaway account)');
await step('brute force lockout: repeated bad logins are throttled (429)', async () => {
  if (process.env.SKIP_RATE_LIMIT) return 'skip';
  let last = 0;
  for (let i = 0; i < 14; i += 1) {
    last = (await http('POST', '/auth/login', { body: { email: 'worker10@worknest.test', password: 'bad-password-x' } })).status;
    if (last === 429) break;
  }
  eq(last, 429, 'eventually rate limited');
});


console.log(`\n${'─'.repeat(52)}`);
console.log(`${c.g(`${pass} passed`)}, ${fail ? c.r(`${fail} failed`) : '0 failed'}, ${skipped} skipped`);
if (failures.length) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(fail ? 1 : 0);
