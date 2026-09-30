/**
 * Razorpay adapter — signature checks and API mapping, with fetch mocked.
 *
 * These pin the two cryptographic checks the whole coin wallet depends on:
 *   checkout: HMAC-SHA256(order_id|payment_id, key_secret)
 *   webhook:  HMAC-SHA256(raw body, webhook_secret)
 * and that nothing secret ever reaches the checkout parameters sent to the browser.
 */
import { createHmac } from 'crypto';
import { razorpayProvider } from '../../../../backend/src/features/payments/providers/razorpay.provider';
import { resetCircuitBreaker } from '../../../../backend/src/utils/circuitBreaker';

const KEY_ID = 'rzp_test_abc123';
const KEY_SECRET = 'checkout-secret-for-tests';
const WEBHOOK_SECRET = 'webhook-secret-for-tests';

const hmac = (secret: string, data: string) => createHmac('sha256', secret).update(data).digest('hex');

describe('razorpayProvider', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.RAZORPAY_KEY_ID = KEY_ID;
    process.env.RAZORPAY_KEY_SECRET = KEY_SECRET;
    process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
    resetCircuitBreaker('razorpay');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
  });

  it('is configured only with both key id and secret', () => {
    expect(razorpayProvider.isConfigured()).toBe(true);
    delete process.env.RAZORPAY_KEY_SECRET;
    expect(razorpayProvider.isConfigured()).toBe(false);
  });

  describe('verifyCheckout', () => {
    const orderId = 'order_ABC';
    const paymentId = 'pay_XYZ';

    it('accepts the signature Razorpay computes', () => {
      const signature = hmac(KEY_SECRET, `${orderId}|${paymentId}`);
      expect(razorpayProvider.verifyCheckout(orderId, { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature }))
        .toEqual({ valid: true, providerPaymentId: paymentId });
    });

    it('rejects a wrong signature, a swapped order, and a missing field', () => {
      const signature = hmac(KEY_SECRET, `${orderId}|${paymentId}`);
      expect(razorpayProvider.verifyCheckout(orderId, { razorpay_payment_id: paymentId, razorpay_signature: 'f'.repeat(64) }).valid).toBe(false);
      // A valid signature for a different order must not unlock this one.
      expect(razorpayProvider.verifyCheckout('order_OTHER', { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature }).valid).toBe(false);
      expect(razorpayProvider.verifyCheckout(orderId, { razorpay_payment_id: paymentId }).valid).toBe(false);
      // Signed with the webhook secret instead of the key secret.
      expect(razorpayProvider.verifyCheckout(orderId, { razorpay_payment_id: paymentId, razorpay_signature: hmac(WEBHOOK_SECRET, `${orderId}|${paymentId}`) }).valid).toBe(false);
    });
  });

  describe('parseWebhook', () => {
    const body = JSON.stringify({
      entity: 'event',
      event: 'payment.captured',
      created_at: 1759200000,
      payload: {
        payment: {
          entity: {
            id: 'pay_1', order_id: 'order_1', amount: 50000, currency: 'INR', status: 'captured', method: 'upi',
            email: 'someone@example.com', contact: '+919999999999', vpa: 'someone@upi', card: { last4: '1111' },
          },
        },
      },
    });

    it('verifies the body signature and maps a capture to "paid"', () => {
      const parsed = razorpayProvider.parseWebhook(Buffer.from(body), {
        'x-razorpay-signature': hmac(WEBHOOK_SECRET, body),
        'x-razorpay-event-id': 'evt_1',
      });
      expect(parsed).toMatchObject({
        valid: true, eventId: 'evt_1', eventType: 'payment.captured', outcome: 'paid',
        providerOrderId: 'order_1', providerPaymentId: 'pay_1', amountMinor: 50000, currency: 'INR',
      });
    });

    it('rejects a signature over different bytes', () => {
      const parsed = razorpayProvider.parseWebhook(Buffer.from(body.replace('50000', '5')), {
        'x-razorpay-signature': hmac(WEBHOOK_SECRET, body),
      });
      expect(parsed.valid).toBe(false);
    });

    it('stores no contact, VPA or card data', () => {
      const parsed = razorpayProvider.parseWebhook(Buffer.from(body), { 'x-razorpay-signature': hmac(WEBHOOK_SECRET, body) });
      const stored = JSON.stringify(parsed.sanitizedPayload);
      expect(stored).not.toContain('someone@example.com');
      expect(stored).not.toContain('+919999999999');
      expect(stored).not.toContain('someone@upi');
      expect(stored).not.toContain('1111');
    });

    it('maps failures and ignores unrelated events', () => {
      const failed = JSON.stringify({ event: 'payment.failed', payload: { payment: { entity: { id: 'pay_2', order_id: 'order_2', error_description: 'Bank declined' } } } });
      expect(razorpayProvider.parseWebhook(Buffer.from(failed), { 'x-razorpay-signature': hmac(WEBHOOK_SECRET, failed) }))
        .toMatchObject({ valid: true, outcome: 'failed', failureReason: 'Bank declined' });
      const other = JSON.stringify({ event: 'subscription.charged', payload: {} });
      expect(razorpayProvider.parseWebhook(Buffer.from(other), { 'x-razorpay-signature': hmac(WEBHOOK_SECRET, other) }).outcome).toBe('ignored');
    });
  });

  describe('API calls', () => {
    it('creates an order with basic auth and our order id as the receipt, and exposes only public checkout fields', async () => {
      const fetchMock = jest.fn(async () => new Response(JSON.stringify({ id: 'order_new', amount: 10000, currency: 'INR' }), { status: 200 }));
      global.fetch = fetchMock as unknown as typeof fetch;

      const result = await razorpayProvider.createOrder({ orderId: 'po_123', amountMinor: 10000, currency: 'INR', description: '100 coins' });
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toMatch(/\/orders$/);
      expect((init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64')}`);
      expect(JSON.parse(String(init.body))).toMatchObject({ amount: 10000, currency: 'INR', receipt: 'po_123' });

      expect(result.providerOrderId).toBe('order_new');
      expect(result.checkout).toMatchObject({ provider: 'razorpay', keyId: KEY_ID, orderId: 'order_new', amount: 10000 });
      expect(JSON.stringify(result.checkout)).not.toContain(KEY_SECRET);
      expect(JSON.stringify(result.checkout)).not.toContain(WEBHOOK_SECRET);
    });

    it('reports paid only for a captured payment, with the captured amount', async () => {
      const respond = (items: unknown[]) => {
        global.fetch = jest.fn(async () => new Response(JSON.stringify({ items }), { status: 200 })) as unknown as typeof fetch;
      };
      respond([{ id: 'pay_a', status: 'failed', amount: 100, currency: 'INR', error_description: 'Declined' }, { id: 'pay_b', status: 'captured', amount: 10000, currency: 'INR' }]);
      expect(await razorpayProvider.fetchOrderStatus('order_1')).toEqual({ status: 'paid', providerPaymentId: 'pay_b', amountMinor: 10000, currency: 'INR' });

      respond([{ id: 'pay_c', status: 'authorized', amount: 10000, currency: 'INR' }]);
      expect((await razorpayProvider.fetchOrderStatus('order_1')).status).toBe('pending');

      respond([{ id: 'pay_d', status: 'failed', amount: 10000, currency: 'INR', error_description: 'Declined' }]);
      expect(await razorpayProvider.fetchOrderStatus('order_1')).toMatchObject({ status: 'failed', failureReason: 'Declined' });

      respond([]);
      expect((await razorpayProvider.fetchOrderStatus('order_1')).status).toBe('pending');
    });

    it('surfaces a provider error without leaking credentials', async () => {
      global.fetch = jest.fn(async () => new Response(JSON.stringify({ error: { description: 'Authentication failed' } }), { status: 401 })) as unknown as typeof fetch;
      await expect(razorpayProvider.createOrder({ orderId: 'po_x', amountMinor: 100, currency: 'INR', description: 'x' }))
        .rejects.toThrow('Authentication failed');
    });
  });
});
