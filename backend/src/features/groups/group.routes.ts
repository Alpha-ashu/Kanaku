import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { validateBody, validateParams } from '../../middleware/validate';
import * as GroupController from './group.controller';
import { groupCreateSchema, groupIdParamSchema, groupUpdateSchema } from './group.validation';

const router = Router();

router.use(authMiddleware);

router.get('/', GroupController.getGroups);
// User-scoped: repairs only the caller's own groups (where: { userId }), so any
// authenticated user may run it. (Was wrongly gated to admin/manager -> 403 for users.)
router.post('/repair-all-members', GroupController.repairAllGroupMembers);
router.post('/', validateBody(groupCreateSchema), GroupController.createGroup);
router.get('/:id', validateParams(groupIdParamSchema), GroupController.getGroup);
router.put('/:id', validateParams(groupIdParamSchema), validateBody(groupUpdateSchema), GroupController.updateGroup);
router.post('/:id/repair-members', validateParams(groupIdParamSchema), GroupController.repairGroupMembers);
router.delete('/:id', validateParams(groupIdParamSchema), GroupController.deleteGroup);

export { router as groupRoutes };
