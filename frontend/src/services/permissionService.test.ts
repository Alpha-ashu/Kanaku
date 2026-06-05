import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearOptionalBackendUnavailable } from '@/lib/apiBase';

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

import { api } from '@/lib/api';
import { permissionService } from './permissionService';

describe('permissionService', () => {
  beforeEach(() => {
    permissionService.clearPermissions();
    clearOptionalBackendUnavailable();
    getSession.mockReset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
    api.clearCache();
  });

  it('uses backend profile role instead of the fallback role when available', async () => {
    getSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'session-token',
        },
      },
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          role: 'admin',
        },
      }),
    }));

    const permissions = await permissionService.fetchUserPermissions('user-1', 'user');

    expect(fetch).toHaveBeenCalledWith('/api/v1/auth/profile', expect.objectContaining({
      method: 'GET',
      headers: expect.objectContaining({
        Authorization: 'Bearer session-token',
      }),
    }));
    expect(permissions.role).toBe('admin');
    expect(permissions.permissions.canAccessAdminPanel).toBe(true);
  });

  it('downgrades unapproved advisors to user permissions', async () => {
    getSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'session-token',
        },
      },
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          role: 'advisor',
          isApproved: false,
        },
      }),
    }));

    const permissions = await permissionService.fetchUserPermissions('user-1', 'advisor');

    expect(permissions.role).toBe('user');
    expect(permissions.permissions.canAccessAdvisorPanel).toBe(false);
    expect(permissions.permissions.canBookAdvisors).toBe(true);
  });

  it('falls back to the caller role when backend profile lookup fails', async () => {
    getSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'session-token',
        },
      },
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
      json: async () => ({
        success: false,
        error: 'temporarily unavailable',
      }),
    }));

    const permissions = await permissionService.fetchUserPermissions('user-1', 'advisor');

    expect(permissions.role).toBe('advisor');
    expect(permissions.permissions.canAccessAdvisorPanel).toBe(true);
    expect(permissions.permissions.canAccessAdminPanel).toBe(false);
  });

  it('reuses the last successful backend role during a later transient failure', async () => {
    getSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'session-token',
        },
      },
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            role: 'admin',
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({
          success: false,
          error: 'Internal Server Error',
        }),
      });

    vi.stubGlobal('fetch', fetchMock);

    const initialPermissions = await permissionService.fetchUserPermissions('user-1', 'user');
    // Simulate the profile cache expiring AND the role snapshot becoming stale.
    // Without resetting the snapshot timestamp the 5-minute cooldown would suppress
    // the background re-fetch, making fetchMock never reach its 2nd call.
    api.clearCache();
    permissionService.invalidateRoleCacheTimestamp('user-1');
    const retryPermissions = await permissionService.fetchUserPermissions('user-1', 'user');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(initialPermissions.role).toBe('admin');
    expect(retryPermissions.role).toBe('admin');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('deduplicates concurrent backend role lookups for the same user', async () => {
    getSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'session-token',
        },
      },
    });

    let resolveFetch: any = null;
    const fetchPromise = new Promise<any>((resolve) => {
      resolveFetch = resolve;
    });

    const fetchMock = vi.fn().mockReturnValue(fetchPromise);
    vi.stubGlobal('fetch', fetchMock);

    const firstLookup = permissionService.fetchUserPermissions('user-1', 'user');
    const secondLookup = permissionService.fetchUserPermissions('user-1', 'user');

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch?.({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          role: 'advisor',
          isApproved: true,
        },
      }),
    });

    const [firstPermissions, secondPermissions] = await Promise.all([firstLookup, secondLookup]);

    expect(firstPermissions.role).toBe('advisor');
    expect(secondPermissions.role).toBe('advisor');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
