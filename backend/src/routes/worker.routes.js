import { Router } from 'express';
import { z } from 'zod';

import * as workers from '../controllers/worker.controller.js';
import { ROLES } from '../constants/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { uploadDocument, uploadImages } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { idParam, objectId } from '../validators/common.js';
import {
  portfolioCaptionSchema,
  verificationDecisionSchema,
  workerProfileSchema,
  workerProfileUpdateSchema,
} from '../validators/profile.js';

const router = Router();
const workerOnly = [requireAuth, requireRole(ROLES.WORKER)];
const adminOnly = [requireAuth, requireRole(ROLES.ADMIN)];

router.get('/me', workerOnly, workers.getMyProfile);
router.post('/me', workerOnly, validate({ body: workerProfileSchema }), workers.createProfile);
router.patch('/me', workerOnly, validate({ body: workerProfileUpdateSchema }), workers.updateProfile);

router.post(
  '/me/portfolio',
  workerOnly,
  uploadImages('images', 6),
  validate({ body: portfolioCaptionSchema }),
  workers.addPortfolioImages,
);
router.delete(
  '/me/portfolio/:imageId',
  workerOnly,
  validate({ params: z.object({ imageId: objectId }) }),
  workers.removePortfolioImage,
);

router.post('/me/id-verification', workerOnly, uploadDocument('document'), workers.submitIdVerification);

router.get(
  '/:userId/id-document',
  adminOnly,
  validate({ params: idParam('userId') }),
  workers.getIdDocument,
);
router.patch(
  '/:userId/id-verification',
  adminOnly,
  validate({ params: idParam('userId'), body: verificationDecisionSchema }),
  workers.decideIdVerification,
);

router.get('/:userId', validate({ params: idParam('userId') }), workers.getPublicProfile);

export default router;
