import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { pinGate } from '../../middleware/pinGate';
import { validateBody, validateParams } from '../../middleware/validate';
import { idempotency } from '../../middleware/idempotency';
import { duplicateSubmitGuard } from '../../middleware/duplicateSubmitGuard';
import { responseCache } from '../../middleware/cache';
import { CACHE_TTL_SECONDS } from '../../cache/cache-policy';
import { requireFeature } from '../../middleware/featureGate';
import * as GoalController from './goal.controller';
import {
  goalCreateSchema,
  goalUpdateSchema,
  goalIdParamSchema,
  goalMemberAddSchema,
  goalContributionSchema,
  goalWithdrawalSchema,
} from './goal.validation';

const router = Router();

router.use(authMiddleware);
router.use(pinGate); // financial data requires a live PIN unlock
router.use(requireFeature('goals'));

router.get('/', responseCache({ prefix: 'goals:list', ttlSeconds: CACHE_TTL_SECONDS.goals.list }), GoalController.getGoals);
router.post('/', requireFeature('goals', 'createGoal'), idempotency({ scope: 'goals.create' }), validateBody(goalCreateSchema), duplicateSubmitGuard({ scope: 'goals.create' }), GoalController.createGoal);
router.get('/:id', validateParams(goalIdParamSchema), GoalController.getGoal);
router.put(
  '/:id',
  requireFeature('goals', 'editGoal'),
  idempotency({ scope: 'goals.update' }),
  validateParams(goalIdParamSchema),
  validateBody(goalUpdateSchema),
  GoalController.updateGoal,
);
router.delete('/:id', requireFeature('goals', 'deleteGoal'), validateParams(goalIdParamSchema), GoalController.deleteGoal);

// Goal contributions & withdrawals (sub-feature: contribute)
router.get('/:id/contributions', validateParams(goalIdParamSchema), GoalController.getGoalContributions);
router.post(
  '/:id/contribute',
  validateParams(goalIdParamSchema),
  idempotency({ scope: 'goals.contribute' }),
  validateBody(goalContributionSchema),
  // A double-tapped "Contribute" moves the money twice — two contributions, two
  // transactions, two balance debits. Absorb the second tap.
  duplicateSubmitGuard({ scope: 'goals.contribute' }),
  GoalController.addGoalContribution,
);
router.post(
  '/:id/withdraw',
  validateParams(goalIdParamSchema),
  idempotency({ scope: 'goals.withdraw' }),
  validateBody(goalWithdrawalSchema),
  duplicateSubmitGuard({ scope: 'goals.withdraw' }),
  GoalController.withdrawFromGoal,
);

// Group goals: add/remove members (groupGoals sub-feature)
router.get('/:id/members', validateParams(goalIdParamSchema), GoalController.getGoalMembers);
router.post('/:id/members', requireFeature('goals', 'groupGoals'), validateParams(goalIdParamSchema), idempotency({ scope: 'goals.members' }), validateBody(goalMemberAddSchema), duplicateSubmitGuard({ scope: 'goals.members' }), GoalController.addGoalMember);
// goalSharing gate also applies when sharing with an external member
router.delete('/:id/members/:memberId', requireFeature('goals', 'groupGoals'), GoalController.removeGoalMember);

export { router as goalRoutes };

