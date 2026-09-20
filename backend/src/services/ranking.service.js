import { SearchImpression } from '../models/index.js';

/**
 * Collects the training data for the learning-to-rank model.
 *
 * Nothing here is allowed to affect the user-facing request: every call is best-effort and
 * swallows its own errors. A failed log must never break a search or a booking.
 */

const ATTRIBUTION_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // a hire a week after the search still counts
const MAX_LOGGED_RESULTS = 20;

/** Records what was shown, with the features that produced that ordering. */
export async function recordImpression({ client, query, mode, category, city, budgetMax, items }) {
  if (!items?.length) return null;

  try {
    const impression = await SearchImpression.create({
      client: client ?? null,
      query,
      mode,
      category,
      city,
      budgetMax,
      results: items.slice(0, MAX_LOGGED_RESULTS).map((w, position) => ({
        worker: w.user?._id ?? w.user,
        position,
        semantic: w.matchScore ?? 0,
        trustScore: w.trustScore?.score ?? 50,
        avgRating: w.stats?.avgRating ?? 0,
        reviewCount: w.stats?.reviewCount ?? 0,
        distanceKm: w.distanceKm ?? null,
        dailyRate: w.rates?.daily ?? null,
        completedJobs: w.stats?.completedJobs ?? 0,
        idVerified: Boolean(w.idVerified),
        isAvailable: w.isAvailable !== false,
      })),
    });
    return impression._id;
  } catch (err) {
    console.warn('Failed to log search impression:', err.message);
    return null;
  }
}

/** Marks a positive signal against the worker in a specific impression. */
export async function recordEvent({ impressionId, workerId, type, client }) {
  const field = { open: 'opened', hire_intent: 'hireIntent' }[type];
  if (!field) return false;

  try {
    const result = await SearchImpression.updateOne(
      {
        _id: impressionId,
        'results.worker': workerId,
        // Only the searcher can label their own search
        ...(client ? { $or: [{ client }, { client: null }] } : {}),
      },
      { $set: { [`results.$.${field}`]: true } },
    );
    return result.modifiedCount > 0;
  } catch (err) {
    console.warn('Failed to record ranking event:', err.message);
    return false;
  }
}

/**
 * The strongest label: this client actually booked this worker. Attributed back to any search
 * they ran in the previous week that showed them.
 */
export async function recordHire({ clientId, workerId }) {
  try {
    await SearchImpression.updateMany(
      {
        client: clientId,
        'results.worker': workerId,
        createdAt: { $gte: new Date(Date.now() - ATTRIBUTION_WINDOW_MS) },
      },
      { $set: { 'results.$.hired': true } },
    );
  } catch (err) {
    console.warn('Failed to attribute hire:', err.message);
  }
}

/** Flat rows for training: one per (impression, worker) pair. */
export async function exportTrainingRows({ since } = {}) {
  const filter = since ? { createdAt: { $gte: since } } : {};
  const impressions = await SearchImpression.find(filter).lean();

  return impressions.flatMap((imp) =>
    imp.results.map((r) => ({
      impression_id: String(imp._id),
      query: imp.query ?? '',
      mode: imp.mode,
      position: r.position,
      semantic: r.semantic,
      trust_score: r.trustScore,
      avg_rating: r.avgRating,
      review_count: r.reviewCount,
      distance_km: r.distanceKm ?? '',
      daily_rate: r.dailyRate ?? '',
      budget_max: imp.budgetMax ?? '',
      completed_jobs: r.completedJobs,
      id_verified: r.idVerified ? 1 : 0,
      is_available: r.isAvailable ? 1 : 0,
      opened: r.opened ? 1 : 0,
      hire_intent: r.hireIntent ? 1 : 0,
      hired: r.hired ? 1 : 0,
    })),
  );
}
