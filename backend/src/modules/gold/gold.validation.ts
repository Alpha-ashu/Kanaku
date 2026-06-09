import { z } from '../../middleware/validate';

export const goldCreateSchema = z.object({
  type: z.enum(['gold', 'jewelry', 'coin']),
  quantity: z.coerce.number().positive('Quantity must be positive'),
  unit: z.enum(['gram', 'ounce', 'kg']),
  purchasePrice: z.coerce.number().positive('Purchase price must be positive'),
  currentPrice: z.coerce.number().min(0),
  purchaseDate: z.coerce.date(),
  purityPercentage: z.coerce.number().min(0).max(100).optional(),
  location: z.string().trim().max(200).optional(),
  certificateNumber: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(500).optional(),
  clientRequestId: z.string().trim().max(100).optional(),
});

export const goldUpdateSchema = goldCreateSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field is required for update' }
);

export const goldIdParamSchema = z.object({
  id: z.string().trim().min(1),
});

export const goldQuerySchema = z.object({
  type: z.enum(['gold', 'jewelry', 'coin']).optional(),
});

