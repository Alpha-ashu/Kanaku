import { prisma } from '../../db/prisma';
import { Prisma } from '../../db/prisma-client';
import { logger } from '../../config/logger';
import { audit } from '../../utils/auditLogger';
import { notify } from '../notifications/notify';
import { getProvider, defaultPurchaseProvider, purchaseProviders, type PaymentProvider } from '../payments/providers';
import { apiPublicBase, purchaseReturnUrl } from '../payments/providers/redirectCheckout';
import { createHash } from 'crypto';
import { WalletError } from './wallet.errors';
import { walletConfig } from './wallet.config';
import { LEDGER_TX_OPTIONS, findEntry, lockKey, lockWallets, postEntry, setWalletStatus } from './wallet.service';

/**
 * Buying coins.
 *
 *   1. createPurchaseOrder  — our PaymentOrder row, then the provider's order.
 *   2. the user pays in the provider's checkout.
 *   3. confirmation arrives by any of three routes, each independently trusted:
 *        callback  — the browser relays the provider's signed result; we check
 *                    the signature AND ask the provider's API what was captured
 *        webhook   — the provider calls us, signed with the webhook secret
 *        reconcile — a worker (or an admin) asks the provider about stale orders
 *   4. creditPaidOrder — exactly once, whichever route gets there first.
 *
 * The page saying "payment successful" is never one of the routes. The order
 * row is locked while it is credited, and the ledger reference `purchase:<id>`
 * is unique, so a callback and a webhook racing each other credit once.
 */

type OrderRow = NonNullable<Awaited<ReturnType<typeof prisma.paymentOrder.findUnique>>>;

const MAX_OPEN_ORDERS_PER_HOUR = Number(process.env.WALLET_MAX_OPEN_ORDERS_PER_HOUR || 10);

const describe = (coins: number) => `${coins.toLocaleString('en-IN')} KANAKU coins`;

const checkoutFor = (provider: PaymentProvider, order: OrderRow, customer?: { name?: string | null; email?: string | null }) =>
  order.providerOrderId
    ? provider.checkoutFor({
      providerOrderId: order.providerOrderId,
      amountMinor: order.amountMinor,
      currency: order.currency,
      description: describe(order.coins),
      customer,
    })
    : null;

/** What the owner of an order may see of it. */
export const toOrderView = (order: OrderRow) => ({
  id: order.id,
  provider: order.provider,
  status: order.status,
  coins: order.coins,
  amountMinor: order.amountMinor,
  currency: order.currency,
  failureReason: order.failureReason,
  expiresAt: order.expiresAt,
  paidAt: order.paidAt,
  creditedAt: order.creditedAt,
  refundedAt: order.refundedAt,
  createdAt: order.createdAt,
});

export const listActivePackages = () =>
  prisma.coinPackage.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { coins: 'asc' }] });

export interface CreatePurchaseInput {
  userId: string;
  packageId: string;
  providerId?: string;
  idempotencyKey: string;
  customer?: { name?: string | null; email?: string | null };
}

