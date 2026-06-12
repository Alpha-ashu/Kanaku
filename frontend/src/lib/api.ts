/**
 * API Utilities
 * Standardized API client with error handling
 */

import { toast } from 'sonner';
import {
  buildApiUrl,
  clearOptionalBackendUnavailable,
  getApiBaseCandidates,
  getConfiguredApiBase,
  markOptionalBackendUnavailable,
  shouldRetryWithLocalApiFallback,
} from './apiBase';
import supabase from '@/utils/supabase/client';
import type { ApiResponse, ApiError } from '@/types';
import { ErrorFactory, ErrorHandler } from './errorHandling';

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
): string {
  // Log the raw technical detail for debugging  never shown to the user
  console.error(
    `[API Error] HTTP ${status} | code=${serverCode ?? 'n/a'} | ${technicalMessage}`,
  );

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

// In-memory token store — avoids writing JWTs to extra localStorage keys.
// The Supabase session (sb-*-auth-token) is the authoritative source.
// Custom tokens issued by our own backend (e.g. for tests) fall back here.
let _memoryAccessToken: string | null = null;
let _memoryRefreshToken: string | null = null;

export const TokenManager = {
  getAccessToken: (): string | null => {
    // Prefer in-memory (most recent), then legacy localStorage fallback
    return _memoryAccessToken
      || localStorage.getItem('auth_token')
      || localStorage.getItem('accessToken')
      || localStorage.getItem('token');
  },

  setAccessToken: (token: string): void => {
    _memoryAccessToken = token;
    if (token) {
      localStorage.setItem('auth_token', token);
    } else {
      localStorage.removeItem('auth_token');
    }
  },

  getRefreshToken: (): string | null => {
    return _memoryRefreshToken
      || localStorage.getItem('refresh_token')
      || localStorage.getItem('refreshToken');
  },

  setRefreshToken: (token: string): void => {
    _memoryRefreshToken = token;
    if (token) {
      localStorage.setItem('refresh_token', token);
    } else {
      localStorage.removeItem('refresh_token');
    }
  },

  clearTokens: (): void => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('token');
    localStorage.removeItem('authToken');
    localStorage.removeItem('auth_token_v1');
    // Clear in-memory copies too
    _memoryAccessToken = null;
    _memoryRefreshToken = null;
  },

  setTokens: (accessToken: string, refreshToken: string): void => {
    TokenManager.setAccessToken(accessToken);
    TokenManager.setRefreshToken(refreshToken);
  },
};

const resolveAuthToken = async (): Promise<string | null> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      return session.access_token;
    }
  } catch {
    // Fall back to locally stored tokens.
  }

  return TokenManager.getAccessToken();
};

const hasActiveSupabaseSession = async (): Promise<boolean> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return Boolean(session?.access_token);
  } catch {
    return false;
  }
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

// ==================== HTTP Client ====================

