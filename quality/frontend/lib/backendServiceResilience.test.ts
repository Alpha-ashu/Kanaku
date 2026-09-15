// @vitest-environment jsdom

import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// BackendService (axios) used to treat ANY failed silent refresh as session
// death — clearing tokens and hard-redirecting to /login. A throttled (429) or
// 5xx refresh, or the post-failure cooldown, therefore signed users out mid-use.
const { refreshAccessToken, wasRefreshFailureFatal } = vi.hoisted(() => ({
  refreshAccessToken: vi.fn(),
  wasRefreshFailureFatal: vi.fn(),
}));

vi.mock('@/utils/supabase/client', () => ({
  default: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) } },
}));
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, refreshAccessToken, wasRefreshFailureFatal };
});

import { TokenManager } from '@/lib/api';
import { backendService } from '@/lib/backend-api';

const axiosFailure = (config: InternalAxiosRequestConfig, status: number, data: unknown, headers: Record<string, string> = {}) =>
  new AxiosError('failed', 'ERR_BAD_RESPONSE', config, null, {
    status, statusText: '', data, headers, config,
  } as any);

describe('BackendService resilience', () => {
  beforeEach(() => {
    refreshAccessToken.mockReset();
    wasRefreshFailureFatal.mockReset();
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, String(value)); },
      removeItem: (key: string) => { store.delete(key); },
      clear: () => { store.clear(); },
    });
    TokenManager.clearTokens();
    TokenManager.setAccessToken('expired-token');
  });

  it('keeps the session when the silent refresh fails transiently', async () => {
    refreshAccessToken.mockResolvedValue(null);
    wasRefreshFailureFatal.mockReturnValue(false);
    backendService.api.defaults.adapter = async (config) => { throw axiosFailure(config, 401, {}); };

    await expect(backendService.api.get('/admin/features')).rejects.toMatchObject({ status: 503 });

    expect(TokenManager.getAccessToken()).toBe('expired-token');
  });

  it('still signs out when the refresh token is genuinely rejected', async () => {
    refreshAccessToken.mockResolvedValue(null);
    wasRefreshFailureFatal.mockReturnValue(true);
    backendService.api.defaults.adapter = async (config) => { throw axiosFailure(config, 401, {}); };

    await expect(backendService.api.get('/admin/features')).rejects.toMatchObject({ status: 401 });

    expect(TokenManager.getAccessToken()).toBeNull();
  });

  it('quietly replays a short throttle once', async () => {
    const adapter = vi.fn()
      .mockImplementationOnce(async (config: InternalAxiosRequestConfig) => {
        throw axiosFailure(config, 429, { code: 'RATE_LIMIT_EXCEEDED', retryAfter: 0 }, { 'retry-after': '0' });
      })
      .mockImplementationOnce(async (config: InternalAxiosRequestConfig) => ({
        status: 200, statusText: 'OK', headers: {}, config, data: { success: true },
      }));
    backendService.api.defaults.adapter = adapter;

    await expect(backendService.api.post('/groups', { name: 'Trip' })).resolves.toMatchObject({ status: 200 });

    expect(adapter).toHaveBeenCalledTimes(2);
    const keyOf = (call: number) => adapter.mock.calls[call][0].headers['Idempotency-Key'];
    expect(keyOf(1)).toBe(keyOf(0));
  });
});
