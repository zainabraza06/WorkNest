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

export const Payment = mongoose.model('Payment', paymentSchema);
