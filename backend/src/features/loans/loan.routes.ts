import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { pinGate } from '../../middleware/pinGate';
import { validateBody, validateParams } from '../../middleware/validate';
import { idempotency } from '../../middleware/idempotency';
import { responseCache } from '../../middleware/cache';
import { CACHE_TTL_SECONDS } from '../../cache/cache-policy';
import { requireFeature } from '../../middleware/featureGate';
import * as LoanController from './loan.controller';
import { loanCreateSchema, loanUpdateSchema, loanPaymentSchema, loanIdParamSchema } from './loan.validation';

const router = Router();

router.use(authMiddleware);
router.use(pinGate); // financial data requires a live PIN unlock

// borrowMoney / lendMoney: the `type` field in the body distinguishes borrow vs. lend.
// Both are gated by the same endpoint; the controller routes logic by type.
// The frontend should ensure the correct sub-feature is checked before calling.
// Gate at API level with borrowMoney (the more common path); lendMoney is a
// client-side concern enforced via the admin panel sub-feature config.
router.get('/', responseCache({ prefix: 'loans:list', ttlSeconds: CACHE_TTL_SECONDS.loans.list }), LoanController.getLoans);
router.post('/', requireFeature('loans', 'borrowMoney'), idempotency({ scope: 'loans.create' }), validateBody(loanCreateSchema), LoanController.createLoan);
router.get('/:id', validateParams(loanIdParamSchema), responseCache({ prefix: 'loans:item', ttlSeconds: CACHE_TTL_SECONDS.loans.item }), LoanController.getLoan);
router.put('/:id', validateParams(loanIdParamSchema), validateBody(loanUpdateSchema), LoanController.updateLoan);
router.delete('/:id', validateParams(loanIdParamSchema), LoanController.deleteLoan);

// EMI payments mutate account balance — wrap in idempotency to prevent double-debit.
// Gated by emiReminder because payment tracking is the primary sub-feature purpose.
router.post(
  '/:id/payment',
  requireFeature('loans', 'emiReminder'),
  validateParams(loanIdParamSchema),
  idempotency({ scope: 'loans.payment' }),
  validateBody(loanPaymentSchema),
  LoanController.addLoanPayment,
);

// Loan settlement: closes the loan at a negotiated amount, status → 'settled'.
// Gated by loanSettlement (advisor role has no access by default).
router.post(
  '/:id/settle',
  requireFeature('loans', 'loanSettlement'),
  validateParams(loanIdParamSchema),
  idempotency({ scope: 'loans.settle' }),
  LoanController.settleLoan,
);

export { router as loanRoutes };

