import { withCircuitBreaker } from '../../../utils/circuitBreaker';
import { generateSignature, verifySignature } from './paytmChecksum';
import { apiPublicBase, recallCheckout, rememberCheckout, signLaunchToken } from './redirectCheckout';
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
 * Paytm Payment Gateway (UPI, Paytm wallet/postpaid, cards, netbanking) through
 * the Initiate Transaction API and Paytm's hosted payment page.
 *
 *   PAYTM_MID            merchant id (public)
 *   PAYTM_MERCHANT_KEY   16-character merchant key — signs every request (server only)
 *   PAYTM_WEBSITE        website name from the dashboard (WEBSTAGING on staging)
 *   PAYTM_ENV            'production' | 'staging' (default staging)
 *
 * Flow: initiateTransaction → txnToken; the browser is sent through
 * /payments/launch/paytm/:orderId, which POSTs mid + orderId + txnToken to the
 * payment page; Paytm posts the browser back to /payments/return/paytm (we then
 * redirect to the wallet page) and calls the webhook server to server. Coins are
 * credited only from /v3/order/status or a webhook whose checksum verifies —
 * never from the browser's return.
 *
 * Our PaymentOrder id is used as Paytm's ORDER_ID (≤ 50 chars, [A-Za-z0-9@_-]).
 * Written against Paytm's published API; verify end to end on the staging
 * environment with test credentials before enabling it for purchases.
 */

const REQUEST_TIMEOUT_MS = 15_000;

const env = () => {
  const production = (process.env.PAYTM_ENV || 'staging').toLowerCase() === 'production';
  return {
    mid: process.env.PAYTM_MID || '',
    key: process.env.PAYTM_MERCHANT_KEY || '',
    website: process.env.PAYTM_WEBSITE || (production ? 'DEFAULT' : 'WEBSTAGING'),
    production,
    host: (process.env.PAYTM_API_BASE || (production ? 'https://securegw.paytm.in' : 'https://securegw-stage.paytm.in')).replace(/\/+$/, ''),
  };
};

type Obj = Record<string, unknown>;
const asObj = (value: unknown): Obj => (value && typeof value === 'object' ? value as Obj : {});
const str = (value: unknown): string | undefined => (typeof value === 'string' && value !== '' ? value : undefined);

const toMinor = (rupees: unknown): number | undefined => {
  const value = Number(rupees);
  return Number.isFinite(value) ? Math.round(value * 100) : undefined;
};
const toRupees = (minor: number) => (minor / 100).toFixed(2);

class PaytmApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'PaytmApiError';
  }
}

