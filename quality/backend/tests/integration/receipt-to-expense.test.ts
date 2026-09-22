/**
 * A scanned receipt books exactly one expense.
 *
 * The scanner turns a receipt into an expense by posting to /transactions with
 * `attachment: "bill:<id>"`. The user can reach that more than once for the same
 * receipt — rescanning it, retrying after a dropped connection, refreshing
 * mid-save, double-tapping save — and each of those would otherwise book the
 * amount again and overstate their spending.
 *
 * `ExpenseBill.transactionId` is the key the guard uses, so this also covers the
 * case dedupHash cannot: the user edits the amount or the description before
 * confirming, which changes the hash while still being the same receipt.
 */
import { prisma } from '../../../../backend/src/db/prisma';
import { transactionService } from '../../../../backend/src/features/transactions/transaction.service';

const RUN = `receipt-expense-${Date.now()}`;
const USER_ID = `${RUN}-user`;

describe('Receipt → expense', () => {
  let accountId: string;

  const makeBill = async (suffix: string) => {
    const bill = await prisma.expenseBill.create({
      data: {
        userId: USER_ID,
        originalName: `receipt-${suffix}.jpg`,
        contentType: 'image/jpeg',
        size: 1024,
        storagePath: `${RUN}/${suffix}.jpg`,
        sha256: `${RUN}-${suffix}`,
        scanStatus: 'completed',
      },
    });
    return bill.id;
  };

  /**
   * `description` defaults to something unique per receipt on purpose.
   *
   * dedupHash is userId + amount + day + description, so two cases sharing all
   * four collide and the second silently receives the FIRST case's transaction
   * — which is dedupHash doing its job, but it masks what these tests are
   * actually measuring. Each receipt therefore gets its own description unless
   * a test overrides it deliberately.
   */
  const bookExpense = (billId: string, overrides: Record<string, unknown> = {}) =>
    transactionService.createTransaction(USER_ID, {
      accountId,
      amount: 450,
      category: 'Food & Dining',
      description: `Lunch — ${billId}`,
      date: new Date().toISOString(),
      type: 'expense',
      attachment: `bill:${billId}`,
      ...overrides,
    });

  beforeAll(async () => {
    await prisma.user.create({
      data: {
        id: USER_ID,
        email: `${RUN}@test.local`,
        name: 'Receipt Expense User',
        password: 'test-only-not-a-real-hash',
      },
    });
    const account = await prisma.account.create({
      data: { userId: USER_ID, name: 'Receipt Test Account', type: 'bank', balance: 100000 },
    });
    accountId = account.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: USER_ID } });
  });

  it('creates the expense and links it to the receipt', async () => {
    const billId = await makeBill('linked');
    const tx = await bookExpense(billId);

    expect(tx.id).toBeTruthy();
    expect(Number(tx.amount)).toBe(450);

    const bill = await prisma.expenseBill.findUnique({ where: { id: billId } });
    expect(bill?.transactionId).toBe(tx.id);
  });

  it('returns the SAME expense when the receipt is submitted twice', async () => {
    const billId = await makeBill('replay');

    const first = await bookExpense(billId);
    const second = await bookExpense(billId);

    expect(second.id).toBe(first.id);

    const all = await prisma.transaction.findMany({
      where: { userId: USER_ID, attachment: `bill:${billId}`, deletedAt: null },
    });
    expect(all).toHaveLength(1);
  });

  it('does not book twice when the user edits the amount before retrying', async () => {
    // The case dedupHash misses: different amount and description, same receipt.
    const billId = await makeBill('edited');

    const first = await bookExpense(billId, { amount: 450, description: `Lunch ${billId}` });
    const second = await bookExpense(billId, { amount: 480, description: `Lunch + tip ${billId}` });

    expect(second.id).toBe(first.id);
    // The first booking stands — the guard returns it rather than re-writing the
    // ledger, so the account is debited once.
    expect(Number(second.amount)).toBe(450);
  });

  it('debits the account only once across repeated submissions', async () => {
    const billId = await makeBill('balance');
    const before = await prisma.account.findUnique({ where: { id: accountId } });

    await bookExpense(billId, { amount: 100 });
    await bookExpense(billId, { amount: 100 });
    await bookExpense(billId, { amount: 100 });

    const after = await prisma.account.findUnique({ where: { id: accountId } });
    expect(Number(before!.balance) - Number(after!.balance)).toBe(100);
  });

  it('still books separate expenses for different receipts', async () => {
    const billA = await makeBill('distinct-a');
    const billB = await makeBill('distinct-b');

    const a = await bookExpense(billA, { description: 'Receipt A' });
    const b = await bookExpense(billB, { description: 'Receipt B' });

    expect(b.id).not.toBe(a.id);
  });

  it('ignores a bill belonging to someone else', async () => {
    // The guard is scoped by userId, so another user's bill id can neither
    // suppress this user's expense nor leak the other user's transaction.
    const otherUserId = `${RUN}-other`;
    await prisma.user.create({
      data: {
        id: otherUserId,
        email: `${RUN}-other@test.local`,
        name: 'Other',
        password: 'test-only-not-a-real-hash',
      },
    });
    const foreignBill = await prisma.expenseBill.create({
      data: {
        userId: otherUserId,
        originalName: 'foreign.jpg',
        contentType: 'image/jpeg',
        size: 10,
        storagePath: `${RUN}/foreign.jpg`,
        sha256: `${RUN}-foreign`,
        scanStatus: 'completed',
      },
    });

    const tx = await bookExpense(foreignBill.id, { description: 'Mine, not theirs' });
    expect(tx.id).toBeTruthy();

    const foreign = await prisma.expenseBill.findUnique({ where: { id: foreignBill.id } });
    expect(foreign?.transactionId).toBeNull();

    await prisma.user.deleteMany({ where: { id: otherUserId } });
  });
});
