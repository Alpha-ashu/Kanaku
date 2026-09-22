import { Router } from 'express';
import { authMiddleware, requireVerifiedProfile } from '../../middleware/auth';
import { pinGate } from '../../middleware/pinGate';
import { validateBody, validateParams } from '../../middleware/validate';
import { responseCache } from '../../middleware/cache';
import { CACHE_TTL_SECONDS } from '../../cache/cache-policy';
import { idempotency } from '../../middleware/idempotency';
import { duplicateSubmitGuard } from '../../middleware/duplicateSubmitGuard';
import * as AccountController from './account.controller';
import { requireFeature } from '../../middleware/featureGate';
import { accountCreateSchema, accountUpdateSchema, accountIdParamSchema } from './account.validation';

const router = Router();

router.use(authMiddleware);
router.use(pinGate); // financial data requires a live PIN unlock
router.use(requireFeature('accounts'));

router.get('/', responseCache({ prefix: 'accounts:list', ttlSeconds: CACHE_TTL_SECONDS.accounts.list }), AccountController.getAccounts);
router.post(
  '/',
  requireVerifiedProfile,
  idempotency({ scope: 'accounts.create' }),
  requireFeature('accountSetup'),
  requireFeature('accounts', 'createAccount'),
  validateBody(accountCreateSchema),
  duplicateSubmitGuard({ scope: 'accounts.create' }),
  AccountController.createAccount,
);
router.get('/:id', validateParams(accountIdParamSchema), responseCache({ prefix: 'accounts:item', ttlSeconds: CACHE_TTL_SECONDS.accounts.item }), AccountController.getAccount);
router.put(
  '/:id',
  requireVerifiedProfile,
  idempotency({ scope: 'accounts.update' }),
  requireFeature('accounts', 'editAccount'),
  validateParams(accountIdParamSchema),
  validateBody(accountUpdateSchema),
  AccountController.updateAccount,
);
router.delete('/:id', requireVerifiedProfile, requireFeature('accounts', 'deleteAccount'), validateParams(accountIdParamSchema), AccountController.deleteAccount);

// Sub-feature operations
router.post(
  '/:id/transfer',
  requireVerifiedProfile,
  idempotency({ scope: 'accounts.transfer' }),
  requireFeature('accounts', 'accountTransfer'),
  validateParams(accountIdParamSchema),
  duplicateSubmitGuard({ scope: 'accounts.transfer' }),
  AccountController.transferAccount,
);
router.post(
  '/:id/reconcile',
  idempotency({ scope: 'accounts.reconcile' }),
  requireFeature('accounts', 'reconciliation'),
  validateParams(accountIdParamSchema),
  AccountController.reconcileAccount,
);

export { router as accountRoutes };


