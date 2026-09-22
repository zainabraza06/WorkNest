import { z } from 'zod';

import { MIN_WITHDRAWAL_PKR, PAYOUT_METHODS, WITHDRAWAL_STATUS } from '../constants/index.js';
import { pagination } from './common.js';

/**
 * A Pakistani IBAN is 24 characters; Easypaisa and JazzCash use the 11-digit mobile number the
 * wallet is registered to. Both are checked loosely on purpose — the real validation is the
 * admin looking at it before sending money, and rejecting a valid account on a format guess
 * costs a worker their earnings.
 */
export const payoutMethodSchema = z
  .object({
    type: z.enum(PAYOUT_METHODS),
    accountTitle: z.string().trim().min(3, 'Enter the name on the account').max(80),
    accountNumber: z.string().trim().min(10, 'Enter the full account number').max(34),
    bankName: z.string().trim().max(60).optional(),
  })
  .refine((v) => v.type !== 'bank' || Boolean(v.bankName), {
    message: 'Which bank is this account with?',
    path: ['bankName'],
  });

export const withdrawalRequestSchema = z.object({
  amount: z.coerce
    .number()
    .int()
    .min(MIN_WITHDRAWAL_PKR, `The smallest withdrawal is Rs ${MIN_WITHDRAWAL_PKR}`)
    .max(10_000_000),
});

export const settleWithdrawalSchema = z.object({
  paid: z.boolean(),
  reference: z.string().trim().max(100).optional(),
  note: z.string().trim().max(300).optional(),
});

export const listWithdrawalsQuery = z.object({
  ...pagination,
  status: z.enum(Object.values(WITHDRAWAL_STATUS)).optional(),
});
