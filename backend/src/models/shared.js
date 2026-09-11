import mongoose from 'mongoose';
import { CITIES } from '../constants/index.js';

/** GeoJSON point. Coordinates are [longitude, latitude]. */
export const pointSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: ([lng, lat] = []) =>
          Number.isFinite(lng) && Number.isFinite(lat) && lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90,
        message: 'coordinates must be [longitude, latitude]',
      },
    },
  },
  { _id: false },
);

export const locationFields = {
  location: { type: pointSchema, required: true },
  city: { type: String, enum: CITIES, required: true },
  address: { type: String, trim: true, maxlength: 200 },
};

export const imageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    caption: { type: String, trim: true, maxlength: 140 },
  },
  { _id: true, timestamps: { createdAt: true, updatedAt: false } },
);
