import mongoose from 'mongoose';

/**
 * A thing that happened to you while you were not looking.
 *
 * The app already pushed these events over the socket, but a socket event only reaches someone
 * who is connected at that instant: a worker offline when a client hires them had no way to
 * learn about it except stumbling back into the Offers page. These are the same events, stored,
 * so the record survives being away.
 *
 * Notifications are disposable by design — they carry a link to the real resource rather than
 * a copy of it, so nothing here is a source of truth and an old one going missing costs
 * nothing. They expire after 90 days.
 */
const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, required: true }, // offer_new, offer_countered, booking_confirmed, …
    title: { type: String, required: true, maxlength: 120 },
    body: { type: String, maxlength: 300 },
    link: { type: String, maxlength: 200 }, // in-app path the notification opens
    readAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// The two queries the UI makes: my recent notifications, and how many are unread
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, readAt: 1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

notificationSchema.set('toJSON', { versionKey: false });

export const Notification = mongoose.model('Notification', notificationSchema);
