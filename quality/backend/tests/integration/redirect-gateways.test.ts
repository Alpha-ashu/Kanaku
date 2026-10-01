/**
 * PhonePe and Paytm end to end through the real routes, with the gateways' HTTP
 * APIs mocked (fetch). Coins must be credited once, only on the provider's word
 * (verified webhook or status API), and the browser's return must never be
 * enough on its own. The admin `wallet` module gate is passed through here (it
 * is covered by finance-rbac.test.ts).
 */
jest.mock('../../../../backend/src/middleware/featureGate', () => ({
  ...jest.requireActual('../../../../backend/src/middleware/featureGate'),
  requireFeature: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import request from 'supertest';
import { createHash } from 'crypto';
import { app } from '../../../../backend/src/app';
import { prisma } from '../../../../backend/src/db/prisma';
import { generateSignature } from '../../../../backend/src/features/payments/providers/paytmChecksum';
import { API, bearer, cleanupUsers, makePackage, makeUser, walletOf } from '../helpers/walletKit';

const PAYTM_KEY = 'abcdEFGH12345678';
const PAYTM_MID = 'KANAKU00000001';

type Answer = { ok: boolean; status: number; text: () => Promise<string> };
const answer = (body: unknown, status = 200): Answer => ({ ok: status < 300, status, text: async () => JSON.stringify(body) });

describe('Redirect payment gateways (PhonePe, Paytm)', () => {
  const saved = { ...process.env };
  const ids = { buyer: '' };
  let pkgId = '';
  let dbReady = false;
  let phonepeStatus: Record<string, unknown> = { state: 'PENDING' };
  let paytmStatus: Record<string, unknown> = { resultInfo: { resultStatus: 'PENDING' } };

  beforeAll(async () => {
    Object.assign(process.env, {
      PAYMENT_PROVIDERS: 'razorpay,phonepe,paytm,sandbox',
      PHONEPE_CLIENT_ID: 'client-id', PHONEPE_CLIENT_SECRET: 'client-secret', PHONEPE_ENV: 'sandbox',
      PHONEPE_WEBHOOK_USERNAME: 'hook-user', PHONEPE_WEBHOOK_PASSWORD: 'hook-pass',
      PAYTM_MID, PAYTM_MERCHANT_KEY: PAYTM_KEY, PAYTM_ENV: 'staging',
      API_PUBLIC_URL: 'https://api.example.test', FRONTEND_URL: 'https://app.example.test',
      WALLET_PURCHASE_RATE_LIMIT: '100',
    });
    jest.spyOn(global, 'fetch').mockImplementation((async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/v1/oauth/token')) return answer({ access_token: 'tok', expires_at: Math.floor(Date.now() / 1000) + 3600 });
      if (url.endsWith('/checkout/v2/pay')) {
        const body = JSON.parse(String(init?.body));
        return answer({ orderId: `OMO-${body.merchantOrderId}`, state: 'PENDING', redirectUrl: `https://mercury.example/pay/${body.merchantOrderId}` });
      }
      if (url.includes('/checkout/v2/order/')) return answer(phonepeStatus);
      if (url.includes('/theia/api/v1/initiateTransaction')) return answer({ body: { resultInfo: { resultStatus: 'S', resultCode: '0000' }, txnToken: 'PAYTM-TXN-TOKEN' } });
      if (url.endsWith('/v3/order/status')) return answer({ body: paytmStatus });
      throw new Error(`unexpected outbound call in test: ${url}`);
    }) as unknown as typeof fetch);
    try {
      ids.buyer = (await makeUser('Redirect Buyer')).id;
      pkgId = (await makePackage(100, 10_000, 10)).id;
      dbReady = true;
    } catch {
      /* no database — cases self-skip */
    }
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    process.env = { ...saved };
    await cleanupUsers(Object.values(ids));
  });

  const buy = (provider: string, key: string) =>
    request(app).post(`${API}/wallet/purchases`).set(bearer(ids.buyer)).send({ packageId: pkgId, provider, clientRequestId: key });

  it('offers PhonePe and Paytm once configured and enabled', async () => {
    if (!dbReady) return;
    const res = await request(app).get(`${API}/wallet/packages`).set(bearer(ids.buyer));
    const offered = res.body.data.providers.map((p: { id: string }) => p.id);
    expect(offered).toEqual(expect.arrayContaining(['phonepe', 'paytm']));
  });

  describe('PhonePe', () => {
    let orderId = '';

    it('sends the browser to PhonePe with our order id and the wallet as return page', async () => {
      if (!dbReady) return;
      const res = await buy('phonepe', 'phonepe-key-000001');
      expect([200, 201]).toContain(res.status);
      orderId = res.body.data.order.id;
      expect(res.body.data.checkout).toEqual({ provider: 'phonepe', mode: 'redirect', url: `https://mercury.example/pay/${orderId}` });
      const row = await prisma.paymentOrder.findUniqueOrThrow({ where: { id: orderId } });
      expect(row.providerOrderId).toBe(orderId);
    });

    it('credits once from a verified webhook — even after a forged delivery with the same id — and never from the forgery', async () => {
      if (!dbReady) return;
      const before = (await walletOf(ids.buyer)).available;
      const payload = {
        event: 'checkout.order.completed',
        payload: { merchantOrderId: orderId, orderId: `OMO-${orderId}`, state: 'COMPLETED', amount: 10_000, paymentDetails: [{ transactionId: `TX-${orderId}`, amount: 10_000, state: 'COMPLETED', paymentMode: 'UPI_INTENT' }] },
      };
      const forged = await request(app).post(`${API}/payments/webhooks/phonepe`).set('Content-Type', 'application/json')
        .set('Authorization', createHash('sha256').update('hook-user:guess').digest('hex')).send(JSON.stringify(payload));
      expect(forged.status).toBeGreaterThanOrEqual(400);
      expect((await walletOf(ids.buyer)).available).toBe(before);

      const auth = createHash('sha256').update('hook-user:hook-pass').digest('hex');
      const first = await request(app).post(`${API}/payments/webhooks/phonepe`).set('Content-Type', 'application/json').set('Authorization', auth).send(JSON.stringify(payload));
      const again = await request(app).post(`${API}/payments/webhooks/phonepe`).set('Content-Type', 'application/json').set('Authorization', auth).send(JSON.stringify(payload));
      expect(first.status).toBe(200);
      expect(again.status).toBe(200);
      expect((await walletOf(ids.buyer)).available).toBe(before + 110);
      expect((await prisma.paymentOrder.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('PAID');
    });

    it('sends a returning browser to the wallet page for that order', async () => {
      if (!dbReady) return;
      const res = await request(app).get(`${API}/payments/return/phonepe?purchase=${orderId}`);
      expect(res.status).toBe(303);
      expect(res.headers.location).toBe(`https://app.example.test/wallet?purchase=${orderId}`);
    });
  });

  describe('Paytm', () => {
    let orderId = '';
    let launch = '';

    it('hands out a signed launch link that opens Paytm with a form post', async () => {
      if (!dbReady) return;
      const res = await buy('paytm', 'paytm-key-00000001');
      orderId = res.body.data.order.id;
      expect(res.body.data.checkout.mode).toBe('redirect');
      launch = new URL(res.body.data.checkout.url).pathname + new URL(res.body.data.checkout.url).search;
      expect(launch).toMatch(new RegExp(`^/api/v1/payments/launch/paytm/${orderId}\\?t=`));

      const page = await request(app).get(launch);
      expect(page.status).toBe(200);
      expect(page.text).toContain(`action="https://securegw-stage.paytm.in/theia/api/v1/showPaymentPage?mid=${PAYTM_MID}&amp;orderId=${orderId}"`);
      expect(page.text).toContain('value="PAYTM-TXN-TOKEN"');
      expect(page.headers['content-security-policy']).toContain('form-action https://securegw-stage.paytm.in');
      expect(page.headers['cache-control']).toBe('no-store');

      const tampered = await request(app).get(launch.replace(/t=(\d+)\./, (_m, exp) => `t=${Number(exp) + 60}.`));
      expect(tampered.status).toBe(403);
    });

    it("settles from Paytm's status API when the browser returns — the post itself proves nothing", async () => {
      if (!dbReady) return;
      const before = (await walletOf(ids.buyer)).available;
      const fields = { MID: PAYTM_MID, ORDERID: orderId, TXNID: `PT-${orderId}`, TXNAMOUNT: '100.00', STATUS: 'TXN_SUCCESS', CURRENCY: 'INR' };
      const form = new URLSearchParams({ ...fields, CHECKSUMHASH: generateSignature(fields, PAYTM_KEY) }).toString();

      // Paytm has not confirmed yet: the return redirects but credits nothing.
      paytmStatus = { resultInfo: { resultStatus: 'PENDING' } };
      const early = await request(app).post(`${API}/payments/return/paytm`).set('Content-Type', 'application/x-www-form-urlencoded').send(form);
      expect(early.status).toBe(303);
      expect(early.headers.location).toBe(`https://app.example.test/wallet?purchase=${orderId}`);
      await new Promise((r) => setTimeout(r, 300));
      expect((await walletOf(ids.buyer)).available).toBe(before);

      // Now Paytm's own API says paid: the next return (or poll) credits once.
      paytmStatus = { resultInfo: { resultStatus: 'TXN_SUCCESS' }, txnId: `PT-${orderId}`, txnAmount: '100.00' };
      await request(app).post(`${API}/payments/return/paytm`).set('Content-Type', 'application/x-www-form-urlencoded').send(form);
      let status = '';
      for (let i = 0; i < 30 && status !== 'PAID'; i += 1) {
        await new Promise((r) => setTimeout(r, 100));
        status = (await prisma.paymentOrder.findUniqueOrThrow({ where: { id: orderId } })).status;
      }
      expect(status).toBe('PAID');
      expect((await walletOf(ids.buyer)).available).toBe(before + 110);

      // A replayed launch link for a settled order is refused.
      expect((await request(app).get(launch)).status).toBe(409);
    });
  });
});
