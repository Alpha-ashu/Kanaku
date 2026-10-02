import type { Response } from 'express';
import { prisma } from '../../db/prisma';
import { Prisma } from '../../db/prisma-client';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { audit } from '../../utils/auditLogger';
import { invalidateUserSnapshotCache } from '../../middleware/auth';
import { providerStatuses } from '../payments/providers';
import {
  GRANTABLE_TO_MANAGER,
  getManagedUserIds,
  invalidatePermissionCache,
  isPermission,
  permissionsOf,
  type Permission,
} from '../../security/permissions';
import { WalletError } from './wallet.errors';
import { walletConfig } from './wallet.config';
import { adminAdjust, getWalletSummary, ledgerTotals, pageLedger, setWalletStatus } from './wallet.service';
import { reconcileOrder, refundPurchase, toOrderView } from './coinPurchase.service';
import { adminRefundCompletedSession, cancelBookingWithRefund } from './sessionPayment.service';
import { requestIdOf, sendWalletError } from './wallet.http';
import {
  approveWithdrawal,
  decryptPayoutDetails,
  markWithdrawalPaid,
  rejectWithdrawal,
  toWithdrawalView,
} from './withdrawal.service';

/**
 * Finance console (admin, and managers holding explicit grants).
 *
 * A caller holding only a `team.*` permission is confined to users in their
 * manager_assignments: `scopeUserIds` returns that list, and every query below
 * intersects with it. Platform-wide `finance.read` lifts the restriction.
 * Personal data is limited to what reconciliation needs (name, email).
 */

const actorOf = (req: AuthRequest) => ({ id: getUserId(req), role: req.user?.role ?? 'unknown' });

/** null = unrestricted; otherwise the user ids this caller may see. */
const scopeUserIds = async (req: AuthRequest): Promise<string[] | null> => {
  const granted = permissionsOf(req);
  if (granted.has('finance.read')) return null;
  return getManagedUserIds(getUserId(req));
};

const inScope = (scope: string[] | null, userId: string) => scope === null || scope.includes(userId);

const dateRange = (from?: unknown, to?: unknown) => {
  const range: { gte?: Date; lte?: Date } = {};
  if (typeof from === 'string' && from) range.gte = new Date(from);
  if (typeof to === 'string' && to) range.lte = new Date(to);
  return Object.keys(range).length ? range : undefined;
};

const usersById = async (ids: string[]) => {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map<string, { id: string; name: string; email: string; role: string }>();
  const users = await prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true, email: true, role: true } });
  return new Map(users.map((u) => [u.id, u]));
};

// ─── Overview ──────────────────────────────────────────────────────────────────

export const getFinanceOverview = async (req: AuthRequest, res: Response) => {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60_000);
    const [balances, paidToday, revenueToday, failedToday, openOrders, pendingSessions, webhookFailures, mismatches, openWithdrawals] = await Promise.all([
      prisma.wallet.aggregate({ _sum: { availableBalance: true, pendingBalance: true }, _count: { _all: true } }),
      prisma.paymentOrder.count({ where: { status: 'PAID', paidAt: { gte: since } } }),
      prisma.paymentOrder.aggregate({ where: { status: 'PAID', paidAt: { gte: since } }, _sum: { amountMinor: true } }),
      prisma.paymentOrder.count({ where: { status: 'FAILED', updatedAt: { gte: since } } }),
      prisma.paymentOrder.count({ where: { status: 'CREATED' } }),
      prisma.bookingRequest.count({ where: { status: 'accepted', paymentStatus: 'PAID' } }),
      prisma.paymentWebhookEvent.count({ where: { status: { in: ['REJECTED', 'FAILED'] }, receivedAt: { gte: since } } }),
      prisma.paymentOrder.count({ where: { failureReason: { startsWith: 'AMOUNT_MISMATCH' } } }),
      prisma.withdrawalRequest.aggregate({ where: { status: { in: ['REQUESTED', 'APPROVED'] } }, _count: { _all: true }, _sum: { amountMinor: true } }),
    ]);
    res.json({
      success: true,
      data: {
        wallets: balances._count._all,
        coinsAvailable: balances._sum.availableBalance ?? 0,
        coinsPending: balances._sum.pendingBalance ?? 0,
        last24h: { paidOrders: paidToday, revenueMinor: revenueToday._sum.amountMinor ?? 0, failedOrders: failedToday, webhookFailures },
        openOrders,
        paidUpcomingSessions: pendingSessions,
        ordersNeedingReview: mismatches,
        openWithdrawals: { count: openWithdrawals._count._all, amountMinor: openWithdrawals._sum.amountMinor ?? 0 },
        providers: providerStatuses(),
        serverNow: new Date().toISOString(),
      },
    });
  } catch (error) {
    sendWalletError(res, error, 'finance overview', requestIdOf(req));
  }
};

