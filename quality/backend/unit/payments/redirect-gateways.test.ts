/**
 * PhonePe and Paytm adapters, with fetch mocked, plus the shared redirect
 * plumbing. What must hold for money to be safe:
 *   - every Paytm request carries a checksum that verifies with the merchant key,
 *     and a callback/webhook is only trusted when its checksum and MID verify;
 *   - a PhonePe webhook is only trusted with SHA256(username:password);
 *   - "paid" comes only from COMPLETED / TXN_SUCCESS, with the captured amount
 *     reported in paise so the wallet can compare it with the order;
 *   - redirect gateways never accept a browser "checkout proof";
 *   - launch links are signed per order and expire.
 */
import { createHash } from 'crypto';
import { generateSignature, paramsToString, verifySignature } from '../../../../backend/src/features/payments/providers/paytmChecksum';
import { paytmProvider } from '../../../../backend/src/features/payments/providers/paytm.provider';
import { phonepeProvider, __resetPhonePeTokenForTests } from '../../../../backend/src/features/payments/providers/phonepe.provider';
import {
  autoSubmitPage,
  isOrderId,
  purchaseReturnUrl,
  signLaunchToken,
  verifyLaunchToken,
} from '../../../../backend/src/features/payments/providers/redirectCheckout';
import { resetCircuitBreaker } from '../../../../backend/src/utils/circuitBreaker';

const ORDER_ID = '3f2b8c1e-5d4a-4b6f-9e7d-1a2b3c4d5e6f';
const KEY = 'abcdEFGH12345678'; // 16 chars

type FetchCall = { url: string; init: RequestInit };
let calls: FetchCall[] = [];
const respond = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) });

const saved = { ...process.env };
beforeEach(() => {
  calls = [];
  process.env.PAYTM_MID = 'KANAKU00000001';
  process.env.PAYTM_MERCHANT_KEY = KEY;
  process.env.PAYTM_ENV = 'staging';
  process.env.PHONEPE_CLIENT_ID = 'client-id';
  process.env.PHONEPE_CLIENT_SECRET = 'client-secret';
  process.env.PHONEPE_ENV = 'sandbox';
  process.env.PHONEPE_WEBHOOK_USERNAME = 'hook-user';
  process.env.PHONEPE_WEBHOOK_PASSWORD = 'hook-pass';
  process.env.API_PUBLIC_URL = 'https://api.example.test';
  process.env.FRONTEND_URL = 'https://app.example.test';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'unit-test-secret-at-least-32-characters-long';
  __resetPhonePeTokenForTests();
  for (const name of ['paytm', 'phonepe']) resetCircuitBreaker?.(name);
});
afterEach(() => {
  process.env = { ...saved };
  jest.restoreAllMocks();
});

const mockFetch = (handler: (url: string, init: RequestInit) => ReturnType<typeof respond>) =>
  jest.spyOn(global, 'fetch').mockImplementation((async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init);
  }) as unknown as typeof fetch);

describe('Paytm checksum', () => {
  it('round-trips a JSON body and key/value params', () => {
    const body = JSON.stringify({ mid: 'M1', orderId: ORDER_ID });
    expect(verifySignature(body, KEY, generateSignature(body, KEY))).toBe(true);
    const params = { ORDERID: ORDER_ID, MID: 'M1', TXNAMOUNT: '100.00', STATUS: 'TXN_SUCCESS' };
    const checksum = generateSignature(params, KEY);
    expect(verifySignature({ ...params, CHECKSUMHASH: checksum }, KEY, checksum)).toBe(true);
  });

  it('rejects a changed amount, a different key and garbage', () => {
    const params = { ORDERID: ORDER_ID, TXNAMOUNT: '100.00' };
    const checksum = generateSignature(params, KEY);
    expect(verifySignature({ ...params, TXNAMOUNT: '1.00' }, KEY, checksum)).toBe(false);
    expect(verifySignature(params, 'zzzzzzzzzzzzzzzz', checksum)).toBe(false);
    expect(verifySignature(params, KEY, 'not-a-checksum')).toBe(false);
    expect(verifySignature(params, KEY, '')).toBe(false);
  });

  it('orders values by key and blanks nulls, as Paytm does', () => {
    expect(paramsToString({ b: '2', a: '1', c: null, d: 'NULL' })).toBe('1|2||');
  });
});

describe('redirect plumbing', () => {
  it('signs launch links per order and expires them', () => {
    const token = signLaunchToken(ORDER_ID);
    expect(verifyLaunchToken(ORDER_ID, token)).toBe(true);
    expect(verifyLaunchToken('11111111-1111-1111-1111-111111111111', token)).toBe(false);
    expect(verifyLaunchToken(ORDER_ID, `${token}x`)).toBe(false);
    expect(verifyLaunchToken(ORDER_ID, signLaunchToken(ORDER_ID, -1000))).toBe(false);
    expect(verifyLaunchToken(ORDER_ID, undefined)).toBe(false);
  });

  it('builds the wallet return URL and escapes the auto-submit page', () => {
    expect(purchaseReturnUrl(ORDER_ID)).toBe(`https://app.example.test/wallet?purchase=${ORDER_ID}`);
    const page = autoSubmitPage('https://pay.example/x?a=1&b=2', { token: '"><script>' }, 'n0nce');
    expect(page).toContain('action="https://pay.example/x?a=1&amp;b=2"');
    expect(page).toContain('value="&quot;&gt;&lt;script&gt;"');
    expect(page).toContain('<script nonce="n0nce">');
    expect(isOrderId(ORDER_ID)).toBe(true);
    expect(isOrderId('../../etc')).toBe(false);
  });
});

