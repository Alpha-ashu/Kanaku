import { z } from '../../middleware/validate';

export const categorizeSchema = z.object({
  text: z.string().trim().min(1, 'Text is required').max(500),
});

export const learnSchema = z
  .object({
    text: z.string().trim().min(1, 'Text is required').max(500),
    category: z.string().trim().max(120).optional(),
    category_id: z.string().trim().max(120).optional(),
    subcategory: z.string().trim().max(120).optional(),
    subcategory_id: z.string().trim().max(120).optional(),
  })
  .refine((d) => Boolean(d.category || d.category_id), {
    message: 'category is required',
    path: ['category'],
  });
