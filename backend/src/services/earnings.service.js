import mongoose from 'mongoose';

import { Payment, Withdrawal } from '../models/index.js';
import { PAYMENT_STATUS, WITHDRAWAL_STATUS } from '../constants/index.js';

/**
 * What a worker has earned, and how much of it they can ask for right now.
 *
 * Every figure is summed from the Payment and Withdrawal collections on each call. Nothing is
 * stored as a running balance: a cached number that drifts from the records behind it is worse
 * than no number at all, and this is money.
 *
 *   earned     released escrow, the worker's share after the platform fee
 *   inEscrow   held against bookings not yet completed — real, but not theirs yet
 *   requested  locked by a withdrawal waiting to be paid
 *   paid       already sent
 *   available  earned − requested − paid
 */
export async function getEarnings(workerId) {
  const worker = new mongoose.Types.ObjectId(String(workerId));

  const [payments, withdrawals] = await Promise.all([
    Payment.aggregate([
      { $match: { worker, status: { $in: [PAYMENT_STATUS.RELEASED, PAYMENT_STATUS.HELD] } } },
      { $group: { _id: '$status', total: { $sum: '$workerPayout' }, count: { $sum: 1 } } },
    ]),
    Withdrawal.aggregate([
      { $match: { worker, status: { $in: [WITHDRAWAL_STATUS.REQUESTED, WITHDRAWAL_STATUS.PAID] } } },
      { $group: { _id: '$status', total: { $sum: '$amount' } } },
    ]),
  ]);

  const sum = (rows, key) => rows.find((r) => r._id === key)?.total ?? 0;

  const earned = sum(payments, PAYMENT_STATUS.RELEASED);
  const inEscrow = sum(payments, PAYMENT_STATUS.HELD);
  const requested = sum(withdrawals, WITHDRAWAL_STATUS.REQUESTED);
  const paid = sum(withdrawals, WITHDRAWAL_STATUS.PAID);

  return {
    earned,
    inEscrow,
    requested,
    paid,
    // Never negative: a rejected-then-reissued withdrawal, or a manual correction, should show
    // zero rather than a number that reads like the worker owes the platform money.
    available: Math.max(0, earned - requested - paid),
    jobsPaid: payments.find((p) => p._id === PAYMENT_STATUS.RELEASED)?.count ?? 0,
  };
}
