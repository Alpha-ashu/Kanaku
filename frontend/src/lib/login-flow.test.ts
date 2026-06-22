/**
 * Frontend Tests — Login Flow & TokenManager
 *
 * Covers:
 *  - TokenManager: set/get/clear across localStorage keys
 *  - api.auth.login: happy path, TIMEOUT_ERROR retry, non-timeout error propagation
 *  - api.auth.login: failed challenge (missing code)
 *  - Error message mapping: status codes → user-friendly strings
 *  - Profile cache behavior
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mocks (must come before imports) ────────────────────────────────
const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));
const { toastError, toastSuccess } = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@/utils/supabase/client', () => ({
  default: { auth: { getSession } },
}));
vi.mock('sonner', () => ({
  toast: { error: toastError, success: toastSuccess },
}));

import { api, TokenManager } from './api';

// ── localStorage stub ────────────────────────────────────────────────────────
function mockLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); },
  };
}

beforeEach(() => {
  // Always ensure real timers — prevents fake-timer leakage from any test
  vi.useRealTimers();
  getSession.mockReset();
  toastError.mockReset();
  toastSuccess.mockReset();
  vi.unstubAllGlobals();
  vi.stubGlobal('localStorage', mockLocalStorage());
  vi.stubGlobal('crypto', {
    subtle: {
      digest: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]).buffer),
    },
  });
  localStorage.clear();
  // Clear in-memory token state (module-level vars in api.ts)
  TokenManager.clearTokens();
  api.clearCache();
  window.history.replaceState({}, '', '/');
  // Default: no active Supabase session
  getSession.mockResolvedValue({ data: { session: null } });
});

// ════════════════════════════════════════════════════════════════════════════
describe('TokenManager', () => {
  describe('setAccessToken / getAccessToken', () => {
    it('stores and retrieves the access token', () => {
      TokenManager.setAccessToken('my-access-token');
      expect(TokenManager.getAccessToken()).toBe('my-access-token');
    });

    it('returns null when no token is set', () => {
      expect(TokenManager.getAccessToken()).toBeNull();
    });

    it('reads from auth_token localStorage key as fallback', () => {
      localStorage.setItem('auth_token', 'stored-jwt');
      expect(TokenManager.getAccessToken()).toBe('stored-jwt');
    });

    it('reads from accessToken key as fallback', () => {
      localStorage.setItem('accessToken', 'stored-jwt-2');
      expect(TokenManager.getAccessToken()).toBe('stored-jwt-2');
    });

    it('reads from token key as fallback', () => {
      localStorage.setItem('token', 'stored-jwt-3');
      expect(TokenManager.getAccessToken()).toBe('stored-jwt-3');
    });

    it('prefers in-memory over localStorage', () => {
      localStorage.setItem('auth_token', 'old-token');
      TokenManager.setAccessToken('new-token');
      expect(TokenManager.getAccessToken()).toBe('new-token');
    });
  });

  describe('setRefreshToken / getRefreshToken (cookie-only)', () => {
    // The refresh token now lives ONLY in the server's HttpOnly cookie. The
    // client must never store or read it, so these accessors are inert.
    it('setRefreshToken is a no-op (never persisted to JS)', () => {
      TokenManager.setRefreshToken('my-refresh-token');
      expect(TokenManager.getRefreshToken()).toBeNull();
      expect(localStorage.getItem('refresh_token')).toBeNull();
    });

    it('getRefreshToken always returns null, even with a legacy stored value', () => {
      localStorage.setItem('refresh_token', 'stored-refresh');
      expect(TokenManager.getRefreshToken()).toBeNull();
    });
  });

  describe('clearTokens', () => {
    it('clears all token keys from localStorage and memory', () => {
      localStorage.setItem('auth_token', 'a');
      localStorage.setItem('refresh_token', 'b');
      localStorage.setItem('accessToken', 'c');
      localStorage.setItem('refreshToken', 'd');
      localStorage.setItem('token', 'e');
      TokenManager.setAccessToken('mem-access');
      TokenManager.setRefreshToken('mem-refresh');

      TokenManager.clearTokens();

      expect(TokenManager.getAccessToken()).toBeNull();
      expect(TokenManager.getRefreshToken()).toBeNull();
      expect(localStorage.getItem('auth_token')).toBeNull();
      expect(localStorage.getItem('refresh_token')).toBeNull();
      expect(localStorage.getItem('accessToken')).toBeNull();
      expect(localStorage.getItem('refreshToken')).toBeNull();
      expect(localStorage.getItem('token')).toBeNull();
    });
  });

  describe('setTokens (convenience)', () => {
    it('stores only the access token; the refresh token is cookie-only', () => {
      TokenManager.setTokens('acc-123', 'ref-456');
      expect(TokenManager.getAccessToken()).toBe('acc-123');
      expect(TokenManager.getRefreshToken()).toBeNull();
      expect(localStorage.getItem('refresh_token')).toBeNull();
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('api.auth.login', () => {
  const credentials = { email: 'user@test.com', password: 'Test@1234' };

  const challengeSuccessResp = {
    ok: true,
    json: async () => ({ success: true, data: { code: 'CHAL-CODE-123' } }),
  };
  const loginSuccessResp = {
    ok: true,
    json: async () => ({
      success: true,
      data: {
        user: { id: 'user-1', email: 'user@test.com', role: 'user' },
        accessToken: 'jwt-access',
        refreshToken: 'jwt-refresh',
      },
      message: 'Login successful',
    }),
  };

  it('happy path: challenge → login returns user data', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(challengeSuccessResp)
      .mockResolvedValueOnce(loginSuccessResp));

    const result = await api.auth.login(credentials);
    expect(result.success).toBe(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result.data as any)?.user?.email).toBe('user@test.com');
  });

  it('makes two fetch calls: /auth/login/challenge then /auth/login', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(challengeSuccessResp)
      .mockResolvedValueOnce(loginSuccessResp);
    vi.stubGlobal('fetch', fetchMock);

    await api.auth.login(credentials);

    const urls: string[] = fetchMock.mock.calls.map((c: any[]) => c[0] as string);
    expect(urls.some(u => u.includes('/auth/login/challenge'))).toBe(true);
    expect(urls.some(u => u.includes('/auth/login') && !u.includes('/challenge'))).toBe(true);
  });

  it('retries challenge once when api throws TIMEOUT_ERROR (AbortError from abort controller)', async () => {
    // Simulate AbortError — how the api creates TIMEOUT_ERROR internally
    const abortError = Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' });

    let callCount = 0;
    const fetchMock = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.reject(abortError);   // 1st challenge → AbortError → TIMEOUT_ERROR
      if (callCount === 2) return Promise.resolve(challengeSuccessResp); // 2nd challenge → success
      return Promise.resolve(loginSuccessResp);                         // login → success
    });
    vi.stubGlobal('fetch', fetchMock);

    // Use fake timers to skip the 3000ms retry delay synchronously
    vi.useFakeTimers();
    try {
      const loginPromise = api.auth.login(credentials);
      await vi.runAllTimersAsync();
      const result = await loginPromise;
      expect(result.success).toBe(true);
      // fetch was called 3 times: challenge(fail) + challenge(retry) + login
      expect(callCount).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does NOT retry on non-TIMEOUT errors (e.g. INVALID_CREDENTIALS)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ code: 'INVALID_CREDENTIALS', message: 'Wrong password' }),
    }));

    await expect(api.auth.login(credentials)).rejects.toBeDefined();
  });

  it('throws when challenge returns success=false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: false, message: 'Account locked' }),
    }));

    await expect(api.auth.login(credentials)).rejects.toThrow('Account locked');
  });

  it('throws when challenge returns no code in data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: {} }), // no code field
    }));

    await expect(api.auth.login(credentials)).rejects.toThrow('Verification challenge failed');
  });

  it('passes the challengeCode to the /auth/login call', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(challengeSuccessResp)
      .mockResolvedValueOnce(loginSuccessResp);
    vi.stubGlobal('fetch', fetchMock);

    await api.auth.login(credentials);

    const loginCall = fetchMock.mock.calls.find((c: any[]) =>
      (c[0] as string).includes('/auth/login') && !(c[0] as string).includes('/challenge'),
    );
    expect(loginCall).toBeDefined();
    const body = JSON.parse(loginCall![1].body);
    expect(body.challengeCode).toBe('CHAL-CODE-123');
    expect(body.email).toBe('user@test.com');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('api error handling (via updateProfile)', () => {
  // Use updateProfile (PUT) instead of getProfile (GET) to avoid GET dedup cache side-effects.
  // The error mapping logic is shared across all HTTP methods.
  beforeEach(() => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
  });

  it('returns user-friendly message for INVALID_CREDENTIALS (401)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ code: 'INVALID_CREDENTIALS', message: 'Wrong password' }),
    }));
    await expect(api.auth.updateProfile({ firstName: 'Test' })).rejects.toMatchObject({
      message: 'Incorrect email or password. Please try again.',
    });
  });

  it('returns user-friendly message for FORBIDDEN (403)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: async () => ({ code: 'FORBIDDEN', message: 'No access' }),
    }));
    await expect(api.auth.updateProfile({ firstName: 'Test' })).rejects.toMatchObject({
      message: 'You do not have permission to do that.',
    });
  });

  it('returns user-friendly message for NOT_FOUND (404)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({ code: 'NOT_FOUND', message: 'Resource missing' }),
    }));
    await expect(api.auth.updateProfile({ firstName: 'Test' })).rejects.toMatchObject({
      message: 'We could not find what you were looking for.',
    });
  });

  it('returns generic 500 message for server errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => '',
    }));
    await expect(api.auth.updateProfile({ firstName: 'Test' })).rejects.toMatchObject({
      status: 500,
      message: 'Something went wrong on our end. Please try again later.',
    });
  });

  it('returns user-friendly VALIDATION_ERROR message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => ({ code: 'VALIDATION_ERROR', message: 'Bad input' }),
    }));
    await expect(api.auth.updateProfile({ firstName: 'Test' })).rejects.toMatchObject({
      message: 'Some of your inputs look incorrect. Please review and try again.',
    });
  });

  it('shows error toast by default on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => ({ code: 'VALIDATION_ERROR', message: 'Bad input' }),
    }));
    await expect(api.auth.updateProfile({ firstName: 'Test' })).rejects.toBeDefined();
    expect(toastError).toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('api.auth.getProfile caching', () => {
  beforeEach(() => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
  });

  it('returns cached response on second call within TTL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { id: 'user-1', name: 'Test User' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await api.auth.getProfile();
    await api.auth.getProfile();

    // Both calls share one network request (profile cache + GET dedup)
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('bypasses profile cache AND GET dedup when cache is cleared between calls', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { id: 'user-1', name: 'Test User' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await api.auth.getProfile();

    // Clear cache (including GET dedup map) then force a fresh request
    api.clearCache();
    await api.auth.getProfile({ force: true });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
