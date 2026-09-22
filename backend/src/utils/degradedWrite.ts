import { logger } from '../config/logger';
import { ErrorTracker } from './errorTracker';
import { isStructuralDatabaseError, isDatabaseConnectivityError } from './AppError';

export type DegradedWriteKind = 'structural' | 'transient';

/**
 * Report a write that failed without failing the operation around it.
 *
 * There is a pattern throughout this codebase of wrapping secondary persistence
 * in `catch { logger.warn(...) }` so that, say, a storage hiccup cannot throw
 * away a 30-second OCR job the user already waited for. That intent is correct.
 * What it also did, until now, was give a schema mismatch the same treatment as
 * a network blip — and a schema mismatch is not a blip. It fails every time, for
 * every user, and the only evidence is a warn line.
 *
 * So classify before reporting:
 *
 *   transient  — storage unreachable, connection refused, timeout. Warn and
 *                carry on, exactly as before. This is the common case and it is
 *                genuinely non-critical.
 *   structural — the database does not match the schema this build expects.
 *                Log at ERROR and push it to the error tracker so it reaches
 *                whatever is watching, because nothing else will surface it.
 *
 * Returns the classification so a caller can additionally tell the user that
 * part of their action did not stick — silence is the failure mode being fixed,
 * and a log line the user cannot see is still silence to them.
 */
export function reportDegradedWrite(args: {
  /** Stable identifier for this write, e.g. 'receipt.persist_bill'. */
  operation: string;
  error: unknown;
  context?: Record<string, unknown>;
}): DegradedWriteKind {
  const { operation, error, context = {} } = args;
  const message = error instanceof Error ? error.message : String(error);

  if (isStructuralDatabaseError(error)) {
    // Not recoverable by retrying and not visible anywhere else. ErrorTracker
    // always logs at error level too, so this is loud with or without Sentry.
    ErrorTracker.captureException(error, {
      operation,
      ...context,
    });
    logger.error('DEGRADED_WRITE_STRUCTURAL', {
      operation,
      // Spelled out because whoever reads this line is unlikely to know the
      // codes, and the action is the same every time.
      diagnosis: 'Database schema does not match this build — a migration is almost certainly unapplied.',
      error: message,
      ...context,
    });
    return 'structural';
  }

  logger.warn('DEGRADED_WRITE', {
    operation,
    transient: isDatabaseConnectivityError(error) ? 'connectivity' : 'unclassified',
    error: message,
    ...context,
  });
  return 'transient';
}
