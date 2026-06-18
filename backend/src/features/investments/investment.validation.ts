import { z } from '../../middleware/validate';

export const investmentCreateSchema = z.object({
  assetType: z.string().min(1),
  assetName: z.string().min(1),
  quantity: z.number().positive(),
  buyPrice: z.number().nonnegative(),
  currentPrice: z.number().nonnegative(),
  totalInvested: z.number().nonnegative().optional(),
  currentValue: z.number().nonnegative().optional(),
  profitLoss: z.number().optional(),
  purchaseDate: z.string().datetime().or(z.string().min(1)),
  lastUpdated: z.string().datetime().or(z.string().min(1)).optional(),
  metadata: z.any().optional(),
});

export const investmentUpdateSchema = investmentCreateSchema.partial();

export const investmentIdParamSchema = z.object({
  id: z.string().min(1),
});
