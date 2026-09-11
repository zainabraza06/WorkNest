import { Router } from 'express';
import mongoose from 'mongoose';

import authRoutes from './auth.routes.js';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({
    success: true,
    service: 'worknest-backend',
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    uptime: Math.round(process.uptime()),
  });
});

router.use('/auth', authRoutes);

export default router;
