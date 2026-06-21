import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { pinGate } from '../../middleware/pinGate';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate';
import * as RecurringController from './recurring.controller';
import {
  recurringCreateSchema,
  recurringUpdateSchema,
  recurringIdParamSchema,
  recurringQuerySchema,
} from './recurring.validation';

const router = Router();

router.use(authMiddleware);
router.use(pinGate); // financial data requires a live PIN unlock

router.get('/', validateQuery(recurringQuerySchema), RecurringController.getRecurringTransactions);
router.post('/', validateBody(recurringCreateSchema), RecurringController.createRecurringTransaction);
router.get('/:id', validateParams(recurringIdParamSchema), RecurringController.getRecurringTransaction);
router.put('/:id', validateParams(recurringIdParamSchema), validateBody(recurringUpdateSchema), RecurringController.updateRecurringTransaction);
router.delete('/:id', validateParams(recurringIdParamSchema), RecurringController.deleteRecurringTransaction);
router.patch('/:id/toggle', validateParams(recurringIdParamSchema), RecurringController.toggleRecurringStatus);

export { router as recurringRoutes };

