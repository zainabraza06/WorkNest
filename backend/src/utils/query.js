export const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Case-insensitive "any word matches any of these fields" filter — used where $text can't be (e.g. with $geoNear). */
export function keywordRegexFilter(q, fields) {
  const words = q.split(/\s+/).filter((w) => w.length > 1).slice(0, 8);
  if (!words.length) return {};
  const pattern = new RegExp(words.map(escapeRegex).join('|'), 'i');
  return { $or: fields.map((f) => ({ [f]: pattern })) };
}

export const KM_TO_RADIANS = 1 / 6378.1;

/**
 * Runs a paginated aggregation and returns { items, page, limit, total, totalPages }.
 * `pipeline` must not already contain $skip/$limit.
 */
export async function paginateAggregate(Model, pipeline, { page, limit }) {
  const [result] = await Model.aggregate([
    ...pipeline,
    {
      $facet: {
        items: [{ $skip: (page - 1) * limit }, { $limit: limit }],
        total: [{ $count: 'count' }],
      },
    },
  ]);
  const total = result?.total[0]?.count ?? 0;
  return { items: result?.items ?? [], page, limit, total, totalPages: Math.ceil(total / limit) };
}
