import { createHash } from 'crypto';
import type { NextFunction, Response } from 'express';
import type { AuthRequest } from './auth';
import { logger } from '../config/logger';

/**
 * Collapses a create that is submitted twice into one record.
 *
 * `idempotency()` already sits on every create route, but it is keyed on the
 * client's Idempotency-Key — and a double tap, an Enter key that fires twice, a
 * form with both an Enter handler and a button, or the same record published by
 * two client code paths are separate calls with separate keys. The middleware
 * sees two unrelated requests and dutifully creates two rows. This guard keys on
 * WHAT is being created instead: the authenticated user, the route, and the
 * validated body with its per-attempt noise stripped out.
 *
 *   - While the first request is still running, an identical one waits for it
 *     and receives the same response, so the two can never race each other into
 *     the database.
 *   - For a short window afterwards, an identical one is answered with the
 *     first response, carrying the first record's id, so the client links to
 *     the existing row instead of reporting an error.
 *
 * The window is deliberately short. It exists to catch one action delivered
 * twice, not to forbid a user from recording the same thing again later —
 * transactions keep their own day-level content hash and an explicit
 * `intentionalDuplicate` override for that.
 *
 * Mount it AFTER `validateBody` where the route has one, so the fingerprint is
 * taken over the coerced, schema-shaped body (`"250"` and `250` agree, unknown
 * client-side bookkeeping fields are already gone).
 *
 * In-process only: the API runs as a single web instance and Redis is disabled
 * (cache/redis.ts), so there is no shared store to coordinate across. The window
 * is seconds long, so losing it on a restart costs nothing.
 */

interface GuardOptions {
  /** Logical route identifier, so identical bodies on different routes never collide. */
  scope: string;
  /** How long a completed create keeps absorbing identical repeats. Default 10s. */
  windowSeconds?: number;
}

interface RecordedResponse {
  status: number;
  body: unknown;
  expiresAt: number;
}

const DEFAULT_WINDOW_SECONDS = 10;
const MAX_RECENT_ENTRIES = 10_000;

/**
 * Fields that differ between two submissions of the same thing and must not make
 * them look different: per-attempt keys, client clocks, local bookkeeping.
 */
const VOLATILE_KEYS = new Set([
  'clientRequestId',
  'idempotencyKey',
  'dedupHash',
  'createdAt',
  'updatedAt',
  'lastUpdated',
  'lastSyncedAt',
  'syncedAt',
  'syncStatus',
  'synced',
  'pendingSync',
  'version',
  'deviceId',
  'id',
  'localId',
  'cloudId',
  'remoteId',
]);

const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

const recent = new Map<string, RecordedResponse>();
const inFlight = new Map<string, Promise<RecordedResponse>>();

/**
 * Reduce a body to what identifies the record being created.
 *
 * Timestamps collapse to their calendar day: forms stamp the current clock onto
 * a picked date (AddTransaction's `withEntryTime`, group expense dates), so two
 * taps a few hundred milliseconds apart carry different instants for the same
 * entry. Within a ten-second window, the day is the meaningful part.
 */
export function canonicalizeForDuplicateCheck(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString().slice(0, 10);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    if (ISO_DATETIME.test(trimmed)) return trimmed.slice(0, 10);
    return trimmed.replace(/\s+/g, ' ').toLowerCase();
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.round(value * 100) / 100 : undefined;
  }

  if (Array.isArray(value)) {
    return value.map(canonicalizeForDuplicateCheck);
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      if (VOLATILE_KEYS.has(key)) continue;
      const canonical = canonicalizeForDuplicateCheck((value as Record<string, unknown>)[key]);
      if (canonical !== undefined) out[key] = canonical;
    }
    return out;
  }

  return value;
}

export function duplicateSubmitFingerprint(
  userId: string,
  method: string,
  scope: string,
  params: Record<string, unknown> | undefined,
  body: unknown,
): string {
  // Route params are identity, not noise: `/goals/A/contribute` and
  // `/goals/B/contribute` with the same body are two different actions. They
  // must NOT go through the body canonicaliser, which drops `id` as volatile.
  const routeParams = Object.keys(params ?? {})
    .sort()
    .map((key) => [key, String((params as Record<string, unknown>)[key])]);
  const payload = JSON.stringify({
    u: userId,
    m: method,
    s: scope,
    p: routeParams,
    b: canonicalizeForDuplicateCheck(body ?? {}),
  });
  return createHash('sha256').update(payload).digest('hex');
}

const pruneRecent = () => {
  const now = Date.now();
  for (const [key, entry] of recent) {
    if (entry.expiresAt <= now) recent.delete(key);
  }
  if (recent.size > MAX_RECENT_ENTRIES) {
    const overflow = recent.size - MAX_RECENT_ENTRIES;
    let removed = 0;
    for (const key of recent.keys()) {
      if (removed >= overflow) break;
      recent.delete(key);
      removed += 1;
    }
  }
};

/** Test hook: forget every recorded submission. */
export const resetDuplicateSubmitGuard = () => {
  recent.clear();
  inFlight.clear();
};

export const duplicateSubmitGuard = (options: GuardOptions) => {
  const windowMs = (options.windowSeconds ?? DEFAULT_WINDOW_SECONDS) * 1000;

  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.method !== 'POST') return next();

    const userId = req.userId;
    if (!userId) return next();

    // The one sanctioned way to record a genuine repeat on purpose.
    if (req.body && typeof req.body === 'object' && (req.body as { intentionalDuplicate?: unknown }).intentionalDuplicate === true) {
      return next();
    }

    const key = duplicateSubmitFingerprint(userId, req.method, options.scope, req.params, req.body);

    const replay = (recorded: RecordedResponse, reason: 'in-flight' | 'recent') => {
      logger.info('[duplicate-submit] absorbed repeated create', { scope: options.scope, userId, reason });
      res.setHeader('Duplicate-Submit-Replay', reason);
      return res.status(recorded.status).json(recorded.body);
    };

    const running = inFlight.get(key);
    if (running) {
      try {
        return replay(await running, 'in-flight');
      } catch {
        // The first attempt failed; this one is entitled to try for real.
      }
    }

    pruneRecent();
    const previous = recent.get(key);
    if (previous && previous.expiresAt > Date.now()) {
      return replay(previous, 'recent');
    }

    let settle!: (value: RecordedResponse) => void;
    let fail!: (reason: unknown) => void;
    const pending = new Promise<RecordedResponse>((resolve, reject) => {
      settle = resolve;
      fail = reject;
    });
    // Nobody may be waiting; never let this surface as an unhandled rejection.
    pending.catch(() => {});
    inFlight.set(key, pending);

    let finished = false;
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      if (!finished) {
        finished = true;
        inFlight.delete(key);
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const recorded = { status: res.statusCode, body, expiresAt: Date.now() + windowMs };
          recent.set(key, recorded);
          settle(recorded);
        } else {
          // Never replay a failure: the repeat should get its own chance.
          fail(new Error(`create failed with status ${res.statusCode}`));
        }
      }
      return originalJson(body);
    };

    res.on('close', () => {
      if (!finished) {
        finished = true;
        inFlight.delete(key);
        fail(new Error('connection closed before a response was sent'));
      }
    });

    return next();
  };
};
