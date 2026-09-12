import { Booking, ClientProfile, Job, Payment, WorkerProfile } from '../models/index.js';
import { BOOKING_STATUS, JOB_STATUS, PAYMENT_STATUS } from '../constants/index.js';
import { emitToUser } from '../socket/index.js';

export function pushTimeline(booking, status, by, note) {
  booking.status = status;
  booking.timeline.push({ status, by, note, at: new Date() });
}

export function notifyBooking(booking) {
  emitToUser(booking.worker, 'booking:updated', booking);
  emitToUser(booking.client, 'booking:updated', booking);
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
}

export async function recordWorkerCancellation(booking) {
  await WorkerProfile.updateOne({ user: booking.worker }, { $inc: { 'stats.totalJobs': 1, 'stats.cancelledJobs': 1 } });
}

export async function recordDispute(booking) {
  await WorkerProfile.updateOne({ user: booking.worker }, { $inc: { 'stats.disputes': 1 } });
}

export const findPayment = (booking) => Payment.findOne({ booking: booking._id });
