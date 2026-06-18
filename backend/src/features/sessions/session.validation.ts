import { z } from '../../middleware/validate';

export const sessionIdParamSchema = z.object({
  id: z.string().trim().min(1, 'Session ID is required'),
});

export const sendMessageSchema = z.object({
  message: z.string().trim().min(1, 'Message is required').max(4000),
});

export const completeSessionSchema = z.object({
  notes: z.string().trim().max(2000).optional(),
});

export const cancelSessionSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});
