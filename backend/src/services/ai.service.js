import { env } from '../config/env.js';
import { logger } from '../observability/logger.js';
import { aiCalls } from '../observability/metrics.js';

/**
 * Thin client for the FastAPI AI service.
 *
 * Every call degrades gracefully: if the service is down, slow or disabled, these
 * functions return null and the caller falls back to plain database behaviour.
 * The AI service is an enhancement, never a hard dependency.
 */

let disabledUntil = 0; // simple circuit breaker so a dead service doesn't slow every request
const COOLDOWN_MS = 30_000;

export const isAiEnabled = () => env.AI_ENABLED && Date.now() >= disabledUntil;

async function post(path, body) {
  if (!isAiEnabled()) {
    aiCalls.inc({ endpoint: path, outcome: 'skipped' });
    return null;
  }

  try {
    const res = await fetch(`${env.AI_SERVICE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.AI_SERVICE_KEY && { 'X-Service-Key': env.AI_SERVICE_KEY }),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(env.AI_SERVICE_TIMEOUT_MS),
    });

    if (!res.ok) {
      logger.warn({ path, status: res.status }, 'AI service returned an error status');
      aiCalls.inc({ endpoint: path, outcome: 'error' });
      return null;
    }
    aiCalls.inc({ endpoint: path, outcome: 'ok' });
    return await res.json();
  } catch (err) {
    disabledUntil = Date.now() + COOLDOWN_MS;
    logger.warn({ path, err: err.message, cooldownSeconds: COOLDOWN_MS / 1000 }, 'AI service unavailable; circuit opened, falling back');
    aiCalls.inc({ endpoint: path, outcome: 'error' });
    return null;
  }
}

/** Maps a WorkerProfile aggregate row to the AI service's candidate shape. */
export function toCandidate(profile) {
  return {
    worker_id: String(profile._id),
    headline: profile.headline ?? '',
    bio: profile.bio ?? '',
    categories: profile.categories ?? [],
    skills: profile.skills ?? [],
    daily_rate: profile.rates?.daily ?? null,
    avg_rating: profile.stats?.avgRating ?? 0,
    review_count: profile.stats?.reviewCount ?? 0,
    trust_score: profile.trustScore?.score ?? 50,
    completed_jobs: profile.stats?.completedJobs ?? 0,
    distance_km: profile.distanceKm ?? null,
    id_verified: Boolean(profile.idVerified),
    is_available: profile.isAvailable !== false,
  };
}

/** Returns a Map of workerProfileId → { score, reasons }, or null if unavailable. */
export async function rankWorkers({ query, category, budgetMax, durationType, candidates }) {
  if (!candidates.length) return null;

  const data = await post('/match/workers', {
    query: query ?? '',
    category: category ?? null,
    budget_max: budgetMax ?? null,
    duration_type: durationType ?? null,
    candidates,
    limit: candidates.length,
  });
  if (!data?.results) return null;

  return new Map(
    data.results.map((r) => [r.worker_id, { score: r.score, semanticScore: r.semantic_score, reasons: r.reasons }]),
  );
}

export async function scoreTrust(features) {
  const data = await post('/trust/score', features);
  if (!data) return null;
  return { score: data.score, label: data.label, breakdown: data.breakdown, source: data.source };
}

// Price guidance is a pure function of six small inputs and is requested on every keystroke of
// the post-job form, so identical questions are answered from memory. This cuts AI-service load
// (and the latency a cold Render instance adds) without any staleness risk worth caring about:
// the model only changes on deploy, and entries expire after ten minutes anyway.
const PRICE_TTL_MS = 10 * 60 * 1000;
const PRICE_CACHE_MAX = 500;
const priceCache = new Map();

export const clearPriceCache = () => priceCache.clear();

export async function suggestPrice({ category, city, durationType, durationCount, urgency, experienceYears }) {
  const key = [category, city, durationType, durationCount, urgency, experienceYears].join('|');
  const hit = priceCache.get(key);
  if (hit && hit.expires > Date.now()) {
    aiCalls.inc({ endpoint: '/price/suggest', outcome: 'cache_hit' });
    return hit.value;
  }

  const value = await fetchPrice({ category, city, durationType, durationCount, urgency, experienceYears });
  if (value) {
    if (priceCache.size >= PRICE_CACHE_MAX) priceCache.delete(priceCache.keys().next().value); // oldest first
    priceCache.set(key, { value, expires: Date.now() + PRICE_TTL_MS });
  }
  return value;
}

async function fetchPrice({ category, city, durationType, durationCount, urgency, experienceYears }) {
  const data = await post('/price/suggest', {
    category,
    city: city ?? null,
    duration_type: durationType ?? 'one_day',
    duration_count: durationCount ?? 1,
    urgency: urgency ?? 'normal',
    experience_years: experienceYears ?? 0,
  });
  if (!data) return null;

  return {
    min: data.min,
    median: data.median,
    max: data.max,
    perUnit: data.per_unit,
    currency: data.currency,
    confidence: data.confidence,
    source: data.source,
    explanation: data.explanation,
  };
}
