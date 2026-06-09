import { z } from '../../middleware/validate';

export const taxCalcCreateSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  regime: z.string().trim().max(50).optional(),
  country: z.string().trim().max(50).optional(),
  totalIncome: z.coerce.number().min(0),
  totalExpense: z.coerce.number().min(0),
  netProfit: z.coerce.number(),
  taxableIncome: z.coerce.number().min(0),
  estimatedTax: z.coerce.number().min(0),
  taxRate: z.coerce.number().min(0).max(100),
  deductions: z.coerce.number().min(0).optional(),
  currency: z.string().trim().max(10).optional(),
  notes: z.string().trim().max(500).optional(),
  metadata: z.record(z.unknown()).optional(),
  clientRequestId: z.string().trim().max(100).optional(),
});

export const taxCalcUpdateSchema = taxCalcCreateSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field is required for update' }
);

export const taxCalcIdParamSchema = z.object({
  id: z.string().trim().min(1),
});

export const taxCalcQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
});

