import { Capacitor } from '@capacitor/core';

const DEFAULT_API_BASE = '/api/v1';

/**
 * Backend URL baked in when a native build has no VITE_API_URL.
 *
 * A relative base is correct on web — the app is served from the same origin as
 * the API — but it is never valid on Android or iOS, where the WebView serves
 * the bundle from capacitor://localhost (or http://localhost). There, '/api/v1'
 * resolves against that local origin and every request fails, which surfaces to
 * the user as "sign in failed, please try again" with no further explanation.
 *
 * This mattered because .env.ios is gitignored: CI checked out a tree with no
 * iOS env file, so VITE_API_URL was undefined in every CI-built IPA. The env
 * file is now committed, but silently producing an unusable URL is a bad
 * failure mode to leave in place — a missing variable should not be able to
 * ship a build that cannot talk to its backend at all.
 */
const NATIVE_FALLBACK_API_BASE = 'https://kanaku-api.onrender.com/api/v1';

const isNativeRuntime = (): boolean => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};
const LOCALHOST_BASE_REGEX = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/.*)?$/i;
const OPTIONAL_BACKEND_UNAVAILABLE_TTL_MS = 30_000;
let optionalBackendUnavailableUntil = 0;

const normalizeBase = (base?: string | null): string =>
  (base || DEFAULT_API_BASE).replace(/\/+$/, '');

const isLocalDevBackendBase = (base: string): boolean =>
  base === DEFAULT_API_BASE || LOCALHOST_BASE_REGEX.test(base);

export const getConfiguredApiBase = (): string => {
  const configured = import.meta.env.VITE_API_URL;
  if (configured) return normalizeBase(configured);

  // Only the native fallback differs by platform; web keeps the relative base,
  // which is what it wants. Nothing else in the data path branches on platform.
  if (isNativeRuntime()) {
    console.warn(
      '[apiBase] VITE_API_URL is not set in this native build — falling back to ' +
      `${NATIVE_FALLBACK_API_BASE}. Build with --mode ios / --mode android so the ` +
      'correct backend URL is baked in.',
    );
    return normalizeBase(NATIVE_FALLBACK_API_BASE);
  }

  return normalizeBase(DEFAULT_API_BASE);
};

export const getApiBaseCandidates = (preferredBase?: string): string[] => {
  const primaryBase = normalizeBase(preferredBase || getConfiguredApiBase());
  const candidates = [primaryBase];

  if (
    import.meta.env.DEV &&
    primaryBase !== DEFAULT_API_BASE &&
    LOCALHOST_BASE_REGEX.test(primaryBase)
  ) {
    candidates.push(DEFAULT_API_BASE);
  }

  return Array.from(new Set(candidates));
};

export const buildApiUrl = (base: string, endpoint: string): string => {
  const normalizedBase = normalizeBase(base);
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${normalizedBase}${normalizedEndpoint}`;
};

export const shouldSkipOptionalBackendRequests = (preferredBase?: string): boolean => {
  if (!import.meta.env.DEV || optionalBackendUnavailableUntil <= Date.now()) {
    return false;
  }

  return isLocalDevBackendBase(normalizeBase(preferredBase || getConfiguredApiBase()));
};

export const markOptionalBackendUnavailable = (
  preferredBase?: string,
  ttlMs: number = OPTIONAL_BACKEND_UNAVAILABLE_TTL_MS,
): void => {
  if (!import.meta.env.DEV) {
    return;
  }

  const normalizedBase = normalizeBase(preferredBase || getConfiguredApiBase());
  if (!isLocalDevBackendBase(normalizedBase)) {
    return;
  }

  optionalBackendUnavailableUntil = Date.now() + ttlMs;
};

export const clearOptionalBackendUnavailable = (): void => {
  optionalBackendUnavailableUntil = 0;
};

export const shouldRetryWithLocalApiFallback = (status?: number, error?: unknown): boolean => {
  if (!import.meta.env.DEV) {
    return false;
  }

  if (typeof status === 'number') {
    return status >= 500 || status === 429;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes('failed to fetch') ||
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('err_connection_refused')
  );
};
