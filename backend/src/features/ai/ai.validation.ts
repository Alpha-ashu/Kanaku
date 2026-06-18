import { z } from '../../middleware/validate';

export const aiEventBodySchema = z.object({
  eventType: z.string().trim().min(3).max(80),
  metadata: z.record(z.unknown()).default({}),
});

export const aiLimitQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const aiUserParamsSchema = z.object({
  userId: z.string().trim().min(1),
});

export const aiRunBodySchema = z.object({
  force: z.coerce.boolean().optional(),
}).default({});

export type AIEventBody = z.infer<typeof aiEventBodySchema>;
export type AILimitQuery = z.infer<typeof aiLimitQuerySchema>;
export type AIUserParams = z.infer<typeof aiUserParamsSchema>;
export type AIRunBody = z.infer<typeof aiRunBodySchema>;
