import { z } from '../../middleware/validate';

export const adminCacheMetricsQuerySchema = z.object({
  reset: z.enum(['true', 'false']).optional(),
});
