import { z } from 'zod';

import { ID_VERIFICATION_STATUS } from '../constants/index.js';
import { pagination } from './common.js';

export const verificationQueueQuery = z.object({
  ...pagination,
  // Defaults to the queue that needs a decision; the other states are for looking back
  status: z.enum(ID_VERIFICATION_STATUS).default('pending'),
});

export const adminListQuery = z.object({ ...pagination });
