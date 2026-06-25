import { Router, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pinService } from './pin.service';
import { authMiddleware, AuthRequest } from '../../middleware/auth';
import { securityGate, generateSecurityToken } from '../../middleware/securityGate';
import { establishPinUnlock } from '../../security/pinUnlock';
import { validateBody } from '../../middleware/validate';
import { AppError } from '../../utils/AppError';
import { logger } from '../../config/logger';
import { auditFromRequest } from '../../utils/auditLogger';
import {
  createPinSchema,
  verifyPinSchema,
  verifySecuritySchema,
  updatePinSchema,
  keyBackupSchema,
  resetPinSchema,
} from './pin.validation';

const router = Router();

// All PIN routes require authentication
router.use(authMiddleware);

/** Helper: throw 401 if userId is missing (should never happen after authMiddleware) */
function requireUserId(req: AuthRequest): string {
  const userId = req.user?.id;
  if (!userId) throw AppError.unauthorized();
  return userId;
}

// Step-up window: a security token is only issued if the user proved PIN
// possession within this window (or supplies a valid PIN / fresh OTP token now).
const RECENT_VERIFICATION_WINDOW_MS = 2 * 60 * 1000;

/**
 * Verifies a freshly-minted auth token (e.g. the Supabase session returned by
 * an email-OTP verification during the forgot-PIN reset flow). Confirms the
 * signature, that it belongs to this user, and that it was issued recently —
 * proving a recent OTP step-up without the backend needing to consume the OTP.
 */
function verifyFreshAuthToken(token: string, userId: string): boolean {
  const secrets = [process.env.SUPABASE_JWT_SECRET, process.env.JWT_SECRET].filter(Boolean) as string[];
  for (const secret of secrets) {
    try {
      const decoded: any = jwt.verify(token, secret);
      const sub = decoded.sub || decoded.userId || decoded.id;
      if (sub !== userId) continue;
      // Must be freshly issued (recent step-up), not a long-lived session token.
      if (typeof decoded.iat === 'number' && Date.now() / 1000 - decoded.iat > 10 * 60) continue;
      return true;
    } catch {
      // try the next secret
    }
  }
  return false;
}

/**
 * POST /api/v1/pin/create
 */
