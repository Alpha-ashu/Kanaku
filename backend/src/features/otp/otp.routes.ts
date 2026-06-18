import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthRequest } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import { rateLimit } from '../../middleware/rateLimit';
import { sendOtpSchema, verifyOtpSchema } from './otp.validation';
import { otpService } from './otp.service';

const router = Router();

// Strict rate limiting on OTP endpoints (5 requests per minute per IP)
router.use(rateLimit({
  windowMs: 60_000,
  max: 5,
  scope: 'api-otp',
  message: 'Too many OTP requests. Please wait before trying again.',
}));

/**
 * POST /api/v1/otp/send
 * Send OTP to destination (email or phone)
 * Requires authentication for non-signup flows
 */
router.post('/send', authMiddleware, validateBody(sendOtpSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { destination, channel, purpose } = req.body;
    const userId = req.user?.id;
    const ipAddress = req.ip || req.socket.remoteAddress || undefined;
    const userAgent = req.headers['user-agent'] || undefined;

    const result = await otpService.sendOtp(
      destination,
      purpose,
      channel,
      userId,
      ipAddress,
      userAgent,
    );

    if (!result.success) {
      return res.status(429).json(result);
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/otp/verify
 * Verify OTP code
 */
router.post('/verify', authMiddleware, validateBody(verifyOtpSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { destination, purpose, otp } = req.body;

    const result = await otpService.verifyOtp(destination, purpose, otp);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
});

export { router as otpRoutes };