/**
 * Integrity check: every wallet's cached balances must equal the sum of its
 * ledger. A mismatch means something wrote to `wallets` outside postEntry.
 */
export const checkLedgerIntegrity = async (req: AuthRequest, res: Response) => {
  try {
    const rows = await prisma.$queryRaw<Array<{ user_id: string; available_balance: number; pending_balance: number; ledger_available: bigint | null; ledger_pending: bigint | null }>>`
      SELECT w."user_id", w."available_balance", w."pending_balance",
             SUM(CASE WHEN t."bucket" = 'AVAILABLE' THEN t."amount" ELSE 0 END) AS ledger_available,
             SUM(CASE WHEN t."bucket" = 'PENDING' THEN t."amount" ELSE 0 END) AS ledger_pending
      FROM "wallets" w
      LEFT JOIN "wallet_transactions" t ON t."wallet_id" = w."id"
      GROUP BY w."id"
      HAVING w."available_balance" <> COALESCE(SUM(CASE WHEN t."bucket" = 'AVAILABLE' THEN t."amount" ELSE 0 END), 0)
          OR w."pending_balance" <> COALESCE(SUM(CASE WHEN t."bucket" = 'PENDING' THEN t."amount" ELSE 0 END), 0)
      LIMIT 100`;
    res.json({
      success: true,
      data: {
        consistent: rows.length === 0,
        mismatches: rows.map((r) => ({
          userId: r.user_id,
          availableBalance: Number(r.available_balance),
          pendingBalance: Number(r.pending_balance),
          ledgerAvailable: Number(r.ledger_available ?? 0),
          ledgerPending: Number(r.ledger_pending ?? 0),
        })),
      },
    });
  } catch (error) {
    sendWalletError(res, error, 'ledger integrity', requestIdOf(req));
  }
};

// ─── Transactions ──────────────────────────────────────────────────────────────

export const searchTransactions = async (req: AuthRequest, res: Response) => {
  try {
    const scope = await scopeUserIds(req);
    const q = req.query as Record<string, string | undefined>;
    if (q.userId && !inScope(scope, q.userId)) {
      return res.json({ success: true, data: { items: [], nextCursor: null } });
    }
    const where: Prisma.WalletTransactionWhereInput = {
      ...(q.userId ? { userId: q.userId } : scope ? { userId: { in: scope } } : {}),
      ...(q.type ? { type: q.type } : {}),
      ...(q.bookingId ? { bookingId: q.bookingId } : {}),
      ...(q.paymentOrderId ? { paymentOrderId: q.paymentOrderId } : {}),
      ...(q.reference ? { reference: { contains: q.reference } } : {}),
      ...(dateRange(q.from, q.to) ? { createdAt: dateRange(q.from, q.to) } : {}),
    };
    const page = await pageLedger(where, { cursor: q.cursor ?? null, limit: Number(q.limit) || 25 });
    const users = await usersById(page.items.map((i) => i.userId));
    res.json({
      success: true,
      data: {
        items: page.items.map((row) => ({
          ...row,
          user: users.get(row.userId) ?? { id: row.userId, name: 'Deleted account', email: '', role: '' },
        })),
        nextCursor: page.nextCursor,
      },
    });
  } catch (error) {
    sendWalletError(res, error, 'search transactions', requestIdOf(req));
  }
};

// ─── Payment orders ────────────────────────────────────────────────────────────

