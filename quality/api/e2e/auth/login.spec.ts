/**
 * E2E — Login + Bearer token.
 *   Step 1: POST /api/v1/auth/login/challenge  (SHA-256 password) -> { code }
 *   Step 2: POST /api/v1/auth/login            ({ email, challengeCode }) -> { accessToken }
 *
 * >>> The accessToken returned by step 2 is the BEARER TOKEN. <<<
 * Use it as:  Authorization: Bearer <accessToken>
 */
import { test, expect } from '@playwright/test';
import { ApiClient } from '../helpers/api-client';
import { uniqueUser } from '../helpers/test-data';
import { sha256Hex } from '../helpers/env';

test.describe('Login flow -> bearer token', () => {
  test('challenge returns a 6-digit code for valid credentials', async ({ request }) => {
    const api = new ApiClient(request);
    const user = uniqueUser();
    await api.register(user);

    const resp = await api.loginChallenge(user.email, sha256Hex(user.password));
    expect(resp.status(), await resp.text()).toBe(200);
    const body = await resp.json();
    expect(body.success).toBe(true);
    expect(body.data.code).toMatch(/^\d{6}$/);
    expect(body.data.challengeId).toMatch(/^ch_/);
  });

  test('exchanges challenge code for a BEARER access token + refresh token', async ({ request }) => {
    const api = new ApiClient(request);
    const user = uniqueUser();
    await api.register(user);

    const tokens = await api.login(user.email, user.password);

    // Bearer token is a JWT (three dot-separated segments, starts with eyJ).
    expect(tokens.accessToken).toMatch(/^eyJ[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(tokens.refreshToken).toMatch(/^eyJ[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(tokens.user.email).toBe(user.email.toLowerCase());

    // Prove the bearer token actually authorizes a protected endpoint.
    const profile = await api.getProfile(tokens.accessToken);
    expect(profile.status()).toBe(200);
    expect((await profile.json()).data?.email ?? (await profile.json()).email).toBe(user.email.toLowerCase());
  });

  test('rejects wrong password at challenge (401 INVALID_CREDENTIALS)', async ({ request }) => {
    const api = new ApiClient(request);
    const user = uniqueUser();
    await api.register(user);

    const resp = await api.loginChallenge(user.email, sha256Hex('WrongPass1!'));
    expect(resp.status()).toBe(401);
  });

  test('rejects an invalid challenge code (401 CHALLENGE_INVALID)', async ({ request }) => {
    const api = new ApiClient(request);
    const user = uniqueUser();
    await api.register(user);

    const resp = await api.loginWithCode(user.email, '000000');
    expect(resp.status()).toBe(401);
  });

  test('rejects login for an unknown email (400/401)', async ({ request }) => {
    const api = new ApiClient(request);
    const resp = await api.loginChallenge(`nobody+${Date.now()}@kanaku.test`, sha256Hex('Whatever1!'));
    expect([400, 401]).toContain(resp.status());
  });
});

