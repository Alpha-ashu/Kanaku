import { z } from 'zod';

// `.passthrough()` keeps any extra fields the controller reads (the validate
// middleware replaces req.* with the parsed result), so these schemas enforce
// types/lengths on known fields without dropping anything or rejecting valid
// requests.

const id = z.string().min(1).max(100);

export const notificationIdParamSchema = z.object({ id }).passthrough();

export const listNotificationsQuerySchema = z
  .object({
    unread: z.string().optional(),
    limit: z.string().optional(),
    page: z.string().optional(),
  })
  .passthrough();

export const sendNotificationSchema = z
  .object({
    userId: z.string().min(1).max(100),
    title: z.string().min(1).max(300),
    message: z.string().min(1).max(5000),
    type: z.string().max(50).optional(),
    category: z.string().max(100).optional(),
    deepLink: z.string().max(2000).optional(),
  })
  .passthrough();
