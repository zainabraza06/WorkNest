import { recordEvent } from '../services/ranking.service.js';

/**
 * Labels a search result. Fire-and-forget from the client's point of view: a failed label
 * must never interrupt what the user was doing, so this always answers 200.
 */
export async function logRankingEvent(req, res) {
  const { impressionId, workerId, type } = req.valid.body;
  const recorded = await recordEvent({ impressionId, workerId, type, client: req.user?._id });
  res.json({ success: true, data: { recorded } });
}
