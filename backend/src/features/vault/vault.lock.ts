/**
 * Server-side Vault lock.
 *
 * The Vault PIN used to be a UI overlay only: every /vault endpoint answered any
 * valid access token, so the lock could be skipped by calling the API directly,
 * and `autoLockMinutes` was stored but never applied. The lock is now carried by
 * a short-lived signed token, the same pattern as the app PIN gate
 * (security/pinUnlock.ts):
 *
 *   1. POST /vault/lock/verify (correct PIN) issues a `vault_unlock` JWT whose
 *      lifetime is the user's auto-lock window.
 *   2. The client sends it back as `X-Vault-Unlock` on every vault request.
 *   3. requireVaultUnlock verifies it and echoes a refreshed token, so the window
 *      slides with activity and the vault re-locks after `autoLockMinutes` idle.
 *
 * Users who have not enabled a Vault PIN are never gated.
 */
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Response, NextFunction } from 'express';
import { prisma } from '../../db/prisma';
import { AppError, isStructuralDatabaseError } from '../../utils/AppError';
import { reportDegradedWrite } from '../../utils/degradedWrite';
import { logger } from '../../config/logger';
import { AuthRequest } from '../../middleware/auth';

export const VAULT_UNLOCK_HEADER = 'x-vault-unlock';
export const VAULT_UNLOCK_RESPONSE_HEADER = 'X-Vault-Unlock';
const TOKEN_TYPE = 'vault_unlock';
const DEFAULT_AUTO_LOCK_MINUTES = 5;

const resolveSecret = (): string => {
  const envSecret =
    process.env.SECURITY_JWT_SECRET || process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET;
  if (envSecret) return envSecret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Vault lock requires SECURITY_JWT_SECRET (or JWT_SECRET) in production.');
  }
  logger.warn('[vaultLock] No JWT secret configured; using a per-boot random key (non-production only).');
  return crypto.randomBytes(32).toString('hex');
};

let cachedSecret: string | null = null;
const secret = (): string => {
  if (!cachedSecret) cachedSecret = resolveSecret();
  return cachedSecret;
};

const windowSeconds = (autoLockMinutes?: number | null): number =>
  Math.max(1, autoLockMinutes || DEFAULT_AUTO_LOCK_MINUTES) * 60;

export const issueVaultUnlockToken = (userId: string, autoLockMinutes?: number | null): string =>
  jwt.sign({ typ: TOKEN_TYPE }, secret(), {
    subject: userId,
    expiresIn: windowSeconds(autoLockMinutes),
    algorithm: 'HS256',
  });

export const isValidVaultUnlockToken = (token: string | undefined, userId: string): boolean => {
  if (!token) return false;
  try {
    const payload = jwt.verify(token, secret(), { algorithms: ['HS256'] }) as jwt.JwtPayload;
    return payload?.typ === TOKEN_TYPE && payload.sub === userId;
  } catch {
    return false;
  }
};

/** A vault is locked only when the owner enabled the lock AND set a Vault PIN. */
export const getActiveLock = async (userId: string) => {
  const setting = await prisma.vaultLockSetting.findUnique({
    where: { userId },
    select: { isLockEnabled: true, vaultPinHash: true, autoLockMinutes: true },
  });
  if (!setting?.isLockEnabled || !setting.vaultPinHash) return null;
  return setting;
};

/**
 * Gate for every vault data route (everything except /vault/lock/*). Must run
 * after authMiddleware.
 */
export const requireVaultUnlock = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const userId = req.user?.id;
  if (!userId) return next();

  try {
    const lock = await getActiveLock(userId);
    if (!lock) return next();

    const presented = req.headers[VAULT_UNLOCK_HEADER] as string | undefined;
    if (isValidVaultUnlockToken(presented, userId)) {
      res.setHeader(VAULT_UNLOCK_RESPONSE_HEADER, issueVaultUnlockToken(userId, lock.autoLockMinutes));
      return next();
    }
  } catch (err) {
    // Failing closed is right when we merely could not READ the lock state: the
    // vault holds identity documents, and the owner can re-enter their PIN.
    //
    // It is wrong when the lock table itself is unusable. Then "your vault is
    // locked, enter your PIN" is both false and unwinnable — entering the PIN
    // hits the same broken table and returns 500, so the user loops forever, on
    // every device, with nothing explaining why. That is not hypothetical: a
    // staging database missing `vault_lock_settings.pin_length` (migration
    // 20260920010000_vault_tables_rls) produces exactly this.
    //
    // Access is still denied either way — this only changes the reason given,
    // from a lie the user can act on fruitlessly to the truth that it is us.
    if (isStructuralDatabaseError(err)) {
      reportDegradedWrite({
        operation: 'vault.lock_state_read',
        error: err,
        context: { userId, route: req.originalUrl },
      });
      return next(new AppError(
        503,
        'VAULT_UNAVAILABLE',
        'The vault is temporarily unavailable. Please try again shortly.',
        false,
      ));
    }

    logger.warn('Vault lock evaluation failed; denying request', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return next(AppError.forbidden('Your vault is locked. Enter your Vault PIN to continue.', 'VAULT_LOCKED'));
};
