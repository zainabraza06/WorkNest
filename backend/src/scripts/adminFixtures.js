/**
 * Two items that exist only so the admin console has something to act on.
 *
 * Without them both queues render their empty state, and the one part of the app that cannot
 * be exercised as a client or a worker cannot be shown at all.
 *
 * The dispute is deliberately backed by a **real Stripe test PaymentIntent** in
 * `requires_capture` — funds genuinely authorised and held. Releasing or refunding it from the
 * admin console therefore does the real thing against Stripe rather than pretending, which is
 * the entire point of demonstrating it. If Stripe is not configured or unreachable the booking
 * is still seeded, just without a payment, and the console says "none".
 */
import { Booking, Job, Offer, Payment, WorkerProfile } from '../models/index.js';
import { BOOKING_STATUS, JOB_STATUS, OFFER_STATUS, PAYMENT_STATUS, PLATFORM_FEE_RATE, ROLES } from '../constants/index.js';
import { computeEndDate } from '../utils/dates.js';
import { env } from '../config/env.js';

const daysFromNow = (n) => new Date(Date.now() + n * 86_400_000);

/** A worker waiting on an ID decision, so the verification queue is not empty. */
export async function seedPendingVerification(worker) {
  await WorkerProfile.updateOne(
    { user: worker.user._id },
    {
      idVerification: {
        status: 'pending',
        // A placeholder id: there is no such Cloudinary asset, so the admin console shows its
        // "could not load" state rather than a real CNIC. The decision flow is unaffected.
        document: { url: 'seed-placeholder', publicId: 'worknest/seed/id-placeholder' },
        submittedAt: daysFromNow(-2),
      },
    },
  );
  return worker.user.name;
}

/** Authorise a real test-mode payment so the admin's release/refund is not a simulation. */
async function heldIntent(amount, bookingId, clientId, workerId) {
  if (!env.STRIPE_SECRET_KEY) return null;
  try {
    const { default: Stripe } = await import('stripe');
    const stripe = new Stripe(env.STRIPE_SECRET_KEY);
    const intent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: env.STRIPE_CURRENCY,
      capture_method: 'manual',
      confirm: true,
      payment_method: 'pm_card_visa',
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      description: `WorkNest seeded dispute ${bookingId}`,
      metadata: { bookingId: String(bookingId), clientId: String(clientId), workerId: String(workerId), seeded: 'true' },
    });
    // requires_capture is Stripe's name for "authorised and held"
    return intent.status === 'requires_capture' ? intent : null;
  } catch (err) {
    console.warn(`Could not authorise a test payment for the seeded dispute (${err.message}); seeding it without one.`);
    return null;
  }
}

/**
 * A disputed booking for the admin to resolve.
 * @param worker  the accused worker  @param client  the complaining client  @param job  their job
 */
export async function seedDispute({ worker, client, job, amount = 4000 }) {
  const offer = await Offer.create({
    job: job._id,
    worker: worker.user._id,
    client: client.user._id,
    status: OFFER_STATUS.ACCEPTED,
    rounds: [
      { by: worker.user._id, byRole: ROLES.WORKER, amount, durationType: 'one_day', durationCount: 1, startDate: daysFromNow(-4) },
    ],
  });
  offer.acceptedRound = offer.rounds[0]._id;
  await offer.save();

  const booking = await Booking.create({
    job: job._id,
    offer: offer._id,
    worker: worker.user._id,
    client: client.user._id,
    agreedPrice: amount,
    durationType: 'one_day',
    durationCount: 1,
    startDate: daysFromNow(-4),
    endDate: computeEndDate(daysFromNow(-4), 'one_day', 1),
    status: BOOKING_STATUS.DISPUTED,
    startedAt: daysFromNow(-4),
    timeline: [
      { status: BOOKING_STATUS.PENDING_PAYMENT, at: daysFromNow(-5) },
      { status: BOOKING_STATUS.CONFIRMED, at: daysFromNow(-5), note: 'Payment held in escrow' },
      { status: BOOKING_STATUS.IN_PROGRESS, at: daysFromNow(-4) },
      {
        status: BOOKING_STATUS.DISPUTED,
        at: daysFromNow(-2),
        note: 'The unit was serviced but it is still not cooling, and he has not returned my calls.',
      },
    ],
  });

  const intent = await heldIntent(amount, booking._id, client.user._id, worker.user._id);
  if (intent) {
    const platformFee = Math.round(amount * PLATFORM_FEE_RATE);
    const payment = await Payment.create({
      booking: booking._id,
      client: client.user._id,
      worker: worker.user._id,
      amount,
      platformFee,
      workerPayout: amount - platformFee,
      providerPaymentId: intent.id,
      status: PAYMENT_STATUS.HELD,
      heldAt: daysFromNow(-5),
    });
    booking.payment = payment._id;
    await booking.save();
  }

  await Job.updateOne({ _id: job._id }, { status: JOB_STATUS.CONFIRMED, hiredWorker: worker.user._id, booking: booking._id, offersCount: 1 });
  return { booking, escrowHeld: Boolean(intent) };
}
