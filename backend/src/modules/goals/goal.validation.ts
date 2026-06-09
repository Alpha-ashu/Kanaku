import { z } from '../../middleware/validate';

export const goalCreateSchema = z.object({
  name: z.string().trim().min(1, 'Goal name is required').max(120),
  targetAmount: z.coerce.number().positive('Target amount must be positive'),
  targetDate: z.coerce.date({ invalid_type_error: 'Invalid target date' }),
  category: z.string().trim().max(80).optional(),
  isGroupGoal: z.boolean().optional(),
  clientRequestId: z.string().trim().optional(),
});

export const goalUpdateSchema = goalCreateSchema
  .partial()
  .extend({
    currentAmount: z.coerce.number().min(0, 'Current amount must be non-negative').optional(),
    syncStatus: z.string().trim().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required for update',
  });

export const goalIdParamSchema = z.object({
  id: z.string().trim().min(1, 'Goal ID is required'),
});

