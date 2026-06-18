import { z } from '../../middleware/validate';

export const collaborationQuerySchema = z.object({
  moduleType: z.enum(['group_expense', 'todo_list', 'goal']).optional(),
  status: z.enum(['REGISTERED', 'PENDING_REGISTRATION']).optional(),
});

export const collaborationIdParamSchema = z.object({
  id: z.string().trim().min(1, 'Collaboration ID is required'),
});
