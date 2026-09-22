import { Booking, ClientProfile, Job, Payment, WorkerProfile } from '../models/index.js';
import { BOOKING_STATUS, JOB_STATUS, PAYMENT_STATUS } from '../constants/index.js';
import { emitToUser } from '../socket/index.js';
import { refreshTrustScore } from './trust.service.js';
import { notify } from './notification.service.js';

/**
 * What each booking state means to the two people in it. Both get a notification: unlike the
 * negotiation, a booking moving is news to the other side whoever triggered it, and the money
 * ones are news to both.
 */
const BOOKING_NEWS = {
  [BOOKING_STATUS.CONFIRMED]: { worker: 'Booking confirmed — payment is held in escrow', client: 'Payment held — your booking is confirmed' },
  [BOOKING_STATUS.IN_PROGRESS]: { worker: 'You marked the work as started', client: 'The worker has started the work' },
  [BOOKING_STATUS.COMPLETED]: { worker: 'Work completed — payment released', client: 'Work marked complete — release the payment when you are happy' },
  [BOOKING_STATUS.CANCELLED]: { worker: 'Booking cancelled', client: 'Booking cancelled' },
  [BOOKING_STATUS.DISPUTED]: { worker: 'A dispute was raised on this booking', client: 'A dispute was raised on this booking' },
};

export function pushTimeline(booking, status, by, note) {
  booking.status = status;
  booking.timeline.push({ status, by, note, at: new Date() });
}

export function notifyBooking(booking) {
  emitToUser(booking.worker, 'booking:updated', booking);
  emitToUser(booking.client, 'booking:updated', booking);

  const news = BOOKING_NEWS[booking.status];
  if (!news) return;
  const link = `/bookings/${booking._id}`;
  const body = booking.timeline?.at(-1)?.note ?? undefined;
  void notify(booking.worker, { type: `booking_${booking.status}`, title: news.worker, body, link });
  void notify(booking.client, { type: `booking_${booking.status}`, title: news.client, body, link });
}

/**
 * Mirrors a Stripe PaymentIntent's status onto our Payment + Booking records.
 * Called from the webhook and from the manual "sync" endpoint, so it must be idempotent.
 */
export async function applyIntentStatus(payment, intent) {
  const booking = await Booking.findById(payment.booking);
  let changed = false;

  switch (intent.status) {
    case 'requires_capture':
      if (payment.status === PAYMENT_STATUS.REQUIRES_PAYMENT || payment.status === PAYMENT_STATUS.FAILED) {
        payment.status = PAYMENT_STATUS.HELD;
        payment.heldAt = new Date();
        payment.failureReason = undefined;
        changed = true;
      }
      if (booking?.status === BOOKING_STATUS.PENDING_PAYMENT) {
        pushTimeline(booking, BOOKING_STATUS.CONFIRMED, booking.client, 'Payment held in escrow');
        await booking.save();
      }
      break;

    case 'succeeded':
      if (payment.status !== PAYMENT_STATUS.RELEASED) {
        payment.status = PAYMENT_STATUS.RELEASED;
        payment.releasedAt ??= new Date();
        changed = true;
      }
      break;

    case 'canceled':
      if (![PAYMENT_STATUS.REFUNDED, PAYMENT_STATUS.CANCELLED].includes(payment.status)) {
        const wasHeld = payment.status === PAYMENT_STATUS.HELD;
        payment.status = wasHeld ? PAYMENT_STATUS.REFUNDED : PAYMENT_STATUS.CANCELLED;
        if (wasHeld) payment.refundedAt = new Date();
        changed = true;
      }
      break;

    case 'requires_payment_method':
      if (intent.last_payment_error && payment.status === PAYMENT_STATUS.REQUIRES_PAYMENT) {
        payment.status = PAYMENT_STATUS.FAILED;
        payment.failureReason = intent.last_payment_error.message;
        changed = true;
      }
      break;

    default:
      break;
  }

  if (changed) await payment.save();
  if (booking) notifyBooking(booking);
  return { payment, booking };
}

/** Counters that feed the Trust Score. */
export async function recordCompletion(booking) {
  const priorHires = await Booking.countDocuments({
    _id: { $ne: booking._id },
    worker: booking.worker,
    client: booking.client,
    status: BOOKING_STATUS.COMPLETED,
  });

  await WorkerProfile.updateOne(
    { user: booking.worker },
    { $inc: { 'stats.totalJobs': 1, 'stats.completedJobs': 1, ...(priorHires > 0 && { 'stats.repeatHires': 1 }) } },
  );
  await ClientProfile.updateOne({ user: booking.client }, { $inc: { 'stats.hires': 1 } });
  await Job.updateOne({ _id: booking.job }, { status: JOB_STATUS.COMPLETED });
  await refreshTrustScore(booking.worker);
}

export async function recordWorkerCancellation(booking) {
  await WorkerProfile.updateOne({ user: booking.worker }, { $inc: { 'stats.totalJobs': 1, 'stats.cancelledJobs': 1 } });
  await refreshTrustScore(booking.worker);
}

export async function recordDispute(booking) {
  await WorkerProfile.updateOne({ user: booking.worker }, { $inc: { 'stats.disputes': 1 } });
  await refreshTrustScore(booking.worker);
}

export const findPayment = (booking) => Payment.findOne({ booking: booking._id });
