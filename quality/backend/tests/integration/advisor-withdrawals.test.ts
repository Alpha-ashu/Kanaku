/**
 * Advisor withdrawals, end to end over HTTP.
 *
 * The rules under test:
 *   - only coins EARNED from completed sessions can be withdrawn; bought coins
 *     stay spend-only, and the minimum is 300 coins;
 *   - payout details need the password (step-up) to change, are stored
 *     encrypted, and are listed only masked — the full account is an audited,
 *     admin-only read;
 *   - a request takes the coins out of the wallet at once; a retry with the same
 *     key is a replay, and an advisor has at most one open request;
 *   - staff approve (which locks out the advisor's cancel), then mark paid with
 *     a reference; a rejected or cancelled request returns the coins exactly once;
 *   - the wallet always equals its ledger.
 *
 * The admin `wallet` module gate is passed through (covered by finance-rbac).
 */
jest.mock('../../../../backend/src/middleware/featureGate', () => ({
  ...jest.requireActual('../../../../backend/src/middleware/featureGate'),
  requireFeature: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { app } from '../../../../backend/src/app';
import { prisma } from '../../../../backend/src/db/prisma';
import { lockWallets, postEntry, type LedgerType } from '../../../../backend/src/features/wallet/wallet.service';
import { financialDeletionBlockers } from '../../../../backend/src/features/wallet/wallet.guards';
import { API, bearer, cleanupUsers, ledgerOf, makeAdvisor, makeUser, walletOf } from '../helpers/walletKit';

const PASSWORD = 'Withdraw#2026';
const UPI = 'ravi.kumar@okhdfc';

/** Posts a ledger row directly — the way a released earning or a purchase lands. */
const post = (userId: string, type: LedgerType, amount: number) =>
  prisma.$transaction(async (tx) => {
    await lockWallets(tx, [userId]);
    await postEntry(tx, { userId, type, amount, reference: `test:${type}:${randomUUID()}`, description: `test ${type}` });
  });

describe('Advisor withdrawals', () => {
  const ids = { advisor: '', second: '', noMethod: '', admin: '', manager: '', user: '' };
  let dbReady = false;
  const previousKey = process.env.AA_ENCRYPTION_ROOT_KEY;

  beforeAll(async () => {
    process.env.AA_ENCRYPTION_ROOT_KEY = 'ab'.repeat(32);
    try {
      const hash = await bcrypt.hash(PASSWORD, 4);
      ids.advisor = (await makeAdvisor('Payout Advisor', 1000)).id;
      ids.second = (await makeAdvisor('Payout Second', 1000)).id;
      ids.noMethod = (await makeAdvisor('Payout NoMethod', 1000)).id;
      ids.admin = (await makeUser('Payout Admin', 'admin')).id;
      ids.manager = (await makeUser('Payout Manager', 'manager')).id;
      ids.user = (await makeUser('Payout User')).id;
      await prisma.user.updateMany({ where: { id: { in: [ids.advisor, ids.second, ids.noMethod] } }, data: { password: hash } });
      dbReady = true;
    } catch {
      /* DB unavailable — cases self-skip */
    }
  });

  afterAll(async () => {
    if (previousKey === undefined) delete process.env.AA_ENCRYPTION_ROOT_KEY;
    else process.env.AA_ENCRYPTION_ROOT_KEY = previousKey;
    await prisma.withdrawalRequest.deleteMany({ where: { userId: { in: Object.values(ids).filter(Boolean) } } }).catch(() => undefined);
    await cleanupUsers(Object.values(ids));
  });

  const asAdvisor = (userId: string) => bearer(userId, 'advisor');
  const asAdmin = () => bearer(ids.admin, 'admin');
  const savePayout = (userId: string, body: Record<string, unknown>) =>
    request(app).put(`${API}/wallet/payout-method`).set(asAdvisor(userId)).send(body);
  const withdraw = (userId: string, coins: number, key = `wd-${randomUUID()}`) =>
    request(app).post(`${API}/wallet/withdrawals`).set(asAdvisor(userId)).send({ coins, clientRequestId: key });
  const overview = async (userId: string) => (await request(app).get(`${API}/wallet/withdrawals`).set(asAdvisor(userId))).body.data;

  it('is for advisors only', async () => {
    if (!dbReady) return;
    expect((await request(app).get(`${API}/wallet/withdrawals`).set(bearer(ids.user))).status).toBe(403);
    expect((await request(app).post(`${API}/wallet/withdrawals`).set(bearer(ids.user)).send({ coins: 300, clientRequestId: 'user-wd-0001' })).status).toBe(403);
  });

  it('never lets bought coins be withdrawn', async () => {
    if (!dbReady) return;
    await post(ids.advisor, 'PAYMENT_CREDIT', 500);
    const data = await overview(ids.advisor);
    expect(data).toMatchObject({ availableBalance: 500, withdrawableCoins: 0, minCoins: 300, coinValueMinor: 100, payoutMethod: null, open: null });
  });

  it('changes payout details only with the password, and stores them encrypted', async () => {
    if (!dbReady) return;
    const details = { method: 'UPI', upiId: ` ${UPI.toUpperCase()} ` };

    const noProof = await savePayout(ids.advisor, { details });
    expect(noProof.status).toBe(428);
    const wrong = await savePayout(ids.advisor, { details, proof: { method: 'password', password: 'not-it' } });
    expect(wrong.status).toBe(403);
    expect(await prisma.payoutMethod.findUnique({ where: { userId: ids.advisor } })).toBeNull();

    const invalid = await savePayout(ids.advisor, { details: { method: 'UPI', upiId: 'not-a-upi' }, proof: { method: 'password', password: PASSWORD } });
    expect(invalid.status).toBe(400);

    const ok = await savePayout(ids.advisor, { details, proof: { method: 'password', password: PASSWORD } });
    expect(ok.status).toBe(200);
    expect(ok.body.data.payoutMethod).toMatchObject({ method: 'UPI', label: 'UPI · ra•••@okhdfc' });

    const stored = await prisma.payoutMethod.findUnique({ where: { userId: ids.advisor } });
    expect(stored?.detailsEncrypted).toBeTruthy();
    expect(stored?.detailsEncrypted).not.toContain('ravi');
    expect(Buffer.from(stored!.detailsEncrypted, 'base64').toString('utf8')).not.toContain('ravi');

    const bank = await savePayout(ids.second, {
      details: { method: 'BANK', accountHolder: 'Asha Menon', accountNumber: '1234 5678 9012', ifsc: 'hdfc0001234' },
      proof: { method: 'password', password: PASSWORD },
    });
    expect(bank.status).toBe(200);
    expect(bank.body.data.payoutMethod.label).toBe('Bank · A/c ••••9012 · HDFC0001234');
  });

  it('enforces the minimum and the earned-coins ceiling', async () => {
    if (!dbReady) return;
    await post(ids.advisor, 'EARNING_RELEASE', 700);
    expect((await overview(ids.advisor)).withdrawableCoins).toBe(700);

    const small = await withdraw(ids.advisor, 299);
    expect(small.status).toBe(400);
    expect(small.body.code).toBe('WITHDRAWAL_BELOW_MINIMUM');

    // 1,200 coins in the wallet, but only 700 of them were earned.
    const tooMuch = await withdraw(ids.advisor, 800);
    expect(tooMuch.status).toBe(409);
    expect(tooMuch.body.code).toBe('WITHDRAWAL_EXCEEDS_EARNINGS');
    expect(tooMuch.body.details.withdrawableCoins).toBe(700);

    const noMethod = await post(ids.noMethod, 'EARNING_RELEASE', 400).then(() => withdraw(ids.noMethod, 300));
    expect(noMethod.body.code).toBe('PAYOUT_METHOD_REQUIRED');
    expect((await walletOf(ids.noMethod)).available).toBe(400);
  });

  it('takes the coins at once, replays a retry, and allows one open request', async () => {
    if (!dbReady) return;
    const key = 'wd-retry-000001';
    const [a, b] = await Promise.all([withdraw(ids.advisor, 400, key), withdraw(ids.advisor, 400, key)]);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(a.body.data.withdrawal.id).toBe(b.body.data.withdrawal.id);
    expect(a.body.data.withdrawal).toMatchObject({ coins: 400, amountMinor: 40_000, status: 'REQUESTED', payoutLabel: 'UPI · ra•••@okhdfc' });
    expect(a.body.data.withdrawal.payoutDetailsEncrypted).toBeUndefined();

    expect((await walletOf(ids.advisor)).available).toBe(800);
    const another = await withdraw(ids.advisor, 300);
    expect(another.status).toBe(409);
    expect(another.body.code).toBe('WITHDRAWAL_ALREADY_OPEN');

    const data = await overview(ids.advisor);
    expect(data.open?.id).toBe(a.body.data.withdrawal.id);
    expect(data.withdrawableCoins).toBe(300);
    expect(await financialDeletionBlockers(ids.advisor)).toEqual(expect.arrayContaining([expect.stringContaining('withdrawal of 400 coins')]));
  });

  it('returns the coins exactly once when the advisor cancels', async () => {
    if (!dbReady) return;
    const open = (await overview(ids.advisor)).open;
    const cancel = () => request(app).post(`${API}/wallet/withdrawals/${open.id}/cancel`).set(asAdvisor(ids.advisor));
    const [first, second] = await Promise.all([cancel(), cancel()]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
    expect((await walletOf(ids.advisor)).available).toBe(1200);

    const reversal = await prisma.walletTransaction.findUnique({ where: { reference: `withdrawal:${open.id}:reversal` } });
    const hold = await prisma.walletTransaction.findUnique({ where: { reference: `withdrawal:${open.id}` } });
    expect(reversal).toMatchObject({ type: 'WITHDRAWAL_REVERSAL', amount: 400, reversalOfId: hold?.id });

    // Someone else's request is not found, not cancelled.
    expect((await request(app).post(`${API}/wallet/withdrawals/${open.id}/cancel`).set(asAdvisor(ids.second))).status).toBe(404);
  });

  it('lets only an admin pay out, after approval, with a reference', async () => {
    if (!dbReady) return;
    const created = await withdraw(ids.advisor, 300);
    expect(created.status).toBe(201);
    const id = created.body.data.withdrawal.id;

    // Listed masked; managers cannot act; advisors cannot reach the console.
    const list = await request(app).get(`${API}/finance/withdrawals`).query({ status: 'OPEN' }).set(asAdmin());
    expect(list.status).toBe(200);
    const row = list.body.data.items.find((r: { id: string }) => r.id === id);
    expect(row).toMatchObject({ status: 'REQUESTED', payoutLabel: 'UPI · ra•••@okhdfc', user: { id: ids.advisor } });
    expect(row.payoutMethodChangedAt).toBeTruthy();
    expect(JSON.stringify(list.body)).not.toContain(UPI);
    expect((await request(app).post(`${API}/finance/withdrawals/${id}/approve`).set(bearer(ids.manager, 'manager'))).status).toBe(403);
    expect((await request(app).get(`${API}/finance/withdrawals/${id}/payout-details`).set(bearer(ids.manager, 'manager'))).status).toBe(403);
    expect((await request(app).get(`${API}/finance/withdrawals`).set(asAdvisor(ids.advisor))).status).toBe(403);

    // The full account, for paying it — audited.
    const reveal = await request(app).get(`${API}/finance/withdrawals/${id}/payout-details`).set(asAdmin());
    expect(reveal.status).toBe(200);
    expect(reveal.body.data.details).toEqual({ method: 'UPI', upiId: UPI });
    // Audit rows are written fire-and-forget; give it a moment to land.
    let viewed = null;
    for (let i = 0; i < 50 && !viewed; i += 1) {
      viewed = await prisma.auditLog.findFirst({ where: { action: 'wallet.payout_details_viewed', resourceId: id } });
      if (!viewed) await new Promise((r) => setTimeout(r, 100));
    }
    expect(viewed?.userId).toBe(ids.admin);

    // Paid only after approval; approval locks out the advisor's cancel.
    const early = await request(app).post(`${API}/finance/withdrawals/${id}/paid`).set(asAdmin()).send({ payoutReference: 'UTR123456789' });
    expect(early.body.code).toBe('WITHDRAWAL_STATE_CHANGED');
    expect((await request(app).post(`${API}/finance/withdrawals/${id}/approve`).set(asAdmin())).body.data.withdrawal.status).toBe('APPROVED');
    expect((await request(app).post(`${API}/wallet/withdrawals/${id}/cancel`).set(asAdvisor(ids.advisor))).status).toBe(409);

    expect((await request(app).post(`${API}/finance/withdrawals/${id}/paid`).set(asAdmin()).send({ payoutReference: '<script>' })).status).toBe(400);
    const paid = await request(app).post(`${API}/finance/withdrawals/${id}/paid`).set(asAdmin()).send({ payoutReference: 'UTR123456789', note: 'IMPS' });
    expect(paid.status).toBe(200);
    expect(paid.body.data.withdrawal).toMatchObject({ status: 'PAID', payoutReference: 'UTR123456789' });
    expect((await request(app).post(`${API}/finance/withdrawals/${id}/reject`).set(asAdmin()).send({ reason: 'too late to reject' })).status).toBe(409);

    // Paying moves no coins: they left the wallet when the request was made.
    expect((await walletOf(ids.advisor)).available).toBe(900);
    const data = await overview(ids.advisor);
    expect(data).toMatchObject({ open: null, withdrawableCoins: 400, paidOut: { coins: 300, amountMinor: 30_000 } });
    expect(data.recent[0]).toMatchObject({ id, status: 'PAID', payoutReference: 'UTR123456789' });
  });

  it('returns the coins when staff reject, even after approval', async () => {
    if (!dbReady) return;
    const id = (await withdraw(ids.advisor, 350)).body.data.withdrawal.id;
    await request(app).post(`${API}/finance/withdrawals/${id}/approve`).set(asAdmin());
    expect((await request(app).post(`${API}/finance/withdrawals/${id}/reject`).set(asAdmin()).send({ reason: 'no' })).status).toBe(400);
    const rejected = await request(app).post(`${API}/finance/withdrawals/${id}/reject`).set(asAdmin()).send({ reason: 'UPI ID could not be verified' });
    expect(rejected.body.data.withdrawal).toMatchObject({ status: 'REJECTED', decisionNote: 'UPI ID could not be verified' });
    expect((await walletOf(ids.advisor)).available).toBe(900);
    expect((await overview(ids.advisor)).withdrawableCoins).toBe(400);
  });

  it('lets only one of two simultaneous requests through', async () => {
    if (!dbReady) return;
    const results = await Promise.all([withdraw(ids.advisor, 300), withdraw(ids.advisor, 300)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect((await walletOf(ids.advisor)).available).toBe(600);
    expect(await prisma.withdrawalRequest.count({ where: { userId: ids.advisor, status: 'REQUESTED' } })).toBe(1);
  });

  it('keeps every wallet equal to its ledger', async () => {
    if (!dbReady) return;
    for (const userId of [ids.advisor, ids.second, ids.noMethod]) {
      const [wallet, ledger] = await Promise.all([walletOf(userId), ledgerOf(userId)]);
      expect({ available: wallet.available, pending: wallet.pending }).toEqual({ available: ledger.available, pending: ledger.pending });
    }
  });
});
