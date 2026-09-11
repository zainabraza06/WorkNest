import { z } from 'zod';
import mongoose from 'mongoose';
import { CITIES } from '../constants/index.js';

export const objectId = z
  .string()
  .refine((v) => mongoose.isValidObjectId(v), { message: 'Invalid id' });

/** API accepts { lat, lng }; models store GeoJSON [lng, lat]. */
export const latLng = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

export const toPoint = ({ lat, lng }) => ({ type: 'Point', coordinates: [lng, lat] });

export const city = z.enum(CITIES);

export const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
};

export const idParam = (name = 'id') => z.object({ [name]: objectId });
