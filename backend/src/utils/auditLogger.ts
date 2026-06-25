/**
 * Structured audit logging for fintech-grade observability.
 *
 * Two tiers:
 *   1. **Winston log line** (`[AUDIT] ...`) — instant tail in any log
 *      aggregator. Already redacted via `config/logger.ts`.
 *   2. **Durable row in `AuditLog`** (Prisma) — required for SOC-2 /
 *      RBI-style retention and for the admin audit-trail UI.
 *      Best-effort, fire-and-forget — never blocks the request.
 *
 * Schema (existing in prisma/schema.prisma):
 *
 *   model AuditLog {
 *     id        String   @id @default(uuid())
 *     userId    String
 *     action    String   -- e.g. "auth.login", "transactions.create"
 *     resource  String   -- e.g. "transaction:tx_abc"
 *     status    String   -- "success" | "failure"
 *     ip        String?
 *     userAgent String?
 *     details   Json?
 *     createdAt DateTime @default(now())
 *   }
 *
 * If the DB write fails (network blip, table missing in a stale env),
 * we degrade silently and rely on the log line — losing an audit row is
 * not worth crashing the user request.
 */

import type { Request } from 'express';
import { logger } from '../config/logger';
import { prisma } from '../db/prisma';
import { getRequestActor } from '../middleware/requestContext';
import { redact } from './redact';

export type AuditEventType =
  | 'auth.login'
  | 'auth.login_failed'
  | 'auth.register'
  | 'auth.token_refresh'
  | 'auth.logout'
  | 'auth.password_change'
  | 'auth.role_change'
  | 'data.create'
  | 'data.update'
  | 'data.delete'
  | 'sync.push'
  | 'sync.pull'
  | 'sync.conflict'
  | 'sync.device_register'
  | 'ai.ocr_request'
  | 'ai.ocr_success'
  | 'ai.ocr_failure'
  | 'ai.prompt_injection'
  | 'ai.quota_exceeded'
  | 'ai.voice_request'
  | 'otp.generated'
  | 'otp.verified'
  | 'otp.invalid'
  | 'otp.expired'
  | 'otp.max_attempts'
  | 'otp.rate_limited'
  | 'device.trusted'
  | 'device.revoked'
  | 'security.rate_limit_hit'
  | 'security.idor_attempt'
  | 'security.invalid_file'
  | 'security.circuit_open'
  | 'security.webhook_invalid_signature'
  | 'security.pin_change'
  | 'admin.feature_toggle'
  | 'admin.user_role_update'
  | 'admin.advisor_approve'
  | 'admin.advisor_reject'
  | 'aa.consent_created'
  | 'aa.consent_revoked'
  | 'aa.data_fetched'
  | 'gdpr.data_export'
  | 'gdpr.account_delete_requested'
  | 'gdpr.account_delete_executed'
  | 'file.upload'
  | 'file.delete';

interface AuditPayload {
  event: AuditEventType;
  userId?: string;
  ip?: string;
  userAgent?: string;
  /** Correlation ID — defaults to the active request's X-Request-Id when omitted. */
  requestId?: string;
  /** Entity being acted on (e.g. "transaction", "account") */
  resource?: string;
  /** The specific resource ID */
  resourceId?: string;
  /** HTTP method + path (e.g. "POST /api/v1/receipts/scan") */
  action?: string;
  /** Freeform metadata (kept small — redacted before persistence). */
  meta?: Record<string, unknown>;
}

const SYSTEM_USER_ID = 'system';

const isFailureEvent = (event: AuditEventType): boolean =>
  event.includes('failed') ||
  event.includes('injection') ||
  event.includes('exceeded') ||
  event.includes('idor') ||
  event.includes('rate_limit') ||
  event.includes('invalid') ||
  event.includes('expired') ||
  event.includes('circuit_open');

/**
 * Persist the audit row asynchronously. We deliberately do NOT `await`
 * this from `audit()` — the caller has already responded to the user.
 */
const persistAuditRow = async (payload: AuditPayload): Promise<void> => {
  try {
    const safeDetails = payload.meta
      ? (redact(payload.meta) as Record<string, unknown>)
      : null;

    await prisma.auditLog.create({
      data: {
        userId: payload.userId ?? SYSTEM_USER_ID,
        action: payload.event,
        resource: payload.resource
          ? (payload.resourceId ? `${payload.resource}:${payload.resourceId}` : payload.resource)
          : (payload.action ?? 'unknown'),
        status: isFailureEvent(payload.event) ? 'failure' : 'success',
        ip: payload.ip ?? null,
        userAgent: payload.userAgent ?? null,
        // Auto-correlate to the active request when the caller didn't pass one,
        // so every audit() emitted inside a request shares the chain's ID.
        requestId: payload.requestId ?? getRequestActor().requestId ?? null,
        details: safeDetails as any,
      },
    });
  } catch (err) {
    // Never throw from audit — degrade silently.
    logger.warn('[audit] failed to persist audit row', {
      event: payload.event,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};

/**
 * Emit an audit entry. Writes a Winston log line synchronously and
 * schedules a durable DB row asynchronously (fire-and-forget).
 */
export function audit(payload: AuditPayload): void {
  const entry = {
    audit: true,
    ...payload,
    timestamp: new Date().toISOString(),
  };

  if (isFailureEvent(payload.event)) {
    logger.warn('[AUDIT]', entry);
  } else {
    logger.info('[AUDIT]', entry);
  }

  // Fire-and-forget — do not block the caller.
  void persistAuditRow(payload);
}

/**
 * Convenience helper for Express handlers — auto-extracts userId, IP,
 * and User-Agent from the request so individual callers do not have to
 * remember to populate them.
 */
export function auditFromRequest(
  req: Request,
  event: AuditEventType,
  extras: Omit<AuditPayload, 'event' | 'ip' | 'userAgent' | 'userId'> & { userId?: string } = {},
): void {
  audit({
    event,
    userId: extras.userId ?? (req as any).userId,
    ip: req.ip || (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim(),
    userAgent: req.headers['user-agent'] as string | undefined,
    requestId: (req as any).id,
    action: `${req.method} ${req.path}`,
    ...extras,
  });
}
