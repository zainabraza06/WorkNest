import { Router } from 'express';

import * as offers from '../controllers/offer.controller.js';
import { ROLES } from '../constants/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { idParam } from '../validators/common.js';
import { counterOfferSchema, listMessagesQuery, listOffersQuery, reasonSchema, sendMessageSchema } from '../validators/offer.js';

const router = Router();
const participants = [requireAuth, requireRole(ROLES.WORKER, ROLES.CLIENT)];
const byId = { params: idParam() };

router.get('/', participants, validate({ query: listOffersQuery }), offers.listOffers);
router.get('/:id', participants, validate(byId), offers.getOffer);

router.post('/:id/counter', participants, validate({ ...byId, body: counterOfferSchema }), offers.counterOffer);
router.post('/:id/accept', participants, validate(byId), offers.acceptOffer);
router.post('/:id/reject', participants, validate({ ...byId, body: reasonSchema }), offers.rejectOffer);
router.post('/:id/withdraw', participants, validate({ ...byId, body: reasonSchema }), offers.withdrawOffer);

router.get('/:id/messages', participants, validate({ ...byId, query: listMessagesQuery }), offers.listMessages);
router.post('/:id/messages', participants, validate({ ...byId, body: sendMessageSchema }), offers.sendMessage);
router.post('/:id/read', participants, validate(byId), offers.markRead);

export default router;
