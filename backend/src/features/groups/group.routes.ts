import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { pinGate } from '../../middleware/pinGate';
import { validateBody, validateParams } from '../../middleware/validate';
import { requireFeature } from '../../middleware/featureGate';
import { idempotency } from '../../middleware/idempotency';
import * as GroupController from './group.controller';
import { groupCreateSchema, groupIdParamSchema, groupUpdateSchema } from './group.validation';

const router = Router();

router.use(authMiddleware);
router.use(pinGate); // group expenses are financial data — requires a live PIN unlock
router.use(requireFeature('groups'));

router.get('/', GroupController.getGroups);
router.get('/analytics', GroupController.getGroupAnalytics);
// User-scoped: repairs only the caller's own groups (where: { userId }), so any
// authenticated user may run it. (Was wrongly gated to admin/manager -> 403 for users.)
router.post('/repair-all-members', GroupController.repairAllGroupMembers);
router.post(
  '/',
  idempotency({ scope: 'groups.create' }),
  validateBody(groupCreateSchema),
  GroupController.createGroup,
);
router.get('/:id', validateParams(groupIdParamSchema), GroupController.getGroup);
router.put(
  '/:id',
  idempotency({ scope: 'groups.update' }),
  validateParams(groupIdParamSchema),
  validateBody(groupUpdateSchema),
  GroupController.updateGroup,
);
router.post('/:id/repair-members', validateParams(groupIdParamSchema), GroupController.repairGroupMembers);
router.delete('/:id', validateParams(groupIdParamSchema), GroupController.deleteGroup);

export { router as groupRoutes };
