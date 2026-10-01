import type { NextFunction, Response } from 'express';
import type { AuthRequest } from '../middleware/auth';
import { prisma } from '../db/prisma';
import { logger } from '../config/logger';
import { audit } from '../utils/auditLogger';

/**
 * Granular staff permissions.
 *
 * Roles answer "what kind of account is this"; permissions answer "what may this
 * account do". Checking `role === 'manager'` handed every manager the same
 * powers, and there was no way to give one manager read access to payments
 * without giving it to all of them — or to withhold the user directory from a
 * manager who only supervises three advisors.
 *
 *   admin    — every permission, always.
 *   manager  — MANAGER_DEFAULTS (team-scoped reads) plus whatever an admin has
 *              granted in staff_permission_grants, limited to GRANTABLE.
 *   advisor / user — none. Their access is ownership, checked in each handler.
 *
 * `team.*` permissions are scoped: handlers restrict the rows to the manager's
 * manager_assignments (see getManagedUserIds). Nothing here is ever derived from
 * the request body or the token's claims — the role comes from the auth
 * snapshot (database) and grants from the table.
 */

export const PERMISSIONS = [
  // Team (manager scope — restricted to assigned users/advisors)
  'team.read',
  'team.bookings.read',
  'team.wallets.read',
  'team.payments.read',
  // Platform-wide
  'users.directory.read',
  'finance.read',
  'finance.refund',
  'finance.reconcile',
  'finance.adjust',
  'finance.packages.manage',
  'finance.providers.read',
  'finance.payouts',
  'security.read',
  'staff.manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const MANAGER_DEFAULTS: readonly Permission[] = ['team.read', 'team.bookings.read'];

/**
 * What an admin may grant to a manager. Anything that moves money by fiat
 * (`finance.adjust`), pays money out (`finance.payouts`), changes prices, or
 * changes who holds authority (`staff.manage`) stays admin-only and cannot be
 * granted.
 */
export const GRANTABLE_TO_MANAGER: readonly Permission[] = [
  'team.wallets.read',
  'team.payments.read',
  'users.directory.read',
  'finance.read',
  'finance.refund',
  'finance.reconcile',
  'security.read',
];

export const isPermission = (value: unknown): value is Permission =>
  typeof value === 'string' && (PERMISSIONS as readonly string[]).includes(value);

const GRANT_CACHE_TTL_MS = 30_000;
const grantCache = new Map<string, { grants: Permission[]; expiresAt: number }>();

export const invalidatePermissionCache = (userId: string) => {
  grantCache.delete(userId);
};

const loadGrants = async (userId: string): Promise<Permission[]> => {
  const cached = grantCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.grants;
  const rows = await prisma.staffPermissionGrant.findMany({ where: { userId }, select: { permission: true } });
  const grants = rows.map((r) => r.permission).filter(isPermission).filter((p) => GRANTABLE_TO_MANAGER.includes(p));
  grantCache.set(userId, { grants, expiresAt: Date.now() + GRANT_CACHE_TTL_MS });
  return grants;
};

/** Effective permissions for an account. The role must come from the database snapshot. */
export const getEffectivePermissions = async (userId: string, role: string | undefined): Promise<Set<Permission>> => {
  if (role === 'admin') return new Set(PERMISSIONS);
  if (role === 'manager') return new Set([...MANAGER_DEFAULTS, ...(await loadGrants(userId))]);
  return new Set();
};

export const hasPermission = async (userId: string, role: string | undefined, permission: Permission) =>
  (await getEffectivePermissions(userId, role)).has(permission);

/**
 * Route guard. `anyOf` passes when the caller holds at least one of them —
 * e.g. a team-scoped OR platform-wide read — and the handler narrows by which.
 * The granted set is exposed on `req.permissions` for that narrowing.
 */
export const requirePermission = (...anyOf: Permission[]) =>
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    const userId = req.user?.id ?? req.userId;
    if (!userId) return res.status(401).json({ error: 'Authentication required', code: 'UNAUTHORIZED' });
    try {
      const granted = await getEffectivePermissions(userId, req.user?.role);
      if (!anyOf.some((p) => granted.has(p))) {
        audit({
          event: 'authz.denied',
          userId,
          ip: req.ip || undefined,
          action: `${req.method} ${req.originalUrl || req.path}`,
          meta: { role: req.user?.role ?? null, check: 'requirePermission', required: anyOf },
        });
        return res.status(403).json({ error: 'You do not have permission to do this.', code: 'FORBIDDEN' });
      }
      (req as AuthRequest & { permissions?: Set<Permission> }).permissions = granted;
      return next();
    } catch (error) {
      logger.error('[permissions] lookup failed', { userId, error });
      return res.status(503).json({ error: 'Permission check unavailable. Please try again.', code: 'PERMISSION_CHECK_FAILED' });
    }
  };

export const permissionsOf = (req: AuthRequest): Set<Permission> =>
  (req as AuthRequest & { permissions?: Set<Permission> }).permissions ?? new Set();

/** Users a manager is responsible for. */
export const getManagedUserIds = async (managerId: string): Promise<string[]> => {
  const rows = await prisma.managerAssignment.findMany({ where: { managerId }, select: { subjectUserId: true } });
  return rows.map((r) => r.subjectUserId);
};
