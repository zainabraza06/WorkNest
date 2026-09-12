import { z } from 'zod';
import { pagination } from './common.js';

const aspect = z.coerce.number().int().min(1).max(5).optional();

export const createReviewSchema = z.object({
  rating: z.coerce.number().int().min(1, 'Rating is required').max(5),
  text: z.string().trim().max(1500).optional(),
  aspects: z.object({ quality: aspect, punctuality: aspect, communication: aspect }).optional(),
});

export const listReviewsQuery = z.object({
  ...pagination,
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
