import mongoose from 'mongoose';
import { CATEGORIES, DURATION_TYPES, JOB_STATUS, URGENCY } from '../constants/index.js';
import { locationFields } from './shared.js';

const jobSchema = new mongoose.Schema(
  {
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    title: { type: String, required: true, trim: true, minlength: 5, maxlength: 120 },
    description: { type: String, required: true, trim: true, minlength: 20, maxlength: 3000 },
    category: { type: String, enum: CATEGORIES, required: true },
    skills: [{ type: String, trim: true, lowercase: true, maxlength: 40 }],

    // PKR, for the whole duration below
    budget: {
      min: { type: Number, min: 0, required: true },
      max: { type: Number, min: 0, required: true },
    },
    durationType: { type: String, enum: DURATION_TYPES, required: true },
    durationCount: { type: Number, min: 1, max: 365, default: 1 }, // e.g. 3 days, 2 months
    startDate: { type: Date, required: true },
    urgency: { type: String, enum: URGENCY, default: 'normal' },

    ...locationFields,

    status: { type: String, enum: Object.values(JOB_STATUS), default: JOB_STATUS.POSTED, index: true },

    // Set when a client hires one worker directly from their profile rather than posting
    // publicly. Such a job is not an open call: it is excluded from browse and no other worker
    // may bid on it, so it carries a private request to exactly one person.
    invitedWorker: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    hiredWorker: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
    offersCount: { type: Number, default: 0 },

    // Snapshot of the AI fair-price suggestion shown when the job was posted
    suggestedPrice: {
      min: Number,
      max: Number,
      median: Number,
      source: String,
    },
  },
  { timestamps: true },
);

jobSchema.pre('validate', function checkBudget() {
  if (this.budget && this.budget.max < this.budget.min) {
    this.invalidate('budget.max', 'budget.max must be greater than or equal to budget.min');
  }
});

jobSchema.index({ location: '2dsphere' });
jobSchema.index({ status: 1, category: 1, createdAt: -1 });
jobSchema.index(
  { title: 'text', description: 'text', skills: 'text' },
  { weights: { title: 5, skills: 4, description: 1 }, name: 'job_text' },
);

jobSchema.set('toJSON', { versionKey: false });

export const Job = mongoose.model('Job', jobSchema);
