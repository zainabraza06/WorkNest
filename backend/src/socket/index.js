import { createAdapter } from '@socket.io/redis-adapter';
import { Server } from 'socket.io';
import mongoose from 'mongoose';

import { env } from '../config/env.js';
import { getRedis } from '../config/redis.js';
import { Offer } from '../models/index.js';
import { resolveUser } from '../middleware/auth.js';
import { socketConnections } from '../observability/metrics.js';

let io = null;

/**
 * Realtime layer. Messages and offers are always created through the REST API
 * (validated + persisted); sockets only broadcast what already happened.
 *
 * Rooms:
 *   user:<userId>   — per-user notifications (new offer, offer updated, booking changes)
 *   offer:<offerId> — a negotiation thread (new messages, typing indicators)
 */
export function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: env.clientOrigins, credentials: true },
  });

  // With Redis, rooms and broadcasts span every API instance, so a message sent through
  // instance A reaches a socket connected to instance B. Without it, single-instance only.
  const redis = getRedis();
  if (redis) io.adapter(createAdapter(redis, redis.duplicate()));

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) throw new Error('missing token');
      // Same checks as REST: valid signature, active account, current token version
      const user = await resolveUser(token);
      socket.data.user = user;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.user._id.toString();
    socket.join(`user:${userId}`);
    socketConnections.inc();
    socket.on('disconnect', () => socketConnections.dec());

    socket.on('thread:join', async (offerId, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      if (!mongoose.isValidObjectId(offerId)) return reply({ ok: false, error: 'Invalid thread' });
      const offer = await Offer.findById(offerId).select('worker client').lean();
      const isParticipant = offer && [offer.worker, offer.client].some((id) => id.toString() === userId);
      if (!isParticipant) return reply({ ok: false, error: 'Not a participant' });
      socket.join(`offer:${offerId}`);
      reply({ ok: true });
    });

    socket.on('thread:leave', (offerId) => socket.leave(`offer:${offerId}`));

    socket.on('thread:typing', ({ offerId, typing } = {}) => {
      if (!socket.rooms.has(`offer:${offerId}`)) return;
      socket.to(`offer:${offerId}`).emit('thread:typing', { offerId, userId, typing: Boolean(typing) });
    });
  });

  return io;
}

// No-ops when sockets aren't initialised (tests, scripts)
export const emitToUser = (userId, event, payload) => io?.to(`user:${userId}`).emit(event, payload);
export const emitToOffer = (offerId, event, payload) => io?.to(`offer:${offerId}`).emit(event, payload);
