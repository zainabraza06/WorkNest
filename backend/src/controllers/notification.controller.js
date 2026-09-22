import { Notification } from '../models/index.js';

/** Recent notifications plus the unread count the bell badge shows. */
export async function listNotifications(req, res) {
  const { page, limit } = req.valid.query;
  const filter = { user: req.user._id };

  const [items, total, unread] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Notification.countDocuments(filter),
    Notification.countDocuments({ ...filter, readAt: null }),
  ]);

  res.json({ success: true, data: { items, page, limit, total, totalPages: Math.ceil(total / limit), unread } });
}

/** Mark one as read, or all of them when no id is given. */
export async function markNotificationsRead(req, res) {
  const filter = { user: req.user._id, readAt: null, ...(req.valid.body.id && { _id: req.valid.body.id }) };
  const { modifiedCount } = await Notification.updateMany(filter, { readAt: new Date() });
  const unread = await Notification.countDocuments({ user: req.user._id, readAt: null });

  res.json({ success: true, data: { marked: modifiedCount, unread } });
}
