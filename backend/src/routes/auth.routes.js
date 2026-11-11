import { Router } from 'express';
import { ipKeyGenerator } from 'express-rate-limit';

import { createLimiter } from '../middleware/rateLimit.js';

import * as auth from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { changePasswordSchema, loginSchema, registerSchema } from '../validators/auth.js';
import { env } from '../config/env.js';

const router = Router();

// Stricter limiter on credential endpoints to slow brute-force attempts
const credentialLimiter = createLimiter({
  name: 'credentials',
  windowMs: 15 * 60 * 1000,
  limit: env.isTest ? 10_000 : 20,
  message: { success: false, message: 'Too many attempts, please try again later' },
});

// Per-ACCOUNT limiter. The per-IP limiter above stops one machine guessing many passwords;
// this stops many machines (a botnet, rotating proxies) guessing one account's password.
// Successful logins do not count, so a legitimate user is never locked out by their own use.
const accountLimiter = createLimiter({
  name: 'account',
  windowMs: 15 * 60 * 1000,
  limit: env.isTest ? 10_000 : 10,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    return email ? `acct:${email}` : ipKeyGenerator(req.ip);
  },
  message: { success: false, message: 'Too many failed attempts for this account, try again later' },
});

router.post('/register', credentialLimiter, validate({ body: registerSchema }), auth.register);
router.post('/login', credentialLimiter, accountLimiter, validate({ body: loginSchema }), auth.login);
router.get('/me', requireAuth, auth.me);
router.post('/logout-all', requireAuth, auth.logoutAll);
router.patch('/password', credentialLimiter, requireAuth, validate({ body: changePasswordSchema }), auth.changePassword);

export default router;
