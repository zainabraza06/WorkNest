import Stripe from 'stripe';

import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Escrow via Stripe PaymentIntents with manual capture (TEST MODE ONLY):
 *   create (capture_method=manual) → client confirms card → "requires_capture" = funds HELD
 *   capture → funds RELEASED   |   cancel → authorisation voided = REFUNDED
 *
 * Limitation (documented in README): card authorisations expire after ~7 days, so long
 * monthly bookings would need Stripe Connect separate charges & transfers in production.
 */
let stripe = null;

function client() {
  if (!env.STRIPE_SECRET_KEY) {
    throw new ApiError(503, 'Payments are not configured on this server (missing STRIPE_SECRET_KEY)');
  }
  stripe ??= new Stripe(env.STRIPE_SECRET_KEY);
  return stripe;
}

/** PKR is a two-decimal currency in Stripe: Rs 3,500 → 350000 paisa. */
export const toMinorUnits = (amount) => Math.round(amount * 100);

export function createEscrowIntent({ amount, bookingId, clientId, workerId }) {
  return client().paymentIntents.create({
    amount: toMinorUnits(amount),
    currency: env.STRIPE_CURRENCY,
    capture_method: 'manual',
    automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    description: `WorkNest booking ${bookingId}`,
    metadata: { bookingId: String(bookingId), clientId: String(clientId), workerId: String(workerId) },
  });
}

export const retrieveIntent = (id) => client().paymentIntents.retrieve(id);
export const captureIntent = (id) => client().paymentIntents.capture(id);
export const cancelIntent = (id) => client().paymentIntents.cancel(id);

export function constructWebhookEvent(rawBody, signature) {
  if (!env.STRIPE_WEBHOOK_SECRET) throw new ApiError(503, 'Stripe webhook secret is not configured');
  try {
    return client().webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    throw ApiError.badRequest(`Webhook signature verification failed: ${err.message}`);
  }
}
