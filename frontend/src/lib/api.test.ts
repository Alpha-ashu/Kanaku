import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSession } = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

const { toastError, toastSuccess } = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@/utils/supabase/client', () => ({
  default: {
    auth: {
      getSession,
    },
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: toastError,
    success: toastSuccess,
  },
}));

import { api, TokenManager } from './api';

describe('api auth token resolution', () => {
  beforeEach(() => {
    getSession.mockReset();
    toastError.mockReset();
    toastSuccess.mockReset();
    vi.unstubAllGlobals();
    const store = new Map<string, string>();
    const mockLocalStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, String(value)); },
      removeItem: (key: string) => { store.delete(key); },
      clear: () => { store.clear(); },
    };
    vi.stubGlobal('localStorage', mockLocalStorage);
    localStorage.clear();
    TokenManager.clearTokens(); // reset in-memory backend JWT between tests
    api.clearCache();
    window.history.replaceState({}, '', '/');
  });

  it('uses the backend JWT (TokenManager) for authenticated requests', async () => {
    // Backend-managed auth: the API credential is the backend JWT, never a Supabase token.
    TokenManager.setAccessToken('session-token');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { id: 'user-1' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await api.auth.getProfile();

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/auth/profile', expect.objectContaining({
      method: 'GET',
      headers: expect.objectContaining({
        Authorization: 'Bearer session-token',
      }),
    }));
  });

  it('reads the backend JWT from auth_token storage', async () => {
    localStorage.setItem('auth_token', 'legacy-jwt');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { id: 'user-1' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await api.auth.getProfile();

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/auth/profile', expect.objectContaining({
      method: 'GET',
      headers: expect.objectContaining({
        Authorization: 'Bearer legacy-jwt',
      }),
    }));
  });

  it('does not redirect to login on a background 401 when a Supabase session is active', async () => {
    getSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'session-token',
        },
      },
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({
        code: 'HTTP_401',
        message: 'Unauthorized',
      }),
    }));

    await expect(api.auth.updateProfile({ firstName: 'Test' })).rejects.toMatchObject({
      status: 401,
      message: 'Your session has expired. Please sign in again.',
    });

    expect(window.location.pathname).toBe('/');
    expect(TokenManager.getAccessToken()).toBeNull();
  });

  it('handles non-JSON error responses without throwing a JSON parse error', async () => {
    getSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'session-token',
        },
      },
    });

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
});
