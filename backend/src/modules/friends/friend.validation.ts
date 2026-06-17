import { z } from '../../middleware/validate';

// The controller enforces the "email OR phone required" rule and duplicate
// checks; these schemas guarantee field presence/types and bound list sizes.

export const friendCreateSchema = z.object({
  name: z.string().trim().min(1, 'Friend name is required').max(120),
  email: z.string().trim().max(255).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
});

export const friendUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    email: z.string().trim().max(255).optional().nullable(),
    phone: z.string().trim().max(40).optional().nullable(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'At least one field is required' });

export const friendBulkSchema = z.object({
  friends: z
    .array(
      z.object({
        name: z.string().trim().max(120).optional(),
        email: z.string().trim().max(255).optional().nullable(),
        phone: z.string().trim().max(40).optional().nullable(),
      }),
    )
    .min(1, 'A non-empty friends array is required')
    .max(200, 'A maximum of 200 friends can be added at once'),
});

export const friendIdParamSchema = z.object({
  id: z.string().trim().min(1, 'Friend ID is required'),
});
