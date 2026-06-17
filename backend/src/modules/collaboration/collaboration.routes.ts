import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { validateParams, validateQuery } from '../../middleware/validate';
import * as CollaborationController from './collaboration.controller';
import { collaborationIdParamSchema, collaborationQuerySchema } from './collaboration.validation';

const router = Router();

router.use(authMiddleware);

router.get('/', validateQuery(collaborationQuerySchema), CollaborationController.listCollaborations);
router.get('/pending', CollaborationController.listPendingCollaborations);
router.get('/:id', validateParams(collaborationIdParamSchema), CollaborationController.getCollaboration);
router.delete('/:id', validateParams(collaborationIdParamSchema), CollaborationController.revokeCollaboration);

export { router as collaborationRoutes };