interface RequestConfig extends RequestInit {
  timeout?: number;
  showErrorToast?: boolean;
  showSuccessToast?: boolean;
  successMessage?: string;
}

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
      ...fetchConfig
    } = { ...this.defaultConfig, ...config };

    // Add auth token if available
    const token = await resolveAuthToken();
    const headers = {
      ...this.defaultConfig.headers,
      ...fetchConfig.headers,
      ...(token && { Authorization: `Bearer ${token}` }),
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
            signal: controller.signal,
          });

          const data = (await this.parseResponseBody(response)) as any;

          // Use optional chaining — test mocks (and some edge-case environments)
          // may not provide a headers object with a .get() method.
          const responseAuthToken = response.headers?.get?.('Authorization') ?? null;
          const responseRefreshToken = response.headers?.get?.('x-refresh-token') ?? null;

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
          if (responseRefreshToken) {
            TokenManager.setRefreshToken(responseRefreshToken);
            if (data && typeof data === 'object') {
              if (data.data && typeof data.data === 'object') {
                data.data.refreshToken = responseRefreshToken;
              } else {
                data.refreshToken = responseRefreshToken;
              }
            }
          }

          if (!response.ok) {
            if (response.status >= 500 || response.status === 429) {
              markOptionalBackendUnavailable(apiBase);
            }

            if (index < baseCandidates.length - 1 && shouldRetryWithLocalApiFallback(response.status)) {
              continue;
            }

            const serverCode = data.code || `HTTP_${response.status}`;
            const technicalMessage = data.message || data.error || response.statusText;
            const userMessage = getUserMessage(response.status, serverCode, technicalMessage);

            const error: ApiError = {
              code: serverCode,
              message: userMessage,
              details: data.details,
            };

            if (showErrorToast) {
              // Use ErrorHandler for consistent, user-friendly toast messages
              ErrorHandler.handle(
                ErrorFactory.fromHTTPStatus(response.status, userMessage),
                true,
              );
            }

            // Handle 401 Unauthorized
            if (response.status === 401) {
              TokenManager.clearTokens();
              try {
                // Force local sign out to clear stale local storage sessions without triggering a 403 network call
                await supabase.auth.signOut({ scope: 'local' });
              } catch (e) {
                // Ignore sign out errors
              }
              // Wait a tiny bit for local storage to actually clear before redirecting
              await new Promise(resolve => setTimeout(resolve, 100));
              if (window.location.pathname !== '/login') {
                window.location.href = '/login';
              }
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
            console.error('[API Error] Request timed out:', endpoint);
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
    // Deduplicate identical concurrent GET requests.
    // Two calls for the same endpoint within GET_DEDUP_TTL_MS share one network request.
    const dedupKey = endpoint;
    const existing = inflightGetRequests.get(dedupKey);
    if (existing) {
      return existing as Promise<ApiResponse<T>>;
    }
    const req = this.request<T>(endpoint, { ...config, method: 'GET' }).finally(() => {
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
    return this.request<T>(endpoint, {
      ...config,
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async delete<T>(endpoint: string, config?: RequestConfig): Promise<ApiResponse<T>> {
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
  },
  // Authentication
  auth: {
    login: async (credentials: { email: string; password: string }) => {
      // Hash the password with SHA-256 before sending over the wire.
      // This prevents the raw password from appearing in DevTools Network tab.
      // The backend verifies the SHA-256 digest; if it can't (legacy accounts),
      // we automatically fall back to sending the plain password.
      let passwordPayload: string = credentials.password;
      let pwEncoding = 'plain';
      try {
        const encoder = new TextEncoder();
        const data = encoder.encode(credentials.password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        passwordPayload = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
        pwEncoding = 'sha256';
      } catch {
        // SubtleCrypto unavailable (very old browser) — fall back to plain
      }

      const doChallenge = (password: string, encoding: string) => apiClient.post<any>(
        '/auth/login/challenge',
        { email: credentials.email, password },
        { showErrorToast: false, headers: { 'x-pw-encoding': encoding } }
      );

      // If the backend is waking from suspension the first call may time out.
      // Retry once after a short pause so the user never sees a dead-end error.
      let challengeResponse;
      try {
        challengeResponse = await doChallenge(passwordPayload, pwEncoding);
      } catch (err: any) {
        if (err?.code === 'TIMEOUT_ERROR') {
          await new Promise(resolve => setTimeout(resolve, 3000));
          challengeResponse = await doChallenge(passwordPayload, pwEncoding);
        } else {
          throw err;
        }
      }

      // If SHA-256 challenge failed (INVALID_CREDENTIALS) and we tried the hashed form,
      // fall back to the plain password so legacy/Supabase-managed accounts still work.
      if ((!challengeResponse?.success || !challengeResponse?.data?.code) && pwEncoding === 'sha256') {
        try {
          challengeResponse = await doChallenge(credentials.password, 'plain');
        } catch (fallbackErr: any) {
          if (fallbackErr?.code === 'TIMEOUT_ERROR') {
            await new Promise(resolve => setTimeout(resolve, 3000));
            challengeResponse = await doChallenge(credentials.password, 'plain');
          } else {
            throw fallbackErr;
          }
        }
      }

      if (!challengeResponse.success || !challengeResponse.data?.code) {
        throw new Error(challengeResponse.message || 'Verification challenge failed.');
      }

      return apiClient.post('/auth/login', {
        email: credentials.email,
        challengeCode: challengeResponse.data.code,
      }, {
        showSuccessToast: true,
        successMessage: 'Login successful',
      });
    },

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

    refreshToken: (refreshToken: string) =>
      apiClient.post('/auth/refresh', undefined, {
        headers: {
          'x-refresh-token': refreshToken,
        },
      }),

    verifyEmail: (token: string) =>
      apiClient.post('/auth/verify-email', { token }),

    resetPassword: (email: string) =>
      apiClient.post('/auth/reset-password', { email }),

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
