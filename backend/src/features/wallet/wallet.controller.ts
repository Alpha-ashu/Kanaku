import type { Response } from 'express';
import { prisma } from '../../db/prisma';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { purchaseProviders, getProvider } from '../payments/providers';
import { simulateSandboxPayment } from '../payments/providers/sandbox.provider';
import { DEFAULT_BOOKING_TIME_ZONE, zonedWallClockToInstant } from '../bookings/bookingTime';
import { WalletError } from './wallet.errors';
import { walletConfig } from './wallet.config';
import { getWalletSummary, pageLedger, toOwnerView } from './wallet.service';
import {
  cancelPurchase,
  confirmPurchaseFromCheckout,
  createPurchaseOrder,
  listActivePackages,
  reconcileOrder,
  toOrderView,
} from './coinPurchase.service';
import { requestIdOf, sendWalletError } from './wallet.http';

/**
 * The account holder's own wallet. Every handler resolves the wallet from the
 * authenticated user — no route takes a user id, so there is nothing to tamper
 * with to reach someone else's balance, ledger or orders.
 */

const LEDGER_TYPES = new Set([
  'PAYMENT_CREDIT', 'SESSION_PAYMENT', 'SESSION_EARNING', 'EARNING_RELEASE',
  'SESSION_REFUND', 'EARNING_REVERSAL', 'PURCHASE_REVERSAL', 'ADMIN_ADJUSTMENT',
  'WITHDRAWAL', 'WITHDRAWAL_REVERSAL',
]);

const providerOptions = () => purchaseProviders().map((p) => ({ id: p.id, displayName: p.displayName }));

export const getMyWallet = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const wallet = await getWalletSummary(userId);
    res.json({
      success: true,
      data: {
        availableBalance: wallet.availableBalance,
        pendingBalance: wallet.pendingBalance,
        status: wallet.status,
        coinValueMinor: walletConfig.coinValueMinor,
        currency: 'INR',
        purchasesEnabled: providerOptions().length > 0,
        serverNow: new Date().toISOString(),
      },
    });
  } catch (error) {
    sendWalletError(res, error, 'get wallet', requestIdOf(req));
  }
};

export const getMyTransactions = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const type = typeof req.query.type === 'string' && LEDGER_TYPES.has(req.query.type) ? req.query.type : undefined;
    const page = await pageLedger(
      { userId, ...(type ? { type } : {}) },
      { cursor: typeof req.query.cursor === 'string' ? req.query.cursor : null, limit: Number(req.query.limit) || 25 },
    );
    res.json({ success: true, data: { items: page.items.map(toOwnerView), nextCursor: page.nextCursor } });
  } catch (error) {
    sendWalletError(res, error, 'list transactions', requestIdOf(req));
  }
};

export const getPackages = async (req: AuthRequest, res: Response) => {
  try {
    const packages = await listActivePackages();
    res.json({
      success: true,
      data: {
        packages: packages.map((p) => ({
          id: p.id,
          code: p.code,
          name: p.name,
          coins: p.coins,
          bonusCoins: p.bonusCoins,
          totalCoins: p.coins + p.bonusCoins,
          priceMinor: p.priceMinor,
          currency: p.currency,
        })),
        providers: providerOptions(),
      },
    });
  } catch (error) {
    sendWalletError(res, error, 'list packages', requestIdOf(req));
  }
};

export const createPurchase = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const { packageId, provider, clientRequestId } = req.body as { packageId: string; provider?: string; clientRequestId: string };
    const result = await createPurchaseOrder({
      userId,
      packageId,
      providerId: provider,
      idempotencyKey: clientRequestId,
      customer: { name: req.user?.name, email: req.user?.email },
    });
    res.status(result.replayed ? 200 : 201).json({ success: true, data: { order: toOrderView(result.order), checkout: result.checkout } });
  } catch (error) {
    sendWalletError(res, error, 'create purchase', requestIdOf(req));
  }
};

export const listMyPurchases = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
    const cursor = typeof req.query.cursor === 'string' && req.query.cursor ? req.query.cursor : null;
    const orders = await prisma.paymentOrder.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = orders.length > limit;
    const items = (hasMore ? orders.slice(0, limit) : orders).map(toOrderView);
    res.json({ success: true, data: { items, nextCursor: hasMore ? items[items.length - 1].id : null } });
  } catch (error) {
    sendWalletError(res, error, 'list purchases', requestIdOf(req));
  }
};

/**
 * Poll a purchase. An order still waiting after 15 seconds is checked with the
 * provider right here, so "I paid but nothing happened" resolves on its own even
 * when the webhook is late and the checkout callback never arrived.
 */
export const getMyPurchase = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    let order = await prisma.paymentOrder.findFirst({ where: { id: req.params.id, userId } });
    if (!order) throw new WalletError('ORDER_NOT_FOUND', 'Order not found.', 404);
    const stale = !order.lastCheckedAt || Date.now() - order.lastCheckedAt.getTime() > 15_000;
    if (order.status === 'CREATED' && !order.creditedAt && stale && Date.now() - order.createdAt.getTime() > 15_000) {
      order = await reconcileOrder(order.id, 'reconcile').catch(() => order!);
    }
    const wallet = await getWalletSummary(userId);
    res.json({ success: true, data: { order: toOrderView(order), availableBalance: wallet.availableBalance } });
  } catch (error) {
    sendWalletError(res, error, 'get purchase', requestIdOf(req));
  }
};

