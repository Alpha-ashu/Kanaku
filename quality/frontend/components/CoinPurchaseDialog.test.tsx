// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/backend-api', () => ({ backendService: { api: { get, post } } }));
vi.mock('lucide-react', () => Object.fromEntries(
  ['CheckCircle2', 'Clock', 'Coins', 'Loader2', 'ShieldCheck', 'X', 'XCircle'].map((n) => [n, () => null]),
));
vi.mock('framer-motion', async () => {
  const { createElement } = await import('react');
  const strip = ({ initial: _i, animate: _a, exit: _e, transition: _t, ...rest }: Record<string, unknown>) => rest;
  return {
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => children,
    motion: new Proxy({}, { get: (_t, tag: string) => ({ children, ...p }: { children?: React.ReactNode } & Record<string, unknown>) => createElement(tag, strip(p), children) }),
  };
});

import { CoinPurchaseDialog } from '@/app/components/wallet/CoinPurchaseDialog';
import type { CoinPackage } from '@/services/walletService';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const pkg: CoinPackage = { id: 'pkg1', code: 'standard', name: 'Standard', coins: 500, bonusCoins: 25, totalCoins: 525, priceMinor: 50000, currency: 'INR' };
const order = (status: string) => ({
  id: 'order-1', provider: 'sandbox', status, coins: 525, amountMinor: 50000, currency: 'INR', failureReason: null,
  expiresAt: new Date(Date.now() + 1800_000).toISOString(), paidAt: null, creditedAt: status === 'PAID' ? new Date().toISOString() : null, refundedAt: null, createdAt: new Date().toISOString(),
});
const envelope = (data: unknown) => ({ data: { success: true, data } });
const flush = async () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

describe('CoinPurchaseDialog', () => {
  let container: HTMLDivElement;
  let root: Root;
  const onCredited = vi.fn();

  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    onCredited.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const byTestId = (id: string) => container.querySelector(`[data-testid="${id}"]`) as HTMLButtonElement | null;

  it('shows success only after the server confirms the order as PAID, with the transaction id', async () => {
    post.mockImplementation(async (url: string, body: Record<string, unknown>) => {
      if (url === '/wallet/purchases') {
        expect(typeof body.clientRequestId).toBe('string');
        return envelope({ order: order('CREATED'), checkout: { provider: 'sandbox', orderId: 'sbx_1' } });
      }
      if (url.endsWith('/sandbox-pay')) return envelope({ payload: { sandbox_payment_id: 'p', sandbox_signature: 's' } });
      if (url.endsWith('/verify')) return envelope({ order: order('PAID'), transactionId: 'ledger-tx-42', availableBalance: 525 });
      throw new Error(`unexpected ${url}`);
    });

    await act(async () => { root.render(<CoinPurchaseDialog pkg={pkg} onClose={() => undefined} onCredited={onCredited} />); });
    await flush();
    expect(container.textContent).not.toContain('Payment successful');
    await act(async () => { byTestId('coin-purchase-sandbox-pay')!.click(); });
    await flush();

    expect(byTestId('coin-purchase-success')).not.toBeNull();
    expect(container.textContent).toContain('Payment successful');
    expect(container.textContent).toContain('ledger-tx-42');
    expect(container.textContent).toContain('525 coins');
    expect(onCredited).toHaveBeenCalledWith(525);
  });

  it('does not claim success when the server has not confirmed; it keeps checking instead', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    post.mockImplementation(async (url: string) => {
      if (url === '/wallet/purchases') return envelope({ order: order('CREATED'), checkout: { provider: 'sandbox', orderId: 'sbx_1' } });
      if (url.endsWith('/sandbox-pay')) return envelope({ payload: { sandbox_payment_id: 'p', sandbox_signature: 'bad' } });
      if (url.endsWith('/verify')) {
        throw Object.assign(new Error('x'), { original: { isAxiosError: true, response: { status: 400, data: { error: 'We could not verify this payment.', code: 'PAYMENT_VERIFICATION_FAILED' } } } });
      }
      throw new Error(`unexpected ${url}`);
    });
    get.mockResolvedValueOnce(envelope({ order: order('CREATED'), availableBalance: 0 }))
      .mockResolvedValueOnce(envelope({ order: order('PAID'), availableBalance: 525 }));

    await act(async () => { root.render(<CoinPurchaseDialog pkg={pkg} onClose={() => undefined} onCredited={onCredited} />); });
    await flush();
    await act(async () => { byTestId('coin-purchase-sandbox-pay')!.click(); });
    await flush();
    expect(container.textContent).toContain('Processing payment');
    expect(container.textContent).not.toContain('Payment successful');

    await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
    await flush();
    expect(container.textContent).not.toContain('Payment successful');
    await act(async () => { await vi.advanceTimersByTimeAsync(3100); });
    await flush();
    expect(container.textContent).toContain('Payment successful');
    expect(get).toHaveBeenCalledWith('/wallet/purchases/order-1');
    vi.useRealTimers();
  });

  it('reports a declined test payment as failed and offers a retry', async () => {
    post.mockImplementation(async (url: string) => {
      if (url === '/wallet/purchases') return envelope({ order: order('CREATED'), checkout: { provider: 'sandbox', orderId: 'sbx_1' } });
      if (url.endsWith('/sandbox-pay')) return envelope({ payload: { sandbox_order_id: 'sbx_1' } });
      throw new Error(`unexpected ${url}`);
    });
    await act(async () => { root.render(<CoinPurchaseDialog pkg={pkg} onClose={() => undefined} onCredited={onCredited} />); });
    await flush();
    await act(async () => { byTestId('coin-purchase-sandbox-decline')!.click(); });
    await flush();
    expect(container.textContent).toContain('Payment failed — try again');
    expect(byTestId('coin-purchase-retry')).not.toBeNull();
    expect(onCredited).not.toHaveBeenCalled();
  });
});
