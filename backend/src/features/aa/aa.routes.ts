import { Router, Response, NextFunction } from 'express';
import { authMiddleware, AuthRequest } from '../../middleware/auth';
import { validateBody, validateParams } from '../../middleware/validate';
import { rateLimit } from '../../middleware/rateLimit';
import {
  createConsentSchema,
  consentHandleParamSchema,
  consentIdParamSchema,
  createDataSessionSchema,
  sessionIdParamSchema,
  aaNotificationSchema,
} from './aa.validation';
import { aaService } from './aa.service';
import { otpService } from '../otp/otp.service';
import { AppError } from '../../utils/AppError';
import { logger } from '../../config/logger';

const router = Router();

// Rate limiting for AA endpoints
router.use(rateLimit({
  windowMs: 60_000,
  max: 20,
  scope: 'api-aa',
  message: 'Too many Account Aggregator requests. Please try again later.',
}));

// All AA routes require authentication
router.use(authMiddleware);

/**
 * POST /api/v1/aa/consent
 * Create a new consent request (Step 1)
 * Requires OTP verification for aa_consent purpose
 */
router.post('/consent', validateBody(createConsentSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) throw AppError.unauthorized();

    const userEmail = req.user?.email;

    // RBI Compliance: OTP verification required before consent creation
    if (userEmail) {
      const hasVerification = await otpService.hasRecentVerification(userEmail, 'aa_consent', 300);
      if (!hasVerification) {
        return res.status(403).json({
          success: false,
          message: 'OTP verification required before creating consent. Please verify your identity first.',
          code: 'OTP_REQUIRED',
        });
      }
    }

    const { vua, fiTypes, consentTypes, purpose, dataRange, consentMode, fetchType } = req.body;

    const result = await aaService.createConsent({
      userId,
      vua,
      fiTypes,
      consentTypes,
      purpose,
      dataRange,
      consentMode,
      fetchType,
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/aa/consent/status/:consentHandle
 * Check consent status (Step 2)
 */
router.get('/consent/status/:consentHandle', validateParams(consentHandleParamSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) throw AppError.unauthorized();

    const { consentHandle } = req.params;
    const result = await aaService.getConsentStatus(consentHandle, userId);

    if (!result.success) {
      return res.status(404).json(result);
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/aa/consent/artifact/:consentId
 * Fetch consent artifact (Step 3)
 */
router.get('/consent/artifact/:consentId', validateParams(consentIdParamSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) throw AppError.unauthorized();

    const { consentId } = req.params;
    const artifact = await aaService.getConsentArtifact(consentId, userId);

    if (!artifact) {
      return res.status(404).json({ success: false, message: 'Consent artifact not found.' });
    }

    res.json({ success: true, data: artifact });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/aa/data/session
 * Create data fetch session (Step 4)
 */
router.post('/data/session', validateBody(createDataSessionSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) throw AppError.unauthorized();

    const { consentId } = req.body;
    const result = await aaService.createDataSession({ consentId, userId });

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/aa/data/fetch/:sessionId
 * Fetch financial data (Step 5)
 */
router.get('/data/fetch/:sessionId', validateParams(sessionIdParamSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) throw AppError.unauthorized();

    const { sessionId } = req.params;
    const result = await aaService.fetchFinancialData(sessionId, userId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/aa/consents
 * List user's consent history
 */
router.get('/consents', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) throw AppError.unauthorized();

    const consents = await aaService.getUserConsents(userId);
    res.json({ success: true, data: consents });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/aa/consent/revoke/:consentId
 * Revoke an active consent
 */
router.post('/consent/revoke/:consentId', validateParams(consentIdParamSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) throw AppError.unauthorized();

    const { consentId } = req.params;
    const result = await aaService.revokeConsent(consentId, userId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/aa/financial-summary
 * Get user's aggregated financial data
 */
router.get('/financial-summary', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    if (!userId) throw AppError.unauthorized();

    const summary = await aaService.getUserFinancialSummary(userId);
    res.json({ success: true, data: summary });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/aa/notification
 * Webhook endpoint for AA notifications (Setu callback)
 * This endpoint is called by the AA system, not by the user
 */
router.post('/notification', validateBody(aaNotificationSchema), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const payload = req.body;
    logger.info('[AA] Webhook notification received', payload);

    await aaService.handleNotification(payload);

    res.json({ success: true, message: 'Notification processed.' });
  } catch (error) {
    next(error);
  }
});

export { router as aaRoutes };

