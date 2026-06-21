import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { pinGate } from '../../middleware/pinGate';
import { validateBody, validateParams } from '../../middleware/validate';
import { idempotency } from '../../middleware/idempotency';
import { responseCache } from '../../middleware/cache';
import { CACHE_TTL_SECONDS } from '../../cache/cache-policy';
import * as GoalController from './goal.controller';
import { goalCreateSchema, goalUpdateSchema, goalIdParamSchema, goalMemberAddSchema } from './goal.validation';

const router = Router();

router.use(authMiddleware);
router.use(pinGate); // financial data requires a live PIN unlock

router.get('/', responseCache({ prefix: 'goals:list', ttlSeconds: CACHE_TTL_SECONDS.goals.list }), GoalController.getGoals);
router.post('/', idempotency({ scope: 'goals.create' }), validateBody(goalCreateSchema), GoalController.createGoal);
router.get('/:id', validateParams(goalIdParamSchema), responseCache({ prefix: 'goals:item', ttlSeconds: CACHE_TTL_SECONDS.goals.item }), GoalController.getGoal);
router.put('/:id', validateParams(goalIdParamSchema), validateBody(goalUpdateSchema), GoalController.updateGoal);
router.delete('/:id', validateParams(goalIdParamSchema), GoalController.deleteGoal);
router.get('/:id/members', validateParams(goalIdParamSchema), GoalController.getGoalMembers);
router.post('/:id/members', validateParams(goalIdParamSchema), idempotency({ scope: 'goals.members' }), validateBody(goalMemberAddSchema), GoalController.addGoalMember);
router.delete('/:id/members/:memberId', GoalController.removeGoalMember);

export { router as goalRoutes };
