/**
 * E2E — Registration endpoint.  POST /api/v1/auth/register
 *
 * Demonstrates: the registration endpoint, success shape, and every documented
 * validation error. Each test uses UNIQUE data so it can be re-run safely.
 */
import { test, expect } from '@playwright/test';
import { ApiClient } from '../helpers/api-client';
import { uniqueUser, invalidUsers } from '../helpers/test-data';

test.describe('POST /auth/register', () => {
  test('registers a brand-new user (201) and returns user + bearer header', async ({ request }) => {
    const api = new ApiClient(request);
    const user = uniqueUser();

    const resp = await api.register(user);

    expect(resp.status(), await resp.text()).toBe(201);
    const body = await resp.json();
    expect(body.success).toBe(true);
    expect(body.data.user).toBeTruthy();
    expect(body.data.user.email).toBe(user.email.toLowerCase());
    // Bearer token is also returned in the Authorization response header.
    expect(resp.headers()['authorization']).toMatch(/^Bearer .+/);
    expect(resp.headers()['x-refresh-token']).toBeTruthy();
  });

  test('rejects duplicate email (409 EMAIL_EXISTS)', async ({ request }) => {
    const api = new ApiClient(request);
    const user = uniqueUser();

    const first = await api.register(user);
    expect(first.status()).toBe(201);

    const second = await api.register(user);
    expect(second.status()).toBe(409);
    expect((await second.json()).code ?? (await second.json()).error?.code).toMatch(/EMAIL_EXISTS|CONFLICT/i);
  });

  test('rejects missing fields (400 MISSING_FIELDS)', async ({ request }) => {
    const api = new ApiClient(request);
    const resp = await api.register(invalidUsers.missingFields());
    expect(resp.status()).toBe(400);
  });

  test('rejects invalid email (400 INVALID_EMAIL)', async ({ request }) => {
    const api = new ApiClient(request);
    const resp = await api.register(invalidUsers.badEmail());
    expect(resp.status()).toBe(400);
  });

  test('rejects short password (400 PASSWORD_TOO_SHORT)', async ({ request }) => {
    const api = new ApiClient(request);
    const resp = await api.register(invalidUsers.shortPassword());
    expect(resp.status()).toBe(400);
  });

  test('rejects weak password (400 PASSWORD_TOO_WEAK)', async ({ request }) => {
    const api = new ApiClient(request);
    const resp = await api.register(invalidUsers.weakPassword());
    expect(resp.status()).toBe(400);
  });
});

