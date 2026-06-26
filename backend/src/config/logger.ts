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
    // eslint-disable-next-line no-console
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

const buildFields = (meta: Meta): Record<string, unknown> => {
  const fields: Record<string, unknown> = {};
  const requestId = getRequestActor().requestId;
  if (requestId) fields.requestId = requestId;

  if (meta instanceof Error) {
    fields.err = { name: meta.name, message: meta.message, stack: meta.stack };
  } else if (meta && typeof meta === 'object') {
    Object.assign(fields, redact(meta) as Record<string, unknown>);
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
