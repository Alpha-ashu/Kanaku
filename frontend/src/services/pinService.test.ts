// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearOptionalBackendUnavailable, markOptionalBackendUnavailable } from '@/lib/apiBase';

const { getSession } = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock('@/utils/supabase/client', () => ({
  default: {
    auth: {
      getSession,
    },
  },
}));

import { isPinMissing, isPinServiceUnavailable, pinService } from './pinService';

describe('pinService', () => {
  beforeEach(() => {
    getSession.mockReset();
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
});
