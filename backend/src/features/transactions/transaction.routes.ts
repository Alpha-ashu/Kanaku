import { Router } from 'express';
import { authMiddleware, requireVerifiedProfile } from '../../middleware/auth';
import { pinGate } from '../../middleware/pinGate';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate';
import { idempotency } from '../../middleware/idempotency';
import { duplicateSubmitGuard } from '../../middleware/duplicateSubmitGuard';
import * as TransactionController from './transaction.controller';
import { responseCache } from '../../middleware/cache';
import { CACHE_TTL_SECONDS } from '../../cache/cache-policy';
import { requireFeature } from '../../middleware/featureGate';
import { announceChange } from '../../middleware/announceChange';
import {
	transactionAccountParamSchema,
	transactionBulkCreateSchema,
	transactionCreateValidatedSchema,
	transactionIdParamSchema,
	transactionQuerySchema,
	transactionUpdateSchema,
} from './transaction.validation';

const router = Router();

// All transaction routes require authentication + a live PIN unlock
router.use(authMiddleware);
router.use(pinGate);
router.use(requireFeature('transactions'));
// Transactions ARE part of the Dexie sync engine, but that engine only pulls on
// app start and on page navigation — so an expense added on a phone did not
// appear on an already-open laptop until the user moved around the app. This is
// the headline multi-device complaint.
//
// Safe to announce because mergeBackendTable does its insert inside a
// db.transaction('rw') that re-checks by cloudId and shares a lock with
// storeServerConfirmedRow, so a pull cannot race a local post-POST writeback
// into a duplicate. The acting device skips its own echo via originSessionId
// regardless.
router.use(announceChange('transactions_updated'));

router.get(
	'/',
	validateQuery(transactionQuerySchema),
	responseCache({ prefix: 'transactions:list', ttlSeconds: CACHE_TTL_SECONDS.transactions.list }),
	TransactionController.getTransactions
);
router.post(
	'/',
	requireVerifiedProfile,
	requireFeature('transactions', 'addTransaction'),
	idempotency({ scope: 'transactions.create' }),
	validateBody(transactionCreateValidatedSchema),
	duplicateSubmitGuard({ scope: 'transactions.create' }),
	TransactionController.createTransaction
);
// Sub-feature operations: Export & Third-Party integration
router.get(
	'/export',
	requireFeature('transactions', 'exportStatement'),
	TransactionController.exportTransactions
);
router.post(
	'/import/third-party',
	requireVerifiedProfile,
	requireFeature('transactions', 'importThirdPartyData'),
	TransactionController.importThirdPartyData
);
router.post(
	'/bulk',
	requireVerifiedProfile,
	requireFeature('transactions', 'addTransaction'),
	idempotency({ scope: 'transactions.bulk' }),
	validateBody(transactionBulkCreateSchema),
	TransactionController.createTransactionsBulk
);

router.get(
	'/:id',
	validateParams(transactionIdParamSchema),
	responseCache({ prefix: 'transactions:item', ttlSeconds: CACHE_TTL_SECONDS.transactions.item }),
	TransactionController.getTransaction
);
router.put(
	'/:id',
	requireVerifiedProfile,
	requireFeature('transactions', 'editTransaction'),
	validateParams(transactionIdParamSchema),
	validateBody(transactionUpdateSchema),
	TransactionController.updateTransaction
);
router.delete(
	'/:id',
	requireVerifiedProfile,
	requireFeature('transactions', 'deleteTransaction'),
	validateParams(transactionIdParamSchema),
	TransactionController.deleteTransaction
);
router.get(
	'/account/:accountId',
	validateParams(transactionAccountParamSchema),
	responseCache({ prefix: 'transactions:account', ttlSeconds: CACHE_TTL_SECONDS.transactions.account }),
	TransactionController.getAccountTransactions
);

export { router as transactionRoutes };
