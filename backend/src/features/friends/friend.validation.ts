import { z } from '../../middleware/validate';

// The controller enforces the "email OR phone required" rule and duplicate
// checks; these schemas guarantee field presence/types and bound list sizes.

export const friendCreateSchema = z.object({
  name: z.string().trim().min(1, 'Friend name is required').max(120),
  email: z.string().trim().max(255).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  // Declared so Zod does not strip it: the controller's replay check and the
  // DB's per-owner unique index both key off this.
  clientRequestId: z.string().trim().max(200).optional(),
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
        clientRequestId: z.string().trim().max(200).optional(),
      }),
    )
    .min(1, 'A non-empty friends array is required')
    // The web client batches to this size (FRIENDS_BULK_BATCH_SIZE in backend-api.ts).
    .max(200, 'A maximum of 200 friends can be added at once'),
});

export const friendIdParamSchema = z.object({
  id: z.string().trim().min(1, 'Friend ID is required'),
});
