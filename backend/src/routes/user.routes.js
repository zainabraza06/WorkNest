import { Router } from 'express';

import { updateMe, uploadAvatar } from '../controllers/user.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { uploadSingleImage } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { updateUserSchema } from '../validators/profile.js';
import { listUserReviews } from '../controllers/review.controller.js';
import { listReviewsQuery } from '../validators/review.js';
import { idParam } from '../validators/common.js';

const router = Router();

router.patch('/me', requireAuth, validate({ body: updateUserSchema }), updateMe);
router.post('/me/avatar', requireAuth, uploadSingleImage('avatar'), uploadAvatar);

// Public: reviews received by any user (worker or client)
router.get('/:userId/reviews', validate({ params: idParam('userId'), query: listReviewsQuery }), listUserReviews);

export default router;
