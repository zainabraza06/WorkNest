import { Router } from 'express';

import { getPriceSuggestion } from '../controllers/price.controller.js';
import { validate } from '../middleware/validate.js';
import { priceQuery } from '../validators/price.js';

const router = Router();

// Public: workers setting a rate and clients drafting a budget both use this
router.get('/suggest', validate({ query: priceQuery }), getPriceSuggestion);

export default router;
