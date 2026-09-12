import { User, WorkerProfile } from '../models/index.js';

/**
 * PLACEHOLDER Trust Score — a transparent weighted heuristic.
 * The AI service replaces this with a trained model; the feature set is identical
 * so the two are interchangeable (see ai-service/app/services/trust.py).
 */

const clamp01 = (v) => Math.max(0, Math.min(1, v));

export function trustLabel(score) {
  if (score >= 85) return 'Highly Trusted';
  if (score >= 70) return 'Trusted';
  if (score >= 50) return 'Building Trust';
  return 'New';
}

/** Raw features, shared with the AI service request payload. */
export function extractTrustFeatures(profile, user) {
  const s = profile.stats ?? {};
  return {
    completed_jobs: s.completedJobs ?? 0,
    total_jobs: s.totalJobs ?? 0,
    cancelled_jobs: s.cancelledJobs ?? 0,
    avg_rating: s.avgRating ?? 0,
    review_count: s.reviewCount ?? 0,
    repeat_hires: s.repeatHires ?? 0,
    disputes: s.disputes ?? 0,
    avg_response_minutes: s.avgResponseMinutes ?? null,
    account_age_days: Math.floor((Date.now() - new Date(user?.createdAt ?? profile.createdAt ?? Date.now()).getTime()) / 86_400_000),
    id_verified: profile.idVerification?.status === 'verified',
    portfolio_count: profile.portfolio?.length ?? 0,
  };
}

export function computePlaceholderTrust(f) {
  const completionRate = f.total_jobs ? f.completed_jobs / f.total_jobs : 0.7; // neutral prior for new workers
  const rating = f.review_count ? (f.avg_rating - 1) / 4 : 0.6;
  const repeat = f.completed_jobs ? clamp01((f.repeat_hires / f.completed_jobs) * 2) : 0;
  const response = f.avg_response_minutes == null ? 0.5 : clamp01(1 - (f.avg_response_minutes - 30) / (24 * 60 - 30));
  const tenure = clamp01(f.account_age_days / 365);
  const disputeRate = f.total_jobs ? clamp01((f.disputes / f.total_jobs) * 3) : 0;
  const profileCompleteness = clamp01(f.portfolio_count / 4);

  const breakdown = {
    completion: 0.22 * completionRate,
    rating: 0.24 * rating,
    verification: f.id_verified ? 0.14 : 0,
    responsiveness: 0.1 * response,
    repeatHires: 0.1 * repeat,
    tenure: 0.08 * tenure,
    portfolio: 0.07 * profileCompleteness,
    disputes: -0.2 * disputeRate,
  };

  const raw = Object.values(breakdown).reduce((a, b) => a + b, 0) / 0.95;

  // Shrink toward a neutral 50 until there is enough history to trust the signal
  const confidence = clamp01((f.completed_jobs + f.review_count) / 10);
  const score = Math.round(100 * clamp01(0.5 * (1 - confidence) + raw * confidence + (f.id_verified ? 0.05 * (1 - confidence) : 0)));

  // With no history at all, say so plainly instead of implying a track record
  const label = f.completed_jobs + f.review_count === 0 ? 'New' : trustLabel(score);

  return {
    score,
    label,
    breakdown: Object.fromEntries(Object.entries(breakdown).map(([k, v]) => [k, Math.round(v * 1000) / 10])),
    source: 'placeholder',
  };
}

/** Pluggable scorer so the AI client can be swapped in without touching callers. */
let scorer = async (features) => computePlaceholderTrust(features);
export const setTrustScorer = (fn) => {
  scorer = fn;
};

export async function refreshTrustScore(workerUserId) {
  const profile = await WorkerProfile.findOne({ user: workerUserId });
  if (!profile) return null;
  const user = await User.findById(workerUserId).select('createdAt');

  const features = extractTrustFeatures(profile, user);
  let result;
  try {
    result = await scorer(features);
  } catch (err) {
    console.warn('Trust scorer failed, falling back to placeholder:', err.message);
    result = computePlaceholderTrust(features);
  }

  profile.trustScore = { ...result, updatedAt: new Date() };
  await profile.save();
  return profile.trustScore;
}
