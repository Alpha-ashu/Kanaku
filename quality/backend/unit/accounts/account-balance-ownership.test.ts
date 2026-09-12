/**
 * accountService.updateAccount — the server owns `balance`.
 *
 * Guards the stale-device fix: clients used to send their local balance on every
 * account edit, so a device that had not yet pulled recent transactions
 * overwrote the correct server balance (production, 2026-09-12: a stored 3,550
 * where openingBalance + ledger was 1,050). A client `balance` is now ignored;
 * deliberate edits arrive as `targetBalance` or `openingBalance` and are applied
 * as deltas to the SERVER's figures, keeping balance = openingBalance + ledger.
 *
 * The repository is mocked so this is a pure unit test (no DB), mirroring
 * export-iterator.test.ts.
 */
jest.mock('../../../../backend/src/cache/redis', () => ({ cacheDeleteByPrefix: jest.fn() }));

const findFirst = jest.fn();
const update = jest.fn();
jest.mock('../../../../backend/src/features/accounts/account.repository', () => ({
  accountRepository: {
    findFirst: (...args: any[]) => findFirst(...args),
    update: (...args: any[]) => update(...args),
  },
}));

import { accountService } from '../../../../backend/src/features/accounts/account.service';

// Server state: opened at 5,000, ledger −3,950 → balance 1,050.
const SERVER_ACCOUNT = { id: 'acc-1', userId: 'user-1', balance: 1050, openingBalance: 5000 };

const updatesSent = () => update.mock.calls[0][1];

beforeEach(() => {
  findFirst.mockResolvedValue({ ...SERVER_ACCOUNT });
  update.mockImplementation(async (_id: string, data: any) => ({ ...SERVER_ACCOUNT, ...data }));
});
afterEach(() => {
  findFirst.mockReset();
  update.mockReset();
});

describe('accountService.updateAccount balance ownership', () => {
  it('ignores a client-supplied balance (stale device echo)', async () => {
    await accountService.updateAccount('acc-1', 'user-1', { name: 'SBI', balance: 3550 });

    expect(updatesSent()).not.toHaveProperty('balance');
    expect(updatesSent()).not.toHaveProperty('openingBalance');
    expect(updatesSent().name).toBe('SBI');
  });

  it('applies targetBalance as a delta to the server figures', async () => {
    await accountService.updateAccount('acc-1', 'user-1', { targetBalance: 2000 });

    // +950 on both sides: balance 1,050 → 2,000, opening 5,000 → 5,950.
    expect(updatesSent()).toMatchObject({ balance: 2000, openingBalance: 5950 });
    expect(updatesSent().balance - updatesSent().openingBalance)
      .toBe(SERVER_ACCOUNT.balance - SERVER_ACCOUNT.openingBalance);
  });

  it('targetBalance wins over a stale balance sent alongside it', async () => {
    await accountService.updateAccount('acc-1', 'user-1', { balance: 3550, targetBalance: 1200 });

    expect(updatesSent()).toMatchObject({ balance: 1200, openingBalance: 5150 });
  });

  it('shifts balance by the openingBalance delta even when a balance is also sent', async () => {
    await accountService.updateAccount('acc-1', 'user-1', { openingBalance: 6000, balance: 3550 });

    // Previously a co-sent balance suppressed the shift and was written verbatim.
    expect(updatesSent()).toMatchObject({ openingBalance: 6000, balance: 2050 });
  });

  it('rejects a non-finite targetBalance', async () => {
    await expect(
      accountService.updateAccount('acc-1', 'user-1', { targetBalance: 'NaN' }),
    ).rejects.toMatchObject({ code: 'INVALID_BALANCE' });
    expect(update).not.toHaveBeenCalled();
  });
});
