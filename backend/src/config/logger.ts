import pino from 'pino';
import { createStream } from 'rotating-file-stream';
import { redact } from '../utils/redact';
import { getRequestActor } from '../middleware/requestContext';
import { serviceName } from './serviceRole';

/**
 * Centralized structured logging (Phase 3).
 *
 * Engine: Pino (high-performance structured JSON). The public surface keeps the
 * Winston-style `logger.x(message, meta?)` signature so the ~hundreds of existing
 * call sites are unchanged — but every line is now consistent JSON of the form:
 *
 *   { "timestamp", "level", "service", "requestId"?, "action"?, "message", ...meta }
 *
 * Cross-cutting guarantees:
 *  - `requestId` is auto-injected from the active request context (AsyncLocalStorage)
 *    so frontend → API → worker → audit logs share one correlation id.
 *  - `service` ("api" | "worker") identifies the emitting process.
 *  - Every meta payload is deep-redacted (passwords, PINs, OTPs, JWTs, refresh/
 *    access tokens, private keys, financial secrets) via `redact()`.
 *
 * Destinations:
 *  - stdout ALWAYS — Fly.io captures it (this is what makes worker logs visible
 *    in `fly logs`, fixing the prior gap) and is the Loki ingestion path (Phase 4).
 *  - a rotating, gzip-compressed file with 3-day / 100 MB retention for local
 *    on-box history (skipped on Vercel's read-only FS).
 */

const isVercel = process.env.VERCEL === '1' || !!process.env.NOW_REGION;
const level = process.env.LOG_LEVEL || 'info';

// ── Destinations ──────────────────────────────────────────────────────────────
const streams: pino.StreamEntry[] = [{ level: level as pino.Level, stream: process.stdout }];

if (!isVercel) {
  try {
    // Rotation/retention: rotate daily OR at 100 MB, keep 3 generations, gzip
    // rotated files, and hard-cap total rotated storage — no uncontrolled growth.
    const fileStream = createStream('app.log', {
      path: process.env.LOG_DIR || 'logs',
      size: process.env.LOG_MAX_SIZE || '100M',
      interval: process.env.LOG_ROTATE_INTERVAL || '1d',
      maxFiles: Number(process.env.LOG_RETENTION_DAYS || 3),
      maxSize: process.env.LOG_TOTAL_CAP || '100M',
      compress: 'gzip',
    });
    fileStream.on('error', () => { /* never let a log-file error crash the process */ });
    streams.push({ level: level as pino.Level, stream: fileStream });
  } catch (err) {
     
    console.warn('Failed to initialise rotating log file:', err);
  }
}

const base = pino(
  {
    level,
    base: { service: serviceName() },
    messageKey: 'message',
    // Emit `"timestamp":"<ISO>"` (the agreed field name) instead of pino's default `time`.
    timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
    // Level as its string label ("info"/"warn"/…) rather than the numeric code.
    formatters: { level: (label) => ({ level: label }) },
  },
  pino.multistream(streams),
);

// ── Winston-compatible facade ─────────────────────────────────────────────────
type Meta = unknown;

/**
 * Replace every Error anywhere in a log payload with a plain, serialisable object.
 *
 * `meta instanceof Error` below only catches an Error passed as the WHOLE meta.
 * The far more common shape — `logger.error('msg', { error })`, used ~60 times
 * across this codebase — puts it one level down, and there it vanishes: an
 * Error's `message` and `stack` are non-enumerable, so the line serialises to
 * `{"error":{}}`. Production 5xx were therefore logged as "something failed"
 * with no indication of what, which is how a storage misconfiguration could
 * look identical to a schema bug for as long as it did.
 *
 * Prisma's `code`/`meta` and the project's `statusCode` are lifted out too —
 * they are what separate schema drift (P2022) from a constraint violation
 * (P2002) from a transaction timeout (P2028).
 *
 * Depth-capped, and cycle-broken via `seen`: a self-referencing payload would
 * otherwise be re-expanded at every level, and now that each level carries a
 * full stack trace that turns one log line into tens of kilobytes.
 *
 * Stacks are truncated too — past a few thousand characters a trace is framework
 * noise, and an unbounded one is a cheap way to blow a log budget.
 */
