import { Router } from 'express';
import mongoose from 'mongoose';

import { redisStatus } from '../config/redis.js';
import { isShuttingDown } from '../lifecycle.js';

import adminRoutes from './admin.routes.js';
import authRoutes from './auth.routes.js';
import bookingRoutes from './booking.routes.js';
import clientRoutes from './client.routes.js';
import jobRoutes from './job.routes.js';
import notificationRoutes from './notification.routes.js';
import offerRoutes from './offer.routes.js';
import priceRoutes from './price.routes.js';
import rankingRoutes from './ranking.routes.js';
import userRoutes from './user.routes.js';
import withdrawalRoutes from './withdrawal.routes.js';
import workerRoutes from './worker.routes.js';

const router = Router();

// ── Health ──────────────────────────────────────────────────────────────────────────────
// live  : the process is up. Restart the container if this fails; it never touches
//         dependencies, so a database blip cannot trigger a restart storm.
// ready : safe to send traffic. Fails while MongoDB is unreachable or the process is draining
//         for shutdown, so the load balancer routes around the instance instead of erroring.
// /health is the original combined probe, kept for the keep-warm workflow and uptime monitors.
router.get('/health/live', (_req, res) => res.json({ success: true, status: 'alive' }));

async function dbReachable() {
  if (mongoose.connection.readyState !== 1) return false;
  try {
    await mongoose.connection.db.admin().ping();
    return true;
  } catch {
    return false;
  }
}

router.get('/health/ready', async (_req, res) => {
  const draining = isShuttingDown();
  const db = await dbReachable();
  const ready = db && !draining;
  res.status(ready ? 200 : 503).json({
    success: ready,
    status: ready ? 'ready' : draining ? 'draining' : 'unavailable',
    db: db ? 'connected' : 'disconnected',
    // Reported, but deliberately not part of readiness: Redis is an accelerator, not a dependency
    redis: redisStatus(),
  });
});

router.get('/health', async (_req, res) => {
  const db = await dbReachable();
  res.status(db ? 200 : 503).json({
    success: db,
    service: 'worknest-backend',
    db: db ? 'connected' : 'disconnected',
    uptime: Math.round(process.uptime()),
    version: (process.env.RENDER_GIT_COMMIT ?? process.env.GIT_SHA ?? 'dev').slice(0, 7),
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
router.use('/notifications', notificationRoutes);
router.use('/ranking', rankingRoutes);
router.use('/withdrawals', withdrawalRoutes);
router.use('/admin', adminRoutes);

export default router;