export const createPurchaseOrder = async (input: CreatePurchaseInput) => {
  // A retried "Buy" (double tap, network retry) returns the order it already made.
  const replay = await prisma.paymentOrder.findUnique({
    where: { userId_idempotencyKey: { userId: input.userId, idempotencyKey: input.idempotencyKey } },
  });
  if (replay) {
    const provider = getProvider(replay.provider);
    return { order: replay, checkout: provider ? checkoutFor(provider, replay, input.customer) : null, replayed: true };
  }

  const pkg = await prisma.coinPackage.findUnique({ where: { id: input.packageId } });
  if (!pkg || !pkg.isActive) throw new WalletError('PACKAGE_UNAVAILABLE', 'This coin package is not available.', 404);

  const provider = input.providerId ? getProvider(input.providerId) : defaultPurchaseProvider();
  if (!provider || !provider.isConfigured() || !purchaseProviders().some((p) => p.id === provider.id)) {
    throw new WalletError('PROVIDER_UNAVAILABLE', 'Payments are not available right now. Please try again later.', 503);
  }

  const openOrders = await prisma.paymentOrder.count({
    where: { userId: input.userId, status: 'CREATED', createdAt: { gte: new Date(Date.now() - 60 * 60_000) } },
  });
  if (openOrders >= MAX_OPEN_ORDERS_PER_HOUR) {
    throw new WalletError('ORDER_NOT_PAYABLE', 'You have too many unfinished purchases. Please complete or wait for them to expire.', 429);
  }

  let order: OrderRow;
  try {
    order = await prisma.paymentOrder.create({
      data: {
        userId: input.userId,
        packageId: pkg.id,
        provider: provider.id,
        amountMinor: pkg.priceMinor,
        currency: pkg.currency,
        coins: pkg.coins + pkg.bonusCoins,
        status: 'CREATED',
        idempotencyKey: input.idempotencyKey,
        expiresAt: new Date(Date.now() + walletConfig.paymentOrderTtlMinutes * 60_000),
      },
    });
  } catch (error) {
    if ((error as { code?: string })?.code === 'P2002') return createPurchaseOrder(input); // concurrent retry won the insert
    throw error;
  }

  try {
    const apiBase = apiPublicBase();
    const created = await provider.createOrder({
      orderId: order.id,
      amountMinor: order.amountMinor,
      currency: order.currency,
      description: describe(order.coins),
      customer: input.customer,
      // Gateways that need a customer id get a stable hash, never the user id.
      customerRef: `k${createHash('sha256').update(`kanaku-customer:${input.userId}`).digest('hex').slice(0, 30)}`,
      // Redirect gateways send the browser back to the wallet page (PhonePe) or
      // post it to the API first (Paytm). Nothing is credited on the way back.
      returnUrl: purchaseReturnUrl(order.id) || undefined,
      callbackUrl: apiBase ? `${apiBase}/api/v1/payments/return/${provider.id}` : undefined,
    });
    order = await prisma.paymentOrder.update({ where: { id: order.id }, data: { providerOrderId: created.providerOrderId } });
    audit({ event: 'payment.order_created', userId: input.userId, resource: 'PaymentOrder', resourceId: order.id, meta: { provider: provider.id, amountMinor: order.amountMinor, coins: order.coins } });
    return { order, checkout: created.checkout, replayed: false };
  } catch (error) {
    logger.error('[wallet] provider order creation failed', { orderId: order.id, provider: provider.id, error });
    await prisma.paymentOrder.update({ where: { id: order.id }, data: { status: 'FAILED', failureReason: 'Payment provider unavailable' } });
    throw new WalletError('PROVIDER_UNAVAILABLE', 'The payment provider could not be reached. No money was taken — please try again.', 503);
  }
};

const lockOrder = (tx: Prisma.TransactionClient, orderId: string) =>
  tx.$queryRaw`SELECT "id" FROM "payment_orders" WHERE "id" = ${orderId} FOR UPDATE`;

/**
 * Credit a paid order exactly once. Safe to call from any confirmation route,
 * any number of times, concurrently.
 */
export const creditPaidOrder = async (
  orderId: string,
  confirmation: { providerPaymentId?: string; via: 'callback' | 'webhook' | 'reconcile' },
) => {
  const result = await prisma.$transaction(async (tx) => {
    await lockOrder(tx, orderId);
    const order = await tx.paymentOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new WalletError('ORDER_NOT_FOUND', 'Order not found.', 404);
    const reference = `purchase:${order.id}`;
    const existing = await findEntry(tx, reference);
    if (existing || order.creditedAt) return { order, entry: existing, credited: false };

    // One provider payment pays for one order. The same payment id reported for
    // a second order means a provider bug or a replayed confirmation: never
    // credit it twice — flag it for a human instead.
    const paymentId = confirmation.providerPaymentId ?? order.providerPaymentId;
    if (paymentId) {
      const clash = await tx.paymentOrder.findFirst({
        where: { provider: order.provider, providerPaymentId: paymentId, id: { not: order.id } },
        select: { id: true },
      });
      if (clash) {
        throw new WalletError('PAYMENT_ID_REUSED', 'This payment is already attached to another order.', 409, { orderId: order.id, otherOrderId: clash.id });
      }
    }

    // A cancelled/expired/failed order that the provider reports as captured is
    // still money we took — it is credited, never ignored.
    const updated = await tx.paymentOrder.update({
      where: { id: order.id },
      data: {
        status: 'PAID',
        paidAt: order.paidAt ?? new Date(),
        creditedAt: new Date(),
        providerPaymentId: confirmation.providerPaymentId ?? order.providerPaymentId,
        verifiedVia: confirmation.via,
        failureReason: null,
      },
    });
    await lockWallets(tx, [order.userId]);
    const entry = await postEntry(tx, {
      userId: order.userId,
      type: 'PAYMENT_CREDIT',
      amount: order.coins,
      reference,
      paymentOrderId: order.id,
      description: `Purchased ${describe(order.coins)}`,
      metadata: { provider: order.provider, amountMinor: order.amountMinor, currency: order.currency, via: confirmation.via },
    });
    return { order: updated, entry, credited: true };
  }, LEDGER_TX_OPTIONS);

  if (result.credited) {
    audit({ event: 'payment.credited', userId: result.order.userId, resource: 'PaymentOrder', resourceId: orderId, meta: { coins: result.order.coins, via: confirmation.via } });
    void notify({
      userId: result.order.userId,
      topic: 'wallet',
      type: 'wallet_coins_credited',
      title: 'Coins added to your wallet',
      message: `Payment successful — ${describe(result.order.coins)} were added to your wallet.`,
      deepLink: '/wallet',
      priority: 'high',
      dedupKey: `wallet_credit:${orderId}`,
      metadata: { paymentOrderId: orderId, coins: result.order.coins, transactionId: result.entry?.id },
    });
  }
  return result;
};