const MAX_STACK_CHARS = 4000;

const serializeErrors = (value: unknown, depth = 0, ancestors = new WeakSet<object>()): unknown => {
  if (depth > 6 || value == null || typeof value !== 'object') {
    return value;
  }

  // Only an ANCESTOR repeating is a cycle. A shared WeakSet would also flag the
  // same object appearing twice as siblings — a normal payload shape — so the
  // marker is removed again on the way back up.
  if (ancestors.has(value)) return '[Circular]';
  ancestors.add(value);

  try {
    if (value instanceof Error) {
      const err = value as Error & { code?: unknown; statusCode?: unknown; meta?: unknown; cause?: unknown };
      const stack = typeof value.stack === 'string' && value.stack.length > MAX_STACK_CHARS
        ? `${value.stack.slice(0, MAX_STACK_CHARS)}… [truncated]`
        : value.stack;
      return {
        name: value.name,
        message: value.message,
        stack,
        ...(err.code !== undefined ? { code: err.code } : {}),
        ...(err.statusCode !== undefined ? { statusCode: err.statusCode } : {}),
        ...(err.meta !== undefined ? { meta: serializeErrors(err.meta, depth + 1, ancestors) } : {}),
        ...(err.cause !== undefined ? { cause: serializeErrors(err.cause, depth + 1, ancestors) } : {}),
      };
    }

    // Most log payloads contain no Error at all. Returning the ORIGINAL reference
    // when nothing was rewritten keeps this pass allocation-free on the hot path —
    // `redact` already walks the payload, and a second unconditional deep copy per
    // log line is a real cost at volume.
    if (Array.isArray(value)) {
      let changed = false;
      const items = value.map((item) => {
        const next = serializeErrors(item, depth + 1, ancestors);
        if (next !== item) changed = true;
        return next;
      });
      return changed ? items : value;
    }

    let changed = false;
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const next = serializeErrors(item, depth + 1, ancestors);
      if (next !== item) changed = true;
      out[key] = next;
    }
    return changed ? out : value;
  } finally {
    ancestors.delete(value);
  }
};

const buildFields = (meta: Meta): Record<string, unknown> => {
  const fields: Record<string, unknown> = {};
  const actor = getRequestActor();
  if (actor.requestId) fields.requestId = actor.requestId;
  if (actor.correlationId) fields.correlationId = actor.correlationId;
  if (actor.sessionId) fields.sessionId = actor.sessionId;
  if (actor.userId) fields.userId = actor.userId;
  if (actor.route) fields.route = actor.route;
  if (actor.method) fields.method = actor.method;

  if (meta instanceof Error) {
    fields.err = serializeErrors(meta);
  } else if (meta && typeof meta === 'object') {
    // serializeErrors first, then redact: flattening exposes the message and
    // stack, and those are exactly the strings that can carry a leaked token.
    Object.assign(fields, redact(serializeErrors(meta)) as Record<string, unknown>);
  } else if (meta !== undefined) {
    fields.detail = meta;
  }
  return fields;
};

const emit = (lvl: 'info' | 'warn' | 'error' | 'debug', message: string, meta?: Meta): void => {
  try {
    base[lvl](buildFields(meta), message);
  } catch {
    // Logging must never throw and never affect request handling.
  }
};

export const logger = {
  info: (message: string, meta?: Meta): void => emit('info', message, meta),
  warn: (message: string, meta?: Meta): void => emit('warn', message, meta),
  error: (message: string, meta?: Meta): void => emit('error', message, meta),
  debug: (message: string, meta?: Meta): void => emit('debug', message, meta),
};
