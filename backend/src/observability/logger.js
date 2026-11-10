import pino from 'pino';

import { env } from '../config/env.js';

/**
 * One structured-JSON logger for the whole API.
 *
 * JSON lines are what log platforms (Render, Datadog, Loki, CloudWatch) index natively, so a
 * request can be found by `req.id` or `userId` instead of grepping prose. Secrets are redacted
 * at the logger, not by convention: forgetting to scrub one call site cannot leak a token.
 */
export const logger = pino({
  level: env.logLevel,
  base: { service: 'worknest-api', env: env.NODE_ENV },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: { level: (label) => ({ level: label }) },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-service-key"]',
      '*.password',
      '*.currentPassword',
      '*.newPassword',
      '*.accountNumber',
      '*.token',
    ],
    censor: '[redacted]',
  },
});
