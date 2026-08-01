import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { validateBody, validateParams } from '../../middleware/validate';
import { requireFeature } from '../../middleware/featureGate';
import { authenticatedRateLimit } from '../../middleware/rateLimit';
import { uploadSingle } from '../../middleware/upload';
import { BILL_MAX_UPLOAD_BYTES } from '../../utils/uploadPolicy';
import * as SessionController from './session.controller';
import {
  sessionIdParamSchema,
  sendMessageSchema,
  completeSessionSchema,
  cancelSessionSchema,
  messageAttachmentParamSchema,
} from './session.validation';

const router = Router();

// All session routes require authentication
router.use(authMiddleware);

// Get session details
router.get('/:id', validateParams(sessionIdParamSchema), SessionController.getSession);

// Chat messages (gated by chat sub-feature under bookAdvisor)
router.post('/:id/messages', requireFeature('bookAdvisor', 'chat'), validateParams(sessionIdParamSchema), validateBody(sendMessageSchema), SessionController.sendMessage);
router.get('/:id/messages', requireFeature('bookAdvisor', 'chat'), validateParams(sessionIdParamSchema), SessionController.getMessages);

// Document sharing inside a consultation. Rate-limited and size-capped like the
// bill uploader — a chat thread is not an unbounded file drop.
router.post(
  '/:id/attachments',
  requireFeature('bookAdvisor', 'chat'),
  authenticatedRateLimit({
    windowMs: 60_000,
    max: Number(process.env.SESSION_ATTACHMENT_RATE_LIMIT || 10),
    scope: 'api-session-attachment',
    message: 'Too many uploads. Please try again in a minute.',
  }),
  validateParams(sessionIdParamSchema),
  uploadSingle('file', { maxBytes: BILL_MAX_UPLOAD_BYTES }),
  SessionController.uploadMessageAttachment,
);
router.get(
  '/:id/messages/:messageId/attachment',
  requireFeature('bookAdvisor', 'chat'),
  validateParams(messageAttachmentParamSchema),
  SessionController.getMessageAttachment,
);


// Session control (advisor)
router.post('/:id/start', validateParams(sessionIdParamSchema), SessionController.startSession);
router.post('/:id/complete', validateParams(sessionIdParamSchema), validateBody(completeSessionSchema), SessionController.completeSession);

// Cancel session (both advisor and client)
router.post('/:id/cancel', validateParams(sessionIdParamSchema), validateBody(cancelSessionSchema), SessionController.cancelSession);

export { router as sessionRoutes };
