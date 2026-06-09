import {
  buildApiUrl,
  clearOptionalBackendUnavailable,
  getApiBaseCandidates,
  getConfiguredApiBase,
  markOptionalBackendUnavailable,
  shouldRetryWithLocalApiFallback,
} from '@/lib/apiBase';
import { TokenManager } from '@/lib/api';
import supabase from '@/utils/supabase/client';
import CryptoJS from 'crypto-js';

export interface PinStatus {
  success: boolean;
  message: string;
  expiresAt?: string;
  attemptsRemaining?: number;
  lockedUntil?: string;
  backup?: string;
  statusCode?: number;
  hasBackup?: boolean;
}

export interface PinVerifyRequest {
  pin: string;
  deviceId?: string;
}

const PIN_NOT_SET_MESSAGE = /pin not set|no pin key backup found/i;
const PIN_SERVICE_FAILURE_MESSAGE = /(internal server error|http 5\d\d|network error|failed to fetch|request timeout|pin request failed)/i;
const PIN_STATUS_CACHE_TTL_MS = 5_000;
const PIN_STATUS_RATE_LIMIT_BACKOFF_MS = 30_000;

let cachedPinStatus: { value: PinStatus; expiresAt: number } | null = null;
let pinStatusInFlight: Promise<PinStatus> | null = null;
let keyBackupInFlight: Promise<PinStatus> | null = null;

const clearCachedPinStatus = () => {
  cachedPinStatus = null;
};

export const isPinMissing = (status?: PinStatus | null): boolean => {
  if (!status || status.success) {
    return false;
  }

  if (status.statusCode === 404) {
    return true;
  }

  return PIN_NOT_SET_MESSAGE.test(status.message);
};

export const isPinServiceUnavailable = (status?: PinStatus | null): boolean => {
  if (!status || status.success) {
    return false;
  }

  if (typeof status.statusCode === 'number') {
    return status.statusCode >= 500;
  }

  return PIN_SERVICE_FAILURE_MESSAGE.test(status.message);
};

class PinService {
  private readonly API_URL = getConfiguredApiBase();
  private readonly PIN_SETUP_KEY = 'pin_setup_completed';
  private readonly PIN_CREATED_KEY = 'pin_created';
  private readonly PIN_EXPIRES_KEY = 'pin_expires_at';
  private readonly PIN_VERIFIED_KEY = 'pin_verified';
  private readonly PIN_VERIFIED_AT_KEY = 'pin_verified_at';
  private readonly PIN_PENDING_SERVER_SYNC_KEY = 'pin_pending_server_sync';

