import { Message } from '../models/index.js';
import { emitToOffer } from '../socket/index.js';

/**
 * How an offer is populated wherever one is returned or pushed. Both flows use it so the client
 * receives one shape whether the worker bid on a job or the client hired them directly.
 */
export const OFFER_POPULATE = [
  { path: 'job', select: 'title category budget durationType durationCount startDate city status client invitedWorker' },
  { path: 'worker', select: 'name avatar' },
  { path: 'client', select: 'name avatar' },
];

/**
 * Append an entry to a negotiation thread and push it to everyone watching.
 *
 * Both the worker-led flow (a worker bids on a posted job) and the client-led one (a client
 * hires a named worker) open a thread the same way, so this lives outside either controller.
 */
export async function postMessage(offer, { sender = null, type, text, roundId }) {
  const message = await Message.create({
    offer: offer._id,
    job: offer.job,
    sender,
    type,
    text,
    roundId,
    readBy: sender ? [sender] : [],
  });
  emitToOffer(offer._id, 'message:new', message);
  return message;
}
