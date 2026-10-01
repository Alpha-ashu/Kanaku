import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { pinGate } from '../../middleware/pinGate';
import { requireFeature } from '../../middleware/featureGate';
import { requireRole, requireApproved } from '../../middleware/rbac';
import { authenticatedRateLimit } from '../../middleware/rateLimit';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate';
import * as WalletController from './wallet.controller';
import * as Withdrawals from './withdrawal.controller';
import {
  createPurchaseSchema,
  createWithdrawalSchema,
  idParamSchema,
  ledgerQuerySchema,
  payoutMethodSchema,
  sandboxPaySchema,
  verifyPurchaseSchema,
} from './wallet.validation';

/**
 * /api/v1/wallet — the signed-in user's own coin wallet.
 *
 * Gated by the admin panel's `wallet` module: a module the admin has not
 * enabled is refused (403) for every non-admin, so the whole surface ships dark
 * until an admin turns it on. Financial data, so a live PIN unlock is required
 * like /payments and /bills.
 */
const router = Router();

router.use(authMiddleware);
router.use(requireFeature('wallet'));
router.use(pinGate);

const purchaseLimiter = authenticatedRateLimit({
  windowMs: 10 * 60_000,
  // Read per request so the ceiling can be tuned without a restart.
  max: () => Number(process.env.WALLET_PURCHASE_RATE_LIMIT || 10),
  scope: 'wallet-purchase-create',
  message: 'Too many purchase attempts. Please wait a few minutes.',
});
const verifyLimiter = authenticatedRateLimit({ windowMs: 60_000, max: 30, scope: 'wallet-purchase-verify' });

router.get('/', WalletController.getMyWallet);
router.get('/transactions', validateQuery(ledgerQuerySchema), WalletController.getMyTransactions);
router.get('/packages', WalletController.getPackages);

router.post('/purchases', purchaseLimiter, validateBody(createPurchaseSchema), WalletController.createPurchase);
router.get('/purchases', WalletController.listMyPurchases);
router.get('/purchases/:id', validateParams(idParamSchema), WalletController.getMyPurchase);
router.post('/purchases/:id/verify', verifyLimiter, validateParams(idParamSchema), validateBody(verifyPurchaseSchema), WalletController.verifyPurchase);
router.post('/purchases/:id/cancel', validateParams(idParamSchema), WalletController.cancelMyPurchase);

// Development gateway stand-in. The handler refuses in production as well, so a
// misconfigured NODE_ENV cannot route it by accident.
if (process.env.NODE_ENV !== 'production') {
  router.post('/purchases/:id/sandbox-pay', verifyLimiter, validateParams(idParamSchema), validateBody(sandboxPaySchema), WalletController.sandboxPay);
}

router.get('/earnings', requireRole('advisor'), requireApproved, WalletController.getMyEarnings);

// Advisor withdrawals of earned coins (paid out manually by finance staff).
const advisorOnly = [requireRole('advisor'), requireApproved];
const withdrawalLimiter = authenticatedRateLimit({
  windowMs: 60 * 60_000,
  max: 10,
  scope: 'wallet-withdrawal-create',
  message: 'Too many withdrawal attempts. Please wait a while and try again.',
});
const payoutMethodLimiter = authenticatedRateLimit({
  windowMs: 60 * 60_000,
  max: 5,
  scope: 'wallet-payout-method',
  message: 'Too many changes to payout details. Please try again later.',
});

router.get('/withdrawals', ...advisorOnly, Withdrawals.getMyWithdrawals);
router.put('/payout-method', ...advisorOnly, payoutMethodLimiter, validateBody(payoutMethodSchema), Withdrawals.saveMyPayoutMethod);
router.post('/withdrawals', ...advisorOnly, withdrawalLimiter, validateBody(createWithdrawalSchema), Withdrawals.requestWithdrawal);
router.post('/withdrawals/:id/cancel', ...advisorOnly, validateParams(idParamSchema), Withdrawals.cancelMyWithdrawal);

export { router as walletRoutes };