router.post('/create', validateBody(createPinSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = requireUserId(req);
    const { pin } = req.body;

    if (!pin) throw AppError.badRequest('PIN is required', 'PIN_REQUIRED');

    const result = await pinService.createPin({
      userId,
      pin,
      email: req.user?.email,
      name: req.user?.name,
      role: req.user?.role,
      isApproved: req.user?.isApproved,
    });

    if (!result.success) {
      throw AppError.badRequest(result.message, 'INVALID_PIN');
    }

    // Creating a PIN implicitly unlocks the session (the user just proved it).
    await establishPinUnlock(userId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/pin/verify
 */
router.post('/verify', validateBody(verifyPinSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = requireUserId(req);
    const { pin, deviceId } = req.body;

    if (!pin) throw AppError.badRequest('PIN is required', 'PIN_REQUIRED');

    const result = await pinService.verifyPin({ userId, pin, deviceId });
    if (!result.success) {
      return res.status(401).json(result);
    }
    // Establish the server-side PIN-unlock so financial endpoints (behind pinGate)
    // become accessible for this user until the inactivity window elapses.
    await establishPinUnlock(userId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/pin/verify-security
 * Issues a short-lived security token for sensitive operations (PIN update,
 * key-backup, self-reset). A token is ONLY issued against proof:
 *   1. `pin` in the body  → verified now via pinService, OR
 *   2. `freshAuthToken`    → a recently-issued auth/OTP token (forgot-PIN reset), OR
 *   3. a recent server-recorded PIN verify/create (normal flow calls /pin/verify
 *      or /pin/create immediately before this).
 * Otherwise it returns 403 — closing the previous "issue token without proof" bypass.
 */
router.post('/verify-security', validateBody(verifySecuritySchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = requireUserId(req);
    const { pin, freshAuthToken } = (req.body || {}) as { pin?: string; freshAuthToken?: string };

    let verified = false;

    if (typeof pin === 'string' && pin) {
      const result = await pinService.verifyPin({ userId, pin });
      if (!result.success) {
        return res.status(401).json({ success: false, message: result.message || 'Invalid PIN' });
      }
      verified = true;
    } else if (typeof freshAuthToken === 'string' && freshAuthToken) {
      verified = verifyFreshAuthToken(freshAuthToken, userId);
      if (!verified) {
        return res.status(401).json({ success: false, message: 'Invalid or expired verification token' });
      }
    } else {
      // No explicit proof supplied — accept a recent server-recorded PIN
      // verification (the normal UI flow verifies/creates the PIN just before
      // calling this endpoint).
      verified = await pinService.hasRecentVerification(userId, RECENT_VERIFICATION_WINDOW_MS);
    }

    if (!verified) {
      logger.warn('verify-security denied: no recent proof', { userId });
      return next(AppError.forbidden(
        'Recent PIN or OTP verification is required to obtain a security token.',
        'SECURITY_PROOF_REQUIRED',
      ));
    }

    const token = generateSecurityToken(userId);
    res.json({ success: true, securityToken: token });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/pin/update
 */
router.post('/update', securityGate, validateBody(updatePinSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = requireUserId(req);
    const { currentPin, newPin } = req.body;

    if (!currentPin || !newPin) {
      throw AppError.badRequest('Current PIN and new PIN are required', 'PIN_FIELDS_REQUIRED');
    }

    const result = await pinService.updatePin({ userId, currentPin, newPin });
    if (!result.success) {
      throw AppError.badRequest(result.message, 'INVALID_PIN');
    }
    auditFromRequest(req, 'security.pin_change', { resource: 'pin', resourceId: userId });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/pin/status
 */
router.get('/status', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const result = await pinService.getPinStatus(req.user?.id || '');
    res.json(result);
  } catch (error) {
    // PIN status is non-critical  degrade gracefully rather than erroring
    res.json({
      success: false,
      message: 'PIN service temporarily unavailable',
      statusCode: 503,
    });
  }
});

/**
 * GET /api/v1/pin/key-backup
 */
router.get('/key-backup', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = requireUserId(req);
    const result = await pinService.getPinKeyBackup(userId);
    if (!result.success) {
      return res.status(404).json(result);
    }
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/pin/key-backup
 */
router.post('/key-backup', securityGate, validateBody(keyBackupSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = requireUserId(req);
    const { backup } = req.body;

    if (!backup || typeof backup !== 'string') {
      throw AppError.badRequest('PIN key backup is required', 'BACKUP_REQUIRED');
    }

    const result = await pinService.savePinKeyBackup({ userId, backup });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/pin/key-backup
 */
router.delete('/key-backup', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = requireUserId(req);
    const result = await pinService.clearPinKeyBackup(userId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/pin/expiring-soon
 */
router.get('/expiring-soon', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = requireUserId(req);
    const [isExpiringSoon, daysRemaining] = await Promise.all([
      pinService.isPinExpiringSoon(userId),
      pinService.getPinDaysRemaining(userId),
    ]);
    res.json({ success: true, isExpiringSoon, daysRemaining });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/pin/reset  (admin only)
 */
router.post('/reset', validateBody(resetPinSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user?.role !== 'admin') {
      throw AppError.forbidden('Admin access required', 'ADMIN_REQUIRED');
    }

    const { userId } = req.body;
    if (!userId) throw AppError.badRequest('User ID is required', 'USER_ID_REQUIRED');

    const result = await pinService.forceResetPin(userId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/pin/self-reset
 */
router.post('/self-reset', securityGate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = requireUserId(req);
    const result = await pinService.forceResetPin(userId);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export { router as pinRoutes };
