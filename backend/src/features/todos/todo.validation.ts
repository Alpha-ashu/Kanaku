import { z } from '../../middleware/validate';

export const todoCreateSchema = z.object({
  title: z.string().min(1),
  completed: z.boolean().optional(),
  // Declared so Zod does not strip it: the controller's replay check and the
  // DB's per-owner unique index both key off this.
  clientRequestId: z.string().trim().max(200).optional(),
});

export const todoUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  completed: z.boolean().optional(),
});

export const todoIdParamSchema = z.object({
  id: z.string().min(1),
});