const markOrder = async (orderId: string, status: 'FAILED' | 'EXPIRED' | 'CANCELLED', reason: string) => {
  // Only an order still waiting can move to a terminal non-paid state.
  await prisma.paymentOrder.updateMany({
    where: { id: orderId, status: 'CREATED' },
    data: { status, failureReason: reason, lastCheckedAt: new Date() },
  });
};

/**
 * Ask the provider what happened and settle accordingly. Returns the order as
 * it now stands. Never trusts anything the client sent.
 */
export const reconcileOrder = async (orderId: string, via: 'callback' | 'reconcile' = 'reconcile') => {
  const order = await prisma.paymentOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new WalletError('ORDER_NOT_FOUND', 'Order not found.', 404);
  if (order.creditedAt || order.status === 'REFUNDED') return order;
  const provider = getProvider(order.provider);
  if (!provider || !order.providerOrderId) return order;

  const status = await provider.fetchOrderStatus(order.providerOrderId);
  if (status.status === 'paid') {
    if (status.amountMinor !== undefined && (status.amountMinor !== order.amountMinor
      || (status.currency && status.currency.toUpperCase() !== order.currency.toUpperCase()))) {
      // Never credit a different amount than was ordered. Money was captured,
      // so this needs a human: flag it loudly and leave the order open.
      logger.error('[wallet] captured amount does not match order', { orderId, expected: order.amountMinor, captured: status.amountMinor });
      audit({ event: 'security.payment_amount_mismatch', userId: order.userId, resource: 'PaymentOrder', resourceId: orderId, meta: { expected: order.amountMinor, captured: status.amountMinor } });
      await prisma.paymentOrder.update({ where: { id: orderId }, data: { failureReason: 'AMOUNT_MISMATCH — needs review', lastCheckedAt: new Date() } });
      return prisma.paymentOrder.findUniqueOrThrow({ where: { id: orderId } });
    }
    await creditPaidOrder(orderId, { providerPaymentId: status.providerPaymentId, via });
  } else if (status.status === 'failed') {
    await markOrder(orderId, 'FAILED', status.failureReason || 'Payment failed');
  } else if (order.expiresAt.getTime() < Date.now()) {
    await markOrder(orderId, 'EXPIRED', 'Payment was not completed in time');
  } else {
    await prisma.paymentOrder.update({ where: { id: orderId }, data: { lastCheckedAt: new Date() } });
  }
  return prisma.paymentOrder.findUniqueOrThrow({ where: { id: orderId } });
};

/** The browser relays the provider's checkout result. Verified, then confirmed with the provider. */
export const confirmPurchaseFromCheckout = async (userId: string, orderId: string, payload: Record<string, unknown>) => {
  const order = await prisma.paymentOrder.findFirst({ where: { id: orderId, userId } });
  if (!order) throw new WalletError('ORDER_NOT_FOUND', 'Order not found.', 404);
  if (order.creditedAt) return order;
  const provider = getProvider(order.provider);
  if (!provider || !order.providerOrderId) throw new WalletError('PROVIDER_UNAVAILABLE', 'Payments are not available right now.', 503);

  // Redirect gateways return no signed result from the browser; "verify" can
  // only mean "ask the provider now" — which is all reconcileOrder does.
  if (provider.checkoutKind === 'redirect') return reconcileOrder(orderId, 'callback');

  const verification = provider.verifyCheckout(order.providerOrderId, payload);
  if (!verification.valid) {
    audit({ event: 'security.payment_signature_invalid', userId, resource: 'PaymentOrder', resourceId: orderId, meta: { provider: order.provider, route: 'checkout' } });
    throw new WalletError('PAYMENT_VERIFICATION_FAILED', 'We could not verify this payment. If money was taken, it will be credited automatically once the provider confirms it.', 400);
  }
  return reconcileOrder(orderId, 'callback');
};

