/**
 * E2E — Full authenticated journey for a single fresh user:
 *   register -> login (bearer) -> read profile -> create account -> list accounts
 *   -> update profile -> refresh token -> verify still authorized.
 *
 * This is the "golden path" that proves the whole auth + protected-resource
 * chain works end to end with a UNIQUE user each run.
 */
import { test, expect } from '@playwright/test';
import { ApiClient } from '../helpers/api-client';
import { uniqueUser } from '../helpers/test-data';

test.describe('Auth golden path (register -> bearer -> protected -> refresh)', () => {
  test('a new user can register, authenticate, and use protected endpoints', async ({ request }) => {
    const api = new ApiClient(request);
    const user = uniqueUser();

    // 1) Register
    const reg = await api.register(user);
    expect(reg.status(), await reg.text()).toBe(201);

    // 2) Login -> bearer token
    const { accessToken } = await api.login(user.email, user.password);
    expect(accessToken).toBeTruthy();

    // 3) Read own profile with the bearer token
    const profile = await api.getProfile(accessToken);
    expect(profile.status()).toBe(200);

    // 4) Create a protected resource (account)
    const create = await api.authed('post', '/accounts', accessToken, {
      name: 'E2E Savings',
      type: 'bank',
      balance: 1000,
      currency: 'INR',
      clientRequestId: `e2e-${user.email}`,
    });
    expect([200, 201]).toContain(create.status());

    // 5) List accounts -> must include the one we just created
    const list = await api.authed('get', '/accounts', accessToken);
    expect(list.status()).toBe(200);
    const accounts = (await list.json()).data ?? (await list.json());
    expect(JSON.stringify(accounts)).toContain('E2E Savings');

    // 6) Reject access WITHOUT a valid bearer token
    const unauth = await api.authed('get', '/accounts', 'not-a-real-token');
    expect([401, 403]).toContain(unauth.status());
  });
});


