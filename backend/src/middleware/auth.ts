import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logger } from '../config/logger';
import { createClient } from '@supabase/supabase-js';
import { audit } from '../utils/auditLogger';
import { prisma } from '../db/prisma';

// ─── Typed JWT payload interfaces ─────────────────────────────────────────────

/** Claims present in a custom backend-issued JWT */
interface CustomJwtPayload extends jwt.JwtPayload {
  userId?: string;
  email?: string;
  role?: string;
  isApproved?: boolean;
  name?: string;
}

/** Claims present in a Supabase-issued JWT */
interface SupabaseJwtPayload extends jwt.JwtPayload {
  email?: string;
  user_metadata?: {
    role?: string;
    full_name?: string;
  };
  app_metadata?: {
    role?: string;
  };
}

/** Shape of user claims passed to ensureUserInDb */
interface UserClaims {
  email?: string;
  name?: string;
  role?: string;
  isApproved?: boolean;
}

const ensureUserInDb = async (userId: string, userClaims: UserClaims) => {
  try {
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: {
        id: userId,
        email: userClaims.email || `user-${userId.substring(0, 8)}@noemail.invalid`,
        name: userClaims.name || userClaims.email?.split('@')[0] || 'User',
        password: 'supabase-managed-account',
        role: userClaims.role || 'user',
        isApproved: userClaims.isApproved ?? false,
      }
    });
    logger.info(`[Auth] Ensured user ${userId} exists in database`);
  } catch (err) {
    logger.error(`[Auth] Failed to ensure user ${userId} exists in database:`, err);
  }
};

export interface AuthRequest extends Request {
  userId?: string;
  user?: {
    id: string;
    email: string;
    role: string;
    isApproved: boolean;
    name?: string;
  };
  file?: Express.Multer.File;
}

let _supabase: any = null;
const getSupabase = () => {
  if (_supabase) return _supabase;

  const url = process.env.SUPABASE_URL?.trim() || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';

  if (!url || !serviceKey) {
    return null;
  }

  try {
    _supabase = createClient(url, serviceKey);
    return _supabase;
  } catch (err) {
    logger.error('Failed to init Supabase in auth middleware:', err);
    return null;
  }
};

// Supabase JWT Secret found in Supabase Dashboard Project Settings API JWT Settings
const supabaseJwtSecret = process.env.SUPABASE_JWT_SECRET || '';
const AUTH_STATUS_LOOKUP_TIMEOUT_MS = Number(process.env.AUTH_STATUS_LOOKUP_TIMEOUT_MS || 5000);
const STATUS_LOOKUP_TIMEOUT = Symbol('auth-status-timeout');
const ALLOW_TEST_ROLE_FALLBACK = process.env.NODE_ENV === 'test';
const ALLOW_UNVERIFIED_DEV_JWT = process.env.NODE_ENV === 'development' && process.env.ALLOW_UNVERIFIED_JWT === 'true';


interface UserAuthSnapshot {
  email: string;
  role: string;
  isApproved: boolean;
  name: string;
  status: string;
}

const normalizeAppRole = (value: unknown): string => {
  if (typeof value !== 'string') return 'user';
  const role = value.trim().toLowerCase();
  if (role === 'admin' || role === 'manager' || role === 'advisor' || role === 'user' || role === 'customer') {
    return role === 'customer' ? 'user' : role;
  }
  return 'user';
};

// In-memory cache for auth snapshots: avoids a DB query on every single API request.
// 60s TTL is short enough to pick up role changes without hammering the DB.
// Invalidated on profile/role updates via invalidateUserSnapshotCache().
const userSnapshotCache = new Map<string, { snapshot: UserAuthSnapshot | null; expiresAt: number }>();
const SNAPSHOT_CACHE_TTL_MS = 60_000;

export const invalidateUserSnapshotCache = (userId: string) => {
  userSnapshotCache.delete(userId);
};

