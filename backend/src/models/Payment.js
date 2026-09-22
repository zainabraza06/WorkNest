import mongoose from 'mongoose';
import { PAYMENT_STATUS } from '../constants/index.js';

/**
 * Escrow record. Modelled on Stripe PaymentIntents with manual capture:
 *   requires_payment → held (authorised) → released (captured) | refunded (cancelled)
 * Stripe runs in TEST MODE ONLY for this project.
 */
const paymentSchema = new mongoose.Schema(
  {
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true, unique: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    worker: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    amount: { type: Number, min: 1, required: true }, // PKR the client pays
    platformFee: { type: Number, min: 0, required: true },
    workerPayout: { type: Number, min: 0, required: true },
    currency: { type: String, default: 'pkr' },

    provider: { type: String, enum: ['stripe'], default: 'stripe' },
    providerPaymentId: { type: String, index: true, sparse: true },

    status: {
      type: String,
      enum: Object.values(PAYMENT_STATUS),
      default: PAYMENT_STATUS.REQUIRES_PAYMENT,
    },
    heldAt: Date,
    releasedAt: Date,
    refundedAt: Date,
    failureReason: String,
  },
  { timestamps: true },
);

paymentSchema.set('toJSON', { versionKey: false });

/**
 * A worker's balance is derived from these rows, so every status change moves it: escrow held
 * changes what is pending, released changes what is available, refunded takes it back.
 *
 * The hook lives on the model rather than at each call site because there are seven places a
 * payment's status changes — the webhook, the manual sync, completion, cancellation, dispute
 * resolution — and one of them being forgotten would leave a worker staring at a stale number.
 * The socket module is imported lazily so models and sockets do not import each other at load.
 */
paymentSchema.pre('save', function trackStatusChange() {
  this.$locals.statusChanged = this.isModified('status');
});

paymentSchema.post('save', async function announceStatusChange(doc) {
  if (!doc.$locals?.statusChanged) return;
  try {
    const { emitToUser } = await import('../socket/index.js');
    emitToUser(doc.worker, 'earnings:updated', { paymentId: doc._id, status: doc.status });
  } catch {
    // Never let a notification failure roll back money that has already been recorded
  }
});

export const Payment = mongoose.model('Payment', paymentSchema);
