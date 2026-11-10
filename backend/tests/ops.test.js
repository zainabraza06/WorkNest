import { spawnSync } from 'node:child_process';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { api, bearer, registerUser } from './helpers.js';
import { env } from '../src/config/env.js';
import { beginShutdown } from '../src/lifecycle.js';
import { clearPriceCache, suggestPrice } from '../src/services/ai.service.js';

describe('health probes', () => {
  it('liveness answers without touching dependencies', async () => {
    const res = await api().get('/api/health/live');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('alive');
  });

  it('readiness confirms the database with a real ping', async () => {
    const res = await api().get('/api/health/ready');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ready', db: 'connected' });
  });

  it('keeps the combined /health probe the keep-warm workflow relies on', async () => {
    const res = await api().get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ service: 'worknest-backend', db: 'connected' });
  });
});

describe('request tracing', () => {
  it('generates a request id and returns it in the header', async () => {
    const res = await api().get('/api/health/live');
    expect(res.headers['x-request-id']).toMatch(/^[\w-]{8,64}$/);
  });

  it('honours a well-formed upstream request id', async () => {
    const res = await api().get('/api/health/live').set('X-Request-Id', 'trace-abc12345');
    expect(res.headers['x-request-id']).toBe('trace-abc12345');
  });

  it('replaces a malformed or hostile request id rather than echoing it', async () => {
    const res = await api().get('/api/health/live').set('X-Request-Id', 'bad id\twith spaces');
    expect(res.headers['x-request-id']).not.toContain(' ');
    expect(res.headers['x-request-id']).toMatch(/^[\w-]{8,64}$/);
  });

  it('puts the request id in error bodies so a report can be matched to a log line', async () => {
    const res = await api().get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.requestId).toBe(res.headers['x-request-id']);
  });
});

describe('response hardening', () => {
  it('forbids caching API responses', async () => {
    const res = await api().get('/api/health');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('sends the API security headers', async () => {
    const res = await api().get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toContain('max-age=');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('metrics', () => {
  it('exposes Prometheus text including request latency by route pattern', async () => {
    await api().get('/api/jobs');
    const res = await api().get('/metrics');
    expect(res.status).toBe(200);
    expect(res.text).toContain('http_request_duration_seconds_bucket');
    expect(res.text).toMatch(/route="\/api\/jobs\/"|route="\/api\/jobs"/);
  });

  it('does not create a time series per document id', async () => {
    await api().get('/api/jobs/64b7f0f0f0f0f0f0f0f0f0f0');
    await api().get('/api/jobs/64b7f0f0f0f0f0f0f0f0f0f1');
    const { text } = await api().get('/metrics');
    expect(text).not.toContain('64b7f0f0f0f0f0f0f0f0f0f0');
    expect(text).toContain('/:id');
  });

  it('collapses unmatched URLs into one label', async () => {
    await api().get('/api/definitely-not-a-route-1');
    await api().get('/api/definitely-not-a-route-2');
    const { text } = await api().get('/metrics');
    expect(text).not.toContain('definitely-not-a-route');
    expect(text).toContain('route="unmatched"');
  });
});

describe('session revocation', () => {
  it('rejects tokens issued before a password change, and accepts the new one', async () => {
    const { token, password } = await registerUser();

    const change = await api()
      .patch('/api/auth/password')
      .set(bearer(token))
      .send({ currentPassword: password, newPassword: 'brand-new-pass-9' });
    expect(change.status).toBe(200);

    expect((await api().get('/api/auth/me').set(bearer(token))).status).toBe(401);
    expect((await api().get('/api/auth/me').set(bearer(change.body.data.token))).status).toBe(200);
  });

  it('"sign out everywhere" revokes every token the account holds', async () => {
    const { token, user, password } = await registerUser();
    const second = await api().post('/api/auth/login').send({ email: user.email, password });
    const otherDevice = second.body.data.token;

    expect((await api().post('/api/auth/logout-all').set(bearer(token))).status).toBe(200);

    expect((await api().get('/api/auth/me').set(bearer(token))).status).toBe(401);
    expect((await api().get('/api/auth/me').set(bearer(otherDevice))).status).toBe(401);

    // Signing in again issues a token under the new version
    const fresh = await api().post('/api/auth/login').send({ email: user.email, password });
    expect((await api().get('/api/auth/me').set(bearer(fresh.body.data.token))).status).toBe(200);
  });

  it('never leaks the token version in user payloads', async () => {
    const { token } = await registerUser();
    const res = await api().get('/api/auth/me').set(bearer(token));
    expect(res.body.data.user).not.toHaveProperty('tokenVersion');
  });
});

describe('price suggestion cache', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    env.AI_ENABLED = false;
    clearPriceCache();
  });

  const query = { category: 'plumbing', city: 'Lahore', durationType: 'one_day', durationCount: 1, urgency: 'normal', experienceYears: 0 };
  const aiReply = { min: 2000, median: 3000, max: 4000, per_unit: 3000, currency: 'PKR', confidence: 'high', source: 'model', explanation: 'x' };

  it('asks the AI service once for identical questions', async () => {
    env.AI_ENABLED = true;
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => aiReply }));
    vi.stubGlobal('fetch', fetchMock);

    const a = await suggestPrice(query);
    const b = await suggestPrice({ ...query });
    expect(a).toEqual(b);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not share answers between different questions', async () => {
    env.AI_ENABLED = true;
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => aiReply }));
    vi.stubGlobal('fetch', fetchMock);

    await suggestPrice(query);
    await suggestPrice({ ...query, city: 'Karachi' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never caches a failure — the next call retries', async () => {
    env.AI_ENABLED = true;
    const fetchMock = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await suggestPrice(query)).toBeNull();
    expect(await suggestPrice(query)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('production configuration guard', () => {
  const boot = (overrides) =>
    spawnSync(process.execPath, ['--input-type=module', '-e', "await import('./src/config/env.js'); console.log('booted')"], {
      cwd: new URL('..', import.meta.url),
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH,
        NODE_ENV: 'production',
        MONGODB_URI: 'mongodb+srv://u:p@cluster.mongodb.net/worknest',
        JWT_SECRET: 'x'.repeat(48),
        CLIENT_URL: 'https://app.example.com',
        ...overrides,
      },
    });

  it('boots with a sound production configuration', () => {
    const r = boot({});
    expect(r.stdout).toContain('booted');
  });

  it('refuses a short JWT secret', () => {
    const r = boot({ JWT_SECRET: 'too-short-secret-1' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('JWT_SECRET');
  });

  it('refuses a wildcard CORS origin', () => {
    const r = boot({ CLIENT_URL: '*' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('CLIENT_URL');
  });

  it('refuses a localhost database', () => {
    const r = boot({ MONGODB_URI: 'mongodb://localhost:27017/worknest' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('MONGODB_URI');
  });
});

describe('graceful shutdown', () => {
  // Keep last: draining is process-wide state
  it('fails readiness once draining starts, so the load balancer stops routing here', async () => {
    beginShutdown();
    const res = await api().get('/api/health/ready');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('draining');
    // Liveness must stay green: a draining instance is healthy, just not accepting new work
    expect((await api().get('/api/health/live')).status).toBe(200);
  });
});
