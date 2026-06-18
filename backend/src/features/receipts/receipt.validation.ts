import { z } from '../../middleware/validate';

export const receiptScanQuerySchema = z.object({
  provider: z.enum(['auto', 'donut']).optional().default('auto'),
});
