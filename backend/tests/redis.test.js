import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

const state = { redis: null };
vi.mock('../src/config/redis.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getRedis: () => state.redis,
}));

const { createLimiter } = await import('../src/middleware/rateLimit.js');
const { redisStatus, isRedisConfigured } = await import('../src/config/redis.js');

const appWith = (limiter) => {
  const app = express();
  app.use(limiter);
  app.get('/', (_req, res) => res.json({ ok: true }));
  return app;
};

describe('createLimiter', () => {
  it('limits in memory when Redis is not configured', async () => {
    state.redis = null;
    const app = appWith(createLimiter({ name: 't1', windowMs: 60_000, limit: 2 }));
    expect((await request(app).get('/')).status).toBe(200);
    expect((await request(app).get('/')).status).toBe(200);
    const blocked = await request(app).get('/');
    expect(blocked.status).toBe(429);
    expect(blocked.headers.ratelimit).toBeDefined();
  });

  it('FAILS OPEN when the Redis store errors, so a cache outage cannot lock everyone out', async () => {
    state.redis = { call: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) };
    const app = appWith(createLimiter({ name: 't2', windowMs: 60_000, limit: 1 }));
    for (let i = 0; i < 3; i++) expect((await request(app).get('/')).status).toBe(200);
  });
});

describe('redis status', () => {
  it('reports disabled with no REDIS_URL and not configured', () => {
    expect(isRedisConfigured()).toBe(false);
    expect(redisStatus()).toBe('disabled');
  });
});
