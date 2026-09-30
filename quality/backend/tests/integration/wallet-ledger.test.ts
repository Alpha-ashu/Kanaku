/**
 * Coin ledger invariants, against the real database.
 *
 *   - Two concurrent debits of 80 against a balance of 100: exactly one wins,
 *     the balance never goes negative, one ledger row is written.
 *   - A retried adjustment (same idempotency key) applies once.
 *   - A frozen wallet refuses the user's own spending but still receives what
 *     the platform owes (credits).
 *   - Ledger rows cannot be edited or deleted (database trigger), and the wallet
 *     balance always equals the sum of its ledger.
 */
import { prisma } from '../../../../backend/src/db/prisma';
import {
  adminAdjust,
  lockWallets,
  postEntry,
  setWalletStatus,
  LEDGER_TX_OPTIONS,
} from '../../../../backend/src/features/wallet/wallet.service';
import { WalletError } from '../../../../backend/src/features/wallet/wallet.errors';
import { cleanupUsers, ledgerOf, makeUser, walletOf } from '../helpers/walletKit';

describe('Coin ledger', () => {
  const ids = { admin: '', spender: '', frozen: '' };
  let dbReady = false;

  beforeAll(async () => {
    try {
      ids.admin = (await makeUser('Ledger Admin', 'admin')).id;
      ids.spender = (await makeUser('Ledger Spender')).id;
      ids.frozen = (await makeUser('Ledger Frozen')).id;
      dbReady = true;
    } catch {
      /* DB unavailable — cases self-skip */
    }
  });

  afterAll(async () => {
    await cleanupUsers(Object.values(ids));
  });

  const debit = (userId: string, amount: number, reference: string) =>
    prisma.$transaction(async (tx) => {
      await lockWallets(tx, [userId]);
      return postEntry(tx, { userId, type: 'SESSION_PAYMENT', amount: -amount, reference, description: 'test debit', userInitiated: true });
    }, LEDGER_TX_OPTIONS);

  it('credits through an audited, idempotent admin adjustment', async () => {
    if (!dbReady) return;
    const input = { userId: ids.spender, amount: 100, reason: 'Opening test balance', actorId: ids.admin, actorRole: 'admin', idempotencyKey: 'ledger-open-1' };
    const [a, b] = await Promise.all([adminAdjust(input), adminAdjust(input)]);
    expect([a.replayed, b.replayed].sort()).toEqual([false, true]);
    expect(a.entry.id).toBe(b.entry.id);
    expect((await walletOf(ids.spender)).available).toBe(100);
  });

  it('never lets two concurrent debits spend the same coins', async () => {
    if (!dbReady) return;
    const results = await Promise.allSettled([debit(ids.spender, 80, `race-a-${Date.now()}`), debit(ids.spender, 80, `race-b-${Date.now()}`)]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBeInstanceOf(WalletError);
    expect((rejected[0].reason as WalletError).code).toBe('INSUFFICIENT_COINS');

    const wallet = await walletOf(ids.spender);
    expect(wallet.available).toBe(20);
    const ledger = await ledgerOf(ids.spender);
    expect(ledger.rows.filter((r) => r.type === 'SESSION_PAYMENT')).toHaveLength(1);
    expect(ledger.available).toBe(wallet.available);
    // Every row records the balance it left behind, and none is negative.
    expect(ledger.rows.every((r) => r.availableAfter >= 0)).toBe(true);
  });

  it('refuses a debit that would overdraw, leaving no trace', async () => {
    if (!dbReady) return;
    await expect(debit(ids.spender, 21, `overdraw-${Date.now()}`)).rejects.toMatchObject({ code: 'INSUFFICIENT_COINS' });
    expect((await walletOf(ids.spender)).available).toBe(20);
  });

  it('a replayed reference cannot post twice (unique reference)', async () => {
    if (!dbReady) return;
    const reference = `dup-${Date.now()}`;
    await debit(ids.spender, 5, reference);
    await expect(debit(ids.spender, 5, reference)).rejects.toBeTruthy();
    expect((await walletOf(ids.spender)).available).toBe(15);
  });

  it('a frozen wallet cannot spend, but still receives credits the platform owes', async () => {
    if (!dbReady) return;
    await adminAdjust({ userId: ids.frozen, amount: 50, reason: 'Opening test balance', actorId: ids.admin, actorRole: 'admin', idempotencyKey: 'frozen-open' });
    await setWalletStatus(ids.frozen, 'FROZEN');
    await expect(debit(ids.frozen, 10, `frozen-debit-${Date.now()}`)).rejects.toMatchObject({ code: 'WALLET_FROZEN' });
    await prisma.$transaction(async (tx) => {
      await lockWallets(tx, [ids.frozen]);
      await postEntry(tx, { userId: ids.frozen, type: 'SESSION_REFUND', amount: 10, reference: `frozen-credit-${Date.now()}`, description: 'refund' });
    }, LEDGER_TX_OPTIONS);
    expect(await walletOf(ids.frozen)).toMatchObject({ available: 60, status: 'FROZEN' });
  });

  it('rejects malformed adjustments', async () => {
    if (!dbReady) return;
    await expect(adminAdjust({ userId: ids.spender, amount: 0, reason: 'zero amount', actorId: ids.admin, actorRole: 'admin', idempotencyKey: 'bad-1' })).rejects.toMatchObject({ code: 'INVALID_ADJUSTMENT' });
    await expect(adminAdjust({ userId: ids.spender, amount: 5, reason: 'no', actorId: ids.admin, actorRole: 'admin', idempotencyKey: 'bad-2' })).rejects.toMatchObject({ code: 'INVALID_ADJUSTMENT' });
    await expect(adminAdjust({ userId: ids.spender, amount: 1.5, reason: 'fractional', actorId: ids.admin, actorRole: 'admin', idempotencyKey: 'bad-3' })).rejects.toMatchObject({ code: 'INVALID_ADJUSTMENT' });
  });

  it('ledger rows are immutable at the database level', async () => {
    if (!dbReady) return;
    const row = await prisma.walletTransaction.findFirstOrThrow({ where: { userId: ids.spender } });
    await expect(prisma.walletTransaction.update({ where: { id: row.id }, data: { amount: 999 } })).rejects.toBeTruthy();
    await expect(prisma.walletTransaction.delete({ where: { id: row.id } })).rejects.toBeTruthy();
    const after = await prisma.walletTransaction.findUniqueOrThrow({ where: { id: row.id } });
    expect(after.amount).toBe(row.amount);
  });

  it('the balance can never be written below zero, even bypassing the service', async () => {
    if (!dbReady) return;
    await expect(prisma.wallet.update({ where: { userId: ids.spender }, data: { availableBalance: -1 } })).rejects.toBeTruthy();
  });
});
