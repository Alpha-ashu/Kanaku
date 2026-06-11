/**
 * Frontend Tests — Login Flow & TokenManager
 *
 * Covers:
 *  - TokenManager: set/get/clear across localStorage keys
 *  - api.auth.login: happy path, TIMEOUT_ERROR retry, non-timeout error propagation
 *  - api.auth.login: failed challenge (missing code)
 *  - getUserMessage: user-friendly error mapping
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
    _store: store,
  };
}

beforeEach(() => {
  getSession.mockReset();
  toastError.mockReset();
  toastSuccess.mockReset();
  vi.unstubAllGlobals();
  vi.stubGlobal('localStorage', mockLocalStorage());
  localStorage.clear();
  api.clearCache();
  window.history.replaceState({}, '', '/');
  // Default: no active Supabase session, all requests use TokenManager
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

  describe('setRefreshToken / getRefreshToken', () => {
    it('stores and retrieves the refresh token', () => {
      TokenManager.setRefreshToken('my-refresh-token');
      expect(TokenManager.getRefreshToken()).toBe('my-refresh-token');
    });

    it('returns null when no refresh token is set', () => {
      expect(TokenManager.getRefreshToken()).toBeNull();
    });

    it('reads from refresh_token key as fallback', () => {
      localStorage.setItem('refresh_token', 'stored-refresh');
      expect(TokenManager.getRefreshToken()).toBe('stored-refresh');
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
    it('sets both access and refresh tokens at once', () => {
      TokenManager.setTokens('acc-123', 'ref-456');
      expect(TokenManager.getAccessToken()).toBe('acc-123');
      expect(TokenManager.getRefreshToken()).toBe('ref-456');
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('api.auth.login', () => {
  const credentials = { email: 'user@test.com', password: 'Test@1234' };

  function mockFetchSequence(...responses: Array<object>) {
    let call = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      const resp = responses[call] ?? responses[responses.length - 1];
      call++;
      return Promise.resolve(resp);
    }));
  }

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
    mockFetchSequence(challengeSuccessResp, loginSuccessResp);

    const result = await api.auth.login(credentials);
    expect(result.success).toBe(true);
    expect(result.data?.user?.email).toBe('user@test.com');
  });

  it('makes two fetch calls: /auth/login/challenge then /auth/login', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(challengeSuccessResp)
      .mockResolvedValueOnce(loginSuccessResp);
    vi.stubGlobal('fetch', fetchMock);

    await api.auth.login(credentials);

    const urls = fetchMock.mock.calls.map((c: any[]) => c[0] as string);
    expect(urls.some((u: string) => u.includes('/auth/login/challenge'))).toBe(true);
    expect(urls.some((u: string) => u.includes('/auth/login'))).toBe(true);
  });

  it('retries challenge once on TIMEOUT_ERROR then succeeds', async () => {
    vi.useFakeTimers();

    // First challenge call resolves with a non-ok response that triggers timeout error
    const timeoutError = Object.assign(new Error('TIMEOUT_ERROR'), { code: 'TIMEOUT_ERROR' });

    let call = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      call++;
      if (call === 1) return Promise.reject(timeoutError);
      if (call === 2) return Promise.resolve(challengeSuccessResp);
      return Promise.resolve(loginSuccessResp);
    }));

    const loginPromise = api.auth.login(credentials);
    // Advance timers past the 3000ms retry delay
    await vi.runAllTimersAsync();
    const result = await loginPromise;

    expect(result.success).toBe(true);
    vi.useRealTimers();
  });

  it('does NOT retry on non-timeout errors (e.g. INVALID_CREDENTIALS)', async () => {
    const credError = Object.assign(new Error('Bad credentials'), {
      code: 'INVALID_CREDENTIALS',
      status: 401,
    });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(credError));

    await expect(api.auth.login(credentials)).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
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
describe('api error handling', () => {
  beforeEach(() => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
  });

  it('returns user-friendly 401 message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ code: 'UNAUTHORIZED', message: 'Token expired' }),
    }));
    await expect(api.auth.getProfile()).rejects.toMatchObject({
      message: 'Please sign in to continue.',
    });
  });

  it('returns user-friendly 403 message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      json: async () => ({ code: 'FORBIDDEN', message: 'Access denied' }),
    }));
    await expect(api.auth.getProfile()).rejects.toMatchObject({
      message: 'You do not have permission to do that.',
    });
  });

  it('returns user-friendly 404 message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({ code: 'NOT_FOUND', message: 'Resource missing' }),
    }));
    await expect(api.auth.getProfile()).rejects.toMatchObject({
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
    await expect(api.auth.getProfile()).rejects.toMatchObject({
      status: 500,
      message: 'Something went wrong on our end. Please try again later.',
    });
  });

  it('surfaces INVALID_CREDENTIALS user message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ code: 'INVALID_CREDENTIALS', message: 'Wrong password' }),
    }));
    await expect(api.auth.getProfile()).rejects.toMatchObject({
      message: 'Incorrect email or password. Please try again.',
    });
  });

  it('shows error toast by default on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: async () => ({ code: 'VALIDATION_ERROR', message: 'Bad input' }),
    }));

    await expect(api.auth.getProfile()).rejects.toBeDefined();
    // toast.error should have been called
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

    // Only one actual fetch should have happened
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('bypasses cache when force=true', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { id: 'user-1', name: 'Test User' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await api.auth.getProfile();
    await api.auth.getProfile({ force: true });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
