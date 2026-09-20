import { Router } from 'express';

import { logRankingEvent } from '../controllers/ranking.controller.js';
import { optionalAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { rankingEventSchema } from '../validators/ranking.js';

const router = Router();

// Signed-out visitors search too, and their clicks are just as informative
router.post('/events', optionalAuth, validate({ body: rankingEventSchema }), logRankingEvent);

export default router;