export const listPaymentOrders = async (req: AuthRequest, res: Response) => {
  try {
    const scope = await scopeUserIds(req);
    const q = req.query as Record<string, string | undefined>;
    const limit = Math.min(Math.max(Number(q.limit) || 25, 1), 100);
    let userFilter: Prisma.PaymentOrderWhereInput = {};
    if (q.search) {
      const matched = await prisma.user.findMany({
        where: { OR: [{ email: { contains: q.search, mode: 'insensitive' } }, { name: { contains: q.search, mode: 'insensitive' } }] },
        select: { id: true },
        take: 200,
      });
      userFilter = {
        OR: [
          { id: q.search },
          { providerOrderId: q.search },
          { providerPaymentId: q.search },
          { userId: { in: matched.map((m) => m.id) } },
        ],
      };
    }
    const where: Prisma.PaymentOrderWhereInput = {
      AND: [
        scope ? { userId: { in: scope } } : {},
        q.userId ? { userId: q.userId } : {},
        q.status ? { status: q.status } : {},
        q.provider ? { provider: q.provider } : {},
        dateRange(q.from, q.to) ? { createdAt: dateRange(q.from, q.to) } : {},
        userFilter,
      ],
    };
    const orders = await prisma.paymentOrder.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      include: { package: { select: { name: true, code: true } } },
    });
    const hasMore = orders.length > limit;
    const items = hasMore ? orders.slice(0, limit) : orders;
    const users = await usersById(items.map((o) => o.userId));
    res.json({
      success: true,
      data: {
        items: items.map((o) => ({
          ...toOrderView(o),
          providerOrderId: o.providerOrderId,
          providerPaymentId: o.providerPaymentId,
          verifiedVia: o.verifiedVia,
          refundReason: o.refundReason,
          package: o.package,
          user: users.get(o.userId) ?? { id: o.userId, name: 'Deleted account', email: '', role: '' },
        })),
        nextCursor: hasMore ? items[items.length - 1].id : null,
      },
    });
  } catch (error) {
    sendWalletError(res, error, 'list payment orders', requestIdOf(req));
  }
};

export const reconcilePaymentOrder = async (req: AuthRequest, res: Response) => {
  try {
    const scope = await scopeUserIds(req);
    const existing = await prisma.paymentOrder.findUnique({ where: { id: req.params.id }, select: { userId: true } });
    if (!existing || !inScope(scope, existing.userId)) throw new WalletError('ORDER_NOT_FOUND', 'Order not found.', 404);
    const order = await reconcileOrder(req.params.id, 'reconcile');
    audit({ event: 'payment.credited', userId: getUserId(req), resource: 'PaymentOrder', resourceId: order.id, meta: { manualReconcile: true, status: order.status } });
    res.json({ success: true, data: { order: toOrderView(order) } });
  } catch (error) {
    sendWalletError(res, error, 'reconcile order', requestIdOf(req));
  }
};

export const refundPaymentOrder = async (req: AuthRequest, res: Response) => {
  try {
    const scope = await scopeUserIds(req);
    const existing = await prisma.paymentOrder.findUnique({ where: { id: req.params.id }, select: { userId: true } });
    if (!existing || !inScope(scope, existing.userId)) throw new WalletError('ORDER_NOT_FOUND', 'Order not found.', 404);
    // Same rule as adjusting or freezing: staff never act on their own money.
    if (existing.userId === getUserId(req)) throw new WalletError('NOT_REFUNDABLE', 'You cannot refund your own purchase. Ask another administrator.', 403);
    const order = await refundPurchase(req.params.id, actorOf(req), req.body.reason);
    audit({ event: 'payment.refunded', userId: getUserId(req), resource: 'PaymentOrder', resourceId: order.id, meta: { reason: req.body.reason } });
    res.json({ success: true, data: { order: toOrderView(order) } });
  } catch (error) {
    sendWalletError(res, error, 'refund order', requestIdOf(req));
  }
};

// ─── Wallets ───────────────────────────────────────────────────────────────────

