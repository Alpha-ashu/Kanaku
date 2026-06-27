/**
 * Thin, typed client over the Kanaku auth + core API for E2E tests.
 *
 * It mirrors the REAL frontend flow:
 *   register  -> POST /auth/register            (plain password)
 *   login     -> POST /auth/login/challenge     (SHA-256 password)  => { code }
 *             -> POST /auth/login               ({ email, challengeCode })  => { accessToken, refreshToken }
 *
 * The accessToken is the BEARER TOKEN used for every protected endpoint:
 *   Authorization: Bearer <accessToken>
 */
import { APIRequestContext, APIResponse } from '@playwright/test';
import { apiUrl, sha256Hex } from './env';
import { TestUser } from './test-data';

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; name?: string; role?: string };
}

export class ApiClient {
  constructor(private readonly request: APIRequestContext) {}

  // ---- raw endpoint calls -------------------------------------------------

  register(user: Partial<TestUser>): Promise<APIResponse> {
    return this.request.post(apiUrl('/auth/register'), {
      data: user,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /** Step 1 of login. `password` MUST be the SHA-256 hex of the plain password. */
  loginChallenge(email: string, sha256Password: string): Promise<APIResponse> {
    return this.request.post(apiUrl('/auth/login/challenge'), {
      data: { email, password: sha256Password },
      headers: { 'Content-Type': 'application/json', 'x-pw-encoding': 'sha256' },
    });
  }

  /** Step 2 of login: exchange the challenge code for tokens. */
  loginWithCode(email: string, challengeCode: string): Promise<APIResponse> {
    return this.request.post(apiUrl('/auth/login'), {
      data: { email, challengeCode },
      headers: { 'Content-Type': 'application/json' },
    });
  }

  refresh(refreshToken: string): Promise<APIResponse> {
    return this.request.post(apiUrl('/auth/refresh'), {
      data: { refreshToken },
      headers: { 'Content-Type': 'application/json' },
    });
  }

  getProfile(accessToken: string): Promise<APIResponse> {
    return this.request.get(apiUrl('/auth/profile'), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

  /** Generic authenticated request helper. */
  authed(
    method: 'get' | 'post' | 'put' | 'delete',
    path: string,
    accessToken: string,
    body?: unknown,
  ): Promise<APIResponse> {
    return this.request[method](apiUrl(path), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      ...(body !== undefined ? { data: body } : {}),
    });
  }

  // ---- composite flows ----------------------------------------------------

  /** Full happy-path login: returns the BEARER TOKEN + refresh token + user. */
  async login(email: string, plainPassword: string): Promise<Tokens> {
    const challengeResp = await this.loginChallenge(email, sha256Hex(plainPassword));
    if (!challengeResp.ok()) {
      throw new Error(`login/challenge failed (${challengeResp.status()}): ${await challengeResp.text()}`);
    }
    const code = (await challengeResp.json())?.data?.code as string;
    if (!code) throw new Error('login/challenge returned no code');

    const loginResp = await this.loginWithCode(email, code);
    if (!loginResp.ok()) {
      throw new Error(`login failed (${loginResp.status()}): ${await loginResp.text()}`);
    }
    const data = (await loginResp.json())?.data;
    if (!data?.accessToken) throw new Error('login returned no accessToken');
    return data as Tokens;
  }

  /** Register a fresh user then log in, returning tokens ready for protected calls. */
  async registerAndLogin(user: TestUser): Promise<Tokens> {
    const reg = await this.register(user);
    if (reg.status() !== 201 && reg.status() !== 200) {
      throw new Error(`register failed (${reg.status()}): ${await reg.text()}`);
    }
    return this.login(user.email, user.password);
  }
}

