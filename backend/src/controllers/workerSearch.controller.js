import { WorkerProfile } from '../models/index.js';
import { KM_TO_RADIANS, keywordRegexFilter, paginateAggregate } from '../utils/query.js';

/**
 * Keyword + structured-filter worker discovery.
 * (Semantic search via the AI service is layered on top of this in a later step.)
 */
export async function searchWorkers(req, res) {
  const { q, category, skills, city, minRate, maxRate, minTrust, minRating, verified, available, lat, lng, radiusKm, sort, page, limit } =
    req.valid.query;

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
  if (verified !== undefined) {
    filter['idVerification.status'] = verified ? 'verified' : { $ne: 'verified' };
  }
  if (available !== undefined) filter.isAvailable = available;

  const pipeline = [];
  const hasGeo = lat !== undefined;

  if (sort === 'nearest') {
    if (q) Object.assign(filter, keywordRegexFilter(q, ['headline', 'bio', 'skills']));
    pipeline.push({
      $geoNear: {
        near: { type: 'Point', coordinates: [lng, lat] },
        distanceField: 'distanceMeters',
        maxDistance: radiusKm * 1000,
        query: filter,
        spherical: true,
      },
    });
  } else {
    if (q) filter.$text = { $search: q };
    if (hasGeo) filter.location = { $geoWithin: { $centerSphere: [[lng, lat], radiusKm * KM_TO_RADIANS] } };
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

  pipeline.push(
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
    {
      $project: {
        user: 1,
        headline: 1,
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
      },
    },
  );

  const result = await paginateAggregate(WorkerProfile, pipeline, { page, limit });
  for (const w of result.items) {
    if (w.distanceMeters !== undefined) {
      w.distanceKm = Math.round(w.distanceMeters / 100) / 10;
      delete w.distanceMeters;
    }
  }

  res.json({ success: true, data: result });
}