describe('Paytm adapter', () => {
  it('is configured only with a 16-character merchant key', () => {
    expect(paytmProvider.isConfigured()).toBe(true);
    process.env.PAYTM_MERCHANT_KEY = 'short';
    expect(paytmProvider.isConfigured()).toBe(false);
  });

  it('initiates a signed transaction and hands back a signed launch link', async () => {
    mockFetch(() => respond({ body: { resultInfo: { resultStatus: 'S', resultCode: '0000' }, txnToken: 'TXN-TOKEN-1' } }));
    const created = await paytmProvider.createOrder({
      orderId: ORDER_ID, amountMinor: 10_000, currency: 'INR', description: '110 coins',
      customerRef: 'kabc', callbackUrl: 'https://api.example.test/api/v1/payments/return/paytm',
    });
    expect(calls[0].url).toBe(`https://securegw-stage.paytm.in/theia/api/v1/initiateTransaction?mid=KANAKU00000001&orderId=${ORDER_ID}`);
    const sent = JSON.parse(String(calls[0].init.body));
    expect(sent.body).toMatchObject({ mid: 'KANAKU00000001', orderId: ORDER_ID, txnAmount: { value: '100.00', currency: 'INR' }, userInfo: { custId: 'kabc' } });
    // The signature covers the body exactly as sent.
    expect(verifySignature(JSON.stringify(sent.body), KEY, sent.head.signature)).toBe(true);

    expect(created.providerOrderId).toBe(ORDER_ID);
    expect(created.checkout).toMatchObject({ provider: 'paytm', mode: 'redirect' });
    const url = new URL(String(created.checkout.url));
    expect(url.pathname).toBe(`/api/v1/payments/launch/paytm/${ORDER_ID}`);
    expect(verifyLaunchToken(ORDER_ID, url.searchParams.get('t') ?? undefined)).toBe(true);
    expect(paytmProvider.launchForm(ORDER_ID)).toEqual({
      action: `https://securegw-stage.paytm.in/theia/api/v1/showPaymentPage?mid=KANAKU00000001&orderId=${ORDER_ID}`,
      fields: { mid: 'KANAKU00000001', orderId: ORDER_ID, txnToken: 'TXN-TOKEN-1' },
    });
  });

  it('reads paid, failed and pending from the status API', async () => {
    const answers = [
      { body: { resultInfo: { resultStatus: 'TXN_SUCCESS' }, txnId: 'T1', txnAmount: '100.00' } },
      { body: { resultInfo: { resultStatus: 'TXN_FAILURE', resultMsg: 'Insufficient balance' }, txnId: 'T2' } },
      { body: { resultInfo: { resultStatus: 'NO_RECORD_FOUND' } } },
    ];
    mockFetch(() => respond(answers.shift()));
    expect(await paytmProvider.fetchOrderStatus(ORDER_ID)).toEqual({ status: 'paid', providerPaymentId: 'T1', amountMinor: 10_000, currency: 'INR' });
    expect(await paytmProvider.fetchOrderStatus(ORDER_ID)).toMatchObject({ status: 'failed', failureReason: 'Insufficient balance' });
    expect(await paytmProvider.fetchOrderStatus(ORDER_ID)).toEqual({ status: 'pending' });
  });

  it('trusts a webhook only with a valid checksum from our MID', () => {
    const fields = { MID: 'KANAKU00000001', ORDERID: ORDER_ID, TXNID: 'T1', TXNAMOUNT: '100.00', STATUS: 'TXN_SUCCESS', CURRENCY: 'INR' };
    const signed = new URLSearchParams({ ...fields, CHECKSUMHASH: generateSignature(fields, KEY) }).toString();
    const ok = paytmProvider.parseWebhook(Buffer.from(signed), {});
    expect(ok).toMatchObject({ valid: true, outcome: 'paid', providerOrderId: ORDER_ID, providerPaymentId: 'T1', amountMinor: 10_000 });

    const forged = new URLSearchParams({ ...fields, TXNAMOUNT: '1.00', CHECKSUMHASH: generateSignature(fields, KEY) }).toString();
    expect(paytmProvider.parseWebhook(Buffer.from(forged), {}).valid).toBe(false);

    const otherMid = { ...fields, MID: 'SOMEONEELSE001' };
    const foreign = new URLSearchParams({ ...otherMid, CHECKSUMHASH: generateSignature(otherMid, KEY) }).toString();
    expect(paytmProvider.parseWebhook(Buffer.from(foreign), {}).valid).toBe(false);
  });

  it('never accepts a browser checkout proof', () => {
    expect(paytmProvider.verifyCheckout(ORDER_ID, { STATUS: 'TXN_SUCCESS' }).valid).toBe(false);
  });
});

