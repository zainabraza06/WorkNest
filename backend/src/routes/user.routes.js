import { Router } from 'express';

import { updateMe, uploadAvatar } from '../controllers/user.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { uploadSingleImage } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { updateUserSchema } from '../validators/profile.js';

const router = Router();

router.patch('/me', requireAuth, validate({ body: updateUserSchema }), updateMe);
router.post('/me/avatar', requireAuth, uploadSingleImage('avatar'), uploadAvatar);

export default router;
