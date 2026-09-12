import { Router } from 'express';
import mongoose from 'mongoose';

import authRoutes from './auth.routes.js';
import bookingRoutes from './booking.routes.js';
import clientRoutes from './client.routes.js';
import jobRoutes from './job.routes.js';
import offerRoutes from './offer.routes.js';
import priceRoutes from './price.routes.js';
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
router.use('/jobs', jobRoutes);
router.use('/offers', offerRoutes);
router.use('/bookings', bookingRoutes);
router.use('/price', priceRoutes);

export default router;
