import { z } from 'zod';
import { CATEGORIES, DURATION_TYPES, URGENCY } from '../constants/index.js';
import { city, latLng, pagination } from './common.js';

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const budget = z
  .object({
    min: z.coerce.number().int().min(100, 'Minimum budget is PKR 100'),
    max: z.coerce.number().int().max(10_000_000),
  })
  .refine((b) => b.max >= b.min, { message: 'Maximum must be at least the minimum', path: ['max'] });

const jobFields = {
  title: z.string().trim().min(5, 'Title must be at least 5 characters').max(120),
  description: z.string().trim().min(20, 'Describe the job in at least 20 characters').max(3000),
  category: z.enum(CATEGORIES),
  skills: z
    .array(z.string().trim().toLowerCase().min(2).max(40))
    .max(10)
    .default([])
    .transform((s) => [...new Set(s)]),
  budget,
  durationType: z.enum(DURATION_TYPES),
  durationCount: z.coerce.number().int().min(1).max(365).default(1),
  startDate: z.coerce.date().refine((d) => d >= startOfToday(), 'Start date cannot be in the past'),
  urgency: z.enum(URGENCY).default('normal'),
  location: latLng,
  city,
  address: z.string().trim().max(200).optional(),
};

export const createJobSchema = z.object(jobFields);

export const updateJobSchema = z
  .object(jobFields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

export const cancelJobSchema = z.object({
  reason: z.string().trim().max(300).optional(),
});

const csv = (inner) =>
  z
    .union([z.string(), z.array(z.string())])
    .transform((v) => (Array.isArray(v) ? v : v.split(',')).map((s) => s.trim()).filter(Boolean))
    .pipe(z.array(inner));

export const listJobsQuery = z
  .object({
    q: z.string().trim().max(200).optional(),
    category: csv(z.enum(CATEGORIES)).optional(),
    city: city.optional(),
    durationType: csv(z.enum(DURATION_TYPES)).optional(),
    urgency: z.enum(URGENCY).optional(),
    minBudget: z.coerce.number().min(0).optional(),
    maxBudget: z.coerce.number().min(0).optional(),
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    radiusKm: z.coerce.number().min(1).max(200).default(25),
    sort: z.enum(['newest', 'budget_high', 'budget_low', 'nearest', 'relevance']).default('newest'),
    ...pagination,
  })
  .refine((v) => (v.lat === undefined) === (v.lng === undefined), {
    message: 'lat and lng must be provided together',
    path: ['lat'],
  })
  .refine((v) => v.sort !== 'nearest' || v.lat !== undefined, {
    message: 'sort=nearest requires lat and lng',
    path: ['sort'],
  });

export const myJobsQuery = z.object({
  status: z.string().optional(),
  ...pagination,
});

export const workerSearchQuery = z
  .object({
    q: z.string().trim().max(200).optional(),
    category: csv(z.enum(CATEGORIES)).optional(),
    skills: csv(z.string().toLowerCase().max(40)).optional(),
    city: city.optional(),
    minRate: z.coerce.number().min(0).optional(),
    maxRate: z.coerce.number().min(0).optional(),
    minTrust: z.coerce.number().min(0).max(100).optional(),
    minRating: z.coerce.number().min(0).max(5).optional(),
    verified: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
    available: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    radiusKm: z.coerce.number().min(1).max(200).default(25),
    sort: z.enum(['relevance', 'trust', 'rating', 'price_low', 'price_high', 'nearest']).default('trust'),
    // 'smart' asks the AI service to rank results against the free-text query
    mode: z.enum(['keyword', 'smart']).default('keyword'),
    ...pagination,
  })
  .refine((v) => (v.lat === undefined) === (v.lng === undefined), {
    message: 'lat and lng must be provided together',
    path: ['lat'],
  })
  .refine((v) => v.sort !== 'nearest' || v.lat !== undefined, {
    message: 'sort=nearest requires lat and lng',
    path: ['sort'],
  });
