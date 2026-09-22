import { Router } from 'express';

import * as bookings from '../controllers/booking.controller.js';
import { ROLES } from '../constants/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { uploadImages } from '../middleware/upload.js';
import { idParam } from '../validators/common.js';
import {
  bookingReasonSchema,
  cancellationRequestSchema,
  cancellationResponseSchema,
  disputeSchema,
  disputeStatementSchema,
  listBookingsQuery,
  resolveDisputeSchema,
} from '../validators/booking.js';
import { createReview } from '../controllers/review.controller.js';
import { createReviewSchema } from '../validators/review.js';

const router = Router();
const byId = { params: idParam() };

router.use(requireAuth);

// Admins included: they already read any single booking, and the console links here
router.get('/', requireRole(ROLES.WORKER, ROLES.CLIENT, ROLES.ADMIN), validate({ query: listBookingsQuery }), bookings.listBookings);
router.get('/:id', validate(byId), bookings.getBooking);

router.post('/:id/payment', validate(byId), bookings.createPayment);
router.post('/:id/payment/sync', validate(byId), bookings.syncPayment);

router.post('/:id/start', validate(byId), bookings.startBooking);
router.post('/:id/complete', validate(byId), bookings.completeBooking);
router.post('/:id/cancel', validate({ ...byId, body: bookingReasonSchema }), bookings.cancelBooking);
// Work already under way cannot be called off by one side alone
router.post('/:id/cancellation', validate({ ...byId, body: cancellationRequestSchema }), bookings.requestCancellation);
router.post('/:id/cancellation/respond', validate({ ...byId, body: cancellationResponseSchema }), bookings.respondToCancellation);

// Statements carry photographs, so these two take multipart rather than JSON
router.post('/:id/dispute', uploadImages('evidence', 5), validate({ ...byId, body: disputeSchema }), bookings.disputeBooking);
router.post(
  '/:id/dispute/statements',
  uploadImages('evidence', 5),
  validate({ ...byId, body: disputeStatementSchema }),
  bookings.addDisputeStatement,
);
router.post('/:id/resolve', requireRole(ROLES.ADMIN), validate({ ...byId, body: resolveDisputeSchema }), bookings.resolveDispute);

// Both sides review each other after a completed booking
router.post('/:id/reviews', validate({ ...byId, body: createReviewSchema }), createReview);

export default router;
