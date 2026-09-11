import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import * as auth from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { changePasswordSchema, loginSchema, registerSchema } from '../validators/auth.js';
import { env } from '../config/env.js';

const router = Router();

// Stricter limiter on credential endpoints to slow brute-force attempts
const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.isTest ? 10_000 : 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts, please try again later' },
});

router.post('/register', credentialLimiter, validate({ body: registerSchema }), auth.register);
router.post('/login', credentialLimiter, validate({ body: loginSchema }), auth.login);
router.get('/me', requireAuth, auth.me);
router.patch('/password', requireAuth, validate({ body: changePasswordSchema }), auth.changePassword);

export default router;