/** POST a signed `{ body, head: { signature } }` request and return the response body. */
const call = async (path: string, body: Obj): Promise<Obj> => {
  const { host, key } = env();
  const payload = JSON.stringify(body);
  return withCircuitBreaker({ name: 'paytm', failureThreshold: 5, resetTimeoutMs: 30_000 }, async () => {
    const response = await fetch(`${host}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: `{"body":${payload},"head":{"signature":"${generateSignature(payload, key)}"}}`,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = await response.text();
    let json: Obj = {};
    try {
      json = asObj(JSON.parse(text));
    } catch {
      /* non-JSON error page */
    }
    if (!response.ok) throw new PaytmApiError(response.status, `Paytm ${path} failed with ${response.status}`);
    return asObj(json.body);
  });
};

/** Callback / webhook fields arrive form-encoded (or as JSON on newer setups). */
const parseFields = (raw: Buffer | string): Record<string, string> => {
  const text = raw.toString();
  if (text.trim().startsWith('{')) {
    try {
      const json = asObj(JSON.parse(text));
      return Object.fromEntries(Object.entries(json).map(([k, v]) => [k, v === null || v === undefined ? '' : String(v)]));
    } catch {
      return {};
    }
  }
  return Object.fromEntries(new URLSearchParams(text));
};

export interface PaytmReturn {
  valid: boolean;
  orderId?: string;
}

export const paytmProvider: PaymentProvider & {
  launchForm(providerOrderId: string): { action: string; fields: Record<string, string> } | null;
  verifyReturn(raw: Buffer | string): PaytmReturn;
} = {
  id: 'paytm',
  displayName: 'Paytm (UPI, Paytm wallet, cards)',
  checkoutKind: 'redirect',

  isConfigured() {
    const { mid, key } = env();
    // AES-128 needs exactly 16 bytes of key.
    return Boolean(mid && key && Buffer.byteLength(key, 'utf8') === 16);
  },

  describe() {
    return {
      // One key signs requests, callbacks and webhooks.
      webhookConfigured: paytmProvider.isConfigured(),
      mode: !paytmProvider.isConfigured() ? 'unconfigured' : env().production ? 'live' : 'test',
    };
  },

  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    const { mid, website } = env();
    if (!input.callbackUrl) throw new Error('Paytm needs a public callback URL (API_PUBLIC_URL)');
    const body = await call(`/theia/api/v1/initiateTransaction?mid=${encodeURIComponent(mid)}&orderId=${encodeURIComponent(input.orderId)}`, {
      requestType: 'Payment',
      mid,
      websiteName: website,
      orderId: input.orderId,
      callbackUrl: input.callbackUrl,
      txnAmount: { value: toRupees(input.amountMinor), currency: input.currency },
      userInfo: { custId: input.customerRef || `cust_${input.orderId.slice(0, 8)}` },
    });
    const result = asObj(body.resultInfo);
    const txnToken = str(body.txnToken);
    if (result.resultStatus !== 'S' || !txnToken) {
      throw new PaytmApiError(502, `Paytm did not start the transaction (${String(result.resultCode ?? 'no code')})`);
    }
    rememberCheckout(`paytm:${input.orderId}`, { txnToken });
    return {
      providerOrderId: input.orderId,
      checkout: paytmProvider.checkoutFor({
        providerOrderId: input.orderId,
        amountMinor: input.amountMinor,
        currency: input.currency,
        description: input.description,
      }),
    };
  },

  checkoutFor(input: CheckoutInput) {
    const base = apiPublicBase();
    // Without a remembered token (API restarted) the order can only be checked, not paid.
    if (!base || !recallCheckout(`paytm:${input.providerOrderId}`)) {
      return { provider: 'paytm', mode: 'status-only' };
    }
    return {
      provider: 'paytm',
      mode: 'redirect',
      url: `${base}/api/v1/payments/launch/paytm/${encodeURIComponent(input.providerOrderId)}?t=${signLaunchToken(input.providerOrderId)}`,
    };
  },

  launchForm(providerOrderId: string) {
    const remembered = recallCheckout(`paytm:${providerOrderId}`);
    const txnToken = str(remembered?.txnToken);
    if (!txnToken) return null;
    const { host, mid } = env();
    return {
      action: `${host}/theia/api/v1/showPaymentPage?mid=${encodeURIComponent(mid)}&orderId=${encodeURIComponent(providerOrderId)}`,
      fields: { mid, orderId: providerOrderId, txnToken },
    };
  },

  /** The browser's return post: checked, but never trusted to credit anything. */
  verifyReturn(raw: Buffer | string): PaytmReturn {
    const fields = parseFields(raw);
    const { key, mid } = env();
    const valid = Boolean(fields.CHECKSUMHASH) && fields.MID === mid && verifySignature(fields, key, fields.CHECKSUMHASH);
    return { valid, orderId: fields.ORDERID };
  },

  // Redirect flow: the browser brings back no proof of payment to verify.
  verifyCheckout(): CheckoutVerification {
    return { valid: false };
  },

  async fetchOrderStatus(providerOrderId: string): Promise<OrderStatusResult> {
    const { mid } = env();
    const body = await call('/v3/order/status', { mid, orderId: providerOrderId });
    const result = asObj(body.resultInfo);
    const status = str(result.resultStatus);
    if (status === 'TXN_SUCCESS') {
      return {
        status: 'paid',
        providerPaymentId: str(body.txnId),
        amountMinor: toMinor(body.txnAmount),
        currency: 'INR',
      };
    }
    if (status === 'TXN_FAILURE') {
      return { status: 'failed', providerPaymentId: str(body.txnId), failureReason: str(result.resultMsg) || 'Payment failed' };
    }
    // PENDING, NO_RECORD_FOUND (the user never reached the page) and anything new.
    return { status: 'pending' };
  },

  parseWebhook(rawBody: Buffer): ParsedWebhook {
    const fields = parseFields(rawBody);
    const { key, mid } = env();
    const valid = Boolean(fields.CHECKSUMHASH) && fields.MID === mid && verifySignature(fields, key, fields.CHECKSUMHASH);
    const status = fields.STATUS || fields.status || '';
    const outcome: ParsedWebhook['outcome'] = status === 'TXN_SUCCESS' ? 'paid' : status === 'TXN_FAILURE' ? 'failed' : 'ignored';
    return {
      valid,
      // Paytm repeats a notification with the same order, txn and status.
      eventId: `${fields.ORDERID || 'none'}:${fields.TXNID || 'none'}:${status || 'none'}`,
      eventType: `paytm.${status || 'unknown'}`.toLowerCase(),
      providerOrderId: str(fields.ORDERID),
      providerPaymentId: str(fields.TXNID),
      outcome,
      amountMinor: toMinor(fields.TXNAMOUNT),
      currency: fields.CURRENCY || 'INR',
      failureReason: outcome === 'failed' ? fields.RESPMSG || 'Payment failed' : undefined,
      sanitizedPayload: {
        ORDERID: fields.ORDERID,
        TXNID: fields.TXNID,
        TXNAMOUNT: fields.TXNAMOUNT,
        STATUS: status,
        RESPCODE: fields.RESPCODE,
        RESPMSG: fields.RESPMSG,
        PAYMENTMODE: fields.PAYMENTMODE,
        TXNDATE: fields.TXNDATE,
      },
    };
  },

  async refund(providerPaymentId: string, amountMinor: number, notes: Record<string, string>): Promise<RefundResult> {
    const { mid } = env();
    const orderId = notes.paymentOrderId;
    if (!orderId) throw new Error('Paytm refunds need the order id');
    const body = await call('/refund/apply', {
      mid,
      txnType: 'REFUND',
      orderId,
      txnId: providerPaymentId,
      refId: `rf_${orderId.replace(/-/g, '').slice(0, 20)}_${Date.now().toString(36)}`,
      refundAmount: toRupees(amountMinor),
    });
    const result = asObj(body.resultInfo);
    const status = str(result.resultStatus);
    if (status === 'TXN_FAILURE' || !str(body.refundId)) {
      throw new PaytmApiError(502, `Paytm refused the refund (${String(result.resultCode ?? 'no code')})`);
    }
    return { providerRefundId: str(body.refundId) as string, status: status === 'TXN_SUCCESS' ? 'processed' : 'pending' };
  },
};
