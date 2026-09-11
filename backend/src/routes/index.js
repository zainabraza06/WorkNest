import { Router } from 'express';
import mongoose from 'mongoose';

import authRoutes from './auth.routes.js';
import clientRoutes from './client.routes.js';
import userRoutes from './user.routes.js';
import workerRoutes from './worker.routes.js';

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
router.use('/users', userRoutes);
router.use('/workers', workerRoutes);
router.use('/clients', clientRoutes);

export default router;
