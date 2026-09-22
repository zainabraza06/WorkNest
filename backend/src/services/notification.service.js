import { Notification } from '../models/index.js';
import { emitToUser } from '../socket/index.js';

/**
 * Record something that happened to a user, and push it if they are connected.
 *
 * Best-effort on purpose: a notification is a convenience, never the thing itself. Failing to
 * record that an offer arrived must not fail the request that created the offer, so every error
 * is swallowed and logged. The same reasoning as the ranking impressions.
 */
export async function notify(user, { type, title, body, link }) {
  if (!user) return null;
  try {
    const notification = await Notification.create({ user, type, title, body, link });
    emitToUser(user, 'notification:new', notification);
    return notification;
  } catch (err) {
    console.warn(`Could not record notification ${type}: ${err.message}`);
    return null;
  }
}

/** Both sides of a negotiation or booking, skipping whoever caused the event. */
export function notifyOthers(userIds, actorId, payload) {
  return Promise.all(
    userIds.filter((id) => id && String(id) !== String(actorId)).map((id) => notify(id, payload)),
  );
}
