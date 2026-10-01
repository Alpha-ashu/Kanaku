import { createHash, timingSafeEqual } from 'crypto';
import { withCircuitBreaker } from '../../../utils/circuitBreaker';
import { recallCheckout, rememberCheckout } from './redirectCheckout';
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
 * PhonePe Payment Gateway — Standard Checkout (v2 API): UPI (PhonePe app and
 * any UPI app), cards, netbanking.
 *
 *   PHONEPE_CLIENT_ID / PHONEPE_CLIENT_SECRET / PHONEPE_CLIENT_VERSION
 *                             OAuth client credentials from the dashboard (server only)
 *   PHONEPE_ENV               'production' | 'sandbox' (default sandbox)
 *   PHONEPE_WEBHOOK_USERNAME / PHONEPE_WEBHOOK_PASSWORD
 *                             set on the webhook in the dashboard; PhonePe sends
 *                             SHA256("username:password") in the Authorization header
 *
 * Flow: OAuth token → POST /checkout/v2/pay (merchantOrderId = our PaymentOrder
 * id) → the browser goes to PhonePe's redirectUrl and comes back to the wallet
 * page. Coins are credited only from GET /checkout/v2/order/{id}/status or a
 * webhook whose Authorization verifies — never from the browser's return.
 *
 * Written against PhonePe's published v2 API; verify end to end on the sandbox
 * with test credentials before enabling it for purchases.
 */

const REQUEST_TIMEOUT_MS = 15_000;
const ORDER_TTL_SECONDS = 30 * 60;

const env = () => {
  const production = (process.env.PHONEPE_ENV || 'sandbox').toLowerCase() === 'production';
  return {
    clientId: process.env.PHONEPE_CLIENT_ID || '',
    clientSecret: process.env.PHONEPE_CLIENT_SECRET || '',
    clientVersion: process.env.PHONEPE_CLIENT_VERSION || '1',
    webhookUser: process.env.PHONEPE_WEBHOOK_USERNAME || '',
    webhookPassword: process.env.PHONEPE_WEBHOOK_PASSWORD || '',
    production,
    pgBase: (process.env.PHONEPE_API_BASE || (production ? 'https://api.phonepe.com/apis/pg' : 'https://api-preprod.phonepe.com/apis/pg-sandbox')).replace(/\/+$/, ''),
    authBase: (process.env.PHONEPE_AUTH_BASE || (production ? 'https://api.phonepe.com/apis/identity-manager' : 'https://api-preprod.phonepe.com/apis/pg-sandbox')).replace(/\/+$/, ''),
  };
};

type Obj = Record<string, unknown>;
const asObj = (value: unknown): Obj => (value && typeof value === 'object' ? value as Obj : {});
const str = (value: unknown): string | undefined => (typeof value === 'string' && value !== '' ? value : undefined);
const num = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);
const parseJson = (raw: string | Buffer): Obj => {
  try {
    return asObj(JSON.parse(raw.toString()));
  } catch {
    return {};
  }
};

class PhonePeApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'PhonePeApiError';
  }
}

let cachedToken: { value: string; expiresAt: number } | null = null;

/** Test hook: tokens are cached process-wide. */
export const __resetPhonePeTokenForTests = () => { cachedToken = null; };

const accessToken = async (): Promise<string> => {
  if (cachedToken && cachedToken.expiresAt - 60_000 > Date.now()) return cachedToken.value;
  const { authBase, clientId, clientSecret, clientVersion } = env();
  const response = await fetch(`${authBase}/v1/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_version: clientVersion, client_secret: clientSecret, grant_type: 'client_credentials' }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const json = parseJson(await response.text());
  const token = str(json.access_token);
  if (!response.ok || !token) throw new PhonePeApiError(response.status, `PhonePe token request failed with ${response.status}`);
  const expiresAtSeconds = num(json.expires_at);
  cachedToken = { value: token, expiresAt: expiresAtSeconds ? expiresAtSeconds * 1000 : Date.now() + 10 * 60_000 };
  return token;
};

const call = async (method: 'GET' | 'POST', path: string, body?: Obj): Promise<Obj> =>
  withCircuitBreaker({ name: 'phonepe', failureThreshold: 5, resetTimeoutMs: 30_000 }, async () => {
    const token = await accessToken();
    const response = await fetch(`${env().pgBase}${path}`, {
      method,
      headers: { Authorization: `O-Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const json = parseJson(await response.text());
    if (response.status === 401) cachedToken = null; // expired early; next call fetches a new one
    if (!response.ok) throw new PhonePeApiError(response.status, `PhonePe ${method} ${path} failed with ${response.status} (${String(json.code ?? '')})`);
    return json;
  });

const completedPayment = (details: unknown) => {
  const list = Array.isArray(details) ? details.map(asObj) : [];
  return list.find((p) => p.state === 'COMPLETED') ?? list[list.length - 1];
};

const expectedWebhookAuth = () => {
  const { webhookUser, webhookPassword } = env();
  return webhookUser && webhookPassword ? createHash('sha256').update(`${webhookUser}:${webhookPassword}`).digest('hex') : '';
};

