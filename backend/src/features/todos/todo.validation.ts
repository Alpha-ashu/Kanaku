import { z } from '../../middleware/validate';

export const todoCreateSchema = z.object({
  title: z.string().min(1),
  completed: z.boolean().optional(),
});

export const todoUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  completed: z.boolean().optional(),
});

export const todoIdParamSchema = z.object({
  id: z.string().min(1),
});
