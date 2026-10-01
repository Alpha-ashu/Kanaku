import { createHmac, timingSafeEqual } from 'crypto';
import { withCircuitBreaker } from '../../../utils/circuitBreaker';
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
 * Razorpay (cards, UPI incl. Google Pay / PhonePe apps, netbanking, wallets).
 *
 *   RAZORPAY_KEY_ID          public key id — the only value sent to the browser
 *   RAZORPAY_KEY_SECRET      API + checkout-signature secret (server only)
 *   RAZORPAY_WEBHOOK_SECRET  webhook signing secret (server only)
 *
 * Checkout signature: HMAC-SHA256(order_id + "|" + payment_id, key_secret).
 * Webhook signature:  HMAC-SHA256(raw body, webhook_secret) in X-Razorpay-Signature.
 * Even a valid checkout signature is followed by an API read of the order's
 * payments before coins are credited, so the amount actually captured is what
 * gets checked — not what the page reported.
 */

const API_BASE = process.env.RAZORPAY_API_BASE || 'https://api.razorpay.com/v1';
const REQUEST_TIMEOUT_MS = 15_000;

const env = () => ({
  keyId: process.env.RAZORPAY_KEY_ID || '',
  keySecret: process.env.RAZORPAY_KEY_SECRET || '',
  webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
});

const hmacHex = (secret: string, data: string | Buffer) => createHmac('sha256', secret).update(data).digest('hex');

const safeEqualHex = (a: string, b: string) => {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
};

type Obj = Record<string, unknown>;
const asObj = (value: unknown): Obj => (value && typeof value === 'object' ? value as Obj : {});
const str = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);
const num = (value: unknown): number | undefined => (typeof value === 'number' ? value : undefined);
const parseJson = (raw: string | Buffer): Obj => {
  try {
    return asObj(JSON.parse(raw.toString()));
  } catch {
    return {};
  }
};

const header = (headers: Record<string, string | string[] | undefined>, name: string) => {
  const value = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
};

class RazorpayApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'RazorpayApiError';
  }
}

const call = async <T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> => {
  const { keyId, keySecret } = env();
  return withCircuitBreaker({ name: 'razorpay', failureThreshold: 5, resetTimeoutMs: 30_000 }, async () => {
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = await response.text();
    const json = text ? parseJson(text) : {};
    if (!response.ok) {
      // Razorpay error descriptions carry no secrets; the status and code are what we log.
      throw new RazorpayApiError(response.status, str(asObj(json.error).description) || `Razorpay ${method} ${path} failed with ${response.status}`);
    }
    return json as T;
  });
};

/** Keep ids, amounts and outcomes; drop contact details, card and bank data. */
const sanitizeEntity = (value: unknown) => {
  if (!value || typeof value !== 'object') return undefined;
  const entity = value as Obj;
  return {
    id: entity.id,
    entity: entity.entity,
    order_id: entity.order_id,
    payment_id: entity.payment_id,
    amount: entity.amount,
    currency: entity.currency,
    status: entity.status,
    method: entity.method,
    captured: entity.captured,
    error_code: entity.error_code,
    error_reason: entity.error_reason,
    created_at: entity.created_at,
  };
};

