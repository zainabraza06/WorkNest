import mongoose from 'mongoose';

import { WITHDRAWAL_STATUS } from '../constants/index.js';

/**
 * A worker asking for money they have earned.
 *
 * Escrow captures into the platform's Stripe account, and Stripe Connect — which is how a
 * platform would normally pay its sellers — is not available for Pakistan. So the last leg is
 * settled outside Stripe by bank transfer or a mobile wallet, and this is the record of it:
 * what was asked for, what was paid, by whom, and against which reference.
 *
 * The payout details are **snapshotted onto the request**. A worker who changes their account
 * number afterwards must not silently rewrite where an already-paid withdrawal went.
 */
const withdrawalSchema = new mongoose.Schema(
  {
    worker: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amount: { type: Number, min: 1, required: true }, // PKR

    method: {
      type: { type: String, enum: ['bank', 'easypaisa', 'jazzcash'], required: true },
      accountTitle: { type: String, required: true, trim: true },
      accountNumber: { type: String, required: true, trim: true },
      bankName: { type: String, trim: true },
    },

    status: { type: String, enum: Object.values(WITHDRAWAL_STATUS), default: WITHDRAWAL_STATUS.REQUESTED, index: true },
    requestedAt: { type: Date, default: Date.now },
    processedAt: Date,
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reference: { type: String, trim: true, maxlength: 100 }, // bank transaction id
    note: { type: String, trim: true, maxlength: 300 }, // why it was rejected
  },
  { timestamps: true },
);

/**
 * One open request at a time, enforced by the database rather than by checking first.
 *
 * Two requests submitted together would otherwise both read the same available balance and
 * both pass — this makes the second one fail outright, which is the only way to be sure a
 * worker cannot withdraw the same money twice.
 */
withdrawalSchema.index(
  { worker: 1 },
  {
    // Named, because the field already carries a plain { worker: 1 } index for history lookups
    // and an unnamed second one on the same key collides with it.
    name: 'one_open_withdrawal_per_worker',
    unique: true,
    partialFilterExpression: { status: WITHDRAWAL_STATUS.REQUESTED },
  },
);
withdrawalSchema.index({ status: 1, requestedAt: 1 });

withdrawalSchema.set('toJSON', { versionKey: false });

export const Withdrawal = mongoose.model('Withdrawal', withdrawalSchema);
