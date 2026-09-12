import { Router } from 'express';

import * as bookings from '../controllers/booking.controller.js';
import { ROLES } from '../constants/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { idParam } from '../validators/common.js';
import { bookingReasonSchema, disputeSchema, listBookingsQuery, resolveDisputeSchema } from '../validators/booking.js';

const router = Router();
const byId = { params: idParam() };

router.use(requireAuth);

router.get('/', requireRole(ROLES.WORKER, ROLES.CLIENT), validate({ query: listBookingsQuery }), bookings.listBookings);
router.get('/:id', validate(byId), bookings.getBooking);

router.post('/:id/payment', validate(byId), bookings.createPayment);
router.post('/:id/payment/sync', validate(byId), bookings.syncPayment);

router.post('/:id/start', validate(byId), bookings.startBooking);
router.post('/:id/complete', validate(byId), bookings.completeBooking);
router.post('/:id/cancel', validate({ ...byId, body: bookingReasonSchema }), bookings.cancelBooking);
router.post('/:id/dispute', validate({ ...byId, body: disputeSchema }), bookings.disputeBooking);
router.post('/:id/resolve', requireRole(ROLES.ADMIN), validate({ ...byId, body: resolveDisputeSchema }), bookings.resolveDispute);

export default router;
