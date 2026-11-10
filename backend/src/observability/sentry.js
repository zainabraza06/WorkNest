import * as Sentry from '@sentry/node';

import { env } from '../config/env.js';

let enabled = false;

/** No-op unless SENTRY_DSN is set, so local dev and tests never talk to Sentry. */
export function initSentry() {
  if (!env.SENTRY_DSN || enabled) return;
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
    // Names, emails and phone numbers are personal data; keep them out of error reports
    sendDefaultPii: false,
  });
  enabled = true;
}

export function captureException(err, context) {
  if (enabled) Sentry.captureException(err, context ? { extra: context } : undefined);
}

export const flushSentry = (ms = 2000) => (enabled ? Sentry.flush(ms) : Promise.resolve());
