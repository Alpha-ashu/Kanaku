import { Router, Response, NextFunction } from 'express';
import { pinService } from './pin.service';
import { authMiddleware, AuthRequest } from '../../middleware/auth';
import { securityGate, generateSecurityToken } from '../../middleware/securityGate';
import { AppError } from '../../utils/AppError';

const router = Router();

// All PIN routes require authentication
router.use(authMiddleware);

/** Helper: throw 401 if userId is missing (should never happen after authMiddleware) */
function requireUserId(req: AuthRequest): string {
  const userId = req.user?.id;
  if (!userId) throw AppError.unauthorized();
  return userId;
}

/**
 * POST /api/v1/pin/create
 */
router.post('/create', async (req: AuthRequest, res: Response, next: NextFunction) => {
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

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/pin/verify
 */
router.post('/verify', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = requireUserId(req);
    const { pin, deviceId } = req.body;

    if (!pin) throw AppError.badRequest('PIN is required', 'PIN_REQUIRED');

    const result = await pinService.verifyPin({ userId, pin, deviceId });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/pin/verify-security
 * Generates a short-lived security token after successful biometric/OTP verification
 * (In a real app, this would be the endpoint called after device-side biometric success)
 */
router.post('/verify-security', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = requireUserId(req);
    // For this demonstration/ hardening task, we simulate successful verification
    // In production, this would verify a biometric signature or OTP code
    const token = generateSecurityToken(userId);
    res.json({ success: true, securityToken: token });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/pin/update
 */
router.post('/update', securityGate, async (req: AuthRequest, res: Response, next: NextFunction) => {
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
router.post('/key-backup', securityGate, async (req: AuthRequest, res: Response, next: NextFunction) => {
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
router.post('/reset', async (req: AuthRequest, res: Response, next: NextFunction) => {
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