export const cancelPurchase = async (userId: string, orderId: string) => {
  const order = await prisma.paymentOrder.findFirst({ where: { id: orderId, userId } });
  if (!order) throw new WalletError('ORDER_NOT_FOUND', 'Order not found.', 404);
  // Closing the checkout does not prove nothing was paid; a late capture still credits.
  await markOrder(orderId, 'CANCELLED', 'Checkout closed before payment');
  return prisma.paymentOrder.findUniqueOrThrow({ where: { id: orderId } });
};

// ─── Webhooks ──────────────────────────────────────────────────────────────────

export type WebhookOutcome = { httpStatus: number; body: Record<string, unknown> };

export const handleProviderWebhook = async (
  providerId: string,
  rawBody: Buffer,
  headers: Record<string, string | string[] | undefined>,
): Promise<WebhookOutcome> => {
  const provider = getProvider(providerId);
  if (!provider) return { httpStatus: 404, body: { error: 'Unknown payment provider' } };

  const parsed = provider.parseWebhook(rawBody, headers);

  let event = await prisma.paymentWebhookEvent.findUnique({
    where: { provider_eventId: { provider: provider.id, eventId: parsed.eventId } },
  });
  if (event && ['PROCESSED', 'IGNORED'].includes(event.status)) {
    // Redelivery of something already handled — acknowledge, do nothing.
    return { httpStatus: 200, body: { received: true, duplicate: true } };
  }
  if (event && event.status === 'REJECTED') {
    // The id is known from a delivery whose signature FAILED. Anyone can post
    // that — including someone who guessed the id of a real payment to get its
    // genuine notification dropped as a "duplicate". A forged repeat is refused
    // again; a correctly signed delivery is processed on the same row.
    if (!parsed.valid) return { httpStatus: 401, body: { error: 'Invalid signature' } };
    event = await prisma.paymentWebhookEvent.update({
      where: { id: event.id },
      data: {
        status: 'RECEIVED',
        signatureValid: true,
        eventType: parsed.eventType,
        payload: parsed.sanitizedPayload as Prisma.InputJsonValue,
        error: null,
        processedAt: null,
      },
    });
  }
  if (!event) {
    try {
      event = await prisma.paymentWebhookEvent.create({
        data: {
          provider: provider.id,
          eventId: parsed.eventId,
          eventType: parsed.eventType,
          signatureValid: parsed.valid,
          payload: parsed.sanitizedPayload as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2002') return { httpStatus: 200, body: { received: true, duplicate: true } };
      throw error;
    }
  }

  const finish = (status: 'PROCESSED' | 'IGNORED' | 'REJECTED' | 'FAILED', extra: { error?: string; paymentOrderId?: string } = {}) =>
    prisma.paymentWebhookEvent.update({
      where: { id: event!.id },
      data: { status, processedAt: new Date(), error: extra.error ?? null, paymentOrderId: extra.paymentOrderId ?? undefined },
    });

  if (!parsed.valid) {
    await finish('REJECTED', { error: 'Invalid signature' });
    audit({ event: 'security.webhook_invalid_signature', resource: 'PaymentWebhookEvent', resourceId: event.id, meta: { provider: provider.id, eventType: parsed.eventType } });
    return { httpStatus: 401, body: { error: 'Invalid signature' } };
  }

  const order = parsed.providerOrderId
    ? await prisma.paymentOrder.findUnique({ where: { provider_providerOrderId: { provider: provider.id, providerOrderId: parsed.providerOrderId } } })
    : null;
  if (!order || parsed.outcome === 'ignored') {
    await finish('IGNORED', { paymentOrderId: order?.id });
    return { httpStatus: 200, body: { received: true } };
  }

  try {
    if (parsed.outcome === 'paid') {
      if (parsed.amountMinor !== undefined && parsed.amountMinor !== order.amountMinor) {
        // Same rule as reconcile: a mismatched amount is never credited automatically.
        await prisma.paymentOrder.update({ where: { id: order.id }, data: { failureReason: 'AMOUNT_MISMATCH — needs review' } });
        audit({ event: 'security.payment_amount_mismatch', userId: order.userId, resource: 'PaymentOrder', resourceId: order.id, meta: { expected: order.amountMinor, captured: parsed.amountMinor, route: 'webhook' } });
        await finish('FAILED', { error: 'Amount mismatch', paymentOrderId: order.id });
        return { httpStatus: 200, body: { received: true } };
      }
      await creditPaidOrder(order.id, { providerPaymentId: parsed.providerPaymentId, via: 'webhook' });
    } else if (parsed.outcome === 'failed') {
      await markOrder(order.id, 'FAILED', parsed.failureReason || 'Payment failed');
    } else if (parsed.outcome === 'refunded') {
      await recordProviderSideRefund(order.id);
    }
    await finish('PROCESSED', { paymentOrderId: order.id });
    return { httpStatus: 200, body: { received: true } };
  } catch (error) {
    if (error instanceof WalletError && error.code === 'PAYMENT_ID_REUSED') {
      // Not retryable: acknowledge so the provider stops redelivering, and flag it.
      await prisma.paymentOrder.update({ where: { id: order.id }, data: { failureReason: 'PAYMENT_ID_REUSED — needs review' } }).catch(() => undefined);
      audit({ event: 'security.payment_id_reused', userId: order.userId, resource: 'PaymentOrder', resourceId: order.id, meta: { ...error.details } });
      await finish('FAILED', { error: 'Payment id already used by another order', paymentOrderId: order.id });
      return { httpStatus: 200, body: { received: true } };
    }
    logger.error('[wallet] webhook processing failed', { provider: provider.id, eventId: parsed.eventId, error });
    await finish('FAILED', { error: 'Processing failed', paymentOrderId: order.id }).catch(() => undefined);
    // 5xx so the provider redelivers; the FAILED row lets the redelivery retry.
    return { httpStatus: 500, body: { error: 'Processing failed' } };
  }
};

// ─── Refunds of purchases (money back to the customer) ───────────────────────

/**
 * A refund made at the provider without going through us (e.g. from the
 * Razorpay dashboard). The coins must come back out of the wallet; if they have
 * already been spent, the wallet is frozen and the case flagged for a human.
 */
const recordProviderSideRefund = async (orderId: string) => {
  const order = await prisma.paymentOrder.findUnique({ where: { id: orderId } });
  if (!order || !order.creditedAt) return;
  const reference = `purchase:${order.id}:reversal`;
  try {
    await prisma.$transaction(async (tx) => {
      await lockKey(tx, `ledger:${reference}`);
      if (await findEntry(tx, reference)) return;
      await lockWallets(tx, [order.userId]);
      await postEntry(tx, {
        userId: order.userId,
        type: 'PURCHASE_REVERSAL',
        amount: -order.coins,
        reference,
        paymentOrderId: order.id,
        description: 'Coins removed — purchase refunded',
      });
      await tx.paymentOrder.update({ where: { id: order.id }, data: { status: 'REFUNDED', refundedAt: new Date() } });
    }, LEDGER_TX_OPTIONS);
  } catch (error) {
    if (error instanceof WalletError && error.code === 'INSUFFICIENT_COINS') {
      await setWalletStatus(order.userId, 'FROZEN');
      await prisma.paymentOrder.update({ where: { id: order.id }, data: { status: 'REFUNDED', refundedAt: new Date(), refundReason: 'Refunded at provider; coins already spent — wallet frozen for review' } });
      audit({ event: 'security.refund_unrecovered', userId: order.userId, resource: 'PaymentOrder', resourceId: order.id, meta: { coins: order.coins } });
      return;
    }
    throw error;
  }
};

/** Admin-initiated refund of a coin purchase: coins out first, then money back. */
export const refundPurchase = async (orderId: string, actor: { id: string; role: string }, reason: string) => {
  const order = await prisma.paymentOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new WalletError('ORDER_NOT_FOUND', 'Order not found.', 404);
  if (order.status !== 'PAID' || !order.creditedAt || !order.providerPaymentId) {
    throw new WalletError('NOT_REFUNDABLE', 'Only a paid, credited order can be refunded.', 409);
  }
  const provider = getProvider(order.provider);
  if (!provider || !provider.isConfigured()) throw new WalletError('PROVIDER_UNAVAILABLE', 'The payment provider is not available.', 503);

  const reference = `purchase:${order.id}:reversal`;
  // 1. Take the coins back. If the user has spent them this fails and no money moves.
  const reversal = await prisma.$transaction(async (tx) => {
    await lockKey(tx, `ledger:${reference}`);
    const existing = await findEntry(tx, reference);
    if (existing) return { entry: existing, replayed: true };
    await lockWallets(tx, [order.userId]);
    const entry = await postEntry(tx, {
      userId: order.userId,
      type: 'PURCHASE_REVERSAL',
      amount: -order.coins,
      reference,
      paymentOrderId: order.id,
      description: 'Coins removed — purchase refunded',
      reason,
      actorId: actor.id,
      actorRole: actor.role,
    });
    return { entry, replayed: false };
  }, LEDGER_TX_OPTIONS);
  if (reversal.replayed) {
    return prisma.paymentOrder.findUniqueOrThrow({ where: { id: orderId } });
  }

  // 2. Return the money. If the provider refuses, put the coins back.
  try {
    const refund = await provider.refund(order.providerPaymentId, order.amountMinor, { paymentOrderId: order.id, reason: reason.slice(0, 200) });
    const updated = await prisma.paymentOrder.update({
      where: { id: order.id },
      data: { status: 'REFUNDED', refundedAt: new Date(), providerRefundId: refund.providerRefundId, refundReason: reason },
    });
    void notify({
      userId: order.userId,
      topic: 'wallet',
      type: 'wallet_purchase_refunded',
      title: 'Purchase refunded',
      message: `Your purchase of ${describe(order.coins)} was refunded to your original payment method.`,
      deepLink: '/wallet',
      dedupKey: `wallet_purchase_refund:${order.id}`,
    });
    return updated;
  } catch (error) {
    logger.error('[wallet] provider refund failed — restoring coins', { orderId, error });
    await prisma.$transaction(async (tx) => {
      const undoRef = `${reference}:undo`;
      await lockKey(tx, `ledger:${undoRef}`);
      if (await findEntry(tx, undoRef)) return;
      await lockWallets(tx, [order.userId]);
      await postEntry(tx, {
        userId: order.userId,
        type: 'PURCHASE_REVERSAL',
        amount: order.coins,
        reference: undoRef,
        paymentOrderId: order.id,
        reversalOfId: reversal.entry.id,
        description: 'Coins restored — refund could not be completed',
        actorId: actor.id,
        actorRole: actor.role,
      });
    }, LEDGER_TX_OPTIONS);
    throw new WalletError('PROVIDER_UNAVAILABLE', 'The provider did not accept the refund. The coins were restored; try again later.', 502);
  }
};

// ─── Background reconciliation ────────────────────────────────────────────────

/**
 * Orders nobody has heard back about: the user closed the tab, the webhook was
 * lost, or the server slept through it. Ask the provider. Expired orders are
 * still checked for a day, because a capture can land after our expiry.
 */
export const reconcileStaleOrders = async (now = new Date(), limit = 25) => {
  const stale = await prisma.paymentOrder.findMany({
    where: {
      creditedAt: null,
      providerOrderId: { not: null },
      OR: [
        { status: 'CREATED', createdAt: { lt: new Date(now.getTime() - 2 * 60_000) } },
        { status: { in: ['EXPIRED', 'CANCELLED'] }, createdAt: { gt: new Date(now.getTime() - 24 * 60 * 60_000) } },
      ],
      AND: [{ OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: new Date(now.getTime() - 5 * 60_000) } }] }],
    },
    // Never-checked orders first, then the longest-unchecked. Oldest-first let a
    // backlog of expired orders (re-checked for a day) fill every batch, so a
    // freshly abandoned order could wait indefinitely behind them.
    orderBy: [{ lastCheckedAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }],
    take: limit,
    select: { id: true },
  });
  let settled = 0;
  for (const { id } of stale) {
    try {
      const after = await reconcileOrder(id, 'reconcile');
      if (after.creditedAt) settled += 1;
      else await prisma.paymentOrder.update({ where: { id }, data: { lastCheckedAt: now } });
    } catch (error) {
      logger.warn('[wallet] reconcile failed', { orderId: id, error });
    }
  }
  return { checked: stale.length, settled };
};
