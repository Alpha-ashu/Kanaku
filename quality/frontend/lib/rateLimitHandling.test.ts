// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

// A 60/min per-IP limiter used to surface "You are doing that too fast" during
// ordinary use. The client now replays a short throttle once, quietly, and never
// toasts over a throttled background read.
const { toastError, toastSuccess } = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@/utils/supabase/client', () => ({
  default: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) } },
}));
vi.mock('sonner', () => ({
  toast: { error: toastError, success: toastSuccess, info: vi.fn(), warning: vi.fn() },
}));

import { api, apiClient, getRateLimitRetryDelayMs, TokenManager } from '@/lib/api';

const throttled = (retryAfter: number, code: string | null = 'RATE_LIMIT_EXCEEDED') =>
  new Response(JSON.stringify({ error: 'Too many API requests. Please try again later.', ...(code ? { code } : {}), retryAfter }), {
    status: 429,
    headers: { 'Content-Type': 'application/json', 'Retry-After': String(retryAfter) },
  });
const ok = (data: unknown) =>
  new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { 'Content-Type': 'application/json' } });

describe('getRateLimitRetryDelayMs', () => {
  it('waits out a short Retry-After with a little jitter', () => {
    const delay = getRateLimitRetryDelayMs('1')!;
    expect(delay).toBeGreaterThanOrEqual(1000);
    expect(delay).toBeLessThan(1250);
    expect(getRateLimitRetryDelayMs(0)).toBeGreaterThanOrEqual(250);
  });

  it('falls back to one second when the value is missing or not a number', () => {
    for (const value of [undefined, null, '', 'Wed, 21 Oct 2026 07:28:00 GMT']) {
      const delay = getRateLimitRetryDelayMs(value)!;
      expect(delay).toBeGreaterThanOrEqual(1000);
      expect(delay).toBeLessThan(1250);
    }
  });

  it('refuses to hold a request for a long throttle', () => {
    expect(getRateLimitRetryDelayMs('30')).toBeNull();
  });
});

describe('apiClient 429 handling', () => {
  beforeEach(() => {
    toastError.mockReset();
    toastSuccess.mockReset();
    vi.unstubAllGlobals();
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, String(value)); },
      removeItem: (key: string) => { store.delete(key); },
      clear: () => { store.clear(); },
    });
    TokenManager.clearTokens();
    TokenManager.setAccessToken('session-token');
    api.clearCache();
  });

  it('quietly replays a short throttle once, keeping the Idempotency-Key', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(throttled(0))
      .mockResolvedValueOnce(ok({ id: 'tx-1' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiClient.post('/transactions', { amount: 250 });

    expect(result).toMatchObject({ success: true, data: { id: 'tx-1' } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const keyOf = (call: number) => fetchMock.mock.calls[call][1].headers['Idempotency-Key'];
    expect(keyOf(0)).toBeTruthy();
    expect(keyOf(1)).toBe(keyOf(0));
    expect(toastError).not.toHaveBeenCalled();
  });

  it('never toasts over a throttled background read', async () => {
    const fetchMock = vi.fn().mockResolvedValue(throttled(30));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiClient.get('/accounts', { cacheTtlMs: 0 })).rejects.toMatchObject({ status: 429 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(toastError).not.toHaveBeenCalled();
  });

  it('still tells the user when their own write stays throttled', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(throttled(30)));

    await expect(apiClient.post('/goals', { name: 'Trip' })).rejects.toMatchObject({
      status: 429,
      details: { retryAfter: 30 },
    });

    expect(toastError).toHaveBeenCalledTimes(1);
  });

  it('does not replay a 429 that is not the limiter (e.g. a PIN-attempt lockout)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(throttled(0, 'PIN_LOCKED'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiClient.post('/pin/verify', { pin: 'x' })).rejects.toMatchObject({ status: 429 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('replays at most once', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => throttled(0));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiClient.post('/transactions', { amount: 1 })).rejects.toMatchObject({ status: 429 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
