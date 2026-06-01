import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { responseCache } from '../../middleware/cache';
import { CACHE_TTL_SECONDS } from '../../cache/cache-policy';
import * as AccountController from './account.controller';
import { requireFeature } from '../../middleware/featureGate';

const router = Router();

router.use(authMiddleware);

router.get('/', responseCache({ prefix: 'accounts:list', ttlSeconds: CACHE_TTL_SECONDS.accounts.list }), AccountController.getAccounts);
router.post('/', requireFeature('accounts', 'createAccount'), AccountController.createAccount);
router.get('/:id', responseCache({ prefix: 'accounts:item', ttlSeconds: CACHE_TTL_SECONDS.accounts.item }), AccountController.getAccount);
router.put('/:id', requireFeature('accounts', 'editAccount'), AccountController.updateAccount);
router.delete('/:id', requireFeature('accounts', 'deleteAccount'), AccountController.deleteAccount);

export { router as accountRoutes };
