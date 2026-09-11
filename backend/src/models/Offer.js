import mongoose from 'mongoose';
import { DURATION_TYPES, OFFER_STATUS, ROLES } from '../constants/index.js';

/**
 * A negotiation thread between one worker and the client on one job.
 * Every proposal (initial offer or counter-offer) is a structured round,
 * not free text — the latest round is always the terms on the table.
 */
const roundSchema = new mongoose.Schema(
  {
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    byRole: { type: String, enum: [ROLES.WORKER, ROLES.CLIENT], required: true },
    amount: { type: Number, min: 1, required: true }, // PKR total for the duration
    durationType: { type: String, enum: DURATION_TYPES, required: true },
    durationCount: { type: Number, min: 1, max: 365, required: true },
    startDate: { type: Date, required: true },
    terms: { type: String, trim: true, maxlength: 1000 },
  },
  { _id: true, timestamps: { createdAt: true, updatedAt: false } },
);

const offerSchema = new mongoose.Schema(
  {
    job: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
    worker: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    coverNote: { type: String, trim: true, maxlength: 1000 },
    rounds: {
      type: [roundSchema],
      validate: { validator: (v) => v.length > 0 && v.length <= 20, message: 'Offer must have 1–20 rounds' },
    },
    status: { type: String, enum: Object.values(OFFER_STATUS), default: OFFER_STATUS.PENDING },
    awaitingRole: { type: String, enum: [ROLES.WORKER, ROLES.CLIENT] },
    acceptedRound: { type: mongoose.Schema.Types.ObjectId },
    lastActivityAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

offerSchema.index({ job: 1, worker: 1 }, { unique: true });
offerSchema.index({ worker: 1, lastActivityAt: -1 });
offerSchema.index({ client: 1, lastActivityAt: -1 });

offerSchema.virtual('currentRound').get(function currentRound() {
  return this.rounds?.at(-1) ?? null;
});

offerSchema.set('toJSON', { virtuals: true, versionKey: false });

export const Offer = mongoose.model('Offer', offerSchema);
