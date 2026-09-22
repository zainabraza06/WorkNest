import mongoose from 'mongoose';
import { CATEGORIES, ID_VERIFICATION_STATUS, PAYOUT_METHODS } from '../constants/index.js';
import { imageSchema, locationFields } from './shared.js';

const availabilitySlotSchema = new mongoose.Schema(
  {
    dayOfWeek: { type: Number, min: 0, max: 6, required: true }, // 0 = Sunday
    startTime: { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/, required: true },
    endTime: { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/, required: true },
  },
  { _id: false },
);

const workerProfileSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },

    headline: { type: String, trim: true, maxlength: 100 },
    bio: { type: String, trim: true, maxlength: 2000 },
    categories: {
      type: [{ type: String, enum: CATEGORIES }],
      validate: { validator: (v) => v.length > 0, message: 'Select at least one category' },
    },
    skills: [{ type: String, trim: true, lowercase: true, maxlength: 40 }],
    experienceYears: { type: Number, min: 0, max: 60, default: 0 },

    // All rates in PKR
    rates: {
      hourly: { type: Number, min: 0 },
      daily: { type: Number, min: 0, required: true },
      monthly: { type: Number, min: 0 },
    },

    ...locationFields,
    serviceRadiusKm: { type: Number, min: 1, max: 100, default: 15 },

    isAvailable: { type: Boolean, default: true },
    availability: [availabilitySlotSchema],
    unavailableDates: [Date],

    portfolio: {
      type: [imageSchema],
      validate: { validator: (v) => v.length <= 12, message: 'Portfolio is limited to 12 images' },
    },

    /**
     * Where this worker's earnings are sent. Held on the profile so it survives between
     * withdrawals, but snapshotted onto each request so changing it never rewrites history.
     * Never included in the public projection — see publicView().
     */
    payoutMethod: {
      type: { type: String, enum: PAYOUT_METHODS },
      accountTitle: { type: String, trim: true, maxlength: 80 },
      accountNumber: { type: String, trim: true, maxlength: 34 }, // IBAN is 24 in PK; wallets are 11
      bankName: { type: String, trim: true, maxlength: 60 },
      updatedAt: Date,
    },

    idVerification: {
      status: { type: String, enum: ID_VERIFICATION_STATUS, default: 'none' },
      document: { url: String, publicId: String },
      submittedAt: Date,
      reviewedAt: Date,
    },

    // Denormalised counters, kept up to date by booking/review services
    stats: {
      totalJobs: { type: Number, default: 0 },
      completedJobs: { type: Number, default: 0 },
      cancelledJobs: { type: Number, default: 0 },
      repeatHires: { type: Number, default: 0 },
      disputes: { type: Number, default: 0 },
      avgRating: { type: Number, default: 0 },
      reviewCount: { type: Number, default: 0 },
      avgResponseMinutes: { type: Number, default: null },
    },

    trustScore: {
      score: { type: Number, min: 0, max: 100, default: 50 },
      label: { type: String, default: 'New' },
      breakdown: { type: Map, of: Number },
      source: { type: String, default: 'placeholder' },
      updatedAt: Date,
    },
  },
  { timestamps: true },
);

workerProfileSchema.index({ location: '2dsphere' });
workerProfileSchema.index({ categories: 1, city: 1, 'trustScore.score': -1 });
workerProfileSchema.index(
  { headline: 'text', skills: 'text', bio: 'text' },
  { weights: { skills: 5, headline: 3, bio: 1 }, name: 'worker_text' },
);

workerProfileSchema.virtual('completionRate').get(function completionRate() {
  const { totalJobs, completedJobs } = this.stats ?? {};
  return totalJobs ? completedJobs / totalJobs : null;
});

workerProfileSchema.set('toJSON', { virtuals: true, versionKey: false });

export const WorkerProfile = mongoose.model('WorkerProfile', workerProfileSchema);
