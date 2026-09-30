import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import type {
  CheckoutInput,
  CheckoutVerification,
  CreateOrderInput,
  CreateOrderResult,
  OrderStatusResult,
  ParsedWebhook,
  PaymentProvider,
  RefundResult,
} from './types';

/**
 * A stand-in payment gateway for development, CI and demos. NEVER available in
 * production — the registry refuses to expose it when NODE_ENV=production.
 *
 * It behaves like a real provider from the application's point of view: it
 * keeps its own record of each order (in memory), "completes" a payment only
 * through `simulateSandboxPayment` (the gateway's side of the transaction), and
 * signs the checkout result and its webhooks with a secret the client never
 * holds. So the wallet code path exercised against the sandbox is exactly the
 * one a real gateway uses: verify signature → ask provider → credit.
 */

interface SandboxOrder {
  amountMinor: number;
  currency: string;
  status: 'created' | 'paid' | 'failed' | 'refunded';
  paymentId?: string;
  failureReason?: string;
}

const orders = new Map<string, SandboxOrder>();
const secret = process.env.SANDBOX_PAYMENT_SECRET || randomBytes(32).toString('hex');

const sign = (data: string | Buffer) => createHmac('sha256', secret).update(data).digest('hex');
const safeEqual = (a: string, b: string) => {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
};

/**
 * The gateway's side of a payment: marks the order paid (or failed) and returns
 * what a real checkout would hand the browser — a payment id and a signature.
 */
export const simulateSandboxPayment = (providerOrderId: string, outcome: 'paid' | 'failed') => {
  const order = orders.get(providerOrderId);
  if (!order) return null;
  if (outcome === 'failed') {
    order.status = 'failed';
    order.failureReason = 'Sandbox payment declined';
    return { sandbox_order_id: providerOrderId };
  }
  order.status = 'paid';
  order.paymentId = order.paymentId ?? `sbx_pay_${randomUUID()}`;
  return {
    sandbox_order_id: providerOrderId,
    sandbox_payment_id: order.paymentId,
    sandbox_signature: sign(`${providerOrderId}|${order.paymentId}`),
  };
};

/** Test helper: sign a webhook body the way the sandbox gateway would. */
export const signSandboxWebhook = (rawBody: string | Buffer) => sign(rawBody);

export const sandboxProvider: PaymentProvider = {
  id: 'sandbox',
  displayName: 'Sandbox (test payments — no real money)',

  isConfigured() {
    return process.env.NODE_ENV !== 'production';
  },

  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    const providerOrderId = `sbx_order_${randomUUID()}`;
    orders.set(providerOrderId, { amountMinor: input.amountMinor, currency: input.currency, status: 'created' });
    return {
      providerOrderId,
      checkout: sandboxProvider.checkoutFor({ providerOrderId, amountMinor: input.amountMinor, currency: input.currency, description: input.description }),
    };
  },

  checkoutFor(input: CheckoutInput) {
    return { provider: 'sandbox', orderId: input.providerOrderId, amount: input.amountMinor, currency: input.currency, description: input.description };
  },

  verifyCheckout(providerOrderId: string, payload: Record<string, unknown>): CheckoutVerification {
    const paymentId = typeof payload.sandbox_payment_id === 'string' ? payload.sandbox_payment_id : '';
    const signature = typeof payload.sandbox_signature === 'string' ? payload.sandbox_signature : '';
    if (!paymentId || !signature) return { valid: false };
    return safeEqual(signature, sign(`${providerOrderId}|${paymentId}`)) ? { valid: true, providerPaymentId: paymentId } : { valid: false };
  },

  async fetchOrderStatus(providerOrderId: string): Promise<OrderStatusResult> {
    const order = orders.get(providerOrderId);
    if (!order) return { status: 'pending' };
    if (order.status === 'paid' || order.status === 'refunded') {
      return { status: 'paid', providerPaymentId: order.paymentId, amountMinor: order.amountMinor, currency: order.currency };
    }
    if (order.status === 'failed') return { status: 'failed', failureReason: order.failureReason };
    return { status: 'pending' };
  },

  parseWebhook(rawBody: Buffer, headers): ParsedWebhook {
    const raw = headers['x-sandbox-signature'];
    const signature = (Array.isArray(raw) ? raw[0] : raw) || '';
    const valid = Boolean(signature) && safeEqual(signature, sign(rawBody));
    let body: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(rawBody.toString('utf8'));
      if (parsed && typeof parsed === 'object') body = parsed as Record<string, unknown>;
    } catch {
      // unparseable body: treated as an unknown event below
    }
    const eventType = typeof body.event === 'string' ? body.event : 'unknown';
    const outcome: ParsedWebhook['outcome'] = eventType === 'payment.paid' ? 'paid' : eventType === 'payment.failed' ? 'failed' : 'ignored';
    return {
      valid,
      eventId: typeof body.id === 'string' ? body.id : `sandbox:${eventType}:${String(body.orderId ?? 'none')}`,
      eventType,
      providerOrderId: typeof body.orderId === 'string' ? body.orderId : undefined,
      providerPaymentId: typeof body.paymentId === 'string' ? body.paymentId : undefined,
      outcome,
      amountMinor: typeof body.amount === 'number' ? body.amount : undefined,
      currency: typeof body.currency === 'string' ? body.currency : undefined,
      sanitizedPayload: { event: eventType, orderId: body.orderId, paymentId: body.paymentId, amount: body.amount },
    };
  },

  async refund(providerPaymentId: string): Promise<RefundResult> {
    for (const order of orders.values()) {
      if (order.paymentId === providerPaymentId) order.status = 'refunded';
    }
    return { providerRefundId: `sbx_rfnd_${randomUUID()}`, status: 'processed' };
  },
};
