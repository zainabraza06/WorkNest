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

export const resolveDisputeSchema = z.object({
  outcome: z.enum(['release', 'refund']),
  note: z.string().trim().max(300).optional(),
});
