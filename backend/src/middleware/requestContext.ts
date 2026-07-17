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
 *
 * Phase 9.5 – Observability:
 * `correlationId` is a durable end-to-end trace ID for the full user action.
 *   - Honored from the caller's `X-Correlation-Id` header (so a frontend-minted
 *     ID survives the entire HTTP → API → Ledger → Worker → Notification chain).
 *   - Falls back to `req.id` (the per-request UUID minted in app.ts) so every
 *     request always has a correlationId without any extra work by callers.
 * `sessionId` is read from the `X-Session-Id` header when present, giving us a
 *   stable per-browser-session identifier for grouping related requests.
 */
import type { Request, Response, NextFunction } from 'express';
import { AsyncLocalStorage } from 'async_hooks';

interface Ctx { req: Request }
const storage = new AsyncLocalStorage<Ctx>();

export function requestContext(req: Request, _res: Response, next: NextFunction): void {
  storage.run({ req }, () => next());
}

export function getRequestObject(): any {
  return storage.getStore()?.req;
}

export function getRequestActor(): {
  userId?: string;
  ip?: string;
  userAgent?: string;
  requestId?: string;
  correlationId?: string;
  sessionId?: string;
  route?: string;
  method?: string;
} {
  const req = storage.getStore()?.req as any;
  if (!req) return {};
  const fwd = req.headers?.['x-forwarded-for'];
  return {
    userId: req.userId,
    ip: req.ip || (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim(),
    userAgent: req.headers?.['user-agent'],
    requestId: req.id,
    correlationId: req.correlationId ?? req.id,
    sessionId: req.sessionId,
    route: req.route?.path ?? req.path,
    method: req.method,
  };
}
