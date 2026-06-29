/**
 * API Utilities
 * Standardized API client with error handling
 */

import { toast } from 'sonner';
import { Capacitor } from '@capacitor/core';
import {
  buildApiUrl,
  clearOptionalBackendUnavailable,
  getApiBaseCandidates,
  getConfiguredApiBase,
  markOptionalBackendUnavailable,
  shouldRetryWithLocalApiFallback,
} from './apiBase';
import type { ApiResponse, ApiError } from '@/types';
import { ErrorFactory, ErrorHandler } from './errorHandling';
import { logger } from './logger';

// Native (Capacitor Android/iOS) clients call the API cross-origin from a
// https://localhost webview, where the HttpOnly refresh cookie is unreliable
// (iOS WKWebView ITP, Android third-party-cookie policy). They therefore mark
// requests with `X-Client-Platform: native` and persist the refresh token in
// device storage. Web is same-origin (Vercel proxy) and uses the cookie only —
// the refresh token is never stored in browser JS (XSS-safe).
const isNativePlatform = (): boolean => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

// ==================== User-friendly error message map ====================
// Maps server error codes to simple, human-readable messages.
// Technical details are logged to the console; only these go to the user.

const USER_FRIENDLY_MESSAGES: Record<string, string> = {
  // Auth
  INVALID_CREDENTIALS: 'Incorrect email or password. Please try again.',
  EMAIL_EXISTS: 'An account with this email already exists. Try signing in instead.',
  PHONE_EXISTS: 'This phone number is already registered to another account. Please use a different phone number.',
  MISSING_FIELDS: 'Please fill in all required fields.',
  INVALID_EMAIL: 'Please enter a valid email address.',
  PASSWORD_TOO_SHORT: 'Your password must be at least 8 characters long.',
  UNAUTHORIZED: 'Please sign in to continue.',
  FORBIDDEN: 'You do not have permission to do that.',
  // Accounts / transactions
  ACCOUNT_UNAVAILABLE: 'That account is no longer available. Please pick an active account or create a new one before recording transactions.',
  TRANSFER_ACCOUNT_UNAVAILABLE: 'The transfer destination account is no longer available. Please choose an active account.',
  // Data
  NOT_FOUND: 'We could not find what you were looking for.',
  DUPLICATE_ENTRY: 'This item already exists. Please use different values.',
  VALIDATION_ERROR: 'Some of your inputs look incorrect. Please review and try again.',
  INVALID_JSON: 'There was a problem sending your data. Please try again.',
  // Connectivity
  DATABASE_UNAVAILABLE: 'Our servers are temporarily unavailable. Please try again in a moment.',
  NETWORK_ERROR: 'Check your internet connection and try again.',
  TIMEOUT_ERROR: 'The request took too long. Please try again.',
  RATE_LIMIT_EXCEEDED: 'You are doing that too fast. Please wait a moment before trying again.',
  // Fallback
  INTERNAL_ERROR: 'Something went wrong on our end. Please try again later.',
  REQUEST_ERROR: 'Something went wrong. Please try again.',
};

/**
 * Returns a user-friendly message for a server error code/HTTP status.
 * Logs the raw technical message to the console so developers can debug.
 */
function getUserMessage(
  status: number,
  serverCode: string | undefined,
  technicalMessage: string,
  logToConsole = true,
): string {
  // Log the raw technical detail for debugging  never shown to the user.
  // Callers that already expect/handle this failure (e.g. the login challenge's
  // SHA-256-then-plain-password fallback) pass showErrorToast: false and should
  // not spam the console with a "failure" that's actually a normal retry step.
  if (logToConsole) {
    logger.error(
      `[API Error] HTTP ${status} | code=${serverCode ?? 'n/a'} | ${technicalMessage}`,
    );
  }

  if (serverCode && USER_FRIENDLY_MESSAGES[serverCode]) {
    return USER_FRIENDLY_MESSAGES[serverCode];
  }

  // Fall back to HTTP-status-based friendly message
  if (status === 400) return 'Some of your inputs look incorrect. Please review and try again.';
  if (status === 401) return 'Please sign in to continue.';
  if (status === 403) return 'You do not have permission to do that.';
  if (status === 404) return 'We could not find what you were looking for.';
  if (status === 409) return 'This item already exists. Please use different values.';
  if (status === 429) return 'You are doing that too fast. Please wait a moment and try again.';
  if (status >= 500) return 'Something went wrong on our end. Please try again later.';
  return 'Something went wrong. Please try again.';
}

// ==================== Configuration ====================

