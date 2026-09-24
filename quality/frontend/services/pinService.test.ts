// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearOptionalBackendUnavailable, markOptionalBackendUnavailable } from '@/lib/apiBase';

const { getSession } = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

const { refreshAccessToken } = vi.hoisted(() => ({
  refreshAccessToken: vi.fn(),
}));

vi.mock('@/utils/supabase/client', () => ({
  default: {
    auth: {
      getSession,
    },
  },
}));

// Keep the real TokenManager/api, but stub refreshAccessToken so we can assert
// the 401 → refresh → retry recovery without hitting the network.
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    refreshAccessToken,
  };
});

import { isPinAlreadySet, isPinMissing, isPinServiceUnavailable, isSessionExpired, pinService } from '@/services/pinService';

describe('pinService', () => {
  beforeEach(() => {
    getSession.mockReset();
    refreshAccessToken.mockReset();
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
    pinService.clearPinData();
    clearOptionalBackendUnavailable();
  });

  it('uses the active Supabase session token for PIN status requests', async () => {
    getSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'session-token',
        },
      },
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        message: 'PIN configured',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await pinService.getStatus();

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/pin/status', expect.objectContaining({
      method: 'GET',
      headers: expect.objectContaining({
        Authorization: 'Bearer session-token',
      }),
    }));
  });

  it('falls back to legacy stored auth token when no Supabase session exists', async () => {
    getSession.mockResolvedValue({
      data: {
        session: null,
      },
    });
    localStorage.setItem('auth_token', 'legacy-token');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        message: 'PIN configured',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await pinService.getStatus();

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/pin/status', expect.objectContaining({
      method: 'GET',
      headers: expect.objectContaining({
        Authorization: 'Bearer legacy-token',
      }),
    }));
  });

  it('detects missing PIN status responses', () => {
    expect(isPinMissing({
      success: false,
      message: 'PIN not set for this user',
      statusCode: 200,
    })).toBe(true);
  });

  it('does not report a PIN as missing when the status lookup itself failed', () => {
    // The regression this guards: a degraded /pin/status answers 200 with a
    // body-level 503, and reading that as "no PIN set" routed returning users
    // into PIN *creation* — which the backend then refused, leaving onboarding
    // with no way forward.
    expect(isPinMissing({
      success: false,
      message: 'PIN service temporarily unavailable',
      code: 'PIN_STATUS_UNAVAILABLE',
      statusCode: 503,
    })).toBe(false);

    expect(isPinMissing({
      success: false,
      message: 'PIN service request timeout after 8000ms',
    })).toBe(false);

    expect(isPinMissing({
      success: false,
      message: 'Session expired. Please sign in again.',
      sessionExpired: true,
    })).toBe(false);
  });

  it('still reports an authoritative "no PIN" answer as missing', () => {
    expect(isPinMissing({
      success: false,
      message: 'PIN not set for this user',
      code: 'PIN_NOT_SET',
      statusCode: 200,
    })).toBe(true);
  });

  it('recognises an existing server-side PIN so callers can switch to verifying it', () => {
    expect(isPinAlreadySet({
      success: false,
      message: 'A PIN is already set for this account. Enter your existing PIN instead.',
      code: 'PIN_ALREADY_EXISTS',
      statusCode: 409,
    })).toBe(true);

    // Backends deployed before the code existed only sent the message.
    expect(isPinAlreadySet({
      success: false,
      message: 'PIN already exists. Use update PIN endpoint instead.',
      statusCode: 400,
    })).toBe(true);

    expect(isPinAlreadySet({ success: true, message: 'PIN created successfully' })).toBe(false);
    expect(isPinAlreadySet({ success: false, message: 'PIN is too weak.', code: 'PIN_TOO_WEAK' })).toBe(false);
  });

  it('keeps the body-level statusCode of a degraded 200 response', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'session-token' } } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        success: false,
        message: 'PIN service temporarily unavailable',
        code: 'PIN_STATUS_UNAVAILABLE',
        statusCode: 503,
      }),
    }));

    const status = await pinService.getStatus();

    expect(status.statusCode).toBe(503);
    expect(status.code).toBe('PIN_STATUS_UNAVAILABLE');
    expect(isPinServiceUnavailable(status)).toBe(true);
    expect(isPinMissing(status)).toBe(false);
  });

  it('detects backend PIN service failures', () => {
    expect(isPinServiceUnavailable({
      success: false,
      message: 'HTTP 500: Internal Server Error',
      statusCode: 500,
    })).toBe(true);
  });

  it('still sends critical PIN reset requests even when optional backend sync is in backoff mode', async () => {
    getSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'session-token',
        },
      },
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        message: 'PIN reset successfully',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    markOptionalBackendUnavailable('/api/v1');

    const result = await pinService.resetCurrentUserPin();

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/pin/self-reset', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: 'Bearer session-token',
      }),
    }));
  });

  it('refreshes the access token and retries when /pin/verify returns 401 (stale token)', async () => {
    // The access token expired while the app sat on the lock screen.
    getSession.mockResolvedValue({
      data: { session: { access_token: 'expired-token' } },
    });

    // Auth-middleware 401 shape: `{ error }`, no `success` field.
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Invalid or expired session' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, message: 'PIN verified' }),
      });
    vi.stubGlobal('fetch', fetchMock);
    refreshAccessToken.mockResolvedValue('fresh-token');

    const result = await pinService.verifyPin({ pin: '135790' });

    expect(result.success).toBe(true);
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // The retry must carry the freshly refreshed token, not the expired one.
    expect(fetchMock).toHaveBeenLastCalledWith('/api/v1/pin/verify', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer fresh-token' }),
    }));
  });

  it('flags sessionExpired (and stops retrying) when the session cannot be refreshed', async () => {
    getSession.mockResolvedValue({
      data: { session: { access_token: 'expired-token' } },
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Invalid or expired session' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    refreshAccessToken.mockResolvedValue(null);

    const result = await pinService.verifyPin({ pin: '135790' });

    expect(result.success).toBe(false);
    expect(result.sessionExpired).toBe(true);
    expect(isSessionExpired(result)).toBe(true);
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    // No fresh token → no retry; the original 401 is surfaced.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT refresh or flag sessionExpired on a wrong-PIN 401 (route rejection)', async () => {
    getSession.mockResolvedValue({
      data: { session: { access_token: 'valid-token' } },
    });

    // Route-level rejection shape: `{ success: false, message }` — the token is
    // valid, so a refresh would be pointless.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ success: false, message: 'Incorrect PIN. Please try again.' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await pinService.verifyPin({ pin: '135790' });

    expect(result.success).toBe(false);
    expect(result.sessionExpired).toBeFalsy();
    expect(isSessionExpired(result)).toBe(false);
    expect(refreshAccessToken).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
