import { NextFunction, Request, Response, Router } from 'express';
import { authRoutes } from '../features/auth/auth.routes';
import { syncRoutes } from '../features/sync/sync.routes';
import { pinRoutes } from '../features/pin/pin.routes';
import { transactionRoutes } from '../features/transactions/transaction.routes';
import { accountRoutes } from '../features/accounts/account.routes';
import { goalRoutes } from '../features/goals/goal.routes';
import { loanRoutes } from '../features/loans/loan.routes';
import { settingsRoutes } from '../features/settings/settings.routes';
import { bookingRoutes } from '../features/bookings/booking.routes';
import { advisorRoutes } from '../features/advisors/advisor.routes';
import { sessionRoutes } from '../features/sessions/session.routes';
import { paymentRoutes } from '../features/payments/payment.routes';
import { adminRoutes } from '../features/admin/admin.routes';
import { notificationRoutes } from '../features/notifications/notification.routes';
import { deviceRoutes } from '../features/devices/device.routes';
import { stockRoutes } from '../features/stocks/stock.routes';
import { friendRoutes } from '../features/friends/friend.routes';
import { investmentRoutes } from '../features/investments/investment.routes';
import { todoRoutes } from '../features/todos/todo.routes';
import { groupRoutes } from '../features/groups/group.routes';
import { dashboardRoutes } from '../features/dashboard/dashboard.routes';
import { categorizationRoutes, learnRouter } from '../features/categorization/categorization.routes';
import { avatarRoutes } from '../features/avatars/avatar.routes';
import voiceRoutes from '../features/voice/voice.routes';
import importRoutes from '../features/import/import.routes';
import { otpRoutes } from '../features/otp/otp.routes';
import { aaRoutes } from '../features/aa/aa.routes';
import { recurringRoutes } from '../features/recurring/recurring.routes';
import { budgetRoutes } from '../features/budgets/budget.routes';
import { taxRoutes } from '../features/tax/tax.routes';
import { goldRoutes } from '../features/gold/gold.routes';
import { collaborationRoutes } from '../features/collaboration/collaboration.routes';
import { webhookRoutes } from '../features/webhooks/webhook.routes';

const router = Router();

type RouterModule = { [key: string]: Router };

const lazyRoute =
  (loader: () => RouterModule, exportName: string) =>
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const mod = loader();
      const loadedRouter = mod[exportName];
      if (!loadedRouter) {
        throw new Error(`Route export '${exportName}' not found`);
      }

      return loadedRouter(req, res, next);
    } catch (error) {
      return next(error);
    }
  };

// --- Phase-based module gating ----------------------------------------------
// Some routers are scaffolding for later roadmap phases (Advisor marketplace,
// Payments, Account Aggregator). They are deferred and stay UNMOUNTED unless the
// deployment explicitly opts in via the ENABLED_MODULES env var (comma-separated,
// e.g. ENABLED_MODULES=advisor,payments,aa). With it unset — the production
// default — these paths 404, so a deferred/regulated endpoint cannot be reached
// just because its code exists in the repo. MVP modules are always mounted.
// See KANAKU_PROJECT_OVERVIEW.md → "Module Phasing & Gating".
const ENABLED_MODULES = new Set(
  (process.env.ENABLED_MODULES ?? '')
    .split(',')
    .map((m) => m.trim().toLowerCase())
    .filter(Boolean),
);
const moduleEnabled = (key: string): boolean => ENABLED_MODULES.has(key);

// Authentication routes (public)
router.use('/auth', authRoutes);
router.use('/avatars', avatarRoutes);

// Webhook routes (public â€” called directly by external providers like SendGrid)
router.use('/webhooks', webhookRoutes);

// Sync and PIN routes (protected)
router.use('/sync', syncRoutes);
router.use('/pin', pinRoutes);

// Protected API routes
router.use('/transactions', transactionRoutes);
router.use('/accounts', accountRoutes);
router.use('/goals', goalRoutes);
router.use('/loans', loanRoutes);
router.use('/settings', settingsRoutes);
router.use('/friends', friendRoutes);
router.use('/investments', investmentRoutes);
router.use('/todos', todoRoutes);
router.use('/groups', groupRoutes);
router.use('/categorize', categorizationRoutes);
router.use('/learn', learnRouter);
router.use('/voice', voiceRoutes);
router.use('/import', importRoutes);
router.use('/ai', lazyRoute(() => require('../features/ai/ai.routes'), 'aiRoutes'));
router.use('/receipts', lazyRoute(() => require('../features/receipts/receipt.routes'), 'receiptRoutes'));

// Advisor & Booking routes — Phase 2 (deferred). Mounted only when the deploy
// opts in via ENABLED_MODULES=advisor; otherwise these paths 404 in production.
if (moduleEnabled('advisor')) {
  router.use('/bookings', bookingRoutes);
  router.use('/advisors', advisorRoutes);
  router.use('/sessions', sessionRoutes);
}

// Payment routes (includes webhook) — Phase 4 (deferred). ENABLED_MODULES=payments.
if (moduleEnabled('payments')) {
  router.use('/payments', paymentRoutes);
}

// Notification routes
router.use('/notifications', notificationRoutes);

// Device registration & management routes
router.use('/devices', deviceRoutes);

// Secure bill uploads
router.use('/bills', lazyRoute(() => require('../features/bills/bills.routes'), 'billsRoutes'));

// Dashboard aggregation
router.use('/dashboard', dashboardRoutes);

// Admin routes (requires admin role)
router.use('/admin', adminRoutes);

// Public stock routes
router.use('/stocks', stockRoutes);

// OTP Verification (RBI-compliant)
router.use('/otp', otpRoutes);

// Account Aggregator (RBI AA â€” Setu integration)
// Account Aggregator (Setu AA) — Phase 5 (deferred). ENABLED_MODULES=aa.
if (moduleEnabled('aa')) {
  router.use('/aa', aaRoutes);
}

// Sub-feature modules (Recurring, Budgets, Tax, Gold)
router.use('/recurring', recurringRoutes);
router.use('/budgets', budgetRoutes);
router.use('/tax', taxRoutes);
router.use('/gold', goldRoutes);

// Unified collaboration/invitation management (Group Expenses, To-Do Lists, Goals)
router.use('/collaborations', collaborationRoutes);

export { router as apiRoutes };
