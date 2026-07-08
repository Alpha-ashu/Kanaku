import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';

/**
 * Admin-platform origin gate — physical separation of the Admin/Manager
 * surface from the User/Advisor surface at the routing layer.
 *
 * The RBAC middleware (requireRole) remains the authorization boundary; this
 * gate adds the *platform* boundary the product requires: admin/manager route
 * groups are only reachable when the request arrives via the dedicated admin
 * origin, so the user-facing origin cannot even route to them (404), and a
 * deploy/config change on one surface cannot expose the other.
 *
 * Configuration (env):
 *   ADMIN_UI_HOSTS — comma-separated hostnames of the admin web origin(s),
 *                    e.g. "admin.kanaku.app". Hostname only (no scheme/port).
 *
 * Behaviour:
 *   - Unset/empty (the default): NO-OP — unified platform, current behaviour.
 *     This keeps the change inert until the admin origin is provisioned
 *     (second Vercel project pointing at the same repo with
 *     VITE_APP_SURFACE=admin, plus this env on Fly).
 *   - Set: the request must present one of the allowed hostnames in its
 *     browser `Origin` header, or (for the Vercel edge proxy path, which
 *     rewrites Host) in `X-Forwarded-Host` / `Host`. Non-matching requests
 *     get the same 404 body as an unmounted route — the admin surface is
 *     not advertised to the user platform.
 *
 * Note: a caller hitting the Fly host directly can forge X-Forwarded-Host;
 * that only returns them to the RBAC boundary (admin JWT still required).
 * The gate is platform isolation + defence-in-depth, not a JWT substitute.
 */
const parseHosts = (raw: string | undefined): Set<string> =>
  new Set(
    (raw ?? '')
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  );

const ADMIN_UI_HOSTS = parseHosts(process.env.ADMIN_UI_HOSTS);

const hostOf = (value: string | undefined): string | null => {
  if (!value) return null;
  const first = value.split(',')[0].trim(); // X-Forwarded-Host may be a list
  try {
    // Origin values carry a scheme; Host/X-Forwarded-Host don't.
    const url = first.includes('://') ? new URL(first) : new URL(`http://${first}`);
    return url.hostname.toLowerCase();
  } catch {
    return null;
  }
};

export const adminPlatformGate = (req: Request, res: Response, next: NextFunction) => {
  if (ADMIN_UI_HOSTS.size === 0) return next(); // separation not configured — unified platform

  const candidates = [
    hostOf(req.headers.origin as string | undefined),
    hostOf(req.headers['x-forwarded-host'] as string | undefined),
    hostOf(req.headers.host),
  ];

  if (candidates.some((h) => h !== null && ADMIN_UI_HOSTS.has(h))) {
    return next();
  }

  logger.warn('[AdminPlatformGate] Blocked admin-surface request from non-admin origin', {
    requestId: (req as any).id,
    path: req.originalUrl,
    origin: req.headers.origin ?? null,
    forwardedHost: req.headers['x-forwarded-host'] ?? null,
  });

  // Mirror the app-level unknown-route response: the admin platform does not
  // exist as far as the user origin is concerned.
  return res.status(404).json({
    success: false,
    error: 'The page or resource you are looking for does not exist.',
    code: 'NOT_FOUND',
  });
};