export const listWallets = async (req: AuthRequest, res: Response) => {
  try {
    const scope = await scopeUserIds(req);
    const q = req.query as Record<string, string | undefined>;
    const limit = Math.min(Math.max(Number(q.limit) || 25, 1), 100);
    const page = Math.max(Number(q.page) || 1, 1);
    let userIds: string[] | undefined = scope ?? undefined;
    if (q.search) {
      const matched = await prisma.user.findMany({
        where: {
          ...(scope ? { id: { in: scope } } : {}),
          OR: [{ email: { contains: q.search, mode: 'insensitive' } }, { name: { contains: q.search, mode: 'insensitive' } }, { id: q.search }],
        },
        select: { id: true },
        take: 500,
      });
      userIds = matched.map((m) => m.id);
    }
    const where: Prisma.WalletWhereInput = userIds ? { userId: { in: userIds } } : {};
    const [wallets, total] = await Promise.all([
      prisma.wallet.findMany({ where, orderBy: { updatedAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      prisma.wallet.count({ where }),
    ]);
    const users = await usersById(wallets.map((w) => w.userId));
    res.json({
      success: true,
      data: {
        items: wallets.map((w) => ({
          userId: w.userId,
          availableBalance: w.availableBalance,
          pendingBalance: w.pendingBalance,
          status: w.status,
          updatedAt: w.updatedAt,
          user: users.get(w.userId) ?? { id: w.userId, name: 'Deleted account', email: '', role: '' },
        })),
        page,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    sendWalletError(res, error, 'list wallets', requestIdOf(req));
  }
};

export const getWalletDetail = async (req: AuthRequest, res: Response) => {
  try {
    const scope = await scopeUserIds(req);
    const { userId } = req.params;
    if (!inScope(scope, userId)) throw new WalletError('ORDER_NOT_FOUND', 'Wallet not found.', 404);
    const [summary, totals, users, ledger] = await Promise.all([
      getWalletSummary(userId),
      ledgerTotals(userId),
      usersById([userId]),
      pageLedger({ userId }, { limit: 25 }),
    ]);
    res.json({
      success: true,
      data: {
        wallet: summary,
        ledgerTotals: totals,
        consistent: totals.available === summary.availableBalance && totals.pending === summary.pendingBalance,
        user: users.get(userId) ?? null,
        transactions: ledger.items,
        nextCursor: ledger.nextCursor,
      },
    });
  } catch (error) {
    sendWalletError(res, error, 'wallet detail', requestIdOf(req));
  }
};

export const adjustWallet = async (req: AuthRequest, res: Response) => {
  try {
    const actor = actorOf(req);
    const { userId } = req.params;
    if (userId === actor.id) throw new WalletError('INVALID_ADJUSTMENT', 'You cannot adjust your own wallet.', 403);
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!target) throw new WalletError('ORDER_NOT_FOUND', 'User not found.', 404);
    const { entry, replayed } = await adminAdjust({
      userId,
      amount: req.body.amount,
      reason: req.body.reason,
      actorId: actor.id,
      actorRole: actor.role,
      idempotencyKey: req.body.clientRequestId,
    });
    if (!replayed) {
      audit({ event: 'wallet.adjusted', userId: actor.id, resource: 'Wallet', resourceId: userId, meta: { amount: req.body.amount, reason: req.body.reason, transactionId: entry.id } });
    }
    res.status(replayed ? 200 : 201).json({ success: true, data: { transaction: entry, replayed } });
  } catch (error) {
    sendWalletError(res, error, 'adjust wallet', requestIdOf(req));
  }
};

export const setWalletState = async (req: AuthRequest, res: Response) => {
  try {
    const actor = actorOf(req);
    const { userId } = req.params;
    if (userId === actor.id) throw new WalletError('INVALID_ADJUSTMENT', 'You cannot change your own wallet status.', 403);
    const wallet = await setWalletStatus(userId, req.body.status);
    audit({ event: 'wallet.status_changed', userId: actor.id, resource: 'Wallet', resourceId: userId, meta: { status: req.body.status, reason: req.body.reason } });
    res.json({ success: true, data: { status: wallet.status } });
  } catch (error) {
    sendWalletError(res, error, 'set wallet status', requestIdOf(req));
  }
};

// ─── Session refunds ───────────────────────────────────────────────────────────

export const refundBooking = async (req: AuthRequest, res: Response) => {
  try {
    const scope = await scopeUserIds(req);
    const actor = actorOf(req);
    const booking = await prisma.bookingRequest.findUnique({ where: { id: req.params.id } });
    if (!booking || (scope && !scope.includes(booking.clientId) && !scope.includes(booking.advisorId))) {
      throw new WalletError('BOOKING_NOT_FOUND', 'Booking not found.', 404);
    }
    if (booking.clientId === actor.id || booking.advisorId === actor.id) {
      throw new WalletError('NOT_REFUNDABLE', 'You cannot refund a session you took part in. Ask another administrator.', 403);
    }
    if (booking.paymentStatus !== 'PAID') throw new WalletError('NOT_REFUNDABLE', 'Only a paid session can be refunded.', 409);
    const { percent, reason } = req.body as { percent: number; reason: string };
    const result = booking.earningsReleasedAt
      ? await adminRefundCompletedSession(booking.id, actor, percent, reason)
      : (await cancelBookingWithRefund(booking.id, { actor: 'admin', actorId: actor.id, reason, refundPercent: percent })).booking;
    res.json({ success: true, data: { booking: { id: result.id, status: result.status, paymentStatus: result.paymentStatus, refundedAt: result.refundedAt } } });
  } catch (error) {
    if (error instanceof WalletError && error.code === 'INSUFFICIENT_COINS') {
      return sendWalletError(res, new WalletError('ADVISOR_BALANCE_INSUFFICIENT', 'The advisor has already spent these earnings. Record a wallet adjustment instead.', 409), 'refund booking');
    }
    return sendWalletError(res, error, 'refund booking', requestIdOf(req));
  }
};

// ─── Packages ──────────────────────────────────────────────────────────────────

export const listAllPackages = async (req: AuthRequest, res: Response) => {
  try {
    const packages = await prisma.coinPackage.findMany({ orderBy: [{ sortOrder: 'asc' }, { coins: 'asc' }] });
    res.json({ success: true, data: { items: packages } });
  } catch (error) {
    sendWalletError(res, error, 'list packages', requestIdOf(req));
  }
};

/**
 * A package must be worth what it costs, give or take a bonus: base coins at
 * most the price at face value (1 coin = ₹1 by default), and coins + bonus at
 * most 1.5× that. Without bounds a typo — 100,000 coins for ₹1 — went on sale.
 */
const MAX_PACKAGE_VALUE_RATIO = 1.5;
const packageValueProblem = (pkg: { coins: number; bonusCoins: number; priceMinor: number }): string | null => {
  const faceCoins = Math.floor(pkg.priceMinor / walletConfig.coinValueMinor);
  if (pkg.coins > faceCoins) {
    return `Base coins (${pkg.coins}) exceed what the price buys (${faceCoins} coins). Put extras in bonus coins.`;
  }
  const maxTotal = Math.floor(faceCoins * MAX_PACKAGE_VALUE_RATIO);
  if (pkg.coins + pkg.bonusCoins > maxTotal) {
    return `Coins plus bonus (${pkg.coins + pkg.bonusCoins}) can be at most ${maxTotal} for this price.`;
  }
  return null;
};

export const createPackage = async (req: AuthRequest, res: Response) => {
  try {
    const problem = packageValueProblem({ coins: req.body.coins, bonusCoins: req.body.bonusCoins ?? 0, priceMinor: req.body.priceMinor });
    if (problem) return res.status(400).json({ success: false, error: problem, code: 'PACKAGE_VALUE_OUT_OF_RANGE' });
    const created = await prisma.coinPackage.create({ data: req.body });
    audit({ event: 'finance.package_changed', userId: getUserId(req), resource: 'CoinPackage', resourceId: created.id, meta: { action: 'create', ...req.body } });
    res.status(201).json({ success: true, data: created });
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2002') return res.status(409).json({ success: false, error: 'A package with this code already exists.', code: 'DUPLICATE_PACKAGE' });
    return sendWalletError(res, error, 'create package', requestIdOf(req));
  }
};

export const updatePackage = async (req: AuthRequest, res: Response) => {
  try {
    // Existing orders snapshot price and coins, so an edit never changes a purchase in flight.
    if (['coins', 'bonusCoins', 'priceMinor'].some((key) => key in req.body)) {
      const current = await prisma.coinPackage.findUnique({ where: { id: req.params.id }, select: { coins: true, bonusCoins: true, priceMinor: true } });
      if (!current) return res.status(404).json({ success: false, error: 'Package not found.', code: 'NOT_FOUND' });
      const problem = packageValueProblem({ ...current, ...req.body });
      if (problem) return res.status(400).json({ success: false, error: problem, code: 'PACKAGE_VALUE_OUT_OF_RANGE' });
    }
    const updated = await prisma.coinPackage.update({ where: { id: req.params.id }, data: req.body });
    audit({ event: 'finance.package_changed', userId: getUserId(req), resource: 'CoinPackage', resourceId: updated.id, meta: { action: 'update', ...req.body } });
    res.json({ success: true, data: updated });
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2025') return res.status(404).json({ success: false, error: 'Package not found.', code: 'NOT_FOUND' });
    return sendWalletError(res, error, 'update package', requestIdOf(req));
  }
};

export const getProviders = async (_req: AuthRequest, res: Response) => {
  res.json({ success: true, data: { items: providerStatuses() } });
};

// ─── Webhook & security events ────────────────────────────────────────────────

export const listWebhookEvents = async (req: AuthRequest, res: Response) => {
  try {
    const q = req.query as Record<string, string | undefined>;
    const limit = Math.min(Math.max(Number(q.limit) || 25, 1), 100);
    const events = await prisma.paymentWebhookEvent.findMany({
      where: { ...(q.status ? { status: q.status } : {}), ...(q.provider ? { provider: q.provider } : {}) },
      orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      select: { id: true, provider: true, eventId: true, eventType: true, signatureValid: true, status: true, error: true, paymentOrderId: true, receivedAt: true, processedAt: true },
    });
    const hasMore = events.length > limit;
    const items = hasMore ? events.slice(0, limit) : events;
    res.json({ success: true, data: { items, nextCursor: hasMore ? items[items.length - 1].id : null } });
  } catch (error) {
    sendWalletError(res, error, 'list webhook events', requestIdOf(req));
  }
};

const SECURITY_ACTIONS = [
  'auth.login_failed', 'authz.denied', 'security.rate_limit_hit', 'security.idor_attempt', 'security.invalid_file',
  'security.webhook_invalid_signature', 'security.payment_signature_invalid', 'security.payment_amount_mismatch',
  'security.refund_unrecovered', 'security.payment_id_reused', 'otp.invalid', 'otp.max_attempts', 'kyc.document_view_denied', 'session.access_denied',
  'wallet.adjusted', 'wallet.status_changed', 'staff.permissions_changed', 'staff.assignment_changed', 'admin.user_role_update',
];

export const listSecurityEvents = async (req: AuthRequest, res: Response) => {
  try {
    const q = req.query as Record<string, string | undefined>;
    const limit = Math.min(Math.max(Number(q.limit) || 25, 1), 100);
    const actions = q.action && SECURITY_ACTIONS.includes(q.action) ? [q.action] : SECURITY_ACTIONS;
    const rows = await prisma.auditLog.findMany({
      where: {
        action: { in: actions },
        ...(q.userId ? { userId: q.userId } : {}),
        ...(dateRange(q.from, q.to) ? { createdAt: dateRange(q.from, q.to) } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      select: { id: true, userId: true, actorRole: true, action: true, resource: true, status: true, ip: true, requestId: true, details: true, createdAt: true },
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    res.json({ success: true, data: { items, nextCursor: hasMore ? items[items.length - 1].id : null, actions: SECURITY_ACTIONS } });
  } catch (error) {
    sendWalletError(res, error, 'list security events', requestIdOf(req));
  }
};

// ─── Staff authority (admin only) ─────────────────────────────────────────────

export const listStaff = async (req: AuthRequest, res: Response) => {
  try {
    const managers = await prisma.user.findMany({
      where: { role: 'manager' },
      select: {
        id: true, name: true, email: true, status: true,
        permissionGrants: { select: { permission: true } },
        managedAssignments: { select: { subjectUserId: true, createdAt: true } },
      },
      orderBy: { name: 'asc' },
    });
    const subjects = await usersById(managers.flatMap((m) => m.managedAssignments.map((a) => a.subjectUserId)));
    res.json({
      success: true,
      data: {
        grantable: GRANTABLE_TO_MANAGER,
        managers: managers.map((m) => ({
          id: m.id,
          name: m.name,
          email: m.email,
          status: m.status,
          permissions: m.permissionGrants.map((g) => g.permission),
          assignments: m.managedAssignments.map((a) => ({ ...subjects.get(a.subjectUserId), assignedAt: a.createdAt })),
        })),
      },
    });
  } catch (error) {
    sendWalletError(res, error, 'list staff', requestIdOf(req));
  }
};

export const setStaffPermissions = async (req: AuthRequest, res: Response) => {
  try {
    const { managerId } = req.params;
    const manager = await prisma.user.findUnique({ where: { id: managerId }, select: { role: true } });
    if (!manager || manager.role !== 'manager') return res.status(404).json({ success: false, error: 'Manager not found.', code: 'NOT_FOUND' });
    const requested: string[] = req.body.permissions;
    const invalid = requested.filter((p) => !isPermission(p) || !GRANTABLE_TO_MANAGER.includes(p as Permission));
    if (invalid.length) return res.status(400).json({ success: false, error: `These permissions cannot be granted to a manager: ${invalid.join(', ')}`, code: 'INVALID_PERMISSION' });
    const unique = [...new Set(requested)] as Permission[];
    const adminId = getUserId(req);
    await prisma.$transaction(async (tx) => {
      await tx.staffPermissionGrant.deleteMany({ where: { userId: managerId, permission: { notIn: unique } } });
      for (const permission of unique) {
        await tx.staffPermissionGrant.upsert({
          where: { userId_permission: { userId: managerId, permission } },
          create: { userId: managerId, permission, grantedBy: adminId },
          update: {},
        });
      }
    });
    invalidatePermissionCache(managerId);
    invalidateUserSnapshotCache(managerId);
    audit({ event: 'staff.permissions_changed', userId: adminId, resource: 'User', resourceId: managerId, meta: { permissions: unique } });
    res.json({ success: true, data: { permissions: unique } });
  } catch (error) {
    sendWalletError(res, error, 'set staff permissions', requestIdOf(req));
  }
};

export const addManagerAssignment = async (req: AuthRequest, res: Response) => {
  try {
    const { managerId } = req.params;
    const { subjectUserId } = req.body as { subjectUserId: string };
    const [manager, subject] = await Promise.all([
      prisma.user.findUnique({ where: { id: managerId }, select: { role: true } }),
      prisma.user.findUnique({ where: { id: subjectUserId }, select: { role: true } }),
    ]);
    if (!manager || manager.role !== 'manager') return res.status(404).json({ success: false, error: 'Manager not found.', code: 'NOT_FOUND' });
    if (!subject || !['user', 'advisor'].includes(subject.role)) {
      return res.status(400).json({ success: false, error: 'Only users and advisors can be assigned to a manager.', code: 'INVALID_ASSIGNMENT' });
    }
    const assignment = await prisma.managerAssignment.upsert({
      where: { managerId_subjectUserId: { managerId, subjectUserId } },
      create: { managerId, subjectUserId, assignedBy: getUserId(req) },
      update: {},
    });
    audit({ event: 'staff.assignment_changed', userId: getUserId(req), resource: 'User', resourceId: managerId, meta: { action: 'assign', subjectUserId } });
    res.status(201).json({ success: true, data: assignment });
  } catch (error) {
    sendWalletError(res, error, 'add assignment', requestIdOf(req));
  }
};

export const removeManagerAssignment = async (req: AuthRequest, res: Response) => {
  try {
    const { managerId, subjectUserId } = req.params;
    await prisma.managerAssignment.deleteMany({ where: { managerId, subjectUserId } });
    audit({ event: 'staff.assignment_changed', userId: getUserId(req), resource: 'User', resourceId: managerId, meta: { action: 'unassign', subjectUserId } });
    res.json({ success: true });
  } catch (error) {
    sendWalletError(res, error, 'remove assignment', requestIdOf(req));
  }
};

// ─── Withdrawals ───────────────────────────────────────────────────────────────

/**
 * Advisor withdrawal requests, newest first; `status=OPEN` is the work queue
 * (requested + approved). Only the masked payout label is listed — the full
 * account details are a separate, audited read.
 */
export const listWithdrawals = async (req: AuthRequest, res: Response) => {
  try {
    const q = req.query as Record<string, string | undefined>;
    const limit = Math.min(Math.max(Number(q.limit) || 25, 1), 100);
    const where: Prisma.WithdrawalRequestWhereInput = {
      ...(q.status === 'OPEN' ? { status: { in: ['REQUESTED', 'APPROVED'] } } : q.status ? { status: q.status } : {}),
      ...(q.userId ? { userId: q.userId } : {}),
    };
    const rows = await prisma.withdrawalRequest.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const userIds = [...new Set(items.map((r) => r.userId))];
    const [users, methods] = await Promise.all([
      usersById(userIds),
      prisma.payoutMethod.findMany({ where: { userId: { in: userIds } }, select: { userId: true, updatedAt: true } }),
    ]);
    const methodChangedAt = new Map(methods.map((m) => [m.userId, m.updatedAt]));
    res.json({
      success: true,
      data: {
        items: items.map((r) => ({
          ...toWithdrawalView(r),
          userId: r.userId,
          reviewedBy: r.reviewedBy,
          // A payout account changed shortly before a request is the classic
          // takeover pattern — shown so staff can check before paying.
          payoutMethodChangedAt: methodChangedAt.get(r.userId) ?? null,
          user: users.get(r.userId) ?? { id: r.userId, name: 'Deleted account', email: '', role: '' },
        })),
        nextCursor: hasMore ? items[items.length - 1].id : null,
      },
    });
  } catch (error) {
    sendWalletError(res, error, 'list withdrawals', requestIdOf(req));
  }
};

/** The full UPI ID / bank account for paying one request. Every read is audited. */
export const revealWithdrawalPayoutDetails = async (req: AuthRequest, res: Response) => {
  try {
    const row = await prisma.withdrawalRequest.findUnique({ where: { id: req.params.id } });
    if (!row) throw new WalletError('WITHDRAWAL_NOT_FOUND', 'Withdrawal not found.', 404);
    const details = decryptPayoutDetails(row);
    audit({ event: 'wallet.payout_details_viewed', userId: getUserId(req), resource: 'WithdrawalRequest', resourceId: row.id, meta: { advisorId: row.userId, status: row.status } });
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, data: { details } });
  } catch (error) {
    sendWalletError(res, error, 'reveal payout details', requestIdOf(req));
  }
};

export const approveWithdrawalRequest = async (req: AuthRequest, res: Response) => {
  try {
    const request = await approveWithdrawal(req.params.id, actorOf(req));
    res.json({ success: true, data: { withdrawal: toWithdrawalView(request) } });
  } catch (error) {
    sendWalletError(res, error, 'approve withdrawal', requestIdOf(req));
  }
};

export const markWithdrawalRequestPaid = async (req: AuthRequest, res: Response) => {
  try {
    const request = await markWithdrawalPaid(req.params.id, actorOf(req), req.body.payoutReference, req.body.note);
    res.json({ success: true, data: { withdrawal: toWithdrawalView(request) } });
  } catch (error) {
    sendWalletError(res, error, 'mark withdrawal paid', requestIdOf(req));
  }
};

export const rejectWithdrawalRequest = async (req: AuthRequest, res: Response) => {
  try {
    const request = await rejectWithdrawal(req.params.id, actorOf(req), req.body.reason);
    res.json({ success: true, data: { withdrawal: toWithdrawalView(request) } });
  } catch (error) {
    sendWalletError(res, error, 'reject withdrawal', requestIdOf(req));
  }
};
