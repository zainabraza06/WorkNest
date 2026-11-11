import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';

import { getRedis } from '../config/redis.js';

/**
 * Every limiter in the app is built here so they all share one policy:
 *  - counters live in Redis when configured (shared by every API instance), else in memory
 *  - a Redis outage FAILS OPEN (passOnStoreError): a broken cache must not lock out all users
 *  - standard RateLimit headers on, legacy ones off
 */
export function createLimiter({ name, ...options }) {
  const redis = getRedis();
  return rateLimit({
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    passOnStoreError: true,
    ...(redis && {
      store: new RedisStore({
        prefix: `rl:${name}:`,
        sendCommand: (...args) => redis.call(...args),
      }),
    }),
    ...options,
  });
}
