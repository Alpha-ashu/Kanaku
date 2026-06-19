import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { validateBody, validateParams } from '../../middleware/validate';
import { idempotency } from '../../middleware/idempotency';
import { responseCache } from '../../middleware/cache';
import { CACHE_TTL_SECONDS } from '../../cache/cache-policy';
import * as LoanController from './loan.controller';
import { loanCreateSchema, loanUpdateSchema, loanPaymentSchema, loanIdParamSchema } from './loan.validation';

const router = Router();

router.use(authMiddleware);

router.get('/', responseCache({ prefix: 'loans:list', ttlSeconds: CACHE_TTL_SECONDS.loans.list }), LoanController.getLoans);
router.post('/', idempotency({ scope: 'loans.create' }), validateBody(loanCreateSchema), LoanController.createLoan);
router.get('/:id', validateParams(loanIdParamSchema), responseCache({ prefix: 'loans:item', ttlSeconds: CACHE_TTL_SECONDS.loans.item }), LoanController.getLoan);
router.put('/:id', validateParams(loanIdParamSchema), validateBody(loanUpdateSchema), LoanController.updateLoan);
router.delete('/:id', validateParams(loanIdParamSchema), LoanController.deleteLoan);
// EMI payments mutate account balance — wrap in idempotency to prevent
// double-debit on network retry / SyncEngine replay.
router.post(
  '/:id/payment',
  validateParams(loanIdParamSchema),
  idempotency({ scope: 'loans.payment' }),
  validateBody(loanPaymentSchema),
  LoanController.addLoanPayment,
);

export { router as loanRoutes };
