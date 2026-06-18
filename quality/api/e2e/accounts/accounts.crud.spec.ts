/**
 * E2E — Protected resource CRUD using a bearer token.
 *   POST/GET/PUT/DELETE /api/v1/accounts
 *
 * Shows how, once you have the bearer token from login, you drive any
 * authenticated endpoint. Each run uses a fresh user + unique resource ids.
 */
import { test, expect } from '@playwright/test';
import { ApiClient, Tokens } from '../helpers/api-client';
import { uniqueUser, uniqueSuffix } from '../helpers/test-data';

test.describe('Accounts CRUD (authenticated)', () => {
  let api: ApiClient;
  let tokens: Tokens;

  test.beforeEach(async ({ request }) => {
    api = new ApiClient(request);
    tokens = await api.registerAndLogin(uniqueUser());
  });

  test('creates and reads back an account', async () => {
    const name = `Wallet ${uniqueSuffix()}`;
    const create = await api.authed('post', '/accounts', tokens.accessToken, {
      name,
      type: 'cash',
      balance: 2500,
      currency: 'INR',
      clientRequestId: `acct-${uniqueSuffix()}`,
    });
    expect([200, 201]).toContain(create.status());

    const list = await api.authed('get', '/accounts', tokens.accessToken);
    expect(list.status()).toBe(200);
    expect(JSON.stringify(await list.json())).toContain(name);
  });

  test('blocks unauthenticated access (401/403)', async ({ request }) => {
    const anon = new ApiClient(request);
    const resp = await anon.authed('get', '/accounts', 'invalid.bearer.token');
    expect([401, 403]).toContain(resp.status());
  });

  test('blocks a malformed Authorization header (401)', async ({ request }) => {
    const resp = await request.get(`${process.env.API_BASE_URL || 'http://localhost:3000'}/api/v1/accounts`, {
      headers: { Authorization: 'NotBearer xyz' },
    });
    expect([401, 403]).toContain(resp.status());
  });
});

