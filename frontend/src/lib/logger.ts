/**
 * Centralized client-side logger.
 *
 * Goals:
 *  - Never leak technical detail (stack traces, raw API messages, request
 *    payloads) into the production browser console.
 *  - Keep verbose diagnostics in development so engineers can debug.
 *  - Provide a single seam to forward production errors to a remote sink
 *    (Sentry / Datadog) later without touching every call site.
 *
 * Usage:
 *   import { logger } from '@/lib/logger';
 *   logger.error('[Sync] queue flush failed', err);
 *   logger.warn('[Auth] retrying refresh');
 *   logger.info('[Boot] migration complete');
 *
 * Rule of thumb: anything you would have written as `console.error(err)`
 * should go through `logger.error(...)` so production users never see
 * stack traces in DevTools.
 */

type LogArg = unknown;

const isDev = (() => {
  try {
    // Vite injects import.meta.env.DEV; default to false in non-Vite envs.
    return Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV);
  } catch {
    return false;
  }
})();

/** Strip technical detail from any value before emitting to the console. */
const redact = (value: LogArg): LogArg => {
  if (value instanceof Error) {
    // In prod we only keep the name + a generic indicator. No stack, no message.
    return isDev ? value : { name: value.name, message: '[redacted]' };
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const safe: Record<string, unknown> = {};
    for (const key of ['code', 'status', 'statusCode', 'name', 'type', 'requestId']) {
      if (key in obj) safe[key] = obj[key];
    }
    return isDev ? value : safe;
  }
  return value;
};

const emit = (
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  args: LogArg[],
): void => {
  // In production, suppress debug/info entirely — keep the console clean.
  if (!isDev && (level === 'debug' || level === 'info')) {
    return;
  }

  const payload = args.map(redact);
  // eslint-disable-next-line no-console
  const sink = console[level] ?? console.log;
  if (payload.length === 0) {
    sink(message);
  } else {
    sink(message, ...payload);
  }
};

export const logger = {
  debug: (message: string, ...args: LogArg[]): void => emit('debug', message, args),
  info: (message: string, ...args: LogArg[]): void => emit('info', message, args),
  warn: (message: string, ...args: LogArg[]): void => emit('warn', message, args),
  error: (message: string, ...args: LogArg[]): void => emit('error', message, args),
};

export default logger;

