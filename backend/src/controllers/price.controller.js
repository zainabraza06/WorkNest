import { suggestPrice } from '../services/ai.service.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Fair-price guidance for a job or a worker's rate.
 * If the AI service is unavailable we say so rather than inventing a number.
 */
export async function getPriceSuggestion(req, res) {
  const suggestion = await suggestPrice(req.valid.query);
  if (!suggestion) {
    throw new ApiError(503, 'Price suggestions are temporarily unavailable');
  }
  res.json({ success: true, data: suggestion });
}
