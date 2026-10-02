/**
 * Coin-priced sessions in the default "auto" mode need the Wallet module ON and
 * a way to buy coins. Switching the module on without a configured payment
 * provider used to price every booking in coins nobody could buy, so each paid
 * booking expired unpaid at its deadline. "on" still forces it; "off" disables.
 */
const mockModuleEnabled = jest.fn();
const mockOpenToRole = jest.fn();
const mockProviders = jest.fn();

jest.mock('../../../../backend/src/middleware/featureGate', () => ({
  isModuleExplicitlyEnabled: (...a: unknown[]) => mockModuleEnabled(...a),
  isModuleOpenToRole: (...a: unknown[]) => mockOpenToRole(...a),
}));
jest.mock('../../../../backend/src/features/payments/providers', () => ({
  purchaseProviders: () => mockProviders(),
}));

import { sessionPaymentsEnabled } from '../../../../backend/src/features/wallet/wallet.config';

const original = process.env.SESSION_COIN_PAYMENTS;
afterEach(() => {
  if (original === undefined) delete process.env.SESSION_COIN_PAYMENTS;
  else process.env.SESSION_COIN_PAYMENTS = original;
});

describe('sessionPaymentsEnabled (auto)', () => {
  beforeEach(() => {
    delete process.env.SESSION_COIN_PAYMENTS;
    mockOpenToRole.mockResolvedValue(true);
  });

  it('is off when clients cannot open the wallet (module on for advisors only)', async () => {
    mockModuleEnabled.mockResolvedValue(true);
    mockOpenToRole.mockImplementation(async (_module: string, role: string) => role !== 'user');
    mockProviders.mockReturnValue([{ id: 'razorpay' }]);
    expect(await sessionPaymentsEnabled()).toBe(false);
    expect(mockOpenToRole).toHaveBeenCalledWith('wallet', 'user');
  });

  it('is off while the Wallet module is off', async () => {
    mockModuleEnabled.mockResolvedValue(false);
    mockProviders.mockReturnValue([{ id: 'razorpay' }]);
    expect(await sessionPaymentsEnabled()).toBe(false);
  });

  it('is off when the module is on but no payment provider is configured', async () => {
    mockModuleEnabled.mockResolvedValue(true);
    mockProviders.mockReturnValue([]);
    expect(await sessionPaymentsEnabled()).toBe(false);
  });

  it('is on when the module is on and coins can be bought', async () => {
    mockModuleEnabled.mockResolvedValue(true);
    mockProviders.mockReturnValue([{ id: 'razorpay' }]);
    expect(await sessionPaymentsEnabled()).toBe(true);
  });
});

describe('sessionPaymentsEnabled (explicit)', () => {
  it('"on" forces coin pricing, "off" disables it', async () => {
    mockModuleEnabled.mockResolvedValue(false);
    mockProviders.mockReturnValue([]);
    process.env.SESSION_COIN_PAYMENTS = 'on';
    expect(await sessionPaymentsEnabled()).toBe(true);
    process.env.SESSION_COIN_PAYMENTS = 'off';
    mockModuleEnabled.mockResolvedValue(true);
    mockProviders.mockReturnValue([{ id: 'razorpay' }]);
    expect(await sessionPaymentsEnabled()).toBe(false);
  });
});
