import { Router, Request, Response, NextFunction } from 'express';
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
import { verifyWebhookSignature } from '../../security/webhookSignature';
import { audit } from '../../utils/auditLogger';

const router = Router();

// Rate limiting for AA endpoints
router.use(rateLimit({
  windowMs: 60_000,
  max: 20,
  scope: 'api-aa',
  message: 'Too many Account Aggregator requests. Please try again later.',
}));

/**
 * POST /api/v1/aa/notification — Setu AA callback (Step: consent/data status).
 *
 * MUST be registered BEFORE `authMiddleware` because the AA system calls
 * it machine-to-machine with no user JWT. Authenticity is enforced via an
 * HMAC signature over the raw body using WEBHOOK_SETU_SECRET instead.
 *
 * Without this, an attacker could POST a forged "consent ACTIVE" event and
 * trick the app into believing a bank link was approved. (Previously this
 * route sat behind authMiddleware and was therefore both unreachable by
 * Setu and unverified.)
 */
router.post('/notification', validateBody(aaNotificationSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const secret = process.env.WEBHOOK_SETU_SECRET;

    // In production the secret is mandatory; in dev we allow an unsigned
    // call so local testing against a mock AA still works, but we log it.
    if (secret) {
      const valid = verifyWebhookSignature(req, secret, {
        headerName: process.env.WEBHOOK_SETU_SIGNATURE_HEADER || 'x-setu-signature',
        algorithm: 'sha256',
        encoding: 'hex',
      });
      if (!valid) {
        audit({
          event: 'security.webhook_invalid_signature',
          ip: req.ip || undefined,
          resource: 'aa.notification',
          action: 'POST /api/v1/aa/notification',
        });
        return res.status(401).json({ success: false, message: 'Invalid signature', code: 'WEBHOOK_SIGNATURE_INVALID' });
      }
    } else if (process.env.NODE_ENV === 'production') {
      logger.error('[AA] WEBHOOK_SETU_SECRET not configured — rejecting webhook in production.');
      return res.status(503).json({ success: false, message: 'Webhook verification not configured', code: 'WEBHOOK_NOT_CONFIGURED' });
    } else {
      logger.warn('[AA] WEBHOOK_SETU_SECRET not set — accepting UNVERIFIED webhook in non-production.');
    }

    const payload = req.body;
    logger.info('[AA] Webhook notification received', { type: payload?.type });

    await aaService.handleNotification(payload);

    res.json({ success: true, message: 'Notification processed.' });
  } catch (error) {
    next(error);
  }
});

// All remaining AA routes require user authentication.
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

export { router as aaRoutes };

