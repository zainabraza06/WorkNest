import { z } from 'zod';
import { BOOKING_STATUS } from '../constants/index.js';
import { pagination } from './common.js';

export const listBookingsQuery = z.object({
  status: z
    .string()
    .optional()
    .transform((s) => s?.split(',').filter(Boolean))
    .pipe(z.array(z.enum(Object.values(BOOKING_STATUS))).optional()),
  ...pagination,
});

export const bookingReasonSchema = z.object({
  reason: z.string().trim().max(300).optional(),
});

export const disputeSchema = z.object({
  reason: z.string().trim().min(10, 'Please explain the problem in at least 10 characters').max(1000),
});

/** Asking to call off started work: a reason is required, because the other side must judge it. */
export const cancellationRequestSchema = z.object({
  reason: z.string().trim().min(10, 'Explain why in at least 10 characters').max(300),
});

export const cancellationResponseSchema = z.object({
  accept: z.boolean(),
  reason: z.string().trim().max(300).optional(),
});

export const disputeStatementSchema = z.object({
  text: z.string().trim().min(10, 'Explain your side in at least 10 characters').max(2000),
});

export const resolveDisputeSchema = z.object({
  outcome: z.enum(['release', 'refund']),
  // Required: whoever lost the money is owed an explanation they can read
  note: z.string().trim().min(10, 'Explain the decision in at least 10 characters').max(1000),
});
