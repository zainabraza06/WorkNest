import { WorkerProfile } from '../models/index.js';
import { isAiEnabled, rankWorkers, toCandidate } from '../services/ai.service.js';
import { recordImpression } from '../services/ranking.service.js';
import { KM_TO_RADIANS, keywordRegexFilter, paginateAggregate } from '../utils/query.js';

/** How many workers to shortlist from MongoDB before the AI service re-ranks them. */
const SMART_POOL_SIZE = 120;

const PUBLIC_PROJECTION = {
  user: 1,
  headline: 1,
  bio: 1,
  categories: 1,
  skills: 1,
  experienceYears: 1,
  rates: 1,
  city: 1,
  isAvailable: 1,
  portfolio: { $slice: ['$portfolio', 3] },
  stats: 1,
  trustScore: { score: 1, label: 1 },
  idVerified: { $eq: ['$idVerification.status', 'verified'] },
  distanceMeters: 1,
  relevance: 1,
};

const USER_LOOKUP = [
  {
    $lookup: {
      from: 'users',
      localField: 'user',
      foreignField: '_id',
      as: 'user',
      pipeline: [{ $match: { isActive: true } }, { $project: { name: 1, avatar: 1 } }],
    },
  },
  { $unwind: '$user' },
];

/** Structured filters shared by both the keyword and the smart path. */
function buildFilter(q) {
  const { category, skills, city, minRate, maxRate, minTrust, minRating, verified, available } = q;
  const filter = {};

  if (category?.length) filter.categories = { $in: category };
  if (skills?.length) filter.skills = { $in: skills };
  if (city) filter.city = city;
  if (minRate !== undefined || maxRate !== undefined) {
    filter['rates.daily'] = {
      ...(minRate !== undefined && { $gte: minRate }),
      ...(maxRate !== undefined && { $lte: maxRate }),
    };
  }
  if (minTrust !== undefined) filter['trustScore.score'] = { $gte: minTrust };
  if (minRating !== undefined) filter['stats.avgRating'] = { $gte: minRating };
  if (verified !== undefined) filter['idVerification.status'] = verified ? 'verified' : { $ne: 'verified' };
  if (available !== undefined) filter.isAvailable = available;

  return filter;
}

function geoStage({ lat, lng, radiusKm }, filter) {
  return {
    $geoNear: {
      near: { type: 'Point', coordinates: [lng, lat] },
      distanceField: 'distanceMeters',
      maxDistance: radiusKm * 1000,
      query: filter,
      spherical: true,
    },
  };
}

function withDistanceKm(rows) {
  for (const row of rows) {
    if (row.distanceMeters !== undefined) {
      row.distanceKm = Math.round(row.distanceMeters / 100) / 10;
      delete row.distanceMeters;
    }
  }
  return rows;
}

/**
 * AI-ranked discovery: MongoDB shortlists on hard filters, the AI service scores the
 * shortlist against the client's own words, and we paginate the reordered list.
 * Returns null if the AI service is unavailable so the caller can fall back to keywords.
 */
async function smartSearch(query) {
  const { q, lat, page, limit } = query;
  const filter = buildFilter(query);

  const pipeline = lat !== undefined ? [geoStage(query, filter)] : [{ $match: filter }];
  pipeline.push(
    { $sort: { 'trustScore.score': -1, _id: 1 } },
    { $limit: SMART_POOL_SIZE },
    ...USER_LOOKUP,
    { $project: PUBLIC_PROJECTION },
  );

  const pool = withDistanceKm(await WorkerProfile.aggregate(pipeline));
  if (!pool.length) return { items: [], page, limit, total: 0, totalPages: 0, mode: 'smart' };

  const ranked = await rankWorkers({
    query: q,
    category: query.category?.[0],
    budgetMax: query.maxRate,
    candidates: pool.map(toCandidate),
  });
  if (!ranked) return null;

  const items = pool
    .map((w) => {
      const match = ranked.get(String(w._id));
      return { ...w, matchScore: match?.score ?? 0, matchReasons: match?.reasons ?? [] };
    })
    .sort((a, b) => b.matchScore - a.matchScore);

  return {
    items: items.slice((page - 1) * limit, page * limit),
    page,
    limit,
    total: items.length,
    totalPages: Math.ceil(items.length / limit),
    mode: 'smart',
  };
}

/** Keyword + structured-filter discovery (MongoDB text index / regex + geo). */
async function keywordSearch(query) {
  const { q, lat, lng, radiusKm, sort, page, limit } = query;
  const filter = buildFilter(query);
  const pipeline = [];

  if (sort === 'nearest') {
    // $geoNear must come first and can't be combined with $text, so keywords fall back to regex
    if (q) Object.assign(filter, keywordRegexFilter(q, ['headline', 'bio', 'skills']));
    pipeline.push(geoStage(query, filter));
  } else {
    if (q) filter.$text = { $search: q };
    if (lat !== undefined) filter.location = { $geoWithin: { $centerSphere: [[lng, lat], radiusKm * KM_TO_RADIANS] } };
    pipeline.push({ $match: filter });
    if (q) pipeline.push({ $addFields: { relevance: { $meta: 'textScore' } } });

    const sorts = {
      trust: { 'trustScore.score': -1, 'stats.avgRating': -1 },
      rating: { 'stats.avgRating': -1, 'stats.reviewCount': -1 },
      price_low: { 'rates.daily': 1 },
      price_high: { 'rates.daily': -1 },
      relevance: q ? { relevance: -1, 'trustScore.score': -1 } : { 'trustScore.score': -1 },
    };
    pipeline.push({ $sort: { ...sorts[sort], _id: 1 } });
  }

  pipeline.push(...USER_LOOKUP, { $project: PUBLIC_PROJECTION });

  const result = await paginateAggregate(WorkerProfile, pipeline, { page, limit });
  withDistanceKm(result.items);
  return { ...result, mode: 'keyword' };
}

export async function searchWorkers(req, res) {
  const query = req.valid.query;
  // "Smart" mode only makes sense with something to match against
  const wantedSmart = query.mode === 'smart' && Boolean(query.q);

  let data = null;
  if (wantedSmart && isAiEnabled()) {
    data = await smartSearch(query);
  }

  let relaxedQuery = false;
  if (!data) {
    data = await keywordSearch(query);

    // A client describing a symptom ("the lights keep tripping") shares no words with any
    // profile, so the text index matches nothing and the keyword fallback returns an empty
    // page — which reads as "no such worker exists" rather than "the matcher is unavailable".
    // Drop the free text, keep every structured filter, and let the caller say why.
    if (wantedSmart && !data.items.length) {
      const sort = query.sort === 'relevance' ? 'trust' : query.sort;
      data = await keywordSearch({ ...query, q: undefined, sort });
      relaxedQuery = true;
    }
  }

  // The UI needs to distinguish "AI ranked these" from "AI was asleep, here's the next best
  // thing" — otherwise a cold service silently looks like a bad matcher.
  data.degraded = wantedSmart && data.mode !== 'smart';
  data.relaxedQuery = relaxedQuery;

  // Training data for the ranker: what was shown, in what order, on which features.
  // Best-effort and awaited only so the id can be returned; failures are swallowed.
  const impressionId = await recordImpression({
    client: req.user?._id,
    query: query.q,
    mode: data.mode,
    category: query.category?.[0],
    city: query.city,
    budgetMax: query.maxRate,
    items: data.items,
  });

  res.json({ success: true, data: { ...data, impressionId } });
}