describe('PhonePe adapter', () => {
  it('reuses one OAuth token and opens Standard Checkout with our order id', async () => {
    mockFetch((url) => (url.endsWith('/v1/oauth/token')
      ? respond({ access_token: 'tok-1', expires_at: Math.floor(Date.now() / 1000) + 3600 })
      : url.includes('/checkout/v2/pay')
        ? respond({ orderId: 'OMO1', state: 'PENDING', redirectUrl: 'https://mercury.example/pay/OMO1' })
        : respond({ state: 'PENDING' })));

    const created = await phonepeProvider.createOrder({
      orderId: ORDER_ID, amountMinor: 10_000, currency: 'INR', description: '110 coins',
      returnUrl: purchaseReturnUrl(ORDER_ID),
    });
    await phonepeProvider.fetchOrderStatus(ORDER_ID);

    expect(calls.filter((c) => c.url.endsWith('/v1/oauth/token'))).toHaveLength(1);
    const pay = calls.find((c) => c.url.endsWith('/checkout/v2/pay'))!;
    expect(pay.url).toBe('https://api-preprod.phonepe.com/apis/pg-sandbox/checkout/v2/pay');
    expect((pay.init.headers as Record<string, string>).Authorization).toBe('O-Bearer tok-1');
    expect(JSON.parse(String(pay.init.body))).toMatchObject({
      merchantOrderId: ORDER_ID,
      amount: 10_000,
      paymentFlow: { type: 'PG_CHECKOUT', merchantUrls: { redirectUrl: `https://app.example.test/wallet?purchase=${ORDER_ID}` } },
    });
    expect(created).toEqual({ providerOrderId: ORDER_ID, checkout: { provider: 'phonepe', mode: 'redirect', url: 'https://mercury.example/pay/OMO1' } });
    // A replayed "Buy" gets the same page without a new PhonePe order.
    expect(phonepeProvider.checkoutFor({ providerOrderId: ORDER_ID, amountMinor: 10_000, currency: 'INR', description: '' }))
      .toEqual({ provider: 'phonepe', mode: 'redirect', url: 'https://mercury.example/pay/OMO1' });
  });

  it('reads COMPLETED, FAILED and PENDING orders', async () => {
    const answers = [
      { state: 'COMPLETED', amount: 10_000, paymentDetails: [{ transactionId: 'TX1', amount: 10_000, state: 'COMPLETED' }] },
      { state: 'FAILED', paymentDetails: [{ transactionId: 'TX2', state: 'FAILED', detailedErrorCode: 'TXN_AUTO_FAILED' }] },
      { state: 'PENDING' },
    ];
    mockFetch((url) => (url.endsWith('/v1/oauth/token') ? respond({ access_token: 't', expires_at: Math.floor(Date.now() / 1000) + 3600 }) : respond(answers.shift())));
    expect(await phonepeProvider.fetchOrderStatus(ORDER_ID)).toEqual({ status: 'paid', providerPaymentId: 'TX1', amountMinor: 10_000, currency: 'INR' });
    expect(await phonepeProvider.fetchOrderStatus(ORDER_ID)).toMatchObject({ status: 'failed', failureReason: 'TXN_AUTO_FAILED' });
    expect(await phonepeProvider.fetchOrderStatus(ORDER_ID)).toEqual({ status: 'pending' });
  });

  it('trusts a webhook only with SHA256(username:password)', () => {
    const body = Buffer.from(JSON.stringify({
      event: 'checkout.order.completed',
      payload: { merchantOrderId: ORDER_ID, state: 'COMPLETED', amount: 10_000, paymentDetails: [{ transactionId: 'TX1', amount: 10_000, state: 'COMPLETED' }] },
    }));
    const auth = createHash('sha256').update('hook-user:hook-pass').digest('hex');
    expect(phonepeProvider.parseWebhook(body, { authorization: auth })).toMatchObject({
      valid: true, outcome: 'paid', providerOrderId: ORDER_ID, providerPaymentId: 'TX1', amountMinor: 10_000,
    });
    expect(phonepeProvider.parseWebhook(body, { authorization: createHash('sha256').update('hook-user:wrong').digest('hex') }).valid).toBe(false);
    expect(phonepeProvider.parseWebhook(body, {}).valid).toBe(false);
  });

  it('refunds against our merchant order id', async () => {
    mockFetch((url) => (url.endsWith('/v1/oauth/token')
      ? respond({ access_token: 't', expires_at: Math.floor(Date.now() / 1000) + 3600 })
      : respond({ refundId: 'RF1', state: 'PENDING', amount: 10_000 })));
    const refund = await phonepeProvider.refund('TX1', 10_000, { paymentOrderId: ORDER_ID });
    expect(refund).toEqual({ providerRefundId: 'RF1', status: 'pending' });
    const sent = JSON.parse(String(calls.find((c) => c.url.endsWith('/payments/v2/refund'))!.init.body));
    expect(sent).toMatchObject({ originalMerchantOrderId: ORDER_ID, amount: 10_000 });
  });
});
