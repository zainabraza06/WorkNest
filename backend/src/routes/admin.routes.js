import { Router } from 'express';

import { getOverview, listDisputes, listVerifications } from '../controllers/admin.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { adminListQuery, verificationQueueQuery } from '../validators/admin.js';
import { ROLES } from '../constants/index.js';

const router = Router();

// Every route below is admin-only; the guard is applied once rather than per route so a new
// endpoint added here cannot accidentally ship unprotected.
router.use(requireAuth, requireRole(ROLES.ADMIN));

router.get('/overview', getOverview);
router.get('/verifications', validate({ query: verificationQueueQuery }), listVerifications);
router.get('/disputes', validate({ query: adminListQuery }), listDisputes);

export default router;
