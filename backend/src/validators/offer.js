import { z } from 'zod';
import { DURATION_TYPES, OFFER_STATUS } from '../constants/index.js';
import { objectId, pagination } from './common.js';

const amount = z.coerce.number().int().min(100, 'Minimum offer is Rs 100').max(10_000_000);
const terms = z.string().trim().max(1000).optional();

export const createOfferSchema = z.object({
  amount,
  durationType: z.enum(DURATION_TYPES).optional(),
  durationCount: z.coerce.number().int().min(1).max(365).optional(),
  startDate: z.coerce.date().optional(),
  terms,
  coverNote: z.string().trim().max(1000).optional(),
});

export const counterOfferSchema = z.object({
  amount,
  durationCount: z.coerce.number().int().min(1).max(365).optional(),
  startDate: z.coerce.date().optional(),
  terms,
  message: z.string().trim().max(1000).optional(),
});

export const listOffersQuery = z.object({
  job: objectId.optional(),
  status: z
    .string()
    .optional()
    .transform((s) => s?.split(',').filter(Boolean))
    .pipe(z.array(z.enum(Object.values(OFFER_STATUS))).optional()),
  ...pagination,
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const sendMessageSchema = z.object({
  text: z.string().trim().min(1, 'Message cannot be empty').max(2000),
});

export const listMessagesQuery = z.object({
  before: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const reasonSchema = z.object({
  reason: z.string().trim().max(300).optional(),
});
