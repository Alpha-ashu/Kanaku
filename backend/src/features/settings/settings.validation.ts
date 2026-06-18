import { z } from '../../middleware/validate';

export const updateSettingsSchema = z
  .object({
    theme: z.string().trim().max(40).optional(),
    language: z.string().trim().max(20).optional(),
    currency: z.string().trim().max(10).optional(),
    timezone: z.string().trim().max(60).optional(),
    // Free-form preference blob — accepted as a JSON string or object.
    settings: z.union([z.string(), z.record(z.any())]).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required',
  });
