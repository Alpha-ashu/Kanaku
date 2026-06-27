/**
 * E2E — Token refresh.  POST /api/v1/auth/refresh
 * Exchanges a valid refresh token for a new access (bearer) token.
 */
import { test, expect } from '@playwright/test';
import { ApiClient } from '../helpers/api-client';
import { uniqueUser } from '../helpers/test-data';

test.describe('POST /auth/refresh', () => {
  test('issues a new bearer token from a valid refresh token', async ({ request }) => {
    const api = new ApiClient(request);
    const user = uniqueUser();
    const tokens = await api.registerAndLogin(user);

    const resp = await api.refresh(tokens.refreshToken);
    expect(resp.status(), await resp.text()).toBe(200);
    const data = (await resp.json()).data;
    expect(data.accessToken).toMatch(/^eyJ[\w-]+\.[\w-]+\.[\w-]+$/);

    // The new bearer token must authorize a protected endpoint.
    const profile = await api.getProfile(data.accessToken);
    expect(profile.status()).toBe(200);
  });

  test('rejects a missing refresh token (401 REFRESH_TOKEN_MISSING)', async ({ request }) => {
    const api = new ApiClient(request);
    const resp = await api.refresh('');
    expect(resp.status()).toBe(401);
  });

  test('rejects a tampered refresh token (401 REFRESH_TOKEN_INVALID)', async ({ request }) => {
    const api = new ApiClient(request);
    const resp = await api.refresh('eyJ.invalid.token');
    expect(resp.status()).toBe(401);
  });
});