export const razorpayProvider: PaymentProvider = {
  id: 'razorpay',
  displayName: 'Razorpay (UPI, cards, netbanking)',
  checkoutKind: 'popup',

  isConfigured() {
    const { keyId, keySecret } = env();
    return Boolean(keyId && keySecret);
  },

  describe() {
    const { keyId, webhookSecret } = env();
    return {
      webhookConfigured: Boolean(webhookSecret),
      mode: !razorpayProvider.isConfigured() ? 'unconfigured' : keyId.startsWith('rzp_live_') ? 'live' : 'test',
    };
  },

  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    const order = await call<{ id: string; amount: number; currency: string }>('POST', '/orders', {
      amount: input.amountMinor,
      currency: input.currency,
      // Razorpay caps receipt at 40 characters; a UUID is 36.
      receipt: input.orderId,
      notes: { paymentOrderId: input.orderId },
    });
    return {
      providerOrderId: order.id,
      checkout: razorpayProvider.checkoutFor({
        providerOrderId: order.id,
        amountMinor: order.amount,
        currency: order.currency,
        description: input.description,
        customer: input.customer,
      }),
    };
  },

  checkoutFor(input: CheckoutInput) {
    return {
      provider: 'razorpay',
      keyId: env().keyId,
      orderId: input.providerOrderId,
      amount: input.amountMinor,
      currency: input.currency,
      name: 'KANAKU',
      description: input.description,
      prefill: { name: input.customer?.name ?? undefined, email: input.customer?.email ?? undefined },
    };
  },

  verifyCheckout(providerOrderId: string, payload: Record<string, unknown>): CheckoutVerification {
    const paymentId = typeof payload.razorpay_payment_id === 'string' ? payload.razorpay_payment_id : '';
    const signature = typeof payload.razorpay_signature === 'string' ? payload.razorpay_signature : '';
    const orderId = typeof payload.razorpay_order_id === 'string' ? payload.razorpay_order_id : providerOrderId;
    const { keySecret } = env();
    if (!paymentId || !signature || !keySecret || orderId !== providerOrderId) return { valid: false };
    const expected = hmacHex(keySecret, `${providerOrderId}|${paymentId}`);
    return safeEqualHex(signature, expected) ? { valid: true, providerPaymentId: paymentId } : { valid: false };
  },

  async fetchOrderStatus(providerOrderId: string): Promise<OrderStatusResult> {
    const result = await call<{ items: Array<{ id: string; status: string; amount: number; currency: string; error_description?: string }> }>(
      'GET',
      `/orders/${encodeURIComponent(providerOrderId)}/payments`,
    );
    const payments = result?.items ?? [];
    const captured = payments.find((p) => p.status === 'captured' || p.status === 'refunded');
    if (captured) {
      return { status: 'paid', providerPaymentId: captured.id, amountMinor: captured.amount, currency: captured.currency };
    }
    // `authorized` = the customer approved it but it is not captured yet (auto
    // capture normally follows within seconds); still pending for us.
    if (payments.some((p) => p.status === 'authorized' || p.status === 'created')) return { status: 'pending' };
    const failed = payments.find((p) => p.status === 'failed');
    if (failed) return { status: 'failed', providerPaymentId: failed.id, failureReason: failed.error_description || 'Payment failed' };
    return { status: 'pending' };
  },

  parseWebhook(rawBody: Buffer, headers): ParsedWebhook {
    const { webhookSecret } = env();
    const signature = header(headers, 'x-razorpay-signature') || '';
    const valid = Boolean(webhookSecret && signature) && safeEqualHex(signature, hmacHex(webhookSecret, rawBody));

    const body = parseJson(rawBody);
    const eventType = str(body.event) ?? 'unknown';
    const payload = asObj(body.payload);
    const payment = asObj(asObj(payload.payment).entity);
    const order = asObj(asObj(payload.order).entity);
    const refund = asObj(asObj(payload.refund).entity);
    // Razorpay sends a unique id per event in this header; retries reuse it.
    const eventId = header(headers, 'x-razorpay-event-id')
      || `${eventType}:${str(payment.id) ?? str(order.id) ?? str(refund.id) ?? 'none'}:${String(body.created_at ?? '')}`;

    let outcome: ParsedWebhook['outcome'] = 'ignored';
    if (eventType === 'payment.captured' || eventType === 'order.paid') outcome = 'paid';
    else if (eventType === 'payment.failed') outcome = 'failed';
    else if (eventType === 'refund.processed') outcome = 'refunded';

    return {
      valid,
      eventId,
      eventType,
      providerOrderId: str(payment.order_id) ?? str(order.id),
      providerPaymentId: str(payment.id) ?? str(refund.payment_id),
      outcome,
      amountMinor: num(payment.amount) ?? num(order.amount_paid),
      currency: str(payment.currency) ?? str(order.currency),
      failureReason: str(payment.error_description),
      sanitizedPayload: {
        event: eventType,
        created_at: body.created_at,
        payment: sanitizeEntity(asObj(payload.payment).entity),
        order: sanitizeEntity(asObj(payload.order).entity),
        refund: sanitizeEntity(asObj(payload.refund).entity),
      },
    };
  },

  async refund(providerPaymentId: string, amountMinor: number, notes: Record<string, string>): Promise<RefundResult> {
    const refund = await call<{ id: string; status: string }>('POST', `/payments/${encodeURIComponent(providerPaymentId)}/refund`, {
      amount: amountMinor,
      speed: 'normal',
      notes,
    });
    return { providerRefundId: refund.id, status: refund.status === 'processed' ? 'processed' : 'pending' };
  },
};
