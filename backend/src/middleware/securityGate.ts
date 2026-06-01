import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { AuthRequest } from './auth';
import { AppError } from '../utils/AppError';
import { logger } from '../config/logger';

const getSecuritySecret = (): string => {
  const envSecret = process.env.SECURITY_JWT_SECRET || 
                    process.env.JWT_SECRET || 
                    process.env.SUPABASE_JWT_SECRET || 
                    process.env.SUPABASE_SERVICE_ROLE_KEY;
                    
  if (envSecret) {
    return envSecret;
  }
  
  // Fall back to a random key generated at startup rather than throwing a fatal error
  // which crashes the entire serverless application on Vercel.
  logger.warn('WARNING: No JWT or Supabase secrets configured in environment for SecurityGate. Generating a dynamic runtime secure key.');
  return crypto.randomBytes(32).toString('hex');
};

const SECURITY_JWT_SECRET = getSecuritySecret();

export interface SecurityGateRequest extends AuthRequest {
  securityVerified?: boolean;
}

/**
 * Security Gate Middleware
 * Ensures that a sensitive operation has been verified via Biometric/OTP
 * within the last few minutes.
 */
export const securityGate = (req: SecurityGateRequest, res: Response, next: NextFunction) => {
  const securityToken = req.headers['x-security-token'] as string;

  if (!securityToken) {
    logger.warn(`Security Gate blocked request to ${req.path}: Missing x-security-token`, {
      userId: req.user?.id,
    });
    return next(AppError.forbidden(
      'Additional security verification required', 
      'SECURITY_VERIFICATION_REQUIRED'
    ));
  }

  try {
    const decoded = jwt.verify(securityToken, SECURITY_JWT_SECRET) as any;
    
    // Ensure the token belongs to the current user
    if (decoded.sub !== req.user?.id) {
      throw new Error('Security token mismatch');
    }

    // Ensure the token is for security verification
    if (decoded.type !== 'security_verification') {
      throw new Error('Invalid security token type');
    }

    req.securityVerified = true;
    next();
  } catch (error) {
    logger.warn(`Security Gate blocked request to ${req.path}: Invalid or expired token`, {
      userId: req.user?.id,
      error: error instanceof Error ? error.message : String(error),
    });
    
    return next(AppError.forbidden(
      'Security verification expired or invalid. Please re-authenticate with biometric/OTP.',
      'SECURITY_VERIFICATION_EXPIRED'
    ));
  }
};

/**
 * Utility to generate a short-lived security token
 */
export const generateSecurityToken = (userId: string): string => {
  return jwt.sign(
    { 
      sub: userId, 
      type: 'security_verification',
      timestamp: Date.now() 
    },
    SECURITY_JWT_SECRET,
    { expiresIn: '5m' } // 5 minutes window for sensitive operations
  );
};
