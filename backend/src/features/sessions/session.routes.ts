import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { validateBody, validateParams } from '../../middleware/validate';
import * as SessionController from './session.controller';
import {
  sessionIdParamSchema,
  sendMessageSchema,
  completeSessionSchema,
  cancelSessionSchema,
} from './session.validation';

const router = Router();

// All session routes require authentication
router.use(authMiddleware);

// Get session details
router.get('/:id', validateParams(sessionIdParamSchema), SessionController.getSession);

// Chat messages
router.post('/:id/messages', validateParams(sessionIdParamSchema), validateBody(sendMessageSchema), SessionController.sendMessage);
router.get('/:id/messages', validateParams(sessionIdParamSchema), SessionController.getMessages);

// Session control (advisor)
router.post('/:id/start', validateParams(sessionIdParamSchema), SessionController.startSession);
router.post('/:id/complete', validateParams(sessionIdParamSchema), validateBody(completeSessionSchema), SessionController.completeSession);

// Cancel session (both advisor and client)
router.post('/:id/cancel', validateParams(sessionIdParamSchema), validateBody(cancelSessionSchema), SessionController.cancelSession);

export { router as sessionRoutes };