export const phonepeProvider: PaymentProvider = {
  id: 'phonepe',
  displayName: 'PhonePe (UPI, cards, netbanking)',
  checkoutKind: 'redirect',

  isConfigured() {
    const { clientId, clientSecret } = env();
    return Boolean(clientId && clientSecret);
  },

  describe() {
    return {
      webhookConfigured: Boolean(expectedWebhookAuth()),
      mode: !phonepeProvider.isConfigured() ? 'unconfigured' : env().production ? 'live' : 'test',
    };
  },

  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    if (!input.returnUrl) throw new Error('PhonePe needs a return URL (FRONTEND_URL or PAYMENT_RETURN_URL)');
    const json = await call('POST', '/checkout/v2/pay', {
      merchantOrderId: input.orderId,
      amount: input.amountMinor,
      expireAfter: ORDER_TTL_SECONDS,
      metaInfo: { udf1: input.orderId },
      paymentFlow: {
        type: 'PG_CHECKOUT',
        message: input.description.slice(0, 100),
        merchantUrls: { redirectUrl: input.returnUrl },
      },
    });
    const redirectUrl = str(json.redirectUrl);
    if (!redirectUrl) throw new PhonePeApiError(502, 'PhonePe did not return a payment page');
    rememberCheckout(`phonepe:${input.orderId}`, { redirectUrl });
    return {
      providerOrderId: input.orderId,
      checkout: { provider: 'phonepe', mode: 'redirect', url: redirectUrl },
    };
  },

  checkoutFor(input: CheckoutInput) {
    const url = str(recallCheckout(`phonepe:${input.providerOrderId}`)?.redirectUrl);
    return url ? { provider: 'phonepe', mode: 'redirect', url } : { provider: 'phonepe', mode: 'status-only' };
  },

  // Redirect flow: the browser brings back no proof of payment to verify.
  verifyCheckout(): CheckoutVerification {
    return { valid: false };
  },

  async fetchOrderStatus(providerOrderId: string): Promise<OrderStatusResult> {
    const json = await call('GET', `/checkout/v2/order/${encodeURIComponent(providerOrderId)}/status?details=false`);
    const state = str(json.state);
    const payment = completedPayment(json.paymentDetails);
    if (state === 'COMPLETED') {
      return {
        status: 'paid',
        providerPaymentId: str(payment?.transactionId) ?? str(json.orderId),
        amountMinor: num(payment?.amount) ?? num(json.amount),
        currency: 'INR',
      };
    }
    if (state === 'FAILED') {
      return {
        status: 'failed',
        providerPaymentId: str(payment?.transactionId),
        failureReason: str(payment?.detailedErrorCode) ?? str(payment?.errorCode) ?? 'Payment failed',
      };
    }
    return { status: 'pending' };
  },

  parseWebhook(rawBody: Buffer, headers): ParsedWebhook {
    const given = String((headers.authorization ?? headers.Authorization ?? '') as string).trim().toLowerCase();
    const expected = expectedWebhookAuth();
    const valid = Boolean(expected && given) && given.length === expected.length
      && timingSafeEqual(Buffer.from(given), Buffer.from(expected));

    const body = parseJson(rawBody);
    const eventType = str(body.event) ?? 'unknown';
    const payload = asObj(body.payload);
    const payment = completedPayment(payload.paymentDetails);
    const isRefund = eventType.startsWith('pg.refund');
    const merchantOrderId = str(payload.merchantOrderId) ?? str(payload.originalMerchantOrderId);

    let outcome: ParsedWebhook['outcome'] = 'ignored';
    if (eventType === 'checkout.order.completed') outcome = 'paid';
    else if (eventType === 'checkout.order.failed') outcome = 'failed';
    else if (eventType === 'pg.refund.completed') outcome = 'refunded';

    return {
      valid,
      // PhonePe sends no delivery id; repeats of one event carry the same fields.
      eventId: `${eventType}:${merchantOrderId ?? 'none'}:${str(payload.state) ?? 'none'}:${str(payment?.transactionId) ?? str(payload.refundId) ?? 'none'}`,
      eventType,
      providerOrderId: merchantOrderId,
      providerPaymentId: isRefund ? undefined : str(payment?.transactionId),
      outcome,
      amountMinor: num(payment?.amount) ?? num(payload.amount),
      currency: 'INR',
      failureReason: outcome === 'failed' ? str(payload.errorCode) ?? str(payment?.detailedErrorCode) ?? 'Payment failed' : undefined,
      sanitizedPayload: {
        event: eventType,
        merchantOrderId,
        orderId: payload.orderId,
        state: payload.state,
        amount: payload.amount,
        paymentMode: payment?.paymentMode,
        transactionId: payment?.transactionId,
        refundId: payload.refundId,
        errorCode: payload.errorCode ?? payment?.errorCode,
      },
    };
  },

  async refund(_providerPaymentId: string, amountMinor: number, notes: Record<string, string>): Promise<RefundResult> {
    const orderId = notes.paymentOrderId;
    if (!orderId) throw new Error('PhonePe refunds need the order id');
    const json = await call('POST', '/payments/v2/refund', {
      merchantRefundId: `rf_${orderId.replace(/-/g, '').slice(0, 20)}_${Date.now().toString(36)}`,
      originalMerchantOrderId: orderId,
      amount: amountMinor,
    });
    const refundId = str(json.refundId);
    if (!refundId) throw new PhonePeApiError(502, 'PhonePe did not accept the refund');
    return { providerRefundId: refundId, status: json.state === 'COMPLETED' ? 'processed' : 'pending' };
  },
};
