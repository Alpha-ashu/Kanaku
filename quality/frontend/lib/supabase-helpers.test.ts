/**
 * Frontend Tests — Supabase signUp duplicate-email guard
 *
 * Regression coverage for the bug where a duplicate-email signup silently
 * "succeeded" and advanced the user into onboarding ("Account Created").
 *
 * Supabase has two duplicate behaviours depending on the project's
 * email-confirmation setting:
 *   1. Confirmations OFF → signUp returns an error (status 422 / user_already_exists)
 *   2. Confirmations ON  → signUp returns NO error but an obfuscated user whose
 *      `identities` array is empty (anti-enumeration). This case used to slip
 *      through and is the one that caused the reported bug.
 *
 * Both must be turned into a thrown, coded (EMAIL_EXISTS) error carrying a
 * generic, non-enumerable message.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { signUpMock, resendMock } = vi.hoisted(() => ({
  signUpMock: vi.fn(),
  resendMock: vi.fn(),
}));

vi.mock('@/utils/supabase/client', () => ({
  default: { auth: { signUp: signUpMock, resend: resendMock } },
}));

// supabase-helpers imports apiClient from '@/lib/api' for the data helpers we
// don't exercise here — stub it so the module loads without side effects.
vi.mock('@/lib/api', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

import { signUp, resendSignupConfirmation, DUPLICATE_ACCOUNT_MESSAGE } from '@/lib/supabase-helpers';

beforeEach(() => {
  signUpMock.mockReset();
  resendMock.mockReset();
});

describe('signUp duplicate-email guard', () => {
  it('returns the data for a genuinely new account', async () => {
    const data = { user: { id: 'u1', identities: [{ id: 'idp1' }] }, session: null };
    signUpMock.mockResolvedValue({ data, error: null });

    await expect(signUp('new@example.com', 'Str0ng!Pass')).resolves.toEqual(data);
  });

  it('throws EMAIL_EXISTS on the obfuscated duplicate (confirmations ON, identities=[])', async () => {
    signUpMock.mockResolvedValue({
      data: { user: { id: 'obfuscated', identities: [] }, session: null },
      error: null,
    });

    await expect(signUp('taken@example.com', 'Str0ng!Pass')).rejects.toMatchObject({
      code: 'EMAIL_EXISTS',
      message: DUPLICATE_ACCOUNT_MESSAGE,
    });
  });

  it('throws EMAIL_EXISTS on the explicit duplicate error (confirmations OFF, 422)', async () => {
    signUpMock.mockResolvedValue({
      data: { user: null, session: null },
      error: { status: 422, code: 'user_already_exists', message: 'User already registered' },
    });

    await expect(signUp('taken@example.com', 'Str0ng!Pass')).rejects.toMatchObject({
      code: 'EMAIL_EXISTS',
      message: DUPLICATE_ACCOUNT_MESSAGE,
    });
  });

  it('does not leak which field is taken (generic message only)', async () => {
    signUpMock.mockResolvedValue({
      data: { user: { id: 'obfuscated', identities: [] }, session: null },
      error: null,
    });

    await expect(signUp('taken@example.com', 'Str0ng!Pass')).rejects.toThrow(
      /try a different email or phone number/i,
    );
    // Must NOT reveal the account already exists in a machine-readable way.
    await expect(signUp('taken@example.com', 'Str0ng!Pass')).rejects.not.toThrow(
      /already registered|already exists|user exists/i,
    );
  });

  it('re-throws unrelated errors unchanged', async () => {
    signUpMock.mockResolvedValue({
      data: { user: null, session: null },
      error: { status: 500, message: 'network down' },
    });

    await expect(signUp('x@example.com', 'Str0ng!Pass')).rejects.toMatchObject({
      message: 'network down',
    });
  });

  it('passes through the session so callers can detect confirmation-required', async () => {
    // Confirmations ON for a NEW user → no error, real identity, session: null.
    const data = { user: { id: 'u2', identities: [{ id: 'idp1' }] }, session: null };
    signUpMock.mockResolvedValue({ data, error: null });

    const result = await signUp('new@example.com', 'Str0ng!Pass');
    expect(result.session).toBeNull();
    expect(result.user.identities).toHaveLength(1);
  });
});

describe('resendSignupConfirmation', () => {
  it('asks Supabase to resend the signup confirmation email', async () => {
    resendMock.mockResolvedValue({ error: null });
    await expect(resendSignupConfirmation('user@example.com')).resolves.toBeUndefined();
    expect(resendMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'signup', email: 'user@example.com' }),
    );
  });

  it('propagates a resend error to the caller', async () => {
    resendMock.mockResolvedValue({ error: { message: 'rate limited' } });
    await expect(resendSignupConfirmation('user@example.com')).rejects.toMatchObject({
      message: 'rate limited',
    });
  });
});