  private async getAuthToken(): Promise<string | null> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        return session.access_token;
      }
    } catch {
      // Fall back to locally stored tokens.
    }

    return TokenManager.getAccessToken();
  }

  private async getAuthHeaders(securityToken?: string): Promise<HeadersInit> {
    const token = await this.getAuthToken();
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(securityToken ? { 'X-Security-Token': securityToken } : {}),
    };
  }

  private async parseResponse(response: Response): Promise<PinStatus> {
    let payload: any = null;

    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    const message =
      payload?.message ||
      payload?.error ||
      (response.ok ? 'Request completed successfully' : `HTTP ${response.status}: ${response.statusText}`);

    return {
      success: Boolean(payload?.success ?? response.ok),
      message,
      expiresAt: payload?.expiresAt,
      attemptsRemaining: payload?.attemptsRemaining,
      lockedUntil: payload?.lockedUntil,
      backup: payload?.backup,
      statusCode: response.status,
    };
  }

  private async get(path: string): Promise<PinStatus> {
    const headers = await this.getAuthHeaders();
    if (!('Authorization' in headers)) {
      return {
        success: false,
        message: 'Session expired. Please sign in again.',
      };
    }

    try {
      const apiBases = getApiBaseCandidates(this.API_URL);

      for (let index = 0; index < apiBases.length; index += 1) {
        const apiBase = apiBases[index];
        try {
          const response = await fetch(buildApiUrl(apiBase, `/pin/${path}`), {
            method: 'GET',
            headers,
          });

          if (!response.ok && index < apiBases.length - 1 && shouldRetryWithLocalApiFallback(response.status)) {
            markOptionalBackendUnavailable(apiBase);
            console.warn('PIN GET failed on configured API base, retrying local API fallback.', {
              apiBase,
              path,
              status: response.status,
            });
            continue;
          }

          clearOptionalBackendUnavailable();
          return await this.parseResponse(response);
        } catch (error) {
          if (shouldRetryWithLocalApiFallback(undefined, error)) {
            markOptionalBackendUnavailable(apiBase);
          }

          if (index < apiBases.length - 1 && shouldRetryWithLocalApiFallback(undefined, error)) {
            console.warn('PIN GET failed on configured API base, retrying local API fallback.', {
              apiBase,
              path,
              error: error instanceof Error ? error.message : String(error),
            });
            continue;
          }

          throw error;
        }
      }

      return {
        success: false,
        message: 'PIN request failed',
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Network error while contacting PIN service',
      };
    }
  }

  private persistPinState(result: PinStatus, markSetup = false): void {
    if (!result.success) {
      return;
    }

    if (markSetup) {
      localStorage.setItem(this.PIN_SETUP_KEY, 'true');
      localStorage.setItem(this.PIN_CREATED_KEY, 'true');
    }

    if (result.expiresAt) {
      localStorage.setItem(this.PIN_EXPIRES_KEY, result.expiresAt);
    }

    this.clearPendingServerSync();
  }

  private async post(path: string, body: object, securityToken?: string): Promise<PinStatus> {
    const headers = await this.getAuthHeaders(securityToken);
    if (!('Authorization' in headers)) {
      return {
        success: false,
        message: 'Session expired. Please sign in again.',
      };
    }

    try {
      const apiBases = getApiBaseCandidates(this.API_URL);

      for (let index = 0; index < apiBases.length; index += 1) {
        const apiBase = apiBases[index];
        try {
          const response = await fetch(buildApiUrl(apiBase, `/pin/${path}`), {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
          });

          if (!response.ok && index < apiBases.length - 1 && shouldRetryWithLocalApiFallback(response.status)) {
            markOptionalBackendUnavailable(apiBase);
            console.warn('PIN POST failed on configured API base, retrying local API fallback.', {
              apiBase,
              path,
              status: response.status,
            });
            continue;
          }

          clearOptionalBackendUnavailable();
          return await this.parseResponse(response);
        } catch (error) {
          if (shouldRetryWithLocalApiFallback(undefined, error)) {
            markOptionalBackendUnavailable(apiBase);
          }

          if (index < apiBases.length - 1 && shouldRetryWithLocalApiFallback(undefined, error)) {
            console.warn('PIN POST failed on configured API base, retrying local API fallback.', {
              apiBase,
              path,
              error: error instanceof Error ? error.message : String(error),
            });
            continue;
          }

          throw error;
        }
      }

      return {
        success: false,
        message: 'PIN request failed',
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Network error while contacting PIN service',
      };
    }
  }

  private async delete(path: string, securityToken?: string): Promise<PinStatus> {
    const headers = await this.getAuthHeaders(securityToken);
    if (!('Authorization' in headers)) {
      return {
        success: false,
        message: 'Session expired. Please sign in again.',
      };
    }

    try {
      const apiBases = getApiBaseCandidates(this.API_URL);

      for (let index = 0; index < apiBases.length; index += 1) {
        const apiBase = apiBases[index];
        try {
          const response = await fetch(buildApiUrl(apiBase, `/pin/${path}`), {
            method: 'DELETE',
            headers,
          });

          if (!response.ok && index < apiBases.length - 1 && shouldRetryWithLocalApiFallback(response.status)) {
            markOptionalBackendUnavailable(apiBase);
            console.warn('PIN DELETE failed on configured API base, retrying local API fallback.', {
              apiBase,
              path,
              status: response.status,
            });
            continue;
          }

          clearOptionalBackendUnavailable();
          return await this.parseResponse(response);
        } catch (error) {
          if (shouldRetryWithLocalApiFallback(undefined, error)) {
            markOptionalBackendUnavailable(apiBase);
          }

          if (index < apiBases.length - 1 && shouldRetryWithLocalApiFallback(undefined, error)) {
            console.warn('PIN DELETE failed on configured API base, retrying local API fallback.', {
              apiBase,
              path,
              error: error instanceof Error ? error.message : String(error),
            });
            continue;
          }

          throw error;
        }
      }

      return {
        success: false,
        message: 'PIN request failed',
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Network error while contacting PIN service',
      };
    }
  }

  /**
   * Create a new PIN for the user
   */
  async createPin(pin: string): Promise<PinStatus> {
    clearCachedPinStatus();
    const hashedPin = CryptoJS.SHA256(pin).toString();
    const result = await this.post('create', { pin: hashedPin });
    this.persistPinState(result, true);
    return result;
  }

  /**
   * Verify a PIN
   */
  async verifyPin(request: PinVerifyRequest): Promise<PinStatus> {
    clearCachedPinStatus();
    const hashedPin = CryptoJS.SHA256(request.pin).toString();
    const result = await this.post('verify', { ...request, pin: hashedPin });

    if (result.success) {
      this.persistPinState(result, true);
      localStorage.setItem(this.PIN_VERIFIED_KEY, 'true');
      localStorage.setItem(this.PIN_VERIFIED_AT_KEY, new Date().toISOString());
    } else {
      this.clearPinVerification();
    }

    return result;
  }

  /**
   * Update an existing PIN
   */
  async updatePin(currentPin: string, newPin: string, securityToken?: string): Promise<PinStatus> {
    clearCachedPinStatus();
    const hashedCurrent = CryptoJS.SHA256(currentPin).toString();
    const hashedNew = CryptoJS.SHA256(newPin).toString();
    const result = await this.post('update', { currentPin: hashedCurrent, newPin: hashedNew }, securityToken);
    if (result.success) {
      this.persistPinState(result, true);
      this.clearPinVerification();
    }
    return result;
  }

  /**
   * Request a security token via biometric/OTP verification
   */
  async verifySecurity(): Promise<{ success: boolean; securityToken?: string; message?: string }> {
    try {
      const response = await this.post('verify-security', {});
      if (response.success && (response as any).securityToken) {
        return { 
          success: true, 
          securityToken: (response as any).securityToken 
        };
      }
      return { 
        success: false, 
        message: response.message || 'Security verification failed' 
      };
    } catch (error) {
      return { 
        success: false, 
        message: error instanceof Error ? error.message : 'Security verification failed' 
      };
    }
  }

  async getStatus(): Promise<PinStatus> {
    if (cachedPinStatus && cachedPinStatus.expiresAt > Date.now()) {
      return cachedPinStatus.value;
    }

    if (pinStatusInFlight) {
      return pinStatusInFlight;
    }

    pinStatusInFlight = (async () => {
      const result = await this.get('status');

      if (result.statusCode === 429) {
        markOptionalBackendUnavailable(this.API_URL, PIN_STATUS_RATE_LIMIT_BACKOFF_MS);
      }

      this.persistPinState(result, result.success);
      cachedPinStatus = {
        value: result,
        expiresAt: Date.now() + PIN_STATUS_CACHE_TTL_MS,
      };
      return result;
    })();

    try {
      return await pinStatusInFlight;
    } finally {
      pinStatusInFlight = null;
    }
  }

  async getKeyBackup(): Promise<PinStatus> {
    try {
      const status = await this.getStatus();
      if (!status.success || !status.hasBackup) {
        return {
          success: false,
          message: 'No PIN key backup found',
          statusCode: 404,
        };
      }
    } catch {
      // Degrade gracefully, fallback to GET if getStatus fails
    }

    if (keyBackupInFlight) {
      return keyBackupInFlight;
    }

    keyBackupInFlight = this.get('key-backup');

    try {
      return await keyBackupInFlight;
    } finally {
      keyBackupInFlight = null;
    }
  }

  async saveKeyBackup(backup: string, securityToken?: string): Promise<PinStatus> {
    clearCachedPinStatus();
    return this.post('key-backup', { backup }, securityToken);
  }

  async clearKeyBackup(securityToken?: string): Promise<PinStatus> {
    clearCachedPinStatus();
    return this.delete('key-backup', securityToken);
  }

  async resetCurrentUserPin(securityToken?: string): Promise<PinStatus> {
    clearCachedPinStatus();
    const result = await this.post('self-reset', {}, securityToken);
    if (result.success) {
      this.clearPinData();
    }
    return result;
  }

  markPinCreatedLocally(expiresAt?: string): void {
    this.persistPinState({
      success: true,
      message: 'PIN created locally',
      expiresAt,
    }, true);
  }

  markPinVerifiedLocally(): void {
    localStorage.setItem(this.PIN_VERIFIED_KEY, 'true');
    localStorage.setItem(this.PIN_VERIFIED_AT_KEY, new Date().toISOString());
  }

  markPendingServerSync(): void {
    localStorage.setItem(this.PIN_PENDING_SERVER_SYNC_KEY, 'true');
  }

  hasPendingServerSync(): boolean {
    return localStorage.getItem(this.PIN_PENDING_SERVER_SYNC_KEY) === 'true';
  }

  clearPendingServerSync(): void {
    localStorage.removeItem(this.PIN_PENDING_SERVER_SYNC_KEY);
  }

  /**
   * Validate PIN format
   */
  validatePinFormat(pin: string): boolean {
    return /^\d{6}$/.test(pin);
  }

  /**
   * Check if PIN is weak (sequential, repeating, or common patterns)
   */
  isWeakPin(pin: string): boolean {
    // Sequential ascending/descending
    const isSequential = /012|123|234|345|456|567|678|789/.test(pin) || /987|876|765|654|543|432|321|210/.test(pin);
    // Repeating characters (e.g. 111111, 222222)
    const isRepeating = /(.)\1{2,}/.test(pin);
    // Common patterns
    const isPattern = /^(121212|101010|010101|212121|112233|223344)$/.test(pin);
    
    return isSequential || isRepeating || isPattern;
  }

  /**
   * Generate a random PIN
   */
  generateRandomPin(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Clear all PIN data
   */
  clearPinData(): void {
    clearCachedPinStatus();
    localStorage.removeItem(this.PIN_SETUP_KEY);
    localStorage.removeItem(this.PIN_CREATED_KEY);
    localStorage.removeItem(this.PIN_EXPIRES_KEY);
    this.clearPendingServerSync();
    this.clearPinVerification();
  }

  /**
   * Check if user has a PIN
   */
  hasPin(): boolean {
    return localStorage.getItem(this.PIN_SETUP_KEY) === 'true' || localStorage.getItem(this.PIN_CREATED_KEY) === 'true';
  }

  /**
   * Check if PIN is verified
   */
  isPinVerified(): boolean {
    return localStorage.getItem(this.PIN_VERIFIED_KEY) === 'true';
  }

  /**
   * Clear PIN verification status
   */
  clearPinVerification(): void {
    localStorage.removeItem(this.PIN_VERIFIED_KEY);
    localStorage.removeItem(this.PIN_VERIFIED_AT_KEY);
  }
}

export const pinService = new PinService();
