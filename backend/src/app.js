import { randomUUID } from 'node:crypto';

import compression from 'compression';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import pinoHttp from 'pino-http';

import { env } from './config/env.js';
import { stripeWebhook } from './controllers/booking.controller.js';
import { errorHandler, notFound } from './middleware/error.js';
import { logger } from './observability/logger.js';
import { metricsMiddleware } from './observability/metrics.js';
import routes from './routes/index.js';
import metricsRoute from './routes/metrics.routes.js';

const QUIET_PATHS = new Set(['/api/health', '/api/health/live', '/api/health/ready', '/metrics']);

export function createApp() {
  const app = express();

  // Exactly the number of proxies in front of us. Over-trusting lets a client send its own
  // X-Forwarded-For and dodge the per-IP rate limits; under-trusting rate-limits the proxy.
  app.set('trust proxy', env.TRUST_PROXY_HOPS);
  app.disable('etag'); // API payloads are per-user and dynamic; conditional GETs buy nothing

  // Request id first, so every later log line and error can be tied back to one request.
  // Honour an id set upstream (load balancer, mobile client) so traces span systems.
  app.use((req, res, next) => {
    const incoming = req.headers['x-request-id'];
    req.id = typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
    res.setHeader('X-Request-Id', req.id);
    next();
  });
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => req.id,
      autoLogging: { ignore: (req) => QUIET_PATHS.has(req.url) },
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
      // Keep log lines small: id, method, url, status. Headers are redacted by the logger.
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url, ip: req.remoteAddress }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );
  app.use(metricsMiddleware);

  app.use(
    helmet({
      // This is a JSON API: nothing it returns should ever be framed, sniffed or executed
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      referrerPolicy: { policy: 'no-referrer' },
      strictTransportSecurity: { maxAge: 63_072_000, includeSubDomains: true, preload: true },
    }),
  );
  app.use(compression());
  app.use(
    cors({
      origin: env.clientOrigins,
      credentials: true,
      maxAge: 600, // let browsers cache the preflight for 10 minutes instead of one per request
      exposedHeaders: ['X-Request-Id', 'RateLimit', 'RateLimit-Policy', 'Retry-After'],
    }),
  );

  app.use(metricsRoute);

  // Stripe verifies the signature against the RAW body, so this must come before express.json()
  app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), stripeWebhook);

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '100kb' }));

  app.use(
    '/api',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: env.isTest ? 10_000 : 500,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      skip: (req) => QUIET_PATHS.has(`/api${req.path}`), // orchestrator probes must never be throttled
      message: { success: false, message: 'Too many requests, please slow down' },
    }),
  );

  // Authenticated responses must never land in a shared cache or the back/forward cache
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  app.use('/api', routes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
