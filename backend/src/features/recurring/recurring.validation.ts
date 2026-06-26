import { z } from '../../middleware/validate';

export const recurringCreateSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(100),
  amount: z.coerce.number().positive('Amount must be positive').max(999999999),
  category: z.string().trim().min(1, 'Category is required').max(80),
  subcategory: z.string().trim().max(80).optional(),
  interval: z.enum(['weekly', 'monthly', 'yearly']),
  nextDueDate: z.coerce.date(),
  autoProcess: z.boolean().optional(),
  accountId: z.string().trim().min(1).optional(),
  description: z.string().trim().max(200).optional(),
  merchant: z.string().trim().max(120).optional(),
  clientRequestId: z.string().trim().max(100).optional(),
  type: z.enum(['income', 'expense', 'transfer']).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  reminderDaysBefore: z.coerce.number().int().min(0).max(30).optional(),
  notes: z.string().trim().max(500).optional(),
  transferToAccountId: z.string().trim().optional(),
});

export const recurringUpdateSchema = recurringCreateSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field is required for update' }
);

export const recurringIdParamSchema = z.object({
  id: z.string().trim().min(1),
});

export const recurringQuerySchema = z.object({
  status: z.enum(['active', 'paused', 'cancelled']).optional(),
  interval: z.enum(['weekly', 'monthly', 'yearly']).optional(),
});

