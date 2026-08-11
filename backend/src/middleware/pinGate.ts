import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { AppError } from '../utils/AppError';
import { logger } from '../config/logger';
import {
  PIN_UNLOCK_HEADER,
  evaluatePinUnlockRequest,
} from '../security/pinUnlock';

/** Response header carrying the refreshed unlock token (see pinUnlock.ts). */
export const PIN_UNLOCK_RESPONSE_HEADER = 'X-Pin-Unlock';

/**
 * PIN gate — must run AFTER authMiddleware (it needs req.user).
 *
 * Rejects requests to financial/data endpoints with 403 PIN_VERIFICATION_REQUIRED
 * unless the caller presents a live PIN unlock: either an `X-Pin-Unlock` token
 * issued by /pin/verify, or a recent `UserPin.lastVerifiedAt` as the durable
 * fallback. No-op when the gate is disabled (PIN_GATE_ENABLED != true).
 *
 * On every accepted request it echoes a refreshed token back on the response,
 * which is what slides the re-lock window forward with activity.
 */
export const pinGate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const userId = req.user?.id;
  if (!userId) {
    // Should not happen after authMiddleware; be safe and let auth handling deal with it.
    return next();
  }

  const presentedToken = req.headers[PIN_UNLOCK_HEADER] as string | undefined;

  try {
    const { unlocked, refreshedToken } = await evaluatePinUnlockRequest(userId, presentedToken);

    if (unlocked) {
      if (refreshedToken) {
        res.setHeader(PIN_UNLOCK_RESPONSE_HEADER, refreshedToken);
      }
      return next();
    }
  } catch (err) {
    // Fail open on unexpected errors — never lock a user out of their own data
    // because of a bug or outage on our side.
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
