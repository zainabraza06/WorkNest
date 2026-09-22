import { Payment, WorkerProfile, Withdrawal } from '../models/index.js';
import { MIN_WITHDRAWAL_PKR, PAYMENT_STATUS, ROLES, WITHDRAWAL_STATUS } from '../constants/index.js';
import { ApiError } from '../utils/ApiError.js';
import { getEarnings } from '../services/earnings.service.js';
import { notify } from '../services/notification.service.js';

/** Enough to recognise the account, not enough to be worth stealing off a screen. */
const maskAccount = (n) => (n && n.length > 4 ? `${'•'.repeat(Math.min(6, n.length - 4))}${n.slice(-4)}` : n);

/** A worker's own history is masked too — they confirm the full number on the payout form. */
const masked = (w) => ({ ...w.toJSON(), method: { ...w.method.toJSON(), accountNumber: maskAccount(w.method.accountNumber) } });

/** The worker's own money: balances, the payments behind them, and their withdrawal history. */
export async function getMyEarnings(req, res) {
  const [earnings, profile, payments, withdrawals] = await Promise.all([
    getEarnings(req.user._id),
    WorkerProfile.findOne({ user: req.user._id }).select('payoutMethod'),
    Payment.find({ worker: req.user._id, status: { $in: [PAYMENT_STATUS.RELEASED, PAYMENT_STATUS.HELD] } })
      .sort({ updatedAt: -1 })
      .limit(20)
      .populate({ path: 'booking', select: 'job', populate: { path: 'job', select: 'title' } })
      .select('amount platformFee workerPayout status heldAt releasedAt booking'),
    Withdrawal.find({ worker: req.user._id }).sort({ requestedAt: -1 }).limit(20),
  ]);

  res.json({
    success: true,
    data: {
      ...earnings,
      minWithdrawal: MIN_WITHDRAWAL_PKR,
      payoutMethod: profile?.payoutMethod?.type ? profile.payoutMethod : null,
      payments,
      withdrawals: withdrawals.map(masked),
    },
  });
}

/** Where to send the money. Stored on the profile, snapshotted onto each request. */
export async function setPayoutMethod(req, res) {
  const profile = await WorkerProfile.findOne({ user: req.user._id });
  if (!profile) throw ApiError.badRequest('Create your worker profile first');

  profile.payoutMethod = { ...req.valid.body, updatedAt: new Date() };
  await profile.save();

  res.json({ success: true, data: profile.payoutMethod });
}

export async function requestWithdrawal(req, res) {
  const profile = await WorkerProfile.findOne({ user: req.user._id }).select('payoutMethod');
  if (!profile?.payoutMethod?.accountNumber) {
    throw ApiError.badRequest('Add your bank or wallet details before requesting a withdrawal');
  }

  const { amount } = req.valid.body;
  const earnings = await getEarnings(req.user._id);
  if (amount > earnings.available) {
    throw ApiError.badRequest(`You can withdraw up to Rs ${earnings.available.toLocaleString('en-PK')}`);
  }

  const { type, accountTitle, accountNumber, bankName } = profile.payoutMethod;
  try {
    const withdrawal = await Withdrawal.create({
      worker: req.user._id,
      amount,
      method: { type, accountTitle, accountNumber, bankName },
    });
    res.status(201).json({ success: true, data: withdrawal });
  } catch (err) {
    // The partial unique index is what actually prevents withdrawing the same money twice:
    // two requests sent together both read the same balance, and only one can be written.
    if (err?.code === 11000) throw ApiError.conflict('You already have a withdrawal waiting to be paid');
    throw err;
  }
}

/** Worker: my own. Admin: the queue, oldest first, because people are waiting on money. */
export async function listWithdrawals(req, res) {
  const { status, page, limit } = req.valid.query;
  const isAdmin = req.user.role === ROLES.ADMIN;

  const filter = { ...(isAdmin ? {} : { worker: req.user._id }), ...(status && { status }) };
  const query = Withdrawal.find(filter)
    .sort(isAdmin ? { requestedAt: 1 } : { requestedAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);
  if (isAdmin) query.populate('worker', 'name email phone');

  const [items, total] = await Promise.all([query, Withdrawal.countDocuments(filter)]);

  res.json({
    success: true,
    data: {
      items: isAdmin ? items : items.map(masked),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}

/**
 * Admin marks a request paid or rejects it.
 *
 * Marking paid records that money left the platform by some other rail — a bank transfer or a
 * wallet — and the reference is what makes that claim checkable afterwards. Rejecting releases
 * the amount back into the worker's available balance.
 */
export async function settleWithdrawal(req, res) {
  const { paid, reference, note } = req.valid.body;
  if (paid && !reference) throw ApiError.badRequest('Record the transfer reference so the payment can be traced');

  // Atomic: only a request still waiting can be settled, so two admins cannot pay it twice
  const withdrawal = await Withdrawal.findOneAndUpdate(
    { _id: req.valid.params.id, status: WITHDRAWAL_STATUS.REQUESTED },
    {
      status: paid ? WITHDRAWAL_STATUS.PAID : WITHDRAWAL_STATUS.REJECTED,
      processedAt: new Date(),
      processedBy: req.user._id,
      ...(reference && { reference }),
      ...(note && { note }),
    },
    { returnDocument: 'after' },
  ).populate('worker', 'name');

  if (!withdrawal) throw ApiError.conflict('That withdrawal has already been settled');

  await notify(withdrawal.worker._id, {
    type: paid ? 'withdrawal_paid' : 'withdrawal_rejected',
    title: paid
      ? `Rs ${withdrawal.amount.toLocaleString('en-PK')} sent to your account`
      : 'Your withdrawal request was rejected',
    body: paid ? `Reference: ${reference}` : (note ?? 'The amount is back in your available balance.'),
    link: '/earnings',
  });

  res.json({ success: true, data: withdrawal });
}

/** Admin console summary: how much is owed and how long people have been waiting. */
export async function getWithdrawalSummary(_req, res) {
  const [pending] = await Withdrawal.aggregate([
    { $match: { status: WITHDRAWAL_STATUS.REQUESTED } },
    { $group: { _id: null, count: { $sum: 1 }, total: { $sum: '$amount' }, oldest: { $min: '$requestedAt' } } },
  ]);

  res.json({
    success: true,
    data: { count: pending?.count ?? 0, total: pending?.total ?? 0, oldest: pending?.oldest ?? null },
  });
}
