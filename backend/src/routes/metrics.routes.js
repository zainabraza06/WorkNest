import { timingSafeEqual } from 'node:crypto';

import { Router } from 'express';

import { env } from '../config/env.js';
import { registry } from '../observability/metrics.js';

const router = Router();

const safeEqual = (a, b) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * Prometheus scrape endpoint.
 *
 * Metrics expose route names, traffic shape and process internals, so in production it is
 * closed unless METRICS_TOKEN is configured, and then only a matching bearer token opens it.
 * It answers 404 rather than 401 when disabled so it does not advertise its own existence.
 */
router.get('/metrics', async (req, res) => {
  if (env.METRICS_TOKEN) {
    const presented = (req.headers.authorization ?? '').replace(/^Bearer /, '');
    if (!safeEqual(presented, env.METRICS_TOKEN)) return res.status(401).end();
  } else if (env.isProd) {
    return res.status(404).end();
  }
  res.setHeader('Content-Type', registry.contentType);
  res.end(await registry.metrics());
});

export default router;
