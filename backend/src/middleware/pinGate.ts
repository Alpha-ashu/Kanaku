import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { AppError } from '../utils/AppError';
import { logger } from '../config/logger';
import { evaluatePinUnlock } from '../security/pinUnlock';

/**
 * PIN gate — must run AFTER authMiddleware (it needs req.user).
 *
 * Rejects requests to financial/data endpoints with 403 PIN_VERIFICATION_REQUIRED
 * unless the user has a live PIN-unlock (a recent /pin/verify, kept alive by
 * activity). This makes the app PIN a real server-side control rather than a
 * client-side UI lock. No-op when the gate is disabled (PIN_GATE_ENABLED!=true),
 * so it is safe to mount before the feature is turned on.
 */
export const pinGate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const userId = req.user?.id;
  if (!userId) {
    // Should not happen after authMiddleware; be safe and let auth handling deal with it.
    return next();
  }

  try {
    const unlocked = await evaluatePinUnlock(userId);
    if (unlocked) return next();
  } catch (err) {
    // Fail open on unexpected errors — never lock a user out of their own data.
    logger.warn('PIN gate evaluation error; allowing request', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return next();
  }

  logger.warn(`PIN gate blocked ${req.method} ${req.path}: no live PIN unlock`, { userId });
  return next(AppError.forbidden(
    'Please unlock the app with your PIN to access your financial data.',
    'PIN_VERIFICATION_REQUIRED',
  ));
};
