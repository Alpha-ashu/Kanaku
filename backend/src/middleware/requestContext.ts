/**
 * Per-request context via AsyncLocalStorage.
 *
 * Mounted early (before routes). It stashes the live `req` object so that
 * deep layers — notably the Prisma audit interceptor in db/prisma.ts — can
 * attribute a mutation to the acting user/IP/User-Agent WITHOUT every
 * controller having to thread the request down manually.
 *
 * We store `req` (not a snapshot) so `userId` is read lazily at audit time,
 * by which point the per-router auth middleware has populated it.
 */
import type { Request, Response, NextFunction } from 'express';
import { AsyncLocalStorage } from 'async_hooks';

interface Ctx { req: Request }
const storage = new AsyncLocalStorage<Ctx>();

export function requestContext(req: Request, _res: Response, next: NextFunction): void {
  storage.run({ req }, () => next());
}

/** Actor for audit rows — resolved at call time from the active request. */
export function getRequestActor(): { userId?: string; ip?: string; userAgent?: string; requestId?: string } {
  const req = storage.getStore()?.req as any;
  if (!req) return {};
  const fwd = req.headers?.['x-forwarded-for'];
  return {
    userId: req.userId,
    ip: req.ip || (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim(),
    userAgent: req.headers?.['user-agent'],
    requestId: req.id,
  };
}
