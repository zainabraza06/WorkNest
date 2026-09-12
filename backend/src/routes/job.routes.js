import { Router } from 'express';

import * as jobs from '../controllers/job.controller.js';
import { ROLES } from '../constants/index.js';
import { optionalAuth, requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { idParam } from '../validators/common.js';
import { cancelJobSchema, createJobSchema, listJobsQuery, myJobsQuery, updateJobSchema } from '../validators/job.js';

const router = Router();
const clientOnly = [requireAuth, requireRole(ROLES.CLIENT)];

router.get('/', validate({ query: listJobsQuery }), jobs.listJobs);
router.post('/', clientOnly, validate({ body: createJobSchema }), jobs.createJob);
router.get('/mine', clientOnly, validate({ query: myJobsQuery }), jobs.listMyJobs);

router.get('/:id', optionalAuth, validate({ params: idParam() }), jobs.getJob);
router.patch('/:id', clientOnly, validate({ params: idParam(), body: updateJobSchema }), jobs.updateJob);
router.post('/:id/cancel', clientOnly, validate({ params: idParam(), body: cancelJobSchema }), jobs.cancelJob);

export default router;
