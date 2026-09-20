import mongoose from 'mongoose';

/**
 * One search, and what happened next.
 *
 * This is the training data for the ranker. The critical detail is that each result stores the
 * feature values **as they were at the moment it was shown** — a worker's Trust Score and
 * distance change over time, so reading them back from the profile later would train the model
 * on features that never produced this outcome.
 *
 * Labels, weakest to strongest: shown → opened → hire intent → hired.
 */
const rankedResultSchema = new mongoose.Schema(
  {
    worker: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    position: { type: Number, required: true }, // 0-indexed rank as displayed

    // Feature vector at impression time
    semantic: { type: Number, default: 0 },
    trustScore: { type: Number, default: 50 },
    avgRating: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },
    distanceKm: { type: Number, default: null },
    dailyRate: { type: Number, default: null },
    completedJobs: { type: Number, default: 0 },
    idVerified: { type: Boolean, default: false },
    isAvailable: { type: Boolean, default: true },

    // Outcomes
    opened: { type: Boolean, default: false },
    hireIntent: { type: Boolean, default: false },
    hired: { type: Boolean, default: false },
  },
  { _id: false },
);

const searchImpressionSchema = new mongoose.Schema(
  {
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // null = signed out
    query: { type: String, trim: true, maxlength: 200 },
    mode: { type: String, enum: ['smart', 'keyword'], default: 'keyword' },
    category: String,
    city: String,
    budgetMax: Number,
    results: {
      type: [rankedResultSchema],
      validate: { validator: (v) => v.length <= 20, message: 'Only the visible page is logged' },
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

searchImpressionSchema.index({ client: 1, createdAt: -1 });
searchImpressionSchema.index({ 'results.worker': 1, createdAt: -1 });
// Training data has a shelf life, and this collection would otherwise grow without bound
searchImpressionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

searchImpressionSchema.set('toJSON', { versionKey: false });

export const SearchImpression = mongoose.model('SearchImpression', searchImpressionSchema);