const API_BASE_URL = getConfiguredApiBase();
const DEFAULT_TIMEOUT = 30000; // 30 seconds
// Profile cache: 30s prevents duplicate /auth/profile calls during startup
// (AuthContext syncProfileFromBackend + permissionService both call getProfile)
const PROFILE_CACHE_TTL_MS = 30_000;
// Generic GET dedup: two identical GET calls within this window share one network request
const GET_DEDUP_TTL_MS = 2_000;

let profilePrivateCache:
  | {
    expiresAt: number;
    response: ApiResponse<any>;
  }
  | null = null;
let profilePublicCache:
  | {
    expiresAt: number;
    response: ApiResponse<any>;
  }
  | null = null;
let profilePrivateRequestInFlight: Promise<ApiResponse<any>> | null = null;
let profilePublicRequestInFlight: Promise<ApiResponse<any>> | null = null;

// Generic in-flight dedup map: prevents concurrent identical GET requests (e.g. on startup burst)
const inflightGetRequests = new Map<string, Promise<ApiResponse<any>>>();

// ── Short-TTL GET response cache ──────────────────────────────────────────
// Some stable, low-volatility endpoints are re-requested every time a
// component mounts (e.g. on each route navigation). The 2s in-flight dedup
// only collapses *concurrent* calls; mounts that are seconds apart still hit
// the network. This cache returns a recent response for an allow-listed set
// of endpoints, so navigating around the app doesn't refire the same GETs.
// Any mutation (POST/PUT/PATCH/DELETE) flushes the cache to avoid staleness.
interface CachedGetEntry {
  expiresAt: number;
  response: ApiResponse<any>;
}
const getResponseCache = new Map<string, CachedGetEntry>();

// Endpoint prefix → cache TTL (ms). Keep TTLs short; these are convenience
// caches to absorb navigation bursts, not a source of truth.
const GET_CACHE_TTL_BY_PREFIX: Array<{ prefix: string; ttlMs: number }> = [
  { prefix: '/settings', ttlMs: 15_000 },
  // Startup role-resolution endpoints (all authenticated users)
  { prefix: '/admin/features', ttlMs: 60_000 },
  { prefix: '/admin/ai-features', ttlMs: 60_000 },
  // Admin panel RBAC matrix endpoints (admin only) — listed after because
  // resolveGetCacheTtl uses startsWith, so /admin/features/matrix inherits
  // the /admin/features TTL correctly; explicit entries are a no-op here but
  // serve as documentation that these are distinct cached resources.
  { prefix: '/admin/features/matrix', ttlMs: 60_000 },
  { prefix: '/admin/ai-features/matrix', ttlMs: 60_000 },
  { prefix: '/notifications', ttlMs: 10_000 },

];

const resolveGetCacheTtl = (endpoint: string): number => {
  const path = endpoint.split('?')[0];
  for (const { prefix, ttlMs } of GET_CACHE_TTL_BY_PREFIX) {
    if (path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(prefix)) {
      return ttlMs;
    }
  }
  return 0;
};

const clearGetResponseCache = (): void => {
  getResponseCache.clear();
};

// In-memory token store — avoids writing JWTs to extra localStorage keys.
// Backend-managed auth: the backend JWT (captured from login/refresh response
// headers) is the authoritative API credential, held in-memory + localStorage.
let _memoryAccessToken: string | null = null;
let _memoryRefreshToken: string | null = null;

// Safe localStorage accessor — undefined in SSR / web-worker / some test envs.
const _ls = (): Storage | null => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
};

export const TokenManager = {
  getAccessToken: (): string | null => {
    // Prefer in-memory (most recent), then legacy localStorage fallback
    return _memoryAccessToken
      || _ls()?.getItem('auth_token')
      || _ls()?.getItem('accessToken')
      || _ls()?.getItem('token')
      || null;
  },

  setAccessToken: (token: string): void => {
    _memoryAccessToken = token;
    if (token) {
      _ls()?.setItem('auth_token', token);
    } else {
      _ls()?.removeItem('auth_token');
    }
  },

  // The refresh token is persisted by JS ONLY on native (Capacitor) clients,
  // which can't use the cross-origin HttpOnly cookie. On web it lives solely in
  // the cookie, so these accessors are inert there (XSS-safe).
  getRefreshToken: (): string | null => {
    if (!isNativePlatform()) return null;
    return _memoryRefreshToken || _ls()?.getItem('refresh_token') || null;
  },

  setRefreshToken: (token?: string): void => {
    if (!isNativePlatform()) return; // web: cookie-only, never store in JS
    _memoryRefreshToken = token || null;
    if (token) {
      _ls()?.setItem('refresh_token', token);
    } else {
      _ls()?.removeItem('refresh_token');
    }
  },

  clearTokens: (): void => {
    const ls = _ls();
    ['auth_token', 'refresh_token', 'accessToken', 'refreshToken', 'token', 'authToken', 'auth_token_v1']
      .forEach((k) => ls?.removeItem(k));
    // Clear in-memory copies too
    _memoryAccessToken = null;
    _memoryRefreshToken = null;

    // Clear session storage auth & lock states to prevent PIN lock bypasses
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem('session_active');
        sessionStorage.removeItem('session_encryption_key');
        sessionStorage.removeItem('KANAKU_lock_reason');
      }
    } catch {
      // Ignore sessionStorage availability issues
    }
  },

  setTokens: (accessToken: string, refreshToken?: string): void => {
    TokenManager.setAccessToken(accessToken);
    // No-op on web; persists to device storage on native.
    if (refreshToken) TokenManager.setRefreshToken(refreshToken);
  },
};

