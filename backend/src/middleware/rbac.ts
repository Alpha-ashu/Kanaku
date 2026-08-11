import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { prisma } from '../db/prisma';
import { logger } from '../config/logger';
import { getRequestActor } from './requestContext';
import { audit } from '../utils/auditLogger';

/** Emit a structured authz.denied audit event for an RBAC/feature rejection. */
const auditDenied = (req: AuthRequest, meta: Record<string, unknown>) => {
  audit({
    event: 'authz.denied',
    userId: req.userId,
    ip: req.ip || undefined,
    action: `${req.method} ${req.originalUrl || req.path}`,
    meta: { role: req.user?.role ?? null, ...meta },
  });
};

export type UserRole = 'admin' | 'manager' | 'advisor' | 'user';

/**
 * RBAC Middleware - Check if user has required role
 * Usage: router.get('/admin', requireRole('admin'), handler)
 */
export const requireRole = (allowedRoles: UserRole | UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

    if (!req.user?.role) {
      return res.status(401).json({ error: 'User role not found' });
    }

    if (!roles.includes(req.user.role as UserRole)) {
      auditDenied(req, { check: 'requireRole', requiredRoles: roles });
      return res.status(403).json({ error: 'Access denied' });
    }

    next();
  };
};

// NOTE: feature-based permission checking lives in ONE place —
// `middleware/featureGate.ts` → `requireFeature(module, childKey?)`, backed by
// the admin panel's live feature-flag matrix (with deny-by-default + audit).
// A second, hardcoded `requireFeature` used to live here; it was unused (the
// only importer never called it) and risked silently diverging from the real
// gate, so it was removed. Import `requireFeature` from `../middleware/featureGate`.

/**
 * Approve-only middleware - Check if advisor is approved
 */
export const requireApproved = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user?.role !== 'advisor') {
    return next(); // Not an advisor, continue
  }

  if (!req.user.isApproved) {
    return res.status(403).json({
      error: 'Access denied'
    });
  }

  next();
};

/**
 * Owner-only middleware - Check if user owns the resource
 * Usage: router.delete('/:id', ownerOnly('userId'), handler)
 */
export const ownerOnly = (userIdField: string) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const resourceUserId = req.params[userIdField] || req.query[userIdField];

    if (!req.userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    if (req.userId !== resourceUserId && req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied - resource does not belong to user' });
    }

    next();
  };
};

/**
 * Audit log helper - Log access attempts to database
 */
export const auditLog = async (
  userId: string | null | undefined,
  action: string,
  resource: string,
  status: 'success' | 'denied',
  details?: any
) => {
  try {
    const finalUserId = userId || 'unauthenticated';
    const ip = details?.ip || null;
    const userAgent = details?.userAgent || null;

    const detailsJson = details ? { ...details } : {};
    delete detailsJson.ip;
    delete detailsJson.userAgent;

    await prisma.auditLog.create({
      data: {
        userId: finalUserId,
        action,
        resource,
        status,
        ip,
        userAgent,
        requestId: details?.requestId ?? getRequestActor().requestId ?? null,
        details: detailsJson,
      },
    });
  } catch (error) {
    logger.error('Security Audit Logging Failed:', {
      error: error instanceof Error ? error.message : String(error),
      userId,
      action,
      resource,
      status,
    });
  }
};

/**
 * Wrapper to add audit logging to routes
 */
export const withAudit = (action: string, resource: string) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    // Capture original send to log after response
    const originalSend = res.send;

    res.send = function (data: any) {
      const statusCode = res.statusCode;
      const status = statusCode >= 400 ? 'denied' : 'success';

      const finalUserId = req.userId || 'unauthenticated';
      auditLog(
        finalUserId,
        action,
        resource,
        status,
        { statusCode, ip: req.ip, userAgent: req.get('user-agent') }
      ).catch(err => logger.error('Audit log failed:', err));

      return originalSend.call(this, data);
    };

    next();
  };
};
