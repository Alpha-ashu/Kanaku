import { NextFunction, Request, Response, Router } from 'express';
import { authRoutes } from '../modules/auth/auth.routes';
import { syncRoutes } from '../modules/sync/sync.routes';
import { pinRoutes } from '../modules/pin/pin.routes';
import { transactionRoutes } from '../modules/transactions/transaction.routes';
import { accountRoutes } from '../modules/accounts/account.routes';
import { goalRoutes } from '../modules/goals/goal.routes';
import { loanRoutes } from '../modules/loans/loan.routes';
import { settingsRoutes } from '../modules/settings/settings.routes';
import { bookingRoutes } from '../modules/bookings/booking.routes';
import { advisorRoutes } from '../modules/advisors/advisor.routes';
import { sessionRoutes } from '../modules/sessions/session.routes';
import { paymentRoutes } from '../modules/payments/payment.routes';
import { adminRoutes } from '../modules/admin/admin.routes';
import { notificationRoutes } from '../modules/notifications/notification.routes';
import { deviceRoutes } from '../modules/devices/device.routes';
import { stockRoutes } from '../modules/stocks/stock.routes';
import { friendRoutes } from '../modules/friends/friend.routes';
import { investmentRoutes } from '../modules/investments/investment.routes';
import { todoRoutes } from '../modules/todos/todo.routes';
import { groupRoutes } from '../modules/groups/group.routes';
import { dashboardRoutes } from '../modules/dashboard/dashboard.routes';
import { categorizationRoutes, learnRouter } from '../modules/categorization/categorization.routes';
import { avatarRoutes } from '../modules/avatars/avatar.routes';
import voiceRoutes from '../modules/voice/voice.routes';
import importRoutes from '../modules/import/import.routes';
import { otpRoutes } from '../modules/otp/otp.routes';
import { aaRoutes } from '../modules/aa/aa.routes';
import { recurringRoutes } from '../modules/recurring/recurring.routes';
import { budgetRoutes } from '../modules/budgets/budget.routes';
import { taxRoutes } from '../modules/tax/tax.routes';
import { goldRoutes } from '../modules/gold/gold.routes';
import { webhookRoutes } from '../modules/webhooks/webhook.routes';

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

// Authentication routes (public)
router.use('/auth', authRoutes);
router.use('/avatars', avatarRoutes);

// Webhook routes (public — called directly by external providers like SendGrid)
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
router.use('/ai', lazyRoute(() => require('../modules/ai/ai.routes'), 'aiRoutes'));
router.use('/receipts', lazyRoute(() => require('../modules/receipts/receipt.routes'), 'receiptRoutes'));

// Advisor & Booking routes
router.use('/bookings', bookingRoutes);
router.use('/advisors', advisorRoutes);
router.use('/sessions', sessionRoutes);

// Payment routes (includes webhook)
router.use('/payments', paymentRoutes);

// Notification routes
router.use('/notifications', notificationRoutes);

// Device registration & management routes
router.use('/devices', deviceRoutes);

// Secure bill uploads
router.use('/bills', lazyRoute(() => require('../modules/bills/bills.routes'), 'billsRoutes'));

// Dashboard aggregation
router.use('/dashboard', dashboardRoutes);

// Admin routes (requires admin role)
router.use('/admin', adminRoutes);

// Public stock routes
router.use('/stocks', stockRoutes);

// OTP Verification (RBI-compliant)
router.use('/otp', otpRoutes);

// Account Aggregator (RBI AA — Setu integration)
router.use('/aa', aaRoutes);

// Sub-feature modules (Recurring, Budgets, Tax, Gold)
router.use('/recurring', recurringRoutes);
router.use('/budgets', budgetRoutes);
router.use('/tax', taxRoutes);
router.use('/gold', goldRoutes);

export { router as apiRoutes };