const getUserAuthSnapshot = async (userId: string): Promise<UserAuthSnapshot | null> => {
  if (process.env.NODE_ENV === 'test' || AUTH_STATUS_LOOKUP_TIMEOUT_MS <= 0) {
    return null;
  }

  // Fast path: return cached snapshot if still fresh
  const cached = userSnapshotCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.snapshot;
  }

  try {
    const result = await Promise.race([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          email: true,
          role: true,
          isApproved: true,
          name: true,
          status: true,
        },
      }),
      new Promise<typeof STATUS_LOOKUP_TIMEOUT>((resolve) => {
        setTimeout(() => resolve(STATUS_LOOKUP_TIMEOUT), AUTH_STATUS_LOOKUP_TIMEOUT_MS);
      }),
    ]);

    if (result === STATUS_LOOKUP_TIMEOUT) {
      logger.warn('Auth status lookup timed out after JWT verification, continuing with token claims.', {
        userId,
        timeoutMs: AUTH_STATUS_LOOKUP_TIMEOUT_MS,
      });
      // Cache null so the next request within TTL doesn't retry the timed-out DB call
      userSnapshotCache.set(userId, { snapshot: null, expiresAt: Date.now() + SNAPSHOT_CACHE_TTL_MS });
      return null;
    }

    const snapshot = result ?? null;
    userSnapshotCache.set(userId, { snapshot, expiresAt: Date.now() + SNAPSHOT_CACHE_TTL_MS });
    return snapshot;
  } catch (error) {
    logger.warn('Auth user lookup failed after JWT verification, continuing with token claims.', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};

export const authMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    if (!token || token === authHeader) {
      logger.warn('Auth check failed: No token provided in headers.');
      return res.status(401).json({ error: 'No token provided' });
    }

    const customSecret = process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET || '';

    // 1. Try Custom JWT first (fast, local)
    if (customSecret) {
      try {
        const decoded = jwt.verify(token, customSecret) as CustomJwtPayload;

        const userId = typeof decoded === 'object'
          ? (typeof decoded.userId === 'string' ? decoded.userId : decoded.sub)
          : null;

        if (typeof userId !== 'string' || userId.length === 0) {
          throw new Error('Invalid JWT subject');
        }

        const authSnapshot = await getUserAuthSnapshot(userId);
        if (authSnapshot?.status === 'suspended') {
          return res.status(403).json({ error: 'Account suspended. Contact support.', code: 'ACCOUNT_SUSPENDED' });
        }

        req.userId = userId;
        req.user = {
          id: userId,
          email: authSnapshot?.email || (typeof decoded.email === 'string' ? decoded.email : ''),
          role: authSnapshot?.role || (ALLOW_TEST_ROLE_FALLBACK ? normalizeAppRole(decoded.role) : 'user'),
          isApproved: authSnapshot?.isApproved ?? (ALLOW_TEST_ROLE_FALLBACK
            ? (typeof decoded.isApproved === 'boolean' ? decoded.isApproved : true)
            : false),
          name: authSnapshot?.name || (typeof decoded.name === 'string' ? decoded.name : undefined),
        };

        if (!authSnapshot) {
          await ensureUserInDb(userId, req.user);
        }

        return next();
      } catch (err) {
        // Fall back to Supabase
      }
    }

    // 2. Try Supabase JWT Secret verification (fast, no network call needed)
    if (supabaseJwtSecret) {
      try {
        const supabaseDecoded = jwt.verify(token, supabaseJwtSecret) as SupabaseJwtPayload;
        const userId = supabaseDecoded?.sub;

        if (typeof userId === 'string' && userId.length > 0) {
          const authSnapshot = await getUserAuthSnapshot(userId);
          if (authSnapshot?.status === 'suspended') {
            return res.status(403).json({ error: 'Account suspended. Contact support.', code: 'ACCOUNT_SUSPENDED' });
          }

          req.userId = userId;
          req.user = {
            id: userId,
            email: authSnapshot?.email || supabaseDecoded.email || '',
            role: authSnapshot?.role || normalizeAppRole(supabaseDecoded.user_metadata?.role || supabaseDecoded.app_metadata?.role),
            isApproved: authSnapshot?.isApproved ?? false,
            name: authSnapshot?.name || supabaseDecoded.user_metadata?.full_name,
          };
          if (!authSnapshot) {
            await ensureUserInDb(userId, req.user);
          }
          return next();
        }
      } catch (err) {
        // Fall through to Supabase API check
      }
    }

    const sb = getSupabase();
    if (sb && process.env.NODE_ENV !== 'test') {
      try {
        const { data: { user }, error } = await sb.auth.getUser(token);

        if (user && !error) {
          const authSnapshot = await getUserAuthSnapshot(user.id);
          if (authSnapshot?.status === 'suspended') {
            return res.status(403).json({ error: 'Account suspended. Contact support.', code: 'ACCOUNT_SUSPENDED' });
          }

          req.userId = user.id;
          req.user = {
            id: user.id,
            email: authSnapshot?.email || user.email || '',
            role: authSnapshot?.role || normalizeAppRole(user.user_metadata?.role || user.app_metadata?.role),
            isApproved: authSnapshot?.isApproved ?? false,
            name: authSnapshot?.name || user.user_metadata?.full_name,
          };
          if (!authSnapshot) {
            await ensureUserInDb(user.id, req.user);
          }
          return next();
        } else if (error) {
          logger.warn(`Supabase Auth rejection: ${error.message}`);
        }
      } catch (supabaseError) {
        logger.warn('Supabase auth lookup failed, continuing to final auth rejection.', {
          error: supabaseError instanceof Error ? supabaseError.message : String(supabaseError),
        });
      }
    }

    if (ALLOW_UNVERIFIED_DEV_JWT) {
      try {
        const unverified = jwt.decode(token) as SupabaseJwtPayload | null;
        const userId = unverified?.sub;
        if (typeof userId === 'string' && userId.length > 0) {
          logger.warn('Auth: Using UNVERIFIED token in development mode because ALLOW_UNVERIFIED_JWT=true. Configure SUPABASE_JWT_SECRET or JWT_SECRET for proper verification.');
          req.userId = userId;
          req.user = {
            id: userId,
            email: unverified?.email || '',
            role: normalizeAppRole(unverified?.user_metadata?.role || unverified?.app_metadata?.role),
            isApproved: false,
            name: unverified?.user_metadata?.full_name,
          };
          await ensureUserInDb(userId, req.user);
          return next();
        }
      } catch {
        // fall through to 401
      }
    }

    if (!customSecret && !supabaseJwtSecret && !sb) {
      logger.error('Authentication is disabled: no JWT_SECRET, SUPABASE_JWT_SECRET, or SUPABASE_SERVICE_ROLE_KEY is configured.');
    }

    audit({
      event: 'auth.login_failed',
      ip: req.ip || undefined,
      action: `${req.method} ${req.path}`,
      meta: { reason: 'invalid_token' },
    });
    logger.info(`Final Auth result: 401 Unauthorized for token starting ${token.substring(0, 10)}...`);
    return res.status(401).json({ error: 'Invalid or expired session' });
  } catch (error) {
    audit({
      event: 'auth.login_failed',
      ip: req.ip || undefined,
      action: `${req.method} ${req.path}`,
      meta: { reason: 'auth_error' },
    });
    logger.error('Critical Auth middleware error:', error);
    return res.status(401).json({ error: 'Authentication failed' });
  }
};

export const getUserId = (req: AuthRequest): string => {
  if (!req.userId) {
    throw new Error('User ID not found in request');
  }
  return req.userId;
};
