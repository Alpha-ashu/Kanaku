import { z } from '../../middleware/validate';

export const accountCreateSchema = z.object({
  name: z.string().trim().min(1, 'Account name is required').max(120),
  type: z.string().trim().min(1, 'Account type is required').max(60),
  provider: z.string().trim().max(120).optional(),
  country: z.string().trim().max(60).optional(),
  balance: z.coerce.number().optional(),
  currency: z.string().trim().length(3, 'Currency must be a 3-letter ISO code').optional(),
  clientRequestId: z.string().trim().optional(),
});

export const accountUpdateSchema = accountCreateSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field is required for update' }
);

export const accountIdParamSchema = z.object({
  id: z.string().trim().min(1, 'Account ID is required'),
});

