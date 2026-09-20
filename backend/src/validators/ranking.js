import { z } from 'zod';
import { objectId } from './common.js';

export const rankingEventSchema = z.object({
  impressionId: objectId,
  workerId: objectId,
  // "open" = the client looked at this worker; "hire_intent" = they started hiring them
  type: z.enum(['open', 'hire_intent']),
});