// One-time cleanup (web only): remove any refresh token a prior build left in
// localStorage. On web the token now lives only in the HttpOnly cookie, so a
// stale copy is dead weight and an XSS target. Native legitimately persists it.
const clearLegacyRefreshTokens = (): void => {
  if (isNativePlatform()) return;
  const ls = _ls();
  if (!ls) return;
  ['refresh_token', 'refreshToken'].forEach((k) => ls.removeItem(k));
  _memoryRefreshToken = null;
};
clearLegacyRefreshTokens();

const resolveAuthToken = async (): Promise<string | null> => {
  // Backend-managed auth (BFF): the only API credential is our own backend JWT,
  // captured by TokenManager from the login/refresh response headers. The client
  // no longer reads Supabase session tokens — Supabase is never the API identity.
  return TokenManager.getAccessToken();
};

// ==================== Error Handler ====================

class APIError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: any
  ) {
    super(message);
    this.name = 'APIError';
  }
}

function handleAPIError(error: any): never {
  if (error instanceof APIError) {
    throw error;
  }

  if (error.response) {
    // The request was made and the server responded with a status code
    // that falls out of the range of 2xx
    const { status, data } = error.response;
    const message = data?.message || 'An error occurred';
    const code = data?.code || 'UNKNOWN_ERROR';

    throw new APIError(code, message, status, data?.details);
  } else if (error.request) {
    // The request was made but no response was received
    throw new APIError(
      'NETWORK_ERROR',
      'Network error. Please check your connection.',
      0
    );
  } else {
    // Something happened in setting up the request that triggered an Error
    throw new APIError(
      'REQUEST_ERROR',
      error.message || 'Failed to make request',
      0
    );
  }
}

// ==================== Token Refresh ====================

// Shared in-flight refresh promise so concurrent 401s only trigger one refresh
let _refreshInFlight: Promise<string | null> | null = null;

// Distinguishes a GENUINE session death (refresh token rejected with 401/403 →
// the user must sign in again) from a TRANSIENT failure (network / timeout / 5xx
// → keep the session; the call just fails and can be retried). Consumed by the
// 401 handler so we never log a user out over a flaky connection.
let _refreshFailureFatal = false;
export const wasRefreshFailureFatal = (): boolean => _refreshFailureFatal;

export const refreshAccessToken = async (): Promise<string | null> => {
  if (_refreshInFlight) return _refreshInFlight;

  _refreshInFlight = (async () => {
    _refreshFailureFatal = false;
    try {
      // Direct fetch (NOT via apiClient) to avoid the 401→refresh recursion.
      // Web: the refresh token rides the HttpOnly cookie (credentials:'include')
      // and is never read/stored by JS. Native: the cookie is unreliable, so the
      // stored token is sent as a header and the rotated one is read from the
      // body and re-persisted. No Supabase involvement.
      const native = isNativePlatform();
      const storedRefresh = native ? TokenManager.getRefreshToken() : null;
      const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(native && { 'X-Client-Platform': 'native' }),
          ...(storedRefresh ? { 'x-refresh-token': storedRefresh } : {}),
        },
        body: '{}',
      });
      if (!res.ok) {
        // 401/403 = refresh token genuinely rejected/expired → fatal (sign out).
        // Anything else (5xx, etc.) is transient → keep the session intact.
        _refreshFailureFatal = res.status === 401 || res.status === 403;
        return null;
      }

      const authHeader = res.headers?.get?.('Authorization') ?? null;
      let accessToken = authHeader ? authHeader.replace(/^Bearer\s+/i, '').trim() : null;

      const json = await res.json().catch(() => null) as any;
      if (!accessToken) {
        accessToken = json?.data?.accessToken ?? null;
      }
      // Native only: persist the rotated refresh token (no-op on web).
      const rotatedRefresh = json?.data?.refreshToken ?? null;
      if (rotatedRefresh) TokenManager.setRefreshToken(rotatedRefresh);

      if (accessToken) {
        TokenManager.setAccessToken(accessToken);
        return accessToken;
      }
    } catch {
      // Refresh failed
    }
    return null;
  })();

  try {
    return await _refreshInFlight;
  } finally {
    _refreshInFlight = null;
  }
};

