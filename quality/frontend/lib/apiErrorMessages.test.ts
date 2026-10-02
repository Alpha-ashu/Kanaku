// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

// The server explains a refusal ("This is the only active administrator…");
// the app used to replace every 409 with "This item already exists" and every
// 403 with "You do not have permission", so the reason never reached anyone.
const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));

vi.mock('@/utils/supabase/client', () => ({
  default: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) } },
}));
vi.mock('sonner', () => ({
  toast: { error: toastError, success: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

import { api, apiClient, TokenManager } from '@/lib/api';

const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const failWith = async (status: number, body: Record<string, unknown>) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply(status, body)));
  return apiClient.post('/admin/users/u1/role', { role: 'user' }).then(
    () => { throw new Error('expected a rejection'); },
    (error: { message: string; status: number }) => error,
  );
};

describe('what the user is told when the server refuses', () => {
  beforeEach(() => {
    toastError.mockReset();
    vi.unstubAllGlobals();
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, String(value)); },
      removeItem: (key: string) => { store.delete(key); },
      clear: () => { store.clear(); },
    });
    TokenManager.clearTokens();
    TokenManager.setAccessToken('session-token');
    api.clearCache();
  });

  it("shows an explained conflict in the server's words", async () => {
    const error = await failWith(409, { error: 'This is the only active administrator. Promote another admin first.', code: 'LAST_ADMIN' });
    expect(error).toMatchObject({ status: 409, message: 'This is the only active administrator. Promote another admin first.' });
  });

  it('shows an explained 403 and an explained 400, even with ordinary words like "at least"', async () => {
    expect((await failWith(403, { error: 'This is a protected Kanaku role account and cannot be changed.', code: 'PROTECTED_ACCOUNT' })).message)
      .toBe('This is a protected Kanaku role account and cannot be changed.');
    expect((await failWith(400, { error: 'Explain why this change is needed (at least 5 characters).', code: 'REASON_REQUIRED' })).message)
      .toBe('Explain why this change is needed (at least 5 characters).');
  });

  it('keeps the generic line for a generic code', async () => {
    expect((await failWith(409, { error: 'Unique constraint failed', code: 'CONFLICT' })).message)
      .toBe('This item already exists. Please use different values.');
  });

  it('never shows technical text', async () => {
    expect((await failWith(409, { error: 'Error at handler (/srv/app/admin.ts:12:7)', code: 'SOMETHING' })).message)
      .not.toContain('/srv/app');
    expect((await failWith(409, { error: 'Invalid `prisma.user.update()` invocation', code: 'P2002' })).message)
      .not.toContain('prisma');
    expect((await failWith(500, { error: 'connect ECONNREFUSED 10.0.0.1:5432', code: 'DB_DOWN' })).message)
      .toBe('Something went wrong on our end. Please try again later.');
  });
});
