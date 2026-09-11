import { Router } from 'express';

import * as clients from '../controllers/client.controller.js';
import { ROLES } from '../constants/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { idParam } from '../validators/common.js';
import { clientProfileSchema, clientProfileUpdateSchema } from '../validators/profile.js';

const router = Router();
const clientOnly = [requireAuth, requireRole(ROLES.CLIENT)];

router.get('/me', clientOnly, clients.getMyProfile);
router.post('/me', clientOnly, validate({ body: clientProfileSchema }), clients.createProfile);
router.patch('/me', clientOnly, validate({ body: clientProfileUpdateSchema }), clients.updateProfile);

// Any signed-in user (typically a worker reviewing a job) can see a client's public profile
router.get('/:userId', requireAuth, validate({ params: idParam('userId') }), clients.getPublicProfile);

export default router;