// ==================== HTTP Client ====================

interface RequestConfig extends RequestInit {
  timeout?: number;
  showErrorToast?: boolean;
  showSuccessToast?: boolean;
  successMessage?: string;
  /**
   * Stable client-generated key for idempotent retries.
   *   - Pass a Dexie record's `clientId` when persisting a local-first
   *     write so a network retry replays the original server response
   *     instead of creating a duplicate row.
   *   - Omit to let the client auto-generate one for fire-and-forget
   *     mutations (still safer than nothing).
   * Set to `null` to explicitly opt out.
   */
  idempotencyKey?: string | null;
  /**
   * Override the short-TTL GET response cache for this call.
   *   - a positive number caches the successful response for that many ms
   *   - `0` disables caching for this call
   * When omitted, an endpoint-based default is used (see
   * GET_CACHE_TTL_BY_PREFIX). Only applies to GET requests.
   */
  cacheTtlMs?: number;
}

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * crypto.randomUUID() polyfill — falls back to a v4-style UUID built on
 * `Math.random` for very old browsers that lack the Crypto API.
 */
const generateClientId = (): string => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // ignore — fall through
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

class HTTPClient {
  private baseURL: string;
  private defaultConfig: RequestConfig;

  constructor(baseURL: string = API_BASE_URL) {
    this.baseURL = baseURL;
    this.defaultConfig = {
      headers: {
        'Content-Type': 'application/json',
      },
      showErrorToast: true,
      showSuccessToast: false,
    };
  }

