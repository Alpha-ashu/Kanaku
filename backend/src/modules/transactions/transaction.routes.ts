import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate';
import * as TransactionController from './transaction.controller';
import { responseCache } from '../../middleware/cache';
import { CACHE_TTL_SECONDS } from '../../cache/cache-policy';
import { requireFeature } from '../../middleware/featureGate';
import {
	transactionAccountParamSchema,
	transactionCreateValidatedSchema,
	transactionIdParamSchema,
	transactionQuerySchema,
	transactionUpdateSchema,
} from './transaction.validation';

const router = Router();

// All transaction routes require authentication
router.use(authMiddleware);

router.get(
	'/',
	validateQuery(transactionQuerySchema),
	responseCache({ prefix: 'transactions:list', ttlSeconds: CACHE_TTL_SECONDS.transactions.list }),
	TransactionController.getTransactions
);
router.post(
	'/',
	requireFeature('transactions', 'addTransaction'),
	validateBody(transactionCreateValidatedSchema),
	TransactionController.createTransaction
);
router.get(
	'/:id',
	validateParams(transactionIdParamSchema),
	responseCache({ prefix: 'transactions:item', ttlSeconds: CACHE_TTL_SECONDS.transactions.item }),
	TransactionController.getTransaction
);
router.put(
	'/:id',
	requireFeature('transactions', 'editTransaction'),
	validateParams(transactionIdParamSchema),
	validateBody(transactionUpdateSchema),
	TransactionController.updateTransaction
);
router.delete(
	'/:id',
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
