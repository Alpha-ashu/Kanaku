/**
 * Clear-Data Lock & Idempotency Utilities — Phase 10.7
 *
 * Advisory Lock:
 *   Uses PostgreSQL SESSION-level advisory locks (pg_try_advisory_lock /
 *   pg_advisory_unlock) so the lock covers the entire six-phase reset
 *   lifecycle — including post-transaction storage cleanup and event logging —
 *   not just the DB transaction.
 *
 *   Transaction-level locks (pg_try_advisory_xact_lock) would be released on
 *   COMMIT, leaving Phases 3-7 unguarded.
 *
 *   The lock bigint is derived by hashing the userId string into a stable
 *   int8 using a simple djb2-style fold — collisions are theoretically
 *   possible but vanishingly unlikely for normal UUID user IDs.
 *
 * Idempotency:
 *   Keys are scoped as `idempotency:{userId}:{operation}:{clientKey}` to
 *   prevent cross-endpoint key reuse (e.g. same key used for /clear-data
 *   and /transactions would otherwise collide).
 *
 *   Responses are stored in the existing in-memory TTL cache with a 10-minute
 *   window — long enough for a frontend retry loop, short enough not to
 *   cache a stale response forever.
 *
 * SCALABILITY NOTE:
 *   The advisory lock relies on a single Postgres connection being held for
 *   the duration of the reset. This is correct for a single-node deployment.
 *
 *   If the service is ever scaled horizontally (multiple Node processes,
 *   Kubernetes pods, PM2 cluster), the lock remains safe because Postgres
 *   advisory locks are cluster-wide and tied to the database session —
 *   they are NOT process-local. Each process uses a separate DB connection,
 *   and the lock is global to the Postgres instance.
 *
 *   The in-memory WORKER SKIP SET in recurring.worker.ts IS process-local.
 *   See the note there for the migration path to a DB-backed flag.
 */
import { prisma } from '../../db/prisma';
import { cacheGetJson, cacheSetJson } from '../../cache/redis';
import { logger } from '../../config/logger';

// Advisory lock bigint derivation

/**
 * Converts a UUID string into a stable signed int64 for use as a Postgres
 * advisory lock key. Uses djb2 hash folded into a 32-bit value, then sign-
 * extends to avoid Postgres's int8 range issues.
 */
function userIdToLockKey(userId: string): bigint {
  let hash = 5381n;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5n) + hash + BigInt(userId.charCodeAt(i))) & 0xffffffffn;
  }
  // Treat as signed 32-bit
  return hash > 0x7fffffffn ? hash - 0x100000000n : hash;
}

// Session-level advisory lock

/**
 * Attempts to acquire a session-level Postgres advisory lock for the given userId.
 * Returns true if acquired, false if another clear is already running for this user.
 */
export async function acquireClearDataLock(userId: string): Promise<boolean> {
  const key = userIdToLockKey(userId);
  try {
    const result = await prisma.$queryRaw<[{ pg_try_advisory_lock: boolean }]>`
      SELECT pg_try_advisory_lock(${key}::bigint)
    `;
    return result[0].pg_try_advisory_lock === true;
  } catch (err: any) {
    logger.error('[ClearDataLock] Failed to acquire advisory lock', { userId, error: err.message });
    return true; // Fail open on lock check errors
  }
}

/**
 * Releases the session-level advisory lock. Must be called in a finally block.
 */
export async function releaseClearDataLock(userId: string): Promise<void> {
  const key = userIdToLockKey(userId);
  try {
    await prisma.$queryRaw`SELECT pg_advisory_unlock(${key}::bigint)`;
  } catch (err: any) {
    logger.warn('[ClearDataLock] Failed to release advisory lock', { userId, error: err.message });
  }
}

// Idempotency cache

const IDEMPOTENCY_TTL_SECONDS = 600; // 10 minutes

function idempotencyCacheKey(userId: string, operation: string, clientKey: string): string {
  return `idempotency:${userId}:${operation}:${clientKey}`;
}

export async function getIdempotentResponse<T>(
  userId: string,
  operation: string,
  clientKey: string,
): Promise<T | null> {
  return cacheGetJson<T>(idempotencyCacheKey(userId, operation, clientKey));
}

export async function storeIdempotentResponse(
  userId: string,
  operation: string,
  clientKey: string,
  response: unknown,
): Promise<void> {
  await cacheSetJson(idempotencyCacheKey(userId, operation, clientKey), response, IDEMPOTENCY_TTL_SECONDS);
}

