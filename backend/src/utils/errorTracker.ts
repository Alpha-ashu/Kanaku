/**
 * Centralized Error Tracking — Phase 9.5 Observability.
 *
 * Wraps Sentry SDK when `SENTRY_DSN` is configured; falls back to a structured
 * `logger.error()` call that preserves the full context in the application log.
 * This means:
 *   - Production (SENTRY_DSN set, @sentry/node installed): every uncaught
 *     exception is sent to Sentry with full context (correlationId, userId,
 *     route, journalId, etc.)
 *   - Development / test (no DSN or SDK absent): the same context is logged at
 *     error level so local debugging is equally rich with zero dependencies.
 *
 * Sentry is lazily required at first `captureException` call so it never blocks
 * process startup if `SENTRY_DSN` is absent or the SDK is not installed.
 * TypeScript never statically imports from @sentry/node so the module compiles
 * cleanly regardless of whether the package is present.
 *
 * Usage:
 *   import { ErrorTracker } from '../../utils/errorTracker';
 *   ErrorTracker.captureException(err);
 *   ErrorTracker.captureException(err, { journalId, operation: 'PostJournalEntry' });
 *   ErrorTracker.captureMessage('Settlement retry limit reached', 'warning', { userId });
 */
import { logger } from '../config/logger';
import { getRequestActor } from '../middleware/requestContext';

export type ErrorTrackerLevel = 'fatal' | 'error' | 'warning' | 'info' | 'debug';

export interface ErrorContext {
  /** Domain entity that was being processed (e.g. journalId, transactionId). */
  journalId?: string;
  transactionId?: string;
  userId?: string;
  operation?: string;
  [key: string]: unknown;
}

// Runtime-only Sentry reference — no static type import so tsc is happy even
// when @sentry/node is not installed.
let _sentryMod: any | null = null;
let _sentryInitialized = false;

function getSentry(): any | null {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return null;

  if (_sentryInitialized) return _sentryMod;
  _sentryInitialized = true;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require('@sentry/node');
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || 'development',
      release: process.env.APP_VERSION || process.env.npm_package_version || 'unknown',
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.1),
      beforeSend(event: any) {
        if (event.request?.cookies) event.request.cookies = '[Filtered]';
        if (event.request?.headers?.authorization) {
          event.request.headers.authorization = '[Filtered]';
        }
        return event;
      },
    });
    _sentryMod = Sentry;
    logger.info('[ErrorTracker] Sentry initialized', {
      environment: process.env.NODE_ENV,
      release: process.env.APP_VERSION,
    });
  } catch {
    logger.warn('[ErrorTracker] @sentry/node not installed — logger-only error capture active');
    _sentryMod = null;
  }

  return _sentryMod;
}

function buildContext(extra: ErrorContext = {}): Record<string, unknown> {
  const actor = getRequestActor();
  return {
    correlationId: actor.correlationId,
    requestId: actor.requestId,
    sessionId: actor.sessionId,
    userId: extra.userId ?? actor.userId,
    route: actor.route,
    method: actor.method,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.APP_VERSION || 'unknown',
    ...extra,
  };
}

export const ErrorTracker = {
  /**
   * Capture an exception and send it to Sentry (if configured) with structured context.
   * Always logs at `error` level so local environments have the same visibility.
   */
  captureException(err: unknown, extra: ErrorContext = {}): void {
    const ctx = buildContext(extra);
    const message = err instanceof Error ? err.message : String(err);

    // Always log locally — Sentry is additive
    logger.error('[ErrorTracker] Captured exception', {
      ...ctx,
      errorMessage: message,
      stack: err instanceof Error ? err.stack : undefined,
    });

    try {
      const Sentry = getSentry();
      if (Sentry) {
        Sentry.withScope((scope: any) => {
          if (ctx.userId) scope.setUser({ id: String(ctx.userId) });
          scope.setTag('correlationId', String(ctx.correlationId ?? ''));
          scope.setTag('requestId', String(ctx.requestId ?? ''));
          scope.setTag('route', String(ctx.route ?? ''));
          scope.setTag('environment', String(ctx.environment));
          scope.setTag('release', String(ctx.release));
          if (ctx.journalId) scope.setTag('journalId', String(ctx.journalId));
          if (ctx.operation) scope.setTag('operation', String(ctx.operation));
          scope.setExtras(ctx);
          Sentry.captureException(err);
        });
      }
    } catch {
      // Sentry must never cause additional failures
    }
  },

  /**
   * Capture an informational or warning message (not an exception).
   */
  captureMessage(
    message: string,
    level: ErrorTrackerLevel = 'info',
    extra: ErrorContext = {}
  ): void {
    const ctx = buildContext(extra);
    logger.info('[ErrorTracker] Captured message', { level, message, ...ctx });

    try {
      const Sentry = getSentry();
      if (Sentry) {
        Sentry.withScope((scope: any) => {
          if (ctx.userId) scope.setUser({ id: String(ctx.userId) });
          scope.setTag('correlationId', String(ctx.correlationId ?? ''));
          scope.setExtras(ctx);
          Sentry.captureMessage(message, level);
        });
      }
    } catch {
      // Sentry must never cause additional failures
    }
  },
};
