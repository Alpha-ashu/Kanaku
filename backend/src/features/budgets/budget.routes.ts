import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { pinGate } from '../../middleware/pinGate';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate';
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

router.get('/', validateQuery(budgetQuerySchema), BudgetController.getBudgets);
router.post('/', validateBody(budgetCreateSchema), BudgetController.createBudget);
router.get('/:id', validateParams(budgetIdParamSchema), BudgetController.getBudget);
router.put('/:id', validateParams(budgetIdParamSchema), validateBody(budgetUpdateSchema), BudgetController.updateBudget);
router.delete('/:id', validateParams(budgetIdParamSchema), BudgetController.deleteBudget);
router.post('/:id/recalculate', validateParams(budgetIdParamSchema), BudgetController.recalculateBudgetSpent);

export { router as budgetRoutes };

