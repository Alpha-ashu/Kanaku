/**
 * The pure parts of advisor withdrawals:
 *   - only earned coins are withdrawable, and never more than the wallet holds;
 *   - payout labels never reveal enough to pay into the account;
 *   - the request schemas normalise and reject malformed payout details;
 *   - the minimum defaults to 300 coins and follows the environment.
 */
import { payoutLabel, withdrawableCoins } from '../../../../backend/src/features/wallet/withdrawal.service';
import { createWithdrawalSchema, payoutMethodSchema, withdrawalPaidSchema } from '../../../../backend/src/features/wallet/wallet.validation';
import { walletConfig } from '../../../../backend/src/features/wallet/wallet.config';

describe('withdrawableCoins', () => {
  it('is the smaller of the wallet balance and the net earnings', () => {
    expect(withdrawableCoins(1200, 700)).toBe(700); // 500 of the 1,200 were bought
    expect(withdrawableCoins(200, 700)).toBe(200); // earnings partly spent
    expect(withdrawableCoins(500, 0)).toBe(0); // bought coins only
    expect(withdrawableCoins(0, -50)).toBe(0); // a reversal never goes negative
  });
});

describe('payoutLabel', () => {
  it('masks a UPI ID down to two characters and the bank handle', () => {
    expect(payoutLabel({ method: 'UPI', upiId: 'ravi.kumar@okhdfc' })).toBe('UPI · ra•••@okhdfc');
    expect(payoutLabel({ method: 'UPI', upiId: '9876543210@ybl' })).toBe('UPI · 98•••@ybl');
  });

  it('shows only the last four digits of an account number', () => {
    const label = payoutLabel({ method: 'BANK', accountHolder: 'Asha Menon', accountNumber: '123456789012', ifsc: 'HDFC0001234' });
    expect(label).toBe('Bank · A/c ••••9012 · HDFC0001234');
    expect(label).not.toContain('12345678');
    expect(label).not.toContain('Asha');
  });
});

describe('payout and withdrawal schemas', () => {
  it('normalises UPI IDs and bank details', () => {
    const upi = payoutMethodSchema.parse({ details: { method: 'UPI', upiId: '  Ravi.Kumar@OKHDFC ' } });
    expect(upi.details).toEqual({ method: 'UPI', upiId: 'ravi.kumar@okhdfc' });

    const bank = payoutMethodSchema.parse({ details: { method: 'BANK', accountHolder: ' Asha Menon ', accountNumber: '1234 5678-9012', ifsc: ' hdfc0001234 ' } });
    expect(bank.details).toEqual({ method: 'BANK', accountHolder: 'Asha Menon', accountNumber: '123456789012', ifsc: 'HDFC0001234' });
  });

  it.each([
    { method: 'UPI', upiId: 'no-at-sign' },
    { method: 'UPI', upiId: '@okhdfc' },
    { method: 'BANK', accountHolder: 'Asha', accountNumber: '12345', ifsc: 'HDFC0001234' },
    { method: 'BANK', accountHolder: 'Asha', accountNumber: '123456789012', ifsc: 'HDFC1001234' },
    { method: 'BANK', accountHolder: 'Asha <b>', accountNumber: '123456789012', ifsc: 'HDFC0001234' },
    { method: 'CASH' },
  ])('rejects %o', (details) => {
    expect(payoutMethodSchema.safeParse({ details }).success).toBe(false);
  });

  it('accepts whole coins and a request key only', () => {
    expect(createWithdrawalSchema.safeParse({ coins: 300, clientRequestId: 'key-00000001' }).success).toBe(true);
    expect(createWithdrawalSchema.safeParse({ coins: 300.5, clientRequestId: 'key-00000001' }).success).toBe(false);
    expect(createWithdrawalSchema.safeParse({ coins: 300 }).success).toBe(false);
  });

  it('accepts bank and UPI references, not markup', () => {
    expect(withdrawalPaidSchema.safeParse({ payoutReference: 'UTR 4123-5678/9' }).success).toBe(true);
    expect(withdrawalPaidSchema.safeParse({ payoutReference: '<img src=x>' }).success).toBe(false);
    expect(withdrawalPaidSchema.safeParse({ payoutReference: 'ab' }).success).toBe(false);
  });
});

describe('withdrawal limits', () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; });

  it('defaults to a 300-coin minimum and follows the environment', () => {
    delete process.env.WALLET_MIN_WITHDRAWAL_COINS;
    expect(walletConfig.minWithdrawalCoins).toBe(300);
    process.env.WALLET_MIN_WITHDRAWAL_COINS = '500';
    expect(walletConfig.minWithdrawalCoins).toBe(500);
    process.env.WALLET_MIN_WITHDRAWAL_COINS = '0';
    expect(walletConfig.minWithdrawalCoins).toBe(300);
  });

  it('can be switched off', () => {
    delete process.env.WALLET_WITHDRAWALS_ENABLED;
    expect(walletConfig.withdrawalsEnabled).toBe(true);
    process.env.WALLET_WITHDRAWALS_ENABLED = 'false';
    expect(walletConfig.withdrawalsEnabled).toBe(false);
  });
});
