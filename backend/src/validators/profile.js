import { z } from 'zod';
import { CATEGORIES } from '../constants/index.js';
import { city, latLng } from './common.js';

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm (24h)');

const availabilitySlot = z
  .object({ dayOfWeek: z.number().int().min(0).max(6), startTime: time, endTime: time })
  .refine((s) => s.startTime < s.endTime, { message: 'startTime must be before endTime', path: ['endTime'] });

const pkr = z.coerce.number().int().min(0).max(10_000_000);

export const workerProfileSchema = z.object({
  headline: z.string().trim().max(100).optional(),
  bio: z.string().trim().max(2000).optional(),
  categories: z.array(z.enum(CATEGORIES)).min(1, 'Select at least one category').max(5),
  skills: z
    .array(z.string().trim().toLowerCase().min(2).max(40))
    .max(20)
    .default([])
    .transform((s) => [...new Set(s)]),
  experienceYears: z.coerce.number().int().min(0).max(60).default(0),
  rates: z
    .object({ hourly: pkr.optional(), daily: pkr.refine((v) => v > 0, 'Daily rate is required'), monthly: pkr.optional() })
    .refine((r) => !r.monthly || r.monthly >= r.daily, {
      message: 'Monthly rate should not be lower than the daily rate',
      path: ['monthly'],
    }),
  location: latLng,
  city,
  address: z.string().trim().max(200).optional(),
  serviceRadiusKm: z.coerce.number().int().min(1).max(100).default(15),
  isAvailable: z.boolean().default(true),
  availability: z.array(availabilitySlot).max(21).default([]),
  unavailableDates: z.array(z.coerce.date()).max(60).default([]),
});

// PATCH semantics: every field optional, but whatever is sent must be valid
export const workerProfileUpdateSchema = workerProfileSchema.partial();

export const clientProfileSchema = z.object({
  location: latLng,
  city,
  address: z.string().trim().max(200).optional(),
  about: z.string().trim().max(1000).optional(),
});

export const clientProfileUpdateSchema = clientProfileSchema.partial();

export const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9\s-]{10,15}$/, 'Invalid phone number')
    .optional(),
});

export const portfolioCaptionSchema = z.object({
  captions: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .transform((c) => (c === undefined ? [] : Array.isArray(c) ? c : [c])),
});

export const verificationDecisionSchema = z.object({
  status: z.enum(['verified', 'rejected']),
});
