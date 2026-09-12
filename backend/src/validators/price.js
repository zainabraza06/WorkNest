import { z } from 'zod';
import { CATEGORIES, DURATION_TYPES, URGENCY } from '../constants/index.js';
import { city } from './common.js';

export const priceQuery = z.object({
  category: z.enum(CATEGORIES),
  city: city.optional(),
  durationType: z.enum(DURATION_TYPES).default('one_day'),
  durationCount: z.coerce.number().int().min(1).max(365).default(1),
  urgency: z.enum(URGENCY).default('normal'),
  experienceYears: z.coerce.number().int().min(0).max(60).default(0),
});
