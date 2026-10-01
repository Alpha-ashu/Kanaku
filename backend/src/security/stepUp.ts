/**
 * Step-up re-authentication for irreversible, account-wide actions (delete the
 * account, wipe its data).
 *
 * An access token alone is not enough for these: it is what an attacker holds
 * after stealing a session, and until now the only "confirm your password" check
 * lived in the browser (it called /auth/login and then DELETE /auth/account,
 * which accepted any token). The proof now travels WITH the destructive request
 * and is checked here, on the server:
 *
 *   { method: 'password', password }  — the account password (bcrypt, or the
 *                                        identity provider for accounts whose
 *                                        password lives there);
 *   { method: 'email_code' }           — a sensitive_action code, sent to and
 *                                        verified against the ACCOUNT's email via
 *                                        POST /otp/send + /otp/verify, consumed
 *                                        here so it authorises exactly one action.
 *
 * The email code is the path for accounts with no password (Google sign-in).
 * Neither failure message mentions the app PIN: the web client retries any 403
 * whose message contains "PIN" through its PIN-unlock flow.
 */
import bcrypt from 'bcryptjs';
import type { Request } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { AppError } from '../utils/AppError';
import { auditFromRequest } from '../utils/auditLogger';
import { otpService, REVERIFY_WINDOW_SECONDS } from '../features/otp/otp.service';
import { authProvider } from '../features/auth/auth.provider';
import { logger } from '../config/logger';

export const stepUpProofSchema = z.discriminatedUnion('method', [
  z.object({ method: z.literal('password'), password: z.string().min(1).max(256) }),
  z.object({ method: z.literal('email_code') }),
]);

export type StepUpProof = z.infer<typeof stepUpProofSchema>;

export type StepUpAction = 'account.delete' | 'data.reset' | 'payout.method_change';

const BCRYPT_HASH = /^\$2[aby]\$\d{2}\$/;
const PROVIDER_MANAGED = 'supabase-managed-account';

const maskEmail = (email: string) => {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${'*'.repeat(Math.max(1, local.length - visible.length))}@${domain}`;
};

/** Which proofs this account can give — drives the confirmation dialog. */
export async function stepUpMethods(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, password: true } });
  if (!user) throw AppError.notFound('User');
  return {
    // A local bcrypt hash is a password we can check. Provider-managed accounts
    // may or may not have one (Google sign-in has none), so they are steered to
    // the email code, which every account can complete.
    password: BCRYPT_HASH.test(user.password || ''),
    emailCode: Boolean(user.email),
    email: user.email ? maskEmail(user.email) : null,
  };
}

const checkPassword = async (email: string, stored: string, candidate: string): Promise<boolean> => {
  if (BCRYPT_HASH.test(stored)) return bcrypt.compare(candidate, stored);
  if (!stored || stored === PROVIDER_MANAGED) {
    try {
      return await authProvider.verifyCredentials(email, candidate);
    } catch (error) {
      logger.warn('[step-up] identity provider password check failed', { error });
      return false;
    }
  }
  return false;
};

/**
 * Throws unless `proof` re-authenticates `userId` right now. 428 when no usable
 * proof was supplied (ask for one), 403 when the proof was wrong.
 */
export async function verifyStepUp(
  req: Request,
  userId: string,
  proof: unknown,
  action: StepUpAction,
): Promise<StepUpProof['method']> {
  const parsed = stepUpProofSchema.safeParse(proof);
  if (!parsed.success) {
    throw new AppError(428, 'STEP_UP_REQUIRED', 'Confirm it is you: enter your password or the code we email you.');
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, password: true } });
  if (!user?.email) throw AppError.notFound('User');

  const method = parsed.data.method;
  let ok: boolean;
  if (parsed.data.method === 'password') {
    ok = await checkPassword(user.email, user.password || '', parsed.data.password);
  } else {
    ok = await otpService.consumeRecentVerification(user.email, 'sensitive_action', REVERIFY_WINDOW_SECONDS);
  }

  if (!ok) {
    auditFromRequest(req, 'security.step_up_failed', { userId, resource: 'user', resourceId: userId, meta: { action, method } });
    if (method === 'email_code') {
      throw new AppError(428, 'STEP_UP_CODE_REQUIRED', 'Enter the verification code we emailed you, then try again. Codes work once and expire after 10 minutes.');
    }
    throw AppError.forbidden('That password is not correct.', 'STEP_UP_FAILED');
  }

  auditFromRequest(req, 'security.step_up_verified', { userId, resource: 'user', resourceId: userId, meta: { action, method } });
  return method;
}
