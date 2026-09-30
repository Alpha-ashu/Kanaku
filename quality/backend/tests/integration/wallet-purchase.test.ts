/**
 * Buying coins, end to end over HTTP, with the sandbox gateway.
 *
 * The rule under test: coins are credited only on a provider-verified
 * confirmation — a signed checkout result that the provider's own status
 * agrees with, or a signed webhook — exactly once, whichever arrives first,
 * however many times, and never on the browser's say-so.
 *
 * The admin `wallet` module gate is passed through here (its behaviour is
 * covered by finance-rbac.test.ts); everything else is the real stack.
 */
jest.mock('../../../../backend/src/middleware/featureGate', () => ({
  ...jest.requireActual('../../../../backend/src/middleware/featureGate'),
  requireFeature: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import request from 'supertest';
import { app } from '../../../../backend/src/app';
import { prisma } from '../../../../backend/src/db/prisma';
import { signSandboxWebhook } from '../../../../backend/src/features/payments/providers/sandbox.provider';
import { reconcileOrder, reconcileStaleOrders } from '../../../../backend/src/features/wallet/coinPurchase.service';
import { API, bearer, cleanupUsers, ledgerOf, makePackage, makeUser, walletOf } from '../helpers/walletKit';

const sendWebhook = (body: Record<string, unknown>, signature?: string) => {
  const raw = JSON.stringify(body);
  return request(app)
    .post(`${API}/payments/webhooks/sandbox`)
    .set('Content-Type', 'application/json')
    .set('x-sandbox-signature', signature ?? signSandboxWebhook(raw))
    .send(raw);
};

describe('Coin purchase', () => {
  const ids = { buyer: '', other: '' };
  let pkgId = '';
  let inactivePkgId = '';
  let dbReady = false;

  beforeAll(async () => {
    // One user creates a dozen orders here; the production ceiling is 10 / 10 min.
    process.env.WALLET_PURCHASE_RATE_LIMIT = '100';
    try {
      ids.buyer = (await makeUser('Coin Buyer')).id;
      ids.other = (await makeUser('Coin Other')).id;
      pkgId = (await makePackage(100, 10_000, 10)).id;
      const inactive = await makePackage(50, 5_000);
      inactivePkgId = (await prisma.coinPackage.update({ where: { id: inactive.id }, data: { isActive: false } })).id;
      dbReady = true;
    } catch {
      /* DB unavailable — cases self-skip */
    }
  });

  afterAll(async () => {
    await cleanupUsers(Object.values(ids));
  });

  const createOrder = (key: string, userId = ids.buyer, packageId = pkgId) =>
    request(app).post(`${API}/wallet/purchases`).set(bearer(userId)).send({ packageId, provider: 'sandbox', clientRequestId: key });

  it('starts at zero and lists only active packages', async () => {
    if (!dbReady) return;
    const wallet = await request(app).get(`${API}/wallet`).set(bearer(ids.buyer));
    expect(wallet.status).toBe(200);
    expect(wallet.body.data).toMatchObject({ availableBalance: 0, pendingBalance: 0 });
    expect(Date.parse(wallet.body.data.serverNow)).not.toBeNaN();

    const packages = await request(app).get(`${API}/wallet/packages`).set(bearer(ids.buyer));
    const listed = packages.body.data.packages.map((p: { id: string }) => p.id);
    expect(listed).toContain(pkgId);
    expect(listed).not.toContain(inactivePkgId);
    expect(packages.body.data.providers.map((p: { id: string }) => p.id)).toContain('sandbox');
  });

  it('refuses inactive packages and replays a retried order instead of creating another', async () => {
    if (!dbReady) return;
    expect((await createOrder('inactive-key-1', ids.buyer, inactivePkgId)).body.code).toBe('PACKAGE_UNAVAILABLE');

    const [a, b] = await Promise.all([createOrder('retry-key-000001'), createOrder('retry-key-000001')]);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(a.body.data.order.id).toBe(b.body.data.order.id);
    expect(a.body.data.order).toMatchObject({ status: 'CREATED', coins: 110, amountMinor: 10_000 });
    expect(a.body.data.checkout).toMatchObject({ provider: 'sandbox' });
    expect(await prisma.paymentOrder.count({ where: { userId: ids.buyer, idempotencyKey: 'retry-key-000001' } })).toBe(1);
  });

  it('never credits on the browser saying so', async () => {
    if (!dbReady) return;
    const order = (await createOrder('forged-key-00001')).body.data.order;
    for (const payload of [
      { paymentSuccess: 'true' },
      { status: 'captured' },
      { sandbox_payment_id: 'sbx_pay_fake', sandbox_signature: 'deadbeef'.repeat(8) },
    ]) {
      const res = await request(app).post(`${API}/wallet/purchases/${order.id}/verify`).set(bearer(ids.buyer)).send({ payload });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('PAYMENT_VERIFICATION_FAILED');
    }
    expect((await walletOf(ids.buyer)).available).toBe(0);
  });

  it('credits a verified checkout exactly once, however often it is confirmed', async () => {
    if (!dbReady) return;
    const order = (await createOrder('happy-key-000001')).body.data.order;
    const paid = await request(app).post(`${API}/wallet/purchases/${order.id}/sandbox-pay`).set(bearer(ids.buyer)).send({ outcome: 'paid' });
    expect(paid.status).toBe(200);
    const { payload } = paid.body.data;

    const verify = () => request(app).post(`${API}/wallet/purchases/${order.id}/verify`).set(bearer(ids.buyer)).send({ payload });
    const [first, second] = await Promise.all([verify(), verify()]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.data.order.status).toBe('PAID');
    expect(first.body.data.availableBalance).toBe(110);
    expect(first.body.data.transactionId).toBeTruthy();

    // Webhook for the same payment arrives afterwards: acknowledged, no second credit.
    const webhook = await sendWebhook({ id: `evt-${order.id}`, event: 'payment.paid', orderId: (await prisma.paymentOrder.findUniqueOrThrow({ where: { id: order.id } })).providerOrderId, paymentId: payload.sandbox_payment_id, amount: 10_000, currency: 'INR' });
    expect(webhook.status).toBe(200);

    expect((await walletOf(ids.buyer)).available).toBe(110);
    const credits = await prisma.walletTransaction.findMany({ where: { paymentOrderId: order.id, type: 'PAYMENT_CREDIT' } });
    expect(credits).toHaveLength(1);
    expect(credits[0].amount).toBe(110);
    const ledger = await ledgerOf(ids.buyer);
    expect(ledger.available).toBe(110);

    const mine = await request(app).get(`${API}/wallet/transactions`).set(bearer(ids.buyer));
    expect(mine.body.data.items[0]).toMatchObject({ type: 'PAYMENT_CREDIT', amount: 110, availableAfter: 110 });
    expect(mine.body.data.items[0]).not.toHaveProperty('actorId');
  });

  it('credits from a signed webhook alone, and ignores its redelivery', async () => {
    if (!dbReady) return;
    const order = (await createOrder('webhook-key-0001')).body.data.order;
    const row = await prisma.paymentOrder.findUniqueOrThrow({ where: { id: order.id } });
    await request(app).post(`${API}/wallet/purchases/${order.id}/sandbox-pay`).set(bearer(ids.buyer)).send({ outcome: 'paid' });
    const event = { id: `evt-wh-${order.id}`, event: 'payment.paid', orderId: row.providerOrderId, paymentId: `sbx_pay_wh_${order.id}`, amount: 10_000, currency: 'INR' };

    const [a, b] = await Promise.all([sendWebhook(event), sendWebhook(event)]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    const again = await sendWebhook(event);
    expect(again.body.duplicate).toBe(true);

    expect(await prisma.walletTransaction.count({ where: { paymentOrderId: order.id, type: 'PAYMENT_CREDIT' } })).toBe(1);
    expect(await prisma.paymentWebhookEvent.count({ where: { provider: 'sandbox', eventId: event.id } })).toBe(1);
    expect((await prisma.paymentOrder.findUniqueOrThrow({ where: { id: order.id } })).verifiedVia).toBe('webhook');
    expect((await walletOf(ids.buyer)).available).toBe(220);
  });

  it('rejects an unsigned or forged webhook and credits nothing', async () => {
    if (!dbReady) return;
    const order = (await createOrder('forged-webhook-1')).body.data.order;
    const row = await prisma.paymentOrder.findUniqueOrThrow({ where: { id: order.id } });
    const event = { id: `evt-forged-${order.id}`, event: 'payment.paid', orderId: row.providerOrderId, paymentId: `sbx_pay_forged_${order.id}`, amount: 10_000 };
    const res = await sendWebhook(event, 'not-a-signature');
    expect(res.status).toBe(401);
    expect((await prisma.paymentWebhookEvent.findFirstOrThrow({ where: { eventId: event.id } })).status).toBe('REJECTED');
    expect((await prisma.paymentOrder.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('CREATED');
    expect((await walletOf(ids.buyer)).available).toBe(220);
  });

  it('never credits a captured amount that differs from the order', async () => {
    if (!dbReady) return;
    const order = (await createOrder('mismatch-key-001')).body.data.order;
    const row = await prisma.paymentOrder.findUniqueOrThrow({ where: { id: order.id } });
    const res = await sendWebhook({ id: `evt-mm-${order.id}`, event: 'payment.paid', orderId: row.providerOrderId, paymentId: `sbx_pay_mm_${order.id}`, amount: 100 });
    expect(res.status).toBe(200);
    const after = await prisma.paymentOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(after.creditedAt).toBeNull();
    expect(after.failureReason).toMatch(/AMOUNT_MISMATCH/);
    expect((await walletOf(ids.buyer)).available).toBe(220);
  });

  it('checks a newly abandoned order even behind a backlog of already-checked ones', async () => {
    if (!dbReady) return;
    // 30 stale orders that were checked 10 minutes ago (due again) and are older:
    // oldest-first used to fill every 25-order batch with them.
    const longAgo = new Date(Date.now() - 6 * 60 * 60_000);
    await prisma.paymentOrder.createMany({
      data: Array.from({ length: 30 }, (_, i) => ({
        userId: ids.other, packageId: pkgId, provider: 'sandbox', providerOrderId: `sbx_backlog_${Date.now()}_${i}`,
        amountMinor: 10_000, currency: 'INR', coins: 110, status: 'EXPIRED',
        expiresAt: longAgo, createdAt: new Date(Date.now() - 20 * 60 * 60_000), lastCheckedAt: new Date(Date.now() - 10 * 60_000),
      })),
    });
    const fresh = (await createOrder('backlog-key-0001')).body.data.order;
    await prisma.paymentOrder.update({ where: { id: fresh.id }, data: { expiresAt: new Date(Date.now() - 60_000), createdAt: new Date(Date.now() - 40 * 60_000) } });

    await reconcileStaleOrders(new Date());
    expect((await prisma.paymentOrder.findUniqueOrThrow({ where: { id: fresh.id } })).status).toBe('EXPIRED');
    await prisma.paymentOrder.deleteMany({ where: { providerOrderId: { startsWith: 'sbx_backlog_' } } });
  });

  it('marks declined payments failed, expires abandoned ones, and still credits a late capture', async () => {
    if (!dbReady) return;
    const declined = (await createOrder('declined-key-001')).body.data.order;
    await request(app).post(`${API}/wallet/purchases/${declined.id}/sandbox-pay`).set(bearer(ids.buyer)).send({ outcome: 'failed' });
    expect((await reconcileOrder(declined.id)).status).toBe('FAILED');

    const abandoned = (await createOrder('abandon-key-0001')).body.data.order;
    await prisma.paymentOrder.update({ where: { id: abandoned.id }, data: { expiresAt: new Date(Date.now() - 60_000), createdAt: new Date(Date.now() - 40 * 60_000) } });
    await reconcileStaleOrders(new Date());
    expect((await prisma.paymentOrder.findUniqueOrThrow({ where: { id: abandoned.id } })).status).toBe('EXPIRED');

    // The capture lands after our expiry: the money was taken, so the coins are owed.
    const row = await prisma.paymentOrder.findUniqueOrThrow({ where: { id: abandoned.id } });
    await request(app).post(`${API}/wallet/purchases/${abandoned.id}/sandbox-pay`).set(bearer(ids.buyer)).send({ outcome: 'paid' });
    await sendWebhook({ id: `evt-late-${abandoned.id}`, event: 'payment.paid', orderId: row.providerOrderId, paymentId: `sbx_pay_late_${abandoned.id}`, amount: 10_000 });
    expect((await prisma.paymentOrder.findUniqueOrThrow({ where: { id: abandoned.id } })).status).toBe('PAID');
    expect((await walletOf(ids.buyer)).available).toBe(330);
  });

  it('never credits one provider payment to two orders', async () => {
    if (!dbReady) return;
    const paid = await prisma.paymentOrder.findFirstOrThrow({ where: { userId: ids.buyer, status: 'PAID', providerPaymentId: { not: null } } });
    const order = (await createOrder('reuse-key-00001')).body.data.order;
    const row = await prisma.paymentOrder.findUniqueOrThrow({ where: { id: order.id } });
    const before = (await walletOf(ids.buyer)).available;
    const res = await sendWebhook({ id: `evt-reuse-${order.id}`, event: 'payment.paid', orderId: row.providerOrderId, paymentId: paid.providerPaymentId, amount: 10_000 });
    // Acknowledged (so the provider stops redelivering) but not credited, and flagged.
    expect(res.status).toBe(200);
    const after = await prisma.paymentOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(after.creditedAt).toBeNull();
    expect(after.failureReason).toMatch(/PAYMENT_ID_REUSED/);
    expect((await walletOf(ids.buyer)).available).toBe(before);
  });

  it("cannot see, verify, pay or cancel another user's order", async () => {
    if (!dbReady) return;
    const order = (await createOrder('private-key-0001')).body.data.order;
    expect((await request(app).get(`${API}/wallet/purchases/${order.id}`).set(bearer(ids.other))).status).toBe(404);
    expect((await request(app).post(`${API}/wallet/purchases/${order.id}/verify`).set(bearer(ids.other)).send({ payload: {} })).status).toBe(404);
    expect((await request(app).post(`${API}/wallet/purchases/${order.id}/sandbox-pay`).set(bearer(ids.other)).send({ outcome: 'paid' })).status).toBe(404);
    expect((await request(app).post(`${API}/wallet/purchases/${order.id}/cancel`).set(bearer(ids.other))).status).toBe(404);
    const theirs = await request(app).get(`${API}/wallet/purchases`).set(bearer(ids.other));
    expect(theirs.body.data.items).toHaveLength(0);
    // And the other user's ledger shows none of the buyer's rows even if asked.
    const ledger = await request(app).get(`${API}/wallet/transactions?userId=${ids.buyer}`).set(bearer(ids.other));
    expect(ledger.body.data.items).toHaveLength(0);
  });
});
