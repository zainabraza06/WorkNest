import mongoose from 'mongoose';
import { BOOKING_STATUS, DURATION_TYPES, ROLES } from '../constants/index.js';

const timelineEntrySchema = new mongoose.Schema(
  {
    status: { type: String, enum: Object.values(BOOKING_STATUS), required: true },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    note: { type: String, maxlength: 300 },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const bookingSchema = new mongoose.Schema(
  {
    // Not unique: if a worker cancels, the job reopens and can get a new booking.
    // "One active booking per job" is enforced by the atomic job-status guard when an offer is accepted.
    job: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true, index: true },
    offer: { type: mongoose.Schema.Types.ObjectId, ref: 'Offer', required: true },
    worker: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    agreedPrice: { type: Number, min: 1, required: true }, // PKR
    durationType: { type: String, enum: DURATION_TYPES, required: true },
    durationCount: { type: Number, min: 1, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    terms: String,

    status: {
      type: String,
      enum: Object.values(BOOKING_STATUS),
      default: BOOKING_STATUS.PENDING_PAYMENT,
      index: true,
    },
    timeline: [timelineEntrySchema],
    payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },

    startedAt: Date,
    completedAt: Date,
    cancelledAt: Date,
    cancellationReason: String,

    /**
     * Work that has started cannot be called off by one side alone: the other party has
     * already committed time or money to it. One side requests, the other answers, and a
     * refusal is what sends it to a dispute for someone impartial to settle.
     */
    cancellationRequest: {
      by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      byRole: { type: String, enum: [ROLES.WORKER, ROLES.CLIENT] },
      reason: { type: String, trim: true, maxlength: 300 },
      status: { type: String, enum: ['pending', 'accepted', 'declined'] },
      requestedAt: Date,
      respondedAt: Date,
      declineReason: { type: String, trim: true, maxlength: 300 },
    },

    reviewed: {
      byClient: { type: Boolean, default: false },
      byWorker: { type: Boolean, default: false },
    },
  },
  { timestamps: true },
);

bookingSchema.set('toJSON', { versionKey: false });

export const Booking = mongoose.model('Booking', bookingSchema);
