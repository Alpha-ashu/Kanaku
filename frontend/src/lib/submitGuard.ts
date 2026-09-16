/**
 * Client-side single-flight guard for creates.
 *
 * Every create in the app ends in a network round trip to Sydney of roughly a
 * third of a second, often more. Anything that fires the save a second time
 * inside that window — an Enter key with no busy check, a key that auto-repeats,
 * an Android keyboard that delivers Enter twice, a double tap on a slow phone, a
 * form wired to both Enter and a button — used to start a second, independent
 * create with its own idempotency key. The server saw two unrelated requests and
 * stored two rows.
 *
 * `coalesceCreate` makes a repeat of the SAME create, while the first is still
 * running or within a short grace period after it finished, return the first
 * one's result instead of running again. "Same" is judged on content, with the
 * per-attempt noise stripped the same way the server's duplicateSubmitGuard does,
 * so the two layers agree about what counts as a repeat.
 *
 * A failed attempt is forgotten immediately, so retrying after an error always
 * gets a real attempt.
 */

const DEFAULT_GRACE_MS = 3_000;

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

interface Entry {
  promise: Promise<unknown>;
  /** Set once the create has succeeded; the entry then lives for the grace period. */
  settledAt?: number;
}

const entries = new Map<string, Entry>();

export function canonicalizeSubmission(value: unknown): unknown {
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

  if (typeof value === 'boolean') return value;

  if (Array.isArray(value)) return value.map(canonicalizeSubmission);

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      if (VOLATILE_KEYS.has(key)) continue;
      const canonical = canonicalizeSubmission((value as Record<string, unknown>)[key]);
      if (canonical !== undefined) out[key] = canonical;
    }
    return out;
  }

  // Functions, symbols and the like carry no identity for a record.
  return undefined;
}

export function submissionKey(scope: string, payload: unknown): string {
  return `${scope}::${JSON.stringify(canonicalizeSubmission(payload) ?? null)}`;
}

const prune = (now: number, graceMs: number) => {
  for (const [key, entry] of entries) {
    if (entry.settledAt !== undefined && now - entry.settledAt > graceMs) {
      entries.delete(key);
    }
  }
};

/**
 * Run `create` unless an identical create for `scope` is in flight or just
 * finished, in which case return that one's result.
 *
 * @param scope   What is being created, e.g. `'todo-item'`. Identical payloads in
 *                different scopes are never merged.
 * @param payload The user's input. Include every field that distinguishes one
 *                record from another (list id, goal id, account, amount…).
 */
export function coalesceCreate<T>(
  scope: string,
  payload: unknown,
  create: () => Promise<T>,
  graceMs: number = DEFAULT_GRACE_MS,
): Promise<T> {
  const now = Date.now();
  prune(now, graceMs);

  const key = submissionKey(scope, payload);
  const existing = entries.get(key);
  if (existing) {
    if (existing.settledAt === undefined || now - existing.settledAt <= graceMs) {
      return existing.promise as Promise<T>;
    }
    entries.delete(key);
  }

  const entry: Entry = { promise: Promise.resolve() };
  entry.promise = (async () => {
    try {
      const result = await create();
      entry.settledAt = Date.now();
      return result;
    } catch (error) {
      // Forget failures at once: the user's retry must not be answered with the
      // error from the attempt they are retrying.
      if (entries.get(key) === entry) entries.delete(key);
      throw error;
    }
  })();
  entries.set(key, entry);

  return entry.promise as Promise<T>;
}

/** Test hook. */
export function resetSubmitGuard(): void {
  entries.clear();
}
