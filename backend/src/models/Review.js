import mongoose from 'mongoose';
import { ROLES } from '../constants/index.js';

const reviewSchema = new mongoose.Schema(
  {
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
    job: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
    from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    fromRole: { type: String, enum: [ROLES.WORKER, ROLES.CLIENT], required: true },

    rating: { type: Number, min: 1, max: 5, required: true },
    text: { type: String, trim: true, maxlength: 1500 },
    // Optional detail ratings (1–5)
    aspects: {
      quality: { type: Number, min: 1, max: 5 },
      punctuality: { type: Number, min: 1, max: 5 },
      communication: { type: Number, min: 1, max: 5 },
    },
  },
  { timestamps: true },
);

reviewSchema.index({ booking: 1, from: 1 }, { unique: true });
reviewSchema.set('toJSON', { versionKey: false });

export const Review = mongoose.model('Review', reviewSchema);
