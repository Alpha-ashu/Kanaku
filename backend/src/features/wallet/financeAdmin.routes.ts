import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { adminPlatformGate } from '../../middleware/adminPlatformGate';
import { authenticatedRateLimit } from '../../middleware/rateLimit';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate';
import { requirePermission } from '../../security/permissions';
import * as Finance from './financeAdmin.controller';
import {
  adjustSchema,
  adminLedgerQuerySchema,
  adminOrdersQuerySchema,
  adminWalletsQuerySchema,
  adminWithdrawalsQuerySchema,
  idParamSchema,
  managerParamSchema,
  packageCreateSchema,
  packageUpdateSchema,
  refundBookingSchema,
  refundOrderSchema,
  securityEventsQuerySchema,
  staffAssignmentParamSchema,
  staffAssignmentSchema,
  staffPermissionsSchema,
  userIdParamSchema,
  walletStatusSchema,
  webhookEventsQuerySchema,
  withdrawalPaidSchema,
  withdrawalRejectSchema,
} from './wallet.validation';

/**
 * /api/v1/finance — staff finance console.
 *
 * Separate from /admin because it is permission-based, not role-based: an
 * admin holds everything, a manager holds only what was granted (and team-
 * scoped reads). Every route names the permission it needs; a route that names
 * none does not exist. Origin-gated like the rest of the staff platform.
 */
const router = Router();

router.use(authMiddleware);
router.use(adminPlatformGate);
router.use(authenticatedRateLimit({ windowMs: 60_000, max: 120, scope: 'finance-console' }));

const moneyLimiter = authenticatedRateLimit({ windowMs: 60_000, max: 20, scope: 'finance-money-actions' });

const read = requirePermission('finance.read', 'team.wallets.read', 'team.payments.read');

router.get('/overview', requirePermission('finance.read'), Finance.getFinanceOverview);
router.get('/integrity', requirePermission('finance.read'), Finance.checkLedgerIntegrity);

router.get('/transactions', read, validateQuery(adminLedgerQuerySchema), Finance.searchTransactions);

router.get('/payment-orders', requirePermission('finance.read', 'team.payments.read'), validateQuery(adminOrdersQuerySchema), Finance.listPaymentOrders);
router.post('/payment-orders/:id/reconcile', moneyLimiter, requirePermission('finance.reconcile'), validateParams(idParamSchema), Finance.reconcilePaymentOrder);
router.post('/payment-orders/:id/refund', moneyLimiter, requirePermission('finance.refund'), validateParams(idParamSchema), validateBody(refundOrderSchema), Finance.refundPaymentOrder);

router.get('/wallets', requirePermission('finance.read', 'team.wallets.read'), validateQuery(adminWalletsQuerySchema), Finance.listWallets);
router.get('/wallets/:userId', requirePermission('finance.read', 'team.wallets.read'), validateParams(userIdParamSchema), Finance.getWalletDetail);
router.post('/wallets/:userId/adjust', moneyLimiter, requirePermission('finance.adjust'), validateParams(userIdParamSchema), validateBody(adjustSchema), Finance.adjustWallet);
router.post('/wallets/:userId/status', moneyLimiter, requirePermission('finance.adjust'), validateParams(userIdParamSchema), validateBody(walletStatusSchema), Finance.setWalletState);

router.post('/bookings/:id/refund', moneyLimiter, requirePermission('finance.refund'), validateParams(idParamSchema), validateBody(refundBookingSchema), Finance.refundBooking);

// Advisor withdrawals: paid by staff outside the app. Acting on them is
// admin-only (`finance.payouts` cannot be granted to a manager).
router.get('/withdrawals', requirePermission('finance.payouts', 'finance.read'), validateQuery(adminWithdrawalsQuerySchema), Finance.listWithdrawals);
router.get('/withdrawals/:id/payout-details', moneyLimiter, requirePermission('finance.payouts'), validateParams(idParamSchema), Finance.revealWithdrawalPayoutDetails);
router.post('/withdrawals/:id/approve', moneyLimiter, requirePermission('finance.payouts'), validateParams(idParamSchema), Finance.approveWithdrawalRequest);
router.post('/withdrawals/:id/paid', moneyLimiter, requirePermission('finance.payouts'), validateParams(idParamSchema), validateBody(withdrawalPaidSchema), Finance.markWithdrawalRequestPaid);
router.post('/withdrawals/:id/reject', moneyLimiter, requirePermission('finance.payouts'), validateParams(idParamSchema), validateBody(withdrawalRejectSchema), Finance.rejectWithdrawalRequest);

router.get('/packages', requirePermission('finance.packages.manage', 'finance.read'), Finance.listAllPackages);
router.post('/packages', requirePermission('finance.packages.manage'), validateBody(packageCreateSchema), Finance.createPackage);
router.patch('/packages/:id', requirePermission('finance.packages.manage'), validateParams(idParamSchema), validateBody(packageUpdateSchema), Finance.updatePackage);

router.get('/providers', requirePermission('finance.providers.read'), Finance.getProviders);
router.get('/webhook-events', requirePermission('finance.read'), validateQuery(webhookEventsQuerySchema), Finance.listWebhookEvents);
router.get('/security-events', requirePermission('security.read'), validateQuery(securityEventsQuerySchema), Finance.listSecurityEvents);

router.get('/staff', requirePermission('staff.manage'), Finance.listStaff);
router.put('/staff/:managerId/permissions', requirePermission('staff.manage'), validateParams(managerParamSchema), validateBody(staffPermissionsSchema), Finance.setStaffPermissions);
router.post('/staff/:managerId/assignments', requirePermission('staff.manage'), validateParams(managerParamSchema), validateBody(staffAssignmentSchema), Finance.addManagerAssignment);
router.delete('/staff/:managerId/assignments/:subjectUserId', requirePermission('staff.manage'), validateParams(staffAssignmentParamSchema), Finance.removeManagerAssignment);

export { router as financeRoutes };