  private async request<T>(
    endpoint: string,
    config: RequestConfig = {}
  ): Promise<ApiResponse<T>> {
    const {
      timeout = DEFAULT_TIMEOUT,
      showErrorToast = true,
      showSuccessToast = false,
      successMessage,
      idempotencyKey,
      ...fetchConfig
    } = { ...this.defaultConfig, ...config };

    // Add auth token if available
    const token = await resolveAuthToken();

    // Auto-inject Idempotency-Key for mutating requests so the backend
    // can replay the original response if the network drops mid-flight.
    // Callers MAY override by passing `idempotencyKey: null` (explicit
    // opt-out) or by providing their own stable key (preferred for any
    // local-first record so retries truly replay).
    const method = (fetchConfig.method || 'GET').toUpperCase();
    let resolvedIdempotencyKey: string | null = null;
    if (MUTATING_METHODS.has(method) && idempotencyKey !== null) {
      resolvedIdempotencyKey = idempotencyKey ?? generateClientId();
    }

    // End-to-end correlation: a per-request ID the backend honors (X-Request-Id)
    // and propagates through API → DB/AuditLog → Worker. Reused below for any
    // client-side error log so a failure can be matched to its server trace.
    const requestId = (fetchConfig.headers as Record<string, string> | undefined)?.['X-Request-Id'] ?? generateClientId();

    const headers = {
      ...this.defaultConfig.headers,
      ...fetchConfig.headers,
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(resolvedIdempotencyKey && { 'Idempotency-Key': resolvedIdempotencyKey }),
      'X-Request-Id': requestId,
      // Marks native (Capacitor) clients so the backend returns the refresh
      // token in the body for device storage (cross-origin cookie is unreliable).
      ...(isNativePlatform() && { 'X-Client-Platform': 'native' }),
    };
    const baseCandidates = getApiBaseCandidates(this.baseURL);

    try {
      for (let index = 0; index < baseCandidates.length; index += 1) {
        const apiBase = baseCandidates[index];
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
          const response = await fetch(buildApiUrl(apiBase, endpoint), {
            ...fetchConfig,
            headers,
            // Send cookies (refresh-token, session) on cross-origin requests.
            // Backend CORS already sets Access-Control-Allow-Credentials: true.
            credentials: fetchConfig.credentials ?? 'include',
            signal: controller.signal,
          });

          const data = (await this.parseResponseBody(response)) as any;

          // Use optional chaining — test mocks (and some edge-case environments)
          // may not provide a headers object with a .get() method.
          const responseAuthToken = response.headers?.get?.('Authorization') ?? null;

          if (responseAuthToken) {
            const tokenVal = responseAuthToken.replace(/^Bearer\s+/i, '').trim();
            TokenManager.setAccessToken(tokenVal);
            if (data && typeof data === 'object') {
              if (data.data && typeof data.data === 'object') {
                data.data.accessToken = tokenVal;
              } else {
                data.accessToken = tokenVal;
              }
            }
          }

          // Refresh token: web never receives it in JS (HttpOnly cookie only).
          // Native receives it in the body and persists it to device storage —
          // setRefreshToken is a no-op on web, so this is safe to call always.
          const bodyRefreshToken =
            (data && typeof data === 'object'
              ? (data.data?.refreshToken ?? data.refreshToken)
              : null) ?? null;
          if (bodyRefreshToken) TokenManager.setRefreshToken(bodyRefreshToken);

          if (!response.ok) {
            if (response.status >= 500 || response.status === 429) {
              markOptionalBackendUnavailable(apiBase);
            }

            if (index < baseCandidates.length - 1 && shouldRetryWithLocalApiFallback(response.status)) {
              continue;
            }

            // ── 401 handling ────────────────────────────────────────────────
            // Credentials errors (wrong password, locked account) are not
            // recoverable by a token refresh — fall through to standard error
            // logging below. For all other 401s (session expired / JWT stale),
            // silently attempt a token refresh and retry the request BEFORE
            // logging anything. If the retry succeeds the caller sees a
            // successful response with zero console noise or toast.
            if (response.status === 401) {
              const rawCode = data.code || 'HTTP_401';
              const isCredentialsError = [
                'INVALID_CREDENTIALS',
                'EMAIL_NOT_FOUND',
                'ACCOUNT_LOCKED',
                'ACCOUNT_DISABLED',
              ].includes(rawCode);

              if (!isCredentialsError) {
                const newToken = await refreshAccessToken();
                if (newToken) {
                  const retryHeaders = { ...headers, Authorization: `Bearer ${newToken}` };
                  const retryController = new AbortController();
                  const retryTimeout = setTimeout(() => retryController.abort(), timeout);
                  try {
                    const retryResponse = await fetch(buildApiUrl(apiBase, endpoint), {
                      ...fetchConfig,
                      headers: retryHeaders,
                      credentials: fetchConfig.credentials ?? 'include',
                      signal: retryController.signal,
                    });
                    clearTimeout(retryTimeout);
                    if (retryResponse.ok) {
                      // Silently recovered — no console error, no toast
                      clearOptionalBackendUnavailable();
                      const retryData = (await this.parseResponseBody(retryResponse)) as T;
                      return { success: true, data: retryData };
                    }
                  } catch {
                    clearTimeout(retryTimeout);
                  }
                  // We had a fresh, valid token but the call still failed — that is
                  // an endpoint-specific 401/403, NOT session death. Surface the
                  // error WITHOUT logging the user out.
                  throw new APIError('UNAUTHORIZED', data.message || 'Request failed after refreshing the session.', response.status);
                }

                // No new token. Only sign the user out when the refresh token was
                // genuinely rejected (fatal). A transient failure (network / timeout /
                // 5xx) must NOT destroy a still-valid session — fail soft so the call
                // can be retried and the user stays logged in.
                if (wasRefreshFailureFatal()) {
                  TokenManager.clearTokens();
                  if (typeof window !== 'undefined') {
                    // Coordinated SOFT logout (no page reload): AuthContext clears the
                    // user (→ Login renders via state) and SecurityContext re-locks the
                    // PIN so the next sign-in correctly requires a fresh PIN unlock.
                    window.dispatchEvent(new CustomEvent('KANAKU_SESSION_EXPIRED', {
                      detail: { reason: 'refresh_rejected' },
                    }));
                  }
                  throw new APIError('UNAUTHORIZED', 'Your session has expired. Please sign in again.', 401);
                }
                throw new APIError('SERVICE_UNAVAILABLE', 'Could not reach the server. Please try again in a moment.', 503);
              }
              // isCredentialsError: fall through to standard error logging below
            }
            // ── End 401 handling ────────────────────────────────────────────

            // ── 403 PIN gate ────────────────────────────────────────────────
            // The server requires a live PIN unlock to serve financial data.
            // Re-lock the app so the PIN screen reappears; a fresh /pin/verify
            // re-establishes the server-side unlock.
            if (response.status === 403 && data.code === 'PIN_VERIFICATION_REQUIRED') {
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('KANAKU_FORCE_PIN_LOCK'));
              }
            }

            const serverCode = data.code || `HTTP_${response.status}`;
            const technicalMessage = data.message || data.error || response.statusText;
            const userMessage = getUserMessage(response.status, serverCode, technicalMessage, showErrorToast);

            const error: ApiError = {
              code: serverCode,
              message: userMessage,
              details: data.details,
            };

            if (showErrorToast) {
              ErrorHandler.handle(
                ErrorFactory.fromHTTPStatus(response.status, userMessage),
                true,
              );
            }

            throw new APIError(error.code, error.message, response.status, error.details);
          }

          if (showSuccessToast && successMessage) {
            toast.success(successMessage);
          }

          clearOptionalBackendUnavailable();

          return {
            success: true,
            data: data.data || data,
            message: data.message,
          };
        } catch (error: unknown) {
          const err = error as Record<string, unknown>;
          if (err?.name === 'AbortError') {
            markOptionalBackendUnavailable(apiBase);
            if (index < baseCandidates.length - 1 && shouldRetryWithLocalApiFallback(undefined, error)) {
              continue;
            }

            const timeoutMsg = USER_FRIENDLY_MESSAGES['TIMEOUT_ERROR'];
            logger.error('[API Error] Request timed out', { endpoint, requestId });
            const timeoutError = new APIError('TIMEOUT_ERROR', timeoutMsg, 0);
            if (showErrorToast) {
              ErrorHandler.handle(ErrorFactory.fromHTTPStatus(408, timeoutMsg), true);
            }
            throw timeoutError;
          }

          markOptionalBackendUnavailable(apiBase);
          if (index < baseCandidates.length - 1 && shouldRetryWithLocalApiFallback(undefined, error)) {
            continue;
          }

          return handleAPIError(error);
        } finally {
          clearTimeout(timeoutId);
        }
      }

      throw new APIError('REQUEST_ERROR', 'Failed to make request', 0);
    } catch (error: unknown) {
      return handleAPIError(error);
    }
  }

  async get<T>(endpoint: string, config?: RequestConfig): Promise<ApiResponse<T>> {
    // 1. Short-TTL response cache: return a recent response for allow-listed
    //    (or explicitly opted-in) stable endpoints so navigating around the
    //    app doesn't refire identical GETs.
    const ttl = config?.cacheTtlMs ?? resolveGetCacheTtl(endpoint);
    if (ttl > 0) {
      const cached = getResponseCache.get(endpoint);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.response as ApiResponse<T>;
      }
    }

    // 2. Deduplicate identical concurrent GET requests.
    //    Two calls for the same endpoint within GET_DEDUP_TTL_MS share one network request.
    const dedupKey = endpoint;
    const existing = inflightGetRequests.get(dedupKey);
    if (existing) {
      return existing as Promise<ApiResponse<T>>;
    }
    const req = this.request<T>(endpoint, { ...config, method: 'GET' })
      .then((response) => {
        if (ttl > 0 && response?.success) {
          getResponseCache.set(endpoint, { expiresAt: Date.now() + ttl, response });
        }
        return response;
      })
      .finally(() => {
        // Remove from map after a short window so future calls still dedup during burst
        setTimeout(() => inflightGetRequests.delete(dedupKey), GET_DEDUP_TTL_MS);
      });
    inflightGetRequests.set(dedupKey, req as Promise<ApiResponse<any>>);
    return req;
  }

  async post<T>(
    endpoint: string,
    data?: unknown,
    config?: RequestConfig
  ): Promise<ApiResponse<T>> {
    clearGetResponseCache();
    return this.request<T>(endpoint, {
      ...config,
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async put<T>(
    endpoint: string,
    data?: unknown,
    config?: RequestConfig
  ): Promise<ApiResponse<T>> {
    clearGetResponseCache();
    return this.request<T>(endpoint, {
      ...config,
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async patch<T>(
    endpoint: string,
    data?: unknown,
    config?: RequestConfig
  ): Promise<ApiResponse<T>> {
    clearGetResponseCache();
    return this.request<T>(endpoint, {
      ...config,
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async delete<T>(endpoint: string, config?: RequestConfig): Promise<ApiResponse<T>> {
    clearGetResponseCache();
    return this.request<T>(endpoint, { ...config, method: 'DELETE' });
  }

  private async parseResponseBody(response: Response): Promise<unknown> {
    if (typeof response.text !== 'function') {
      if (typeof response.json === 'function') {
        return response.json();
      }
      return {};
    }

    const raw = await response.text();
    if (!raw) {
      return {};
    }

    try {
      return JSON.parse(raw);
    } catch {
      return {
        message: raw,
      };
    }
  }
}

// ==================== API Client Instance ====================

export const apiClient = new HTTPClient();

// ==================== Helper Functions ====================

export const api = {
  clearCache: () => {
    profilePrivateCache = null;
    profilePublicCache = null;
    profilePrivateRequestInFlight = null;
    profilePublicRequestInFlight = null;
    // Also flush the generic GET dedup map so callers (e.g. tests) can force
    // a fresh network request on the next call.
    inflightGetRequests.clear();
    clearGetResponseCache();
  },
  // Authentication
  auth: {
    login: async (credentials: { email: string; password: string }) => {
      // Two-step challenge: verify the password, then exchange the returned code
      // for tokens. The password is sent plain over the HTTPS-encrypted connection
      // (TLS protects it in transit; bcrypt on the server is the security gate).
      const doChallenge = () => apiClient.post<any>(
        '/auth/login/challenge',
        { email: credentials.email, password: credentials.password },
        { showErrorToast: false },
      );

      // If the backend is cold-starting, the first call may time out — retry once
      // after a short pause so the user never sees a dead-end error.
      let challengeResponse;
      try {
        challengeResponse = await doChallenge();
      } catch (err: any) {
        if (err?.code === 'TIMEOUT_ERROR') {
          await new Promise(resolve => setTimeout(resolve, 3000));
          challengeResponse = await doChallenge();
        } else {
          throw err;
        }
      }

      if (!challengeResponse?.success || !challengeResponse?.data?.code) {
        throw new Error(challengeResponse?.message || 'Verification challenge failed.');
      }

      return apiClient.post('/auth/login', {
        email: credentials.email,
        challengeCode: challengeResponse!.data!.code,
      }, {
        showSuccessToast: true,
        successMessage: 'Login successful',
      });
    },

    checkEmail: (email: string): Promise<{ data?: { available: boolean; code?: string }; success: boolean }> =>
      apiClient.post('/auth/check-email', { email }) as any,

    register: (data: { name: string; email: string; password: string; firstName?: string; lastName?: string; mobile?: string }) =>
      apiClient.post('/auth/register', data, {
        showSuccessToast: true,
        successMessage: 'Registration successful',
      }),

    getProfile: async (options?: { force?: boolean; includePrivate?: boolean }) => {
      const force = options?.force === true;
      const includePrivate = options?.includePrivate === true;

      // Check if we have a valid cached private profile (which satisfies both private and public requests)
      if (!force && profilePrivateCache && profilePrivateCache.expiresAt > Date.now()) {
        return profilePrivateCache.response;
      }

      // Check if we have a valid cached public profile (satisfies only public requests)
      if (!force && !includePrivate && profilePublicCache && profilePublicCache.expiresAt > Date.now()) {
        return profilePublicCache.response;
      }

      // Check for in-flight requests to deduplicate concurrent requests
      if (!force) {
        if (includePrivate && profilePrivateRequestInFlight) {
          return profilePrivateRequestInFlight;
        }
        if (!includePrivate && profilePublicRequestInFlight) {
          return profilePublicRequestInFlight;
        }
        // If a private request is in-flight, a public request can also wait for it
        if (!includePrivate && profilePrivateRequestInFlight) {
          return profilePrivateRequestInFlight;
        }
      }

      const suffix = includePrivate ? '?includePrivate=true' : '';
      const request = apiClient.get('/auth/profile' + suffix)
        .then((response) => {
          if (includePrivate) {
            profilePrivateCache = {
              expiresAt: Date.now() + PROFILE_CACHE_TTL_MS,
              response,
            };
          } else {
            profilePublicCache = {
              expiresAt: Date.now() + PROFILE_CACHE_TTL_MS,
              response,
            };
          }
          return response;
        })
        .finally(() => {
          if (includePrivate) {
            profilePrivateRequestInFlight = null;
          } else {
            profilePublicRequestInFlight = null;
          }
        });

      if (includePrivate) {
        profilePrivateRequestInFlight = request;
      } else {
        profilePublicRequestInFlight = request;
      }

      return request;
    },

    updateProfile: (data: any) =>
      apiClient.put('/auth/profile', data, {
        showSuccessToast: true,
        successMessage: 'Profile updated successfully',
      }).then((response) => {
        profilePrivateCache = null;
        profilePublicCache = null;
        profilePrivateRequestInFlight = null;
        profilePublicRequestInFlight = null;
        return response;
      }),

    logout: () =>
      apiClient.post('/auth/logout', undefined, {
        showSuccessToast: true,
        successMessage: 'Logged out successfully',
      }),

    // Web: refresh uses the HttpOnly cookie (sent automatically with
    // credentials). Native: the stored token is sent as a header since the
    // cross-origin cookie is unreliable.
    refreshToken: () => {
      const stored = isNativePlatform() ? TokenManager.getRefreshToken() : null;
      return apiClient.post('/auth/refresh', undefined,
        stored ? { headers: { 'x-refresh-token': stored } } : undefined);
    },

    verifyEmail: (token: string) =>
      apiClient.post('/auth/verify-email', { token }),

    forgotPassword: (email: string) =>
      apiClient.post('/auth/forgot-password', { email }),

    resetPassword: (data: any) =>
      apiClient.post('/auth/reset-password', data),

    changePassword: (oldPassword: string, newPassword: string) =>
      apiClient.post('/auth/change-password', { oldPassword, newPassword }),

    deleteAccount: () =>
      apiClient.delete('/auth/account', { showErrorToast: true }),
  },

  // Accounts
  accounts: {
    getAll: () => apiClient.get('/accounts'),
    getById: (id: string) => apiClient.get(`/accounts/${id}`),
    create: (data: any) =>
      apiClient.post('/accounts', data, {
        showSuccessToast: true,
        successMessage: 'Account created successfully',
      }),
    update: (id: string, data: any) =>
      apiClient.put(`/accounts/${id}`, data, {
        showSuccessToast: true,
        successMessage: 'Account updated successfully',
      }),
    delete: (id: string) =>
      apiClient.delete(`/accounts/${id}`, {
        showSuccessToast: true,
        successMessage: 'Account deleted successfully',
      }),
  },

  // Transactions
  transactions: {
    getAll: (filters?: Record<string, string | number | boolean | undefined>) => {
      const params = new URLSearchParams();
      Object.entries(filters || {}).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params.set(key, String(value));
        }
      });
      const suffix = params.toString() ? `?${params.toString()}` : '';
      return apiClient.get(`/transactions${suffix}`);
    },
    getById: (id: string) => apiClient.get(`/transactions/${id}`),
    create: (data: any) =>
      apiClient.post('/transactions', data, {
        showSuccessToast: true,
        successMessage: 'Transaction added successfully',
      }),
    update: (id: string, data: any) =>
      apiClient.put(`/transactions/${id}`, data, {
        showSuccessToast: true,
        successMessage: 'Transaction updated successfully',
      }),
    delete: (id: string) =>
      apiClient.delete(`/transactions/${id}`, {
        showSuccessToast: true,
        successMessage: 'Transaction deleted successfully',
      }),
  },

  // Goals
  goals: {
    getAll: () => apiClient.get('/goals'),
    getById: (id: string) => apiClient.get(`/goals/${id}`),
    create: (data: any) =>
      apiClient.post('/goals', data, {
        showSuccessToast: true,
        successMessage: 'Goal created successfully',
      }),
    update: (id: string, data: any) =>
      apiClient.put(`/goals/${id}`, data, {
        showSuccessToast: true,
        successMessage: 'Goal updated successfully',
      }),
    delete: (id: string) =>
      apiClient.delete(`/goals/${id}`, {
        showSuccessToast: true,
        successMessage: 'Goal deleted successfully',
      }),
    addContribution: (id: string, amount: number) =>
      apiClient.post(`/goals/${id}/contributions`, { amount }),
  },

  // Loans
  loans: {
    getAll: () => apiClient.get('/loans'),
    getById: (id: string) => apiClient.get(`/loans/${id}`),
    create: (data: any) =>
      apiClient.post('/loans', data, {
        showSuccessToast: true,
        successMessage: 'Loan added successfully',
      }),
    update: (id: string, data: any) =>
      apiClient.put(`/loans/${id}`, data, {
        showSuccessToast: true,
        successMessage: 'Loan updated successfully',
      }),
    delete: (id: string) =>
      apiClient.delete(`/loans/${id}`, {
        showSuccessToast: true,
        successMessage: 'Loan deleted successfully',
      }),
    addPayment: (id: string, data: any) =>
      apiClient.post(`/loans/${id}/payment`, data),
  },

  // Investments
  investments: {
    getAll: () => apiClient.get('/investments'),
    getById: (id: string) => apiClient.get(`/investments/${id}`),
    create: (data: any) =>
      apiClient.post('/investments', data, {
        showSuccessToast: true,
        successMessage: 'Investment added successfully',
      }),
    update: (id: string, data: any) =>
      apiClient.put(`/investments/${id}`, data, {
        showSuccessToast: true,
        successMessage: 'Investment updated successfully',
      }),
    delete: (id: string) =>
      apiClient.delete(`/investments/${id}`, {
        showSuccessToast: true,
        successMessage: 'Investment deleted successfully',
      }),
  },

  // Reports
  reports: {
    getSummary: (period: string) => apiClient.get(`/dashboard/summary?period=${period}`),
    getCategoryBreakdown: () => apiClient.get('/dashboard/cashflow'),
    getTrends: () => apiClient.get('/dashboard/cashflow'),
    export: (format: 'pdf' | 'excel' | 'csv', filters?: any) =>
      apiClient.post('/reports/export', { format, filters }),
  },

  // Admin
  admin: {
    getUsers: () => apiClient.get('/admin/users'),
    getFeatureFlags: () => apiClient.get('/admin/features'),
    updateFeatureFlag: (feature: string, enabled: boolean) =>
      apiClient.post('/admin/features/toggle', { feature, enabled }),
    getAnalytics: () => apiClient.get('/admin/stats'),
  },
};

export default api;
