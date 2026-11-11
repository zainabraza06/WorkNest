import Redis from 'ioredis';

import { logger } from '../observability/logger.js';
import { env } from './env.js';

/**
 * Optional shared state (rate-limit counters, Socket.io rooms).
 *
 * With REDIS_URL unset the API runs exactly as before, in-memory, which is correct for one
 * instance. With it set, those two things become cluster-wide, which is what allows running
 * more than one API instance. Redis is never a source of truth: if it goes away the limiters
 * fail open and realtime degrades to per-instance, but no data is lost.
 */
let client = null;

export const isRedisConfigured = () => Boolean(env.REDIS_URL);

export function getRedis() {
  if (!env.REDIS_URL) return null;
  if (client) return client;

  client = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 2, // fail a command quickly instead of hanging a request on a dead Redis
    enableReadyCheck: true,
    retryStrategy: (attempt) => Math.min(attempt * 200, 5000), // keep reconnecting, capped backoff
    lazyConnect: false,
    ...(env.REDIS_URL.startsWith('rediss://') && { tls: {} }),
  });
  client.on('ready', () => logger.info('Redis ready'));
  client.on('close', () => logger.warn('Redis connection closed'));
  client.on('error', (err) => logger.error({ err: err.message }, 'Redis error'));
  return client;
}

export const redisStatus = () => (!client ? 'disabled' : client.status === 'ready' ? 'connected' : 'disconnected');

export async function closeRedis() {
  if (!client) return;
  try {
    await client.quit();
  } catch {
    client.disconnect();
  }
  client = null;
}
