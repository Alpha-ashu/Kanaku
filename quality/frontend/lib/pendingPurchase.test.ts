// @vitest-environment jsdom
/** Coming back from PhonePe / Paytm: which order to check, taken once. */
import { afterEach, describe, expect, it } from 'vitest';
import { rememberPendingPurchase, takePendingPurchase } from '@/lib/pendingPurchase';

const ORDER = '3f2b8c1e-5d4a-4b6f-9e7d-1a2b3c4d5e6f';

afterEach(() => {
  sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('pending purchase after a redirect gateway', () => {
  it('takes the order from the return URL once and removes it from the address bar', () => {
    window.history.replaceState(null, '', `/wallet?tab=all&purchase=${ORDER}`);
    expect(takePendingPurchase()).toBe(ORDER);
    expect(window.location.search).toBe('?tab=all');
    expect(takePendingPurchase()).toBeNull();
  });

  it('falls back to the order remembered before leaving, when routing dropped the query', () => {
    rememberPendingPurchase(ORDER);
    window.history.replaceState(null, '', '/wallet');
    expect(takePendingPurchase()).toBe(ORDER);
    expect(sessionStorage.getItem('kanaku_pending_purchase')).toBeNull();
  });

  it('ignores anything that is not an order id, and stale entries', () => {
    window.history.replaceState(null, '', '/wallet?purchase=../../admin');
    expect(takePendingPurchase()).toBeNull();
    sessionStorage.setItem('kanaku_pending_purchase', JSON.stringify({ orderId: ORDER, at: Date.now() - 3 * 60 * 60_000 }));
    expect(takePendingPurchase()).toBeNull();
  });
});
