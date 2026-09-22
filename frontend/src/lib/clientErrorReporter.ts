/**
 * First-party client error sink.
 *
 * The app already had `registerErrorReporter`, but the only thing that ever
 * called it was the Sentry block in index.tsx — and that block is gated on
 * VITE_SENTRY_DSN, which is set in no deployment config in this repo. So
 * `reportError` was a no-op in every shipped build: the ErrorBoundary showed
 * "Something went wrong" and the cause went nowhere. That is why the underlying
 * error was never clear.
 *
 * This module posts those reports to our own backend instead, so they land in
 * the server logs next to the API requests that caused them. It is deliberately
 * dependency-light (only apiBase) so it can be imported from the error path
 * without risking an import cycle through api.ts / errorHandling.ts, and every
 * function here swallows its own failures: error reporting must never be able
 * to cause, or mask, another error.
 */
import { Capacitor } from '@capacitor/core';
import { buildApiUrl, getConfiguredApiBase } from './apiBase';

const SESSION_STORAGE_KEY = 'kanaku_session_id';

let memorySessionId: string | null = null;

const randomId = (): string => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

/**
 * Stable id for this browser session, sent as `X-Session-Id` on every API call.
 *
 * The backend already reads that header (middleware/requestContext.ts) and
 * stamps it on audit rows — nothing was sending it. sessionStorage, not
 * localStorage, so it scopes to the tab session the user is describing rather
 * than to the device forever. Falls back to an in-memory value in private mode
 * or wherever storage throws.
 */
export const getSessionId = (): string => {
  if (memorySessionId) return memorySessionId;
  try {
    const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (stored) {
      memorySessionId = stored;
      return stored;
    }
  } catch {
    /* storage unavailable — fall through to memory-only */
  }

  const minted = randomId();
  memorySessionId = minted;
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, minted);
  } catch {
    /* memory-only for this session */
  }
  return minted;
};

/**
 * Short, readable id shown to the user on the error screen.
 *
 * Users quote this in a support message; support greps it in the logs. Kept to
 * 8 unambiguous characters — no 0/O/1/I — because it gets read aloud and typed
 * by hand.
 */
export const newErrorReference = (): string => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 8; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `KE-${out.slice(0, 4)}-${out.slice(4)}`;
};

const platformName = (): string => {
  try {
    return Capacitor.isNativePlatform() ? `native:${Capacitor.getPlatform()}` : 'web';
  } catch {
    return 'unknown';
  }
};

const readAccessToken = (): string | null => {
  // Read straight from storage rather than importing TokenManager, which lives
  // in api.ts and would create a cycle through the error path.
  try {
    return (
      localStorage.getItem('auth_token')
      || localStorage.getItem('accessToken')
      || localStorage.getItem('token')
      || null
    );
  } catch {
    return null;
  }
};

export interface ClientErrorContext {
  reference?: string;
  componentStack?: string;
  endpoint?: string;
  method?: string;
  status?: number;
  requestId?: string;
  correlationId?: string;
  serverCode?: string;
  [key: string]: unknown;
}

const asString = (value: unknown, max: number): string | undefined => {
  if (typeof value !== 'string' || !value) return undefined;
  return value.slice(0, max);
};

/**
 * Send one report. Best-effort and fire-and-forget.
 *
 * Uses bare `fetch`, not the app's api client: the client retries, refreshes
 * tokens, shows toasts and reports its own failures — all of which would turn a
 * single crash into a loop. A failed report is simply dropped.
 */
export const reportClientError = (error: unknown, context: ClientErrorContext = {}): string => {
  const reference = context.reference ?? newErrorReference();

  try {
    const err = error instanceof Error ? error : undefined;

    const payload = {
      reference,
      sessionId: getSessionId(),
      name: asString(err?.name ?? (typeof error === 'object' && error ? (error as any).name : undefined), 200),
      message: asString(err?.message ?? (typeof error === 'string' ? error : undefined), 1000),
      stack: asString(err?.stack, 8000),
      componentStack: asString(context.componentStack, 8000),
      endpoint: asString(context.endpoint, 300),
      method: asString(context.method, 10),
      status: typeof context.status === 'number' ? context.status : undefined,
      requestId: asString(context.requestId, 64),
      correlationId: asString(context.correlationId, 64),
      serverCode: asString(context.serverCode, 100),
      route: asString(typeof location !== 'undefined' ? location.pathname + location.search : undefined, 300),
      platform: platformName(),
      appVersion: asString(import.meta.env?.VITE_APP_VERSION as string | undefined, 40),
      online: typeof navigator !== 'undefined' ? navigator.onLine : undefined,
      occurredAt: new Date().toISOString(),
    };

    // Strip undefined — the endpoint's schema is strict and rejects nothing,
    // but sending explicit nulls would just bloat the log line.
    const body = JSON.stringify(
      Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined)),
    );

    const token = readAccessToken();
    void fetch(buildApiUrl(getConfiguredApiBase(), '/client-errors'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Session-Id': getSessionId(),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body,
      credentials: 'include',
      // The report must not keep a unloading page alive, nor block anything.
      keepalive: true,
    }).catch(() => {
      /* reporting is best-effort; never surface or retry */
    });
  } catch {
    /* never let reporting throw into the error path that called it */
  }

  return reference;
};
