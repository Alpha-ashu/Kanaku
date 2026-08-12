/**
 * Deep-link hardening.
 *
 * The Android manifest registers `kanaku://` with BROWSABLE, so ANY web page can
 * navigate the user's browser to `kanaku://<anything>?<k>=<v>` and this module is
 * handed the result. It used to navigate to whatever page string arrived and
 * write every query parameter verbatim into localStorage under `deepLink_<key>`,
 * which destination screens read to prefill forms — unvalidated external input
 * reaching app state.
 *
 * These tests pin the two allowlists that close it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn(), getLaunchUrl: vi.fn() } }));
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: { addListener: vi.fn() } }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.mock('@/lib/database', () => ({
  db: { smsTransactions: { where: () => ({ equals: () => ({ first: async () => null }) }) } },
}));

import { openDeepLink } from '@/lib/nativeDeepLinks';

const mockLocalStorage = () => {
  let store: Record<string, string> = {};
  return {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => { store[k] = String(v); },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { store = {}; },
    key: (i: number) => Object.keys(store)[i] ?? null,
    get length() { return Object.keys(store).length; },
    snapshot: () => ({ ...store }),
  };
};

let ls: ReturnType<typeof mockLocalStorage>;

beforeEach(() => {
  ls = mockLocalStorage();
  vi.stubGlobal('localStorage', ls);
});

describe('page allowlist', () => {
  it('navigates to a known page', async () => {
    const navigate = vi.fn();
    await expect(openDeepLink('kanaku://transactions', navigate)).resolves.toBe(true);
    expect(navigate).toHaveBeenCalledWith('transactions');
  });

  it('refuses an unknown page and does not navigate', async () => {
    const navigate = vi.fn();
    await expect(openDeepLink('kanaku://admin', navigate)).resolves.toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('refuses an attacker-chosen page from a hostile site', async () => {
    const navigate = vi.fn();
    await expect(openDeepLink('kanaku://../../etc/passwd', navigate)).resolves.toBe(false);
    await expect(openDeepLink('kanaku://<script>', navigate)).resolves.toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('ignores empty or malformed links', async () => {
    const navigate = vi.fn();
    await expect(openDeepLink('', navigate)).resolves.toBe(false);
    await expect(openDeepLink('   ', navigate)).resolves.toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('parameter allowlist', () => {
  it('persists a recognised parameter for the destination screen', async () => {
    await openDeepLink('kanaku://add-transaction?smsTransactionId=12', vi.fn());
    expect(localStorage.getItem('deepLink_smsTransactionId')).toBe('12');
  });

  it('drops parameters that are not on the allowlist', async () => {
    await openDeepLink(
      'kanaku://add-transaction?smsTransactionId=12&amount=99999&evil=payload',
      vi.fn(),
    );
    expect(localStorage.getItem('deepLink_smsTransactionId')).toBe('12');
    // A hostile page must not be able to seed arbitrary app state.
    expect(localStorage.getItem('deepLink_amount')).toBeNull();
    expect(localStorage.getItem('deepLink_evil')).toBeNull();
  });

  it('drops an over-long value rather than storing it', async () => {
    await openDeepLink(`kanaku://add-transaction?accountId=${'x'.repeat(500)}`, vi.fn());
    expect(localStorage.getItem('deepLink_accountId')).toBeNull();
  });

  it('writes nothing at all for a rejected page', async () => {
    await openDeepLink('kanaku://not-a-real-page?accountId=7', vi.fn());
    expect(Object.keys(ls.snapshot())).toHaveLength(0);
  });
});

describe('backend-emitted links', () => {
  // These are the exact deepLink shapes backend/src emits on notifications. A
  // too-narrow allowlist would silently break them, so they are pinned here.
  it.each([
    ['/advisor-panel', 'advisor-panel'],
    ['/book-advisor', 'book-advisor'],
    ['/groups', 'groups'],
  ])('routes %s', async (link, expected) => {
    const navigate = vi.fn();
    await expect(openDeepLink(link, navigate)).resolves.toBe(true);
    expect(navigate).toHaveBeenCalledWith(expected);
  });

  it('folds /sessions/<id> into a page plus a parameter', async () => {
    const navigate = vi.fn();
    await expect(openDeepLink('/sessions/abc123', navigate)).resolves.toBe(true);
    expect(navigate).toHaveBeenCalledWith('advisor-panel');
    expect(localStorage.getItem('deepLink_sessionId')).toBe('abc123');
  });

  it('folds /payments/<id> the same way', async () => {
    const navigate = vi.fn();
    await expect(openDeepLink('/payments/pay_9', navigate)).resolves.toBe(true);
    expect(localStorage.getItem('deepLink_paymentId')).toBe('pay_9');
  });

  it('rejects a path-traversal shaped record id', async () => {
    const navigate = vi.fn();
    await expect(openDeepLink('/sessions/..%2f..%2fadmin', navigate)).resolves.toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('rejects an unknown collection', async () => {
    const navigate = vi.fn();
    await expect(openDeepLink('/secrets/42', navigate)).resolves.toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('link forms', () => {
  it('accepts a bare path (raw notification payload)', async () => {
    const navigate = vi.fn();
    await expect(openDeepLink('/goals?goalId=3', navigate)).resolves.toBe(true);
    expect(navigate).toHaveBeenCalledWith('goals');
    expect(localStorage.getItem('deepLink_goalId')).toBe('3');
  });

  it('accepts an https link into the app', async () => {
    const navigate = vi.fn();
    await expect(openDeepLink('https://app.kanaku.test/reports', navigate)).resolves.toBe(true);
    expect(navigate).toHaveBeenCalledWith('reports');
  });

  it('maps the SMS route onto add-transaction', async () => {
    const navigate = vi.fn();
    // No matching local record (mocked as null), so it opens the blank form
    // rather than a half-prefilled one.
    await expect(openDeepLink('kanaku://sms-transaction?sourceSmsId=sms_abc', navigate))
      .resolves.toBe(true);
    expect(navigate).toHaveBeenCalledWith('add-transaction');
    // The platform id is internal plumbing and must not leak into app state.
    expect(localStorage.getItem('deepLink_sourceSmsId')).toBeNull();
  });
});
