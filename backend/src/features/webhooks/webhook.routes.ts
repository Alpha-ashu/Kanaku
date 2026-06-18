import { Router } from 'express';
import { validateBody, z } from '../../middleware/validate';
import { verifySendGridSignature } from './sendgridSignature';
import { receiveSendGridEvents } from './webhook.controller';

const router = Router();

// SendGrid event payload — array of events; we only care about a known subset
// of fields, the rest are stripped by zod via .strip() (the default) so any
// attacker-controlled extra props can't leak into our logs/DB.
const sendgridEventSchema = z.object({
  event: z.string().max(64),
  email: z.string().email().max(320).optional(),
  sg_message_id: z.string().max(256).optional(),
  timestamp: z.number().int().nonnegative().optional(),
  reason: z.string().max(512).optional(),
  // Custom args we attach when sending — bound strictly.
  kind: z.string().max(64).optional(),
  notificationId: z.string().max(64).optional(),
  userId: z.string().max(64).optional(),
  moduleType: z.string().max(64).optional(),
});

// Cap batch size — SendGrid normally sends ≤ 1000 events per POST.
const sendgridBodySchema = z.array(sendgridEventSchema).max(1000);

router.post('/sendgrid', verifySendGridSignature, validateBody(sendgridBodySchema), receiveSendGridEvents);

export { router as webhookRoutes };
