// @vitest-environment jsdom
/**
 * Advisor withdrawals in the wallet:
 *   - the form refuses amounts under the minimum or over what was earned, and
 *     shows the rupee amount at 1 coin = ₹1;
 *   - a request goes out once, after a confirmation, with an idempotency key
 *     that survives a network failure (so the retry is a replay) and is renewed
 *     after the server answers;
 *   - an open request shows its progress and can be cancelled only while it is
 *     still REQUESTED;
 *   - the payout dialog normalises details and sends the step-up proof.
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AxiosError, type AxiosResponse } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { get, post, put } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock('@/lib/backend-api', () => ({ backendService: { api: { get, post, put } } }));
vi.mock('lucide-react', () => Object.fromEntries(
  ['AlertTriangle', 'ArrowRight', 'Banknote', 'CheckCircle2', 'Clock', 'Coins', 'IndianRupee', 'Info', 'KeyRound', 'Landmark', 'Loader2', 'Mail',
    'Pencil', 'Plus', 'ShieldCheck', 'Smartphone', 'X', 'XCircle'].map((n) => [n, () => null]),
));

import { WithdrawPanel } from '@/app/components/wallet/WithdrawPanel';
import { PayoutMethodDialog } from '@/app/components/wallet/PayoutMethodDialog';
import { WalletChip } from '@/app/components/wallet/WalletChip';
import { WALLET_CHANGED_EVENT, type Withdrawal, type WithdrawalOverview } from '@/services/walletService';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const envelope = (data: unknown) => ({ data: { success: true, data } });
const flush = async () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

const serverError = (status: number, code: string, error: string) =>
  Object.assign(new Error(error), {
    original: new AxiosError(error, 'ERR_BAD_REQUEST', undefined, undefined, { status, data: { success: false, error, code } } as AxiosResponse),
  });
const networkError = () => Object.assign(new Error('Network Error'), { original: new AxiosError('Network Error', 'ERR_NETWORK') });

const request = (status: Withdrawal['status']): Withdrawal => ({
  id: 'wd-1', coins: 400, amountMinor: 40_000, currency: 'INR', status, method: 'UPI', payoutLabel: 'UPI · ra•••@okhdfc',
  payoutReference: null, decisionNote: null, createdAt: new Date().toISOString(),
  approvedAt: status === 'APPROVED' ? new Date().toISOString() : null, paidAt: null, rejectedAt: null, cancelledAt: null,
});

const overview = (over: Partial<WithdrawalOverview> = {}): WithdrawalOverview => ({
  enabled: true, minCoins: 300, maxCoins: 100_000, coinValueMinor: 100, currency: 'INR',
  availableBalance: 1200, withdrawableCoins: 700, walletStatus: 'ACTIVE',
  paidOut: { coins: 0, amountMinor: 0 },
  payoutMethod: { method: 'UPI', label: 'UPI · ra•••@okhdfc', updatedAt: new Date().toISOString() },
  open: null, recent: [],
  ...over,
});

describe('Wallet withdrawals UI', () => {
  let container: HTMLDivElement;
  let root: Root;
  const onChanged = vi.fn();

  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    put.mockReset();
    onChanged.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const byTestId = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const type = async (id: string, value: string) => {
    const input = byTestId(id) as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  const click = async (id: string) => {
    await act(async () => { byTestId(id)!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush();
  };
  const render = async (data: WithdrawalOverview | null) => {
    await act(async () => {
      root.render(<WithdrawPanel overview={data} loading={false} error={null} accountEmail="advisor@example.com" onChanged={onChanged} />);
    });
  };

  it('shows what can be withdrawn and refuses amounts outside the rules', async () => {
    await render(overview());
    expect(byTestId('withdrawable-coins')!.textContent).toBe('700');
    expect(byTestId('payout-label')!.textContent).toBe('UPI · ra•••@okhdfc');

    await type('withdraw-amount', '250');
    expect((byTestId('withdraw-submit') as HTMLButtonElement).disabled).toBe(true);
    expect(container.textContent).toContain('The minimum withdrawal is 300 coins.');

    await type('withdraw-amount', '800');
    expect((byTestId('withdraw-submit') as HTMLButtonElement).disabled).toBe(true);
    expect(container.textContent).toContain('You can withdraw up to 700 coins right now.');

    await type('withdraw-amount', '400');
    expect((byTestId('withdraw-submit') as HTMLButtonElement).disabled).toBe(false);
    expect(byTestId('withdraw-receive')!.textContent).toBe('You receive ₹400');
  });

  it('asks for confirmation, then sends one request and announces the balance change', async () => {
    const announced = vi.fn();
    window.addEventListener(WALLET_CHANGED_EVENT, announced);
    post.mockResolvedValue(envelope({ withdrawal: request('REQUESTED'), replayed: false }));
    await render(overview());

    await type('withdraw-amount', '400');
    await act(async () => { (byTestId('withdraw-submit') as HTMLButtonElement).form!.requestSubmit(); });
    expect(post).not.toHaveBeenCalled();
    expect(byTestId('withdraw-confirm')!.textContent).toContain('₹400');

    await click('withdraw-confirm-button');
    expect(post).toHaveBeenCalledTimes(1);
    const [url, body] = post.mock.calls[0];
    expect(url).toBe('/wallet/withdrawals');
    expect(body).toMatchObject({ coins: 400 });
    expect(typeof body.clientRequestId).toBe('string');
    expect(onChanged).toHaveBeenCalled();
    expect(announced).toHaveBeenCalled();
    window.removeEventListener(WALLET_CHANGED_EVENT, announced);
  });

  it('retries a request lost in the network with the same key, and a refused one with a new key', async () => {
    post
      .mockRejectedValueOnce(networkError())
      .mockRejectedValueOnce(serverError(409, 'WITHDRAWAL_EXCEEDS_EARNINGS', 'You can withdraw up to 300 coins right now.'))
      .mockResolvedValueOnce(envelope({ withdrawal: request('REQUESTED'), replayed: false }));
    await render(overview());

    const attempt = async () => {
      await type('withdraw-amount', '400');
      await act(async () => { (byTestId('withdraw-submit') as HTMLButtonElement).form!.requestSubmit(); });
      await click('withdraw-confirm-button');
    };
    await attempt();
    expect(byTestId('withdraw-error')!.textContent).toContain('Could not reach the server');
    await attempt();
    expect(byTestId('withdraw-error')!.textContent).toContain('You can withdraw up to 300 coins');
    await attempt();

    const keys = post.mock.calls.map(([, body]) => body.clientRequestId);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[1]);
  });

  it('explains why a withdrawal is not possible yet', async () => {
    await render(overview({ withdrawableCoins: 120 }));
    expect(byTestId('withdraw-blocker')!.textContent).toContain('at least 300 earned coins (₹300)');
    expect(byTestId('withdraw-amount')).toBeNull();

    await render(overview({ payoutMethod: null }));
    expect(byTestId('payout-label')!.textContent).toBe('No UPI ID or bank account yet');
    expect(byTestId('withdraw-amount')).toBeNull();
  });

  it('lets the advisor cancel a request only before it is approved', async () => {
    post.mockResolvedValue(envelope({ withdrawal: { ...request('REQUESTED'), status: 'CANCELLED' } }));
    await render(overview({ open: request('REQUESTED') }));
    expect(byTestId('withdraw-open')!.textContent).toContain('₹400');
    await click('withdraw-cancel');
    expect(post).toHaveBeenCalledWith('/wallet/withdrawals/wd-1/cancel', {});

    await render(overview({ open: request('APPROVED') }));
    expect(byTestId('withdraw-cancel')).toBeNull();
    expect(byTestId('withdraw-open')!.textContent).toContain('can no longer be cancelled');
  });

  it('saves normalised payout details together with the password proof', async () => {
    get.mockResolvedValue(envelope({ password: true, emailCode: true, email: 'ad***@example.com' }));
    put.mockResolvedValue(envelope({ payoutMethod: { method: 'UPI', label: 'UPI · ra•••@okhdfc', updatedAt: new Date().toISOString() } }));
    const onSaved = vi.fn();
    await act(async () => {
      root.render(<PayoutMethodDialog accountEmail="advisor@example.com" current={null} onClose={() => undefined} onSaved={onSaved} />);
    });
    await flush();

    await type('payout-upi', 'not-a-upi');
    expect(byTestId('payout-hint')!.textContent).toContain('name@bank');
    await type('payout-upi', ' Ravi.Kumar@OKHDFC ');
    await type('payout-password', 'Secret#123');
    expect((byTestId('payout-save') as HTMLButtonElement).disabled).toBe(false);

    await act(async () => { (byTestId('payout-save') as HTMLButtonElement).form!.requestSubmit(); });
    await flush();
    expect(put).toHaveBeenCalledWith('/wallet/payout-method', {
      details: { method: 'UPI', upiId: 'ravi.kumar@okhdfc' },
      proof: { method: 'password', password: 'Secret#123' },
    });
    expect(onSaved).toHaveBeenCalled();
  });

  it('will not save a bank account whose two entries differ', async () => {
    get.mockResolvedValue(envelope({ password: true, emailCode: true, email: null }));
    await act(async () => {
      root.render(<PayoutMethodDialog accountEmail="advisor@example.com" current={null} onClose={() => undefined} onSaved={() => undefined} />);
    });
    await flush();
    await click('payout-method-bank');
    await type('payout-holder', 'Asha Menon');
    await type('payout-account', '123456789012');
    await type('payout-account-confirm', '123456789013');
    await type('payout-ifsc', 'hdfc0001234');
    await type('payout-password', 'Secret#123');
    expect(byTestId('payout-hint')!.textContent).toBe('The account numbers do not match.');
    expect((byTestId('payout-save') as HTMLButtonElement).disabled).toBe(true);

    await type('payout-account-confirm', '1234 5678 9012');
    expect((byTestId('payout-save') as HTMLButtonElement).disabled).toBe(false);
  });

  it('shows the balance in the top bar and refreshes it when the wallet changes', async () => {
    get.mockResolvedValueOnce(envelope({ availableBalance: 1250 })).mockResolvedValueOnce(envelope({ availableBalance: 12_400 }));
    const onOpen = vi.fn();
    await act(async () => { root.render(<WalletChip onOpen={onOpen} />); });
    await flush();
    expect(get).toHaveBeenCalledWith('/wallet');
    expect(byTestId('top-bar-wallet-balance')!.textContent).toBe('1,250');
    expect(byTestId('top-bar-wallet')!.getAttribute('aria-label')).toBe('Wallet: 1,250 coins');

    await act(async () => { window.dispatchEvent(new Event(WALLET_CHANGED_EVENT)); });
    await flush();
    expect(byTestId('top-bar-wallet-balance')!.textContent).toBe('12.4K');

    await click('top-bar-wallet');
    expect(onOpen).toHaveBeenCalled();
  });
});
