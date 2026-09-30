// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { get, post, toastError, toastSuccess, setCurrentPage } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  setCurrentPage: vi.fn(),
}));
vi.mock('@/lib/backend-api', () => ({ backendService: { api: { get, post } } }));
vi.mock('sonner', () => ({ toast: { error: toastError, success: toastSuccess } }));
vi.mock('@/contexts/AppContext', () => ({ useApp: () => ({ setCurrentPage }) }));
// lucide-react resolves the root React 18 copy; stub icons (see PricingPage.test.tsx).
vi.mock('lucide-react', () => ({ Coins: () => null, Loader2: () => null, Lock: () => null, Video: () => null }));

import { SessionPaymentPanel } from '@/app/components/wallet/SessionPaymentPanel';
import type { BookingPaymentState } from '@/services/walletService';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const now = Date.now();
const iso = (offsetMin: number) => new Date(now + offsetMin * 60_000).toISOString();

const state = (overrides: Partial<BookingPaymentState> = {}): BookingPaymentState => ({
  bookingId: 'b1',
  sessionId: 's1',
  lifecycle: 'PAYMENT_DUE',
  status: 'accepted',
  paymentStatus: 'UNPAID',
  coinCost: 100,
  serverNow: new Date(now).toISOString(),
  startsAt: iso(3),
  endsAt: iso(63),
  paymentDueAt: iso(-2),
  paymentClosesAt: iso(13),
  joinOpensAt: iso(-2),
  joinClosesAt: iso(78),
  paidAt: null,
  refundedAt: null,
  canPay: true,
  canJoin: false,
  walletBalance: 500,
  ...overrides,
});

const envelope = (data: unknown) => ({ data: { success: true, data } });

describe('SessionPaymentPanel', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    toastError.mockReset();
    toastSuccess.mockReset();
    setCurrentPage.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render = async (initial: BookingPaymentState) => {
    get.mockResolvedValue(envelope(initial));
    await act(async () => {
      root.render(<SessionPaymentPanel bookingId="b1" viewer="client" initialState={initial} />);
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  };

  const byTestId = (id: string) => container.querySelector(`[data-testid="${id}"]`) as HTMLButtonElement | null;

  it('asks for payment with a countdown, and unlocks only when the server says paid', async () => {
    await render(state());
    expect(container.textContent).toContain('Payment required');
    expect(container.textContent).toMatch(/Pay within \d{2}:\d{2}/);
    expect(byTestId('session-join-b1')).toBeNull();

    post.mockResolvedValue(envelope({
      alreadyPaid: false,
      transactionId: 'tx-1',
      state: state({ lifecycle: 'READY', paymentStatus: 'PAID', canPay: false, canJoin: true }),
    }));
    await act(async () => { byTestId('session-pay-b1')!.click(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    expect(post).toHaveBeenCalledWith('/bookings/b1/pay', {});
    expect(toastSuccess).toHaveBeenCalledWith(expect.stringMatching(/Payment successful/));
    expect(container.textContent).toContain('Join session');
    expect(byTestId('session-pay-b1')).toBeNull();
  });

  it('sends a short user to buy coins instead of offering a payment that will fail', async () => {
    await render(state({ walletBalance: 20 }));
    expect(container.textContent).toContain('Insufficient coins — purchase coins');
    expect(byTestId('session-pay-b1')).toBeNull();
    await act(async () => { byTestId('session-buy-coins-b1')!.click(); });
    expect(setCurrentPage).toHaveBeenCalledWith('wallet');
  });

  it('shows the server error when payment is refused', async () => {
    await render(state());
    post.mockRejectedValue(Object.assign(new Error('x'), {
      original: { isAxiosError: true, response: { status: 409, data: { error: 'You do not have enough coins.', code: 'INSUFFICIENT_COINS' } } },
    }));
    await act(async () => { byTestId('session-pay-b1')!.click(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(toastError).toHaveBeenCalledWith('Insufficient coins — purchase coins to pay for this session.');
  });

  it('joins only through the server-issued link', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    await render(state({ lifecycle: 'READY', paymentStatus: 'PAID', canPay: false, canJoin: true }));
    get.mockResolvedValueOnce(envelope({ ...state({ lifecycle: 'READY', paymentStatus: 'PAID', canPay: false, canJoin: true }), role: 'client', joinUrl: 'https://meet.example/Kanaku-abc' }));
    await act(async () => { byTestId('session-join-b1')!.click(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(get).toHaveBeenCalledWith('/sessions/s1/access');
    expect(open).toHaveBeenCalledWith('https://meet.example/Kanaku-abc', '_blank', 'noopener,noreferrer');
    open.mockRestore();
  });
});
