import mongoose from 'mongoose';
import { locationFields } from './shared.js';

const clientProfileSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    ...locationFields,
    about: { type: String, trim: true, maxlength: 1000 },
    jobHistory: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Job' }],
    stats: {
      jobsPosted: { type: Number, default: 0 },
      hires: { type: Number, default: 0 },
      avgRating: { type: Number, default: 0 },
      reviewCount: { type: Number, default: 0 },
    },
  },
  { timestamps: true },
);

clientProfileSchema.index({ location: '2dsphere' });
clientProfileSchema.set('toJSON', { versionKey: false });

export const ClientProfile = mongoose.model('ClientProfile', clientProfileSchema);
