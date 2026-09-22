import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { pinGate } from '../../middleware/pinGate';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate';
import { requireFeature } from '../../middleware/featureGate';
import { announceChange } from '../../middleware/announceChange';
import { idempotency } from '../../middleware/idempotency';
import { duplicateSubmitGuard } from '../../middleware/duplicateSubmitGuard';
import * as BudgetController from './budget.controller';
import {
  budgetCreateSchema,
  budgetUpdateSchema,
  budgetIdParamSchema,
  budgetQuerySchema,
} from './budget.validation';

const router = Router();

router.use(authMiddleware);
router.use(pinGate); // financial data requires a live PIN unlock
router.use(requireFeature('budgetAlerts'));
// Mirrored into Dexie by featureSyncService rather than the sync engine, so a
// second device has no other way to learn about this change until it reloads.
router.use(announceChange('budgets_updated'));

router.get('/', validateQuery(budgetQuerySchema), BudgetController.getBudgets);
router.post(
  '/',
  idempotency({ scope: 'budgets.create' }),
  validateBody(budgetCreateSchema),
  duplicateSubmitGuard({ scope: 'budgets.create' }),
  BudgetController.createBudget,
);
router.get('/:id', validateParams(budgetIdParamSchema), BudgetController.getBudget);
router.put(
  '/:id',
  idempotency({ scope: 'budgets.update' }),
  validateParams(budgetIdParamSchema),
  validateBody(budgetUpdateSchema),
  BudgetController.updateBudget,
);
router.delete('/:id', validateParams(budgetIdParamSchema), BudgetController.deleteBudget);
router.post('/:id/recalculate', validateParams(budgetIdParamSchema), BudgetController.recalculateBudgetSpent);

export { router as budgetRoutes };