export const verifyPurchase = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const order = await confirmPurchaseFromCheckout(userId, req.params.id, req.body.payload ?? {});
    const wallet = await getWalletSummary(userId);
    const ledger = order.creditedAt
      ? await prisma.walletTransaction.findUnique({ where: { reference: `purchase:${order.id}` }, select: { id: true } })
      : null;
    res.json({
      success: true,
      data: { order: toOrderView(order), transactionId: ledger?.id ?? null, availableBalance: wallet.availableBalance },
    });
  } catch (error) {
    sendWalletError(res, error, 'verify purchase', requestIdOf(req));
  }
};

export const cancelMyPurchase = async (req: AuthRequest, res: Response) => {
  try {
    const order = await cancelPurchase(getUserId(req), req.params.id);
    res.json({ success: true, data: { order: toOrderView(order) } });
  } catch (error) {
    sendWalletError(res, error, 'cancel purchase', requestIdOf(req));
  }
};

/**
 * DEVELOPMENT ONLY — plays the payment gateway's part for a sandbox order and
 * returns what a real checkout hands the browser. The browser must still post
 * that to /verify, exactly as with Razorpay. Not routed in production.
 */
export const sandboxPay = async (req: AuthRequest, res: Response) => {
  try {
    if (process.env.NODE_ENV === 'production' || !getProvider('sandbox')) {
      return res.status(404).json({ success: false, error: 'Not found' });
    }
    const order = await prisma.paymentOrder.findFirst({ where: { id: req.params.id, userId: getUserId(req), provider: 'sandbox' } });
    if (!order?.providerOrderId) throw new WalletError('ORDER_NOT_FOUND', 'Order not found.', 404);
    const result = simulateSandboxPayment(order.providerOrderId, req.body.outcome ?? 'paid');
    if (!result) throw new WalletError('ORDER_NOT_FOUND', 'Order not found.', 404);
    return res.json({ success: true, data: { payload: result } });
  } catch (error) {
    return sendWalletError(res, error, 'sandbox pay', requestIdOf(req));
  }
};

// ─── Advisor earnings ─────────────────────────────────────────────────────────

/** Midnight (in the app's zone) that starts today, this ISO week and this month. */
const periodStarts = (now: Date) => {
  const zone = DEFAULT_BOOKING_TIME_ZONE;
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const [y, m, d] = [Number(get('year')), Number(get('month')), Number(get('day'))];
  const daysSinceMonday = Math.max(0, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(get('weekday')));
  const ymd = (utcMs: number) => new Date(utcMs).toISOString().slice(0, 10);
  const midnight = (date: string) => zonedWallClockToInstant(date, '00:00', zone) ?? now;
  return {
    today: midnight(ymd(Date.UTC(y, m - 1, d))),
    week: midnight(ymd(Date.UTC(y, m - 1, d - daysSinceMonday))),
    month: midnight(ymd(Date.UTC(y, m - 1, 1))),
  };
};

const EARNED_WHERE = (advisorId: string) => ({
  userId: advisorId,
  bucket: 'AVAILABLE',
  type: { in: ['EARNING_RELEASE', 'EARNING_REVERSAL'] },
});

export const getMyEarnings = async (req: AuthRequest, res: Response) => {
  try {
    const advisorId = getUserId(req);
    const now = new Date();
    const periods = periodStarts(now);
    const sum = async (since?: Date) => (await prisma.walletTransaction.aggregate({
      where: { ...EARNED_WHERE(advisorId), ...(since ? { createdAt: { gte: since } } : {}) },
      _sum: { amount: true },
    }))._sum.amount ?? 0;

    const [wallet, total, today, week, month, completedSessions, upcomingPaid, recent] = await Promise.all([
      getWalletSummary(advisorId),
      sum(),
      sum(periods.today),
      sum(periods.week),
      sum(periods.month),
      prisma.bookingRequest.count({ where: { advisorId, status: 'completed' } }),
      prisma.bookingRequest.count({ where: { advisorId, status: 'accepted', paymentStatus: 'PAID' } }),
      prisma.walletTransaction.findMany({
        where: { userId: advisorId, type: { in: ['SESSION_EARNING', 'EARNING_RELEASE', 'EARNING_REVERSAL'] } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 10,
      }),
    ]);

    res.json({
      success: true,
      data: {
        availableBalance: wallet.availableBalance,
        pendingBalance: wallet.pendingBalance,
        earned: { total, today, week, month },
        completedSessions,
        upcomingPaidSessions: upcomingPaid,
        recent: recent.map(toOwnerView),
        serverNow: now.toISOString(),
      },
    });
  } catch (error) {
    sendWalletError(res, error, 'get earnings', requestIdOf(req));
  }
};
