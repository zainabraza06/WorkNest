import { Router } from 'express';

import { listNotifications, markNotificationsRead } from '../controllers/notification.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { listNotificationsQuery, markReadSchema } from '../validators/notification.js';

const router = Router();

// Notifications are always your own — there is no addressing another user's inbox
router.use(requireAuth);

router.get('/', validate({ query: listNotificationsQuery }), listNotifications);
router.post('/read', validate({ body: markReadSchema }), markNotificationsRead);

export default router;
