import { z } from '../../middleware/validate';

export const budgetCreateSchema = z.object({
  category: z.string().trim().min(1, 'Category is required').max(80),
  amount: z.coerce.number().positive('Amount must be positive').max(999999999),
  period: z.enum(['weekly', 'monthly', 'yearly']),
  threshold: z.coerce.number().int().min(1).max(100).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  alertEnabled: z.boolean().optional(),
  alertChannels: z.array(z.enum(['app', 'email', 'push'])).optional(),
  clientRequestId: z.string().trim().max(100).optional(),
});

export const budgetUpdateSchema = z.object({
  amount: z.coerce.number().positive().max(999999999).optional(),
  spent: z.coerce.number().min(0).optional(),
  threshold: z.coerce.number().int().min(1).max(100).optional(),
  alertEnabled: z.boolean().optional(),
  alertChannels: z.array(z.enum(['app', 'email', 'push'])).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field is required for update' }
);

export const budgetIdParamSchema = z.object({
  id: z.string().trim().min(1),
});

export const budgetQuerySchema = z.object({
  period: z.enum(['weekly', 'monthly', 'yearly']).optional(),
  category: z.string().trim().min(1).optional(),
});

