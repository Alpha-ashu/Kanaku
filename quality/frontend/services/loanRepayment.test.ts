/**
 * One EMI payment must produce exactly one debit.
 *
 * Before this service, `PayEMI` and the Loans payment modal each wrote the
 * repayment row, recomputed `loan.outstandingBalance` and set the account
 * balance — and none of it reached the server, so an EMI paid on a phone did
 * not exist on a laptop and vanished at logout. Adding the missing POST beside
 * those writes would have made it worse, not better: the endpoint subtracts the
 * amount from the loan itself, while `db.loans.update` queues an upload of the
 * client's own subtraction, so whichever landed second would subtract twice.
 *
 * The rule these tests pin:
 *   - the SERVER owns the loan's outstanding balance (the local write is
 *     suppressed, never pushed);
 *   - the repayment ROW owns the account's cash movement;
 *   - one user action carries ONE `clientRequestId`, through every retry.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const post = vi.fn();
const refreshTablesForActiveUser = vi.fn();
const runWithCloudSyncSuppressed = vi.fn(async (work: () => Promise<unknown>) => work());

const loanPaymentsAdd = vi.fn();
const loanPaymentsUpdate = vi.fn();
const loanPaymentsFilter = vi.fn();
const loansUpdate = vi.fn();
const loansToArray = vi.fn();
const accountsToArray = vi.fn();

vi.mock('@/lib/api', () => ({ apiClient: { post: (...a: unknown[]) => post(...a) } }));

vi.mock('@/lib/auth-sync-integration', () => ({
  refreshTablesForActiveUser: (...a: unknown[]) => refreshTablesForActiveUser(...a),
  runWithCloudSyncSuppressed: (w: () => Promise<unknown>) => runWithCloudSyncSuppressed(w),
}));

vi.mock('@/lib/database', () => ({
  db: {
    loanPayments: {
      add: (...a: unknown[]) => loanPaymentsAdd(...a),
      update: (...a: unknown[]) => loanPaymentsUpdate(...a),
      filter: (...a: unknown[]) => loanPaymentsFilter(...a),
    },
    loans: { update: (...a: unknown[]) => loansUpdate(...a), toArray: () => loansToArray() },
    accounts: { toArray: () => accountsToArray() },
  },
}));

import {
  recordLoanRepayment,
  pushPendingLoanRepayments,
} from '@/services/loanRepaymentService';

const loan = {
  id: 7,
  cloudId: 'loan-uuid',
  type: 'emi',
  name: 'Car loan',
  outstandingBalance: 50_000,
  principalAmount: 200_000,
  dueDate: new Date('2026-12-01'),
} as never;

const account = { id: 3, cloudId: 'acct-uuid', balance: 100_000, name: 'HDFC' } as never;

beforeEach(() => {
  vi.clearAllMocks();
  loanPaymentsAdd.mockResolvedValue(42);
  loanPaymentsUpdate.mockResolvedValue(1);
  loansUpdate.mockResolvedValue(1);
  refreshTablesForActiveUser.mockResolvedValue(undefined);
  post.mockResolvedValue({ data: { success: true, data: { id: 'payment-uuid' } } });
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

describe('successful repayment', () => {
  it('posts to the server with an idempotency key', async () => {
    await recordLoanRepayment({ loan, account, amount: 5_000 });

    expect(post).toHaveBeenCalledTimes(1);
    const [url, body, options] = post.mock.calls[0];
    expect(url).toBe('/loans/loan-uuid/payment');
    expect(body).toMatchObject({ amount: 5_000, accountId: 'acct-uuid' });
    expect(body.clientRequestId).toBeTruthy();
    // Same value in both places, or the server's two dedupe layers key on
    // different things and neither catches a replay.
    expect(options.idempotencyKey).toBe(body.clientRequestId);
  });

  it('persists that key on the local row so a later retry reuses it', async () => {
    await recordLoanRepayment({ loan, account, amount: 5_000 });

    const [row] = loanPaymentsAdd.mock.calls[0];
    expect(row.clientRequestId).toBe(post.mock.calls[0][1].clientRequestId);
  });

  it('NEVER pushes its own loan-balance arithmetic', async () => {
    await recordLoanRepayment({ loan, account, amount: 5_000 });

    // The whole double-debit hazard: the local loan write must be suppressed,
    // because the server performs the same subtraction on its own row.
    expect(runWithCloudSyncSuppressed).toHaveBeenCalledTimes(1);
    expect(loansUpdate).toHaveBeenCalledTimes(1);
  });

  it('does not write the account balance — the row is the debit', async () => {
    await recordLoanRepayment({ loan, account, amount: 5_000 });

    // computeAccountDeltas already derives the debit from the repayment row.
    // An explicit balance write here was a second deduction fighting it.
    expect(loanPaymentsAdd).toHaveBeenCalledTimes(1);
    const [row] = loanPaymentsAdd.mock.calls[0];
    expect(row.accountId).toBe(3);
    expect(row.amount).toBe(5_000);
  });

  it('adopts the server id and re-reads the authoritative loan', async () => {
    const result = await recordLoanRepayment({ loan, account, amount: 5_000 });

    expect(loanPaymentsUpdate).toHaveBeenCalledWith(42, { cloudId: 'payment-uuid' });
    expect(refreshTablesForActiveUser).toHaveBeenCalledWith(['loans']);
    expect(result).toMatchObject({ localId: 42, cloudId: 'payment-uuid', pending: false });
  });
});

describe('validation — rejected before anything is written', () => {
  it('refuses an amount above the outstanding balance', async () => {
    await expect(recordLoanRepayment({ loan, account, amount: 50_001 }))
      .rejects.toThrow(/exceed/i);
    expect(loanPaymentsAdd).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it('refuses a zero or negative amount', async () => {
    await expect(recordLoanRepayment({ loan, account, amount: 0 })).rejects.toThrow();
    await expect(recordLoanRepayment({ loan, account, amount: -100 })).rejects.toThrow();
    expect(loanPaymentsAdd).not.toHaveBeenCalled();
  });
});

describe('failure and offline', () => {
  it('keeps the repayment locally when the push fails', async () => {
    post.mockRejectedValue(new Error('500'));

    const result = await recordLoanRepayment({ loan, account, amount: 5_000 });

    expect(result.pending).toBe(true);
    expect(result.cloudId).toBeUndefined();
    // The row survives — losing it would lose the account debit too.
    expect(loanPaymentsAdd).toHaveBeenCalledTimes(1);
  });

  it('does not attempt a push while offline', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

    const result = await recordLoanRepayment({ loan, account, amount: 5_000 });

    expect(post).not.toHaveBeenCalled();
    expect(result.pending).toBe(true);
  });

  it('does not push a loan that has no server identity yet', async () => {
    const localOnlyLoan = { ...(loan as object), cloudId: undefined } as never;

    const result = await recordLoanRepayment({ loan: localOnlyLoan, account, amount: 5_000 });

    expect(post).not.toHaveBeenCalled();
    expect(result.pending).toBe(true);
  });
});

describe('pushPendingLoanRepayments — retry under the original key', () => {
  beforeEach(() => {
    loansToArray.mockResolvedValue([loan]);
    accountsToArray.mockResolvedValue([account]);
  });

  const pendingRows = (rows: unknown[]) => {
    loanPaymentsFilter.mockReturnValue({ toArray: () => Promise.resolve(rows) });
  };

  it('reuses the key stored on the row, never a fresh one', async () => {
    pendingRows([{ id: 42, loanId: 7, accountId: 3, amount: 5_000, clientRequestId: 'original-key' }]);

    await pushPendingLoanRepayments();

    const [, body, options] = post.mock.calls[0];
    // This is what makes a retry safe: the server recognises the replay and
    // returns the original payment instead of debiting again.
    expect(body.clientRequestId).toBe('original-key');
    expect(options.idempotencyKey).toBe('original-key');
  });

  it('marks the row synced once the server confirms', async () => {
    pendingRows([{ id: 42, loanId: 7, accountId: 3, amount: 5_000, clientRequestId: 'original-key' }]);

    const pushed = await pushPendingLoanRepayments();

    expect(pushed).toBe(1);
    expect(loanPaymentsUpdate).toHaveBeenCalledWith(42, { cloudId: 'payment-uuid' });
    expect(refreshTablesForActiveUser).toHaveBeenCalledWith(['loans']);
  });

  it('leaves the row pending when the retry fails, so it tries again', async () => {
    pendingRows([{ id: 42, loanId: 7, accountId: 3, amount: 5_000, clientRequestId: 'original-key' }]);
    post.mockRejectedValue(new Error('still down'));

    const pushed = await pushPendingLoanRepayments();

    expect(pushed).toBe(0);
    expect(loanPaymentsUpdate).not.toHaveBeenCalled();
  });

  it('skips a repayment whose loan is not yet on the server', async () => {
    loansToArray.mockResolvedValue([{ ...(loan as object), cloudId: undefined }]);
    pendingRows([{ id: 42, loanId: 7, accountId: 3, amount: 5_000, clientRequestId: 'k' }]);

    await pushPendingLoanRepayments();

    expect(post).not.toHaveBeenCalled();
  });

  it('does nothing while offline', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    pendingRows([{ id: 42, loanId: 7, accountId: 3, amount: 5_000, clientRequestId: 'k' }]);

    expect(await pushPendingLoanRepayments()).toBe(0);
    expect(post).not.toHaveBeenCalled();
  });
});

describe('one action, one debit', () => {
  it('two separate user actions carry two different keys', async () => {
    await recordLoanRepayment({ loan, account, amount: 5_000 });
    await recordLoanRepayment({ loan, account, amount: 5_000 });

    const first = post.mock.calls[0][1].clientRequestId;
    const second = post.mock.calls[1][1].clientRequestId;
    // Genuinely paying twice must be possible; only a REPLAY of one action is
    // deduplicated. Sharing a key here would silently swallow the second EMI.
    expect(first).not.toBe(second);
  });
});
