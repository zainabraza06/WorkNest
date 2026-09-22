import { z } from 'zod';

import { objectId, pagination } from './common.js';

export const listNotificationsQuery = z.object({ ...pagination });

/** No id means "mark everything read", which is what closing the panel does. */
export const markReadSchema = z.object({ id: objectId.optional() }).default({});
