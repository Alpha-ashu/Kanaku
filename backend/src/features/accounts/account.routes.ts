import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { pinGate } from '../../middleware/pinGate';
import { validateBody, validateParams } from '../../middleware/validate';
import { responseCache } from '../../middleware/cache';
import { CACHE_TTL_SECONDS } from '../../cache/cache-policy';
import * as AccountController from './account.controller';
import { requireFeature } from '../../middleware/featureGate';
import { accountCreateSchema, accountUpdateSchema, accountIdParamSchema } from './account.validation';

const router = Router();

router.use(authMiddleware);
router.use(pinGate); // financial data requires a live PIN unlock

router.get('/', responseCache({ prefix: 'accounts:list', ttlSeconds: CACHE_TTL_SECONDS.accounts.list }), AccountController.getAccounts);
router.post('/', requireFeature('accounts', 'createAccount'), validateBody(accountCreateSchema), AccountController.createAccount);
router.get('/:id', validateParams(accountIdParamSchema), responseCache({ prefix: 'accounts:item', ttlSeconds: CACHE_TTL_SECONDS.accounts.item }), AccountController.getAccount);
router.put('/:id', requireFeature('accounts', 'editAccount'), validateParams(accountIdParamSchema), validateBody(accountUpdateSchema), AccountController.updateAccount);
router.delete('/:id', requireFeature('accounts', 'deleteAccount'), validateParams(accountIdParamSchema), AccountController.deleteAccount);

// Sub-feature operations
router.post('/:id/transfer', requireFeature('accounts', 'accountTransfer'), validateParams(accountIdParamSchema), AccountController.transferAccount);
router.post('/:id/reconcile', requireFeature('accounts', 'reconciliation'), validateParams(accountIdParamSchema), AccountController.reconcileAccount);

export { router as accountRoutes };

