import { Router } from 'express';

import * as offers from '../controllers/offer.controller.js';
import { ROLES } from '../constants/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { idParam } from '../validators/common.js';
import { counterOfferSchema, listMessagesQuery, listOffersQuery, reasonSchema, sendMessageSchema } from '../validators/offer.js';

const router = Router();
const participants = [requireAuth, requireRole(ROLES.WORKER, ROLES.CLIENT)];
/**
 * Reading a thread. Admins are allowed through the role guard here because a negotiation is the
 * evidence in a dispute — the controller still decides whether this particular thread is theirs
 * to read, and every route that *changes* an offer stays on `participants`.
 */
const readers = [requireAuth, requireRole(ROLES.WORKER, ROLES.CLIENT, ROLES.ADMIN)];
const byId = { params: idParam() };

router.get('/', participants, validate({ query: listOffersQuery }), offers.listOffers);
router.get('/:id', readers, validate(byId), offers.getOffer);

router.post('/:id/counter', participants, validate({ ...byId, body: counterOfferSchema }), offers.counterOffer);
router.post('/:id/accept', participants, validate(byId), offers.acceptOffer);
router.post('/:id/reject', participants, validate({ ...byId, body: reasonSchema }), offers.rejectOffer);
router.post('/:id/withdraw', participants, validate({ ...byId, body: reasonSchema }), offers.withdrawOffer);

router.get('/:id/messages', readers, validate({ ...byId, query: listMessagesQuery }), offers.listMessages);
router.post('/:id/messages', participants, validate({ ...byId, body: sendMessageSchema }), offers.sendMessage);
router.post('/:id/read', participants, validate(byId), offers.markRead);

export default router;
