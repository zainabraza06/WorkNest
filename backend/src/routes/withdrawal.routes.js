import { Router } from 'express';

import * as withdrawals from '../controllers/withdrawal.controller.js';
import { ROLES } from '../constants/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { idParam } from '../validators/common.js';
import {
  listWithdrawalsQuery,
  payoutMethodSchema,
  settleWithdrawalSchema,
  withdrawalRequestSchema,
} from '../validators/withdrawal.js';

const router = Router();
router.use(requireAuth);

const workerOnly = requireRole(ROLES.WORKER);

router.get('/earnings', workerOnly, withdrawals.getMyEarnings);
router.put('/method', workerOnly, validate({ body: payoutMethodSchema }), withdrawals.setPayoutMethod);
router.post('/', workerOnly, validate({ body: withdrawalRequestSchema }), withdrawals.requestWithdrawal);

// Workers see their own; admins see every request that is waiting to be paid
router.get('/', requireRole(ROLES.WORKER, ROLES.ADMIN), validate({ query: listWithdrawalsQuery }), withdrawals.listWithdrawals);

router.get('/summary', requireRole(ROLES.ADMIN), withdrawals.getWithdrawalSummary);
router.post('/:id/settle', requireRole(ROLES.ADMIN), validate({ params: idParam(), body: settleWithdrawalSchema }), withdrawals.settleWithdrawal);

export default router;
