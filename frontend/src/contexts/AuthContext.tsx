import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import supabase from '@/utils/supabase/client';
import { UserRole } from '@/lib/featureFlags';
import { permissionService } from '@/services/permissionService';
import { db } from '@/lib/database';
import { resolveAvatarSelection } from '@/lib/avatar-gallery';
import { api, TokenManager } from '@/lib/api';
import { clearSecurityData } from '@/lib/encryption';
import {
  handleLogout as handleBackendLogout,
  initializeBackendSync,
  runWithCloudSyncSuppressed,
  subscribeToUserCloudSync,
  syncUserDataFromCloud,
} from '@/lib/auth-sync-integration';
import { backendService } from '@/lib/backend-api';
import { shouldSkipOptionalBackendRequests } from '@/lib/apiBase';
import { pinService } from '@/services/pinService';
import socketClient from '@/lib/socket-client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  role: UserRole;
  dataReady: boolean;
  dataSyncing: boolean;
  dataSyncError: string | null;
  triggerDataSync: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

type LocalProfile = {
  displayName?: string;
  firstName?: string;
  lastName?: string;
  mobile?: string;
  gender?: string;
  dateOfBirth?: string;
  jobType?: string;
  salary?: string | number;
  monthlyIncome?: number;
  profilePhoto?: string;
  avatarUrl?: string;
  avatarId?: string;
  country?: string;
  state?: string;
  city?: string;
  language?: string;
  currency?: string;
  createdAt?: string;
  updatedAt?: string;
  role?: string;
};

type RemoteProfileSnapshot = {
  displayName: string;
  firstName: string;
  lastName: string;
  phone: string;
  gender: string;
  dateOfBirth: string;
  jobType: string;
  monthlyIncome: number;
  annualIncome: number;
  avatarUrl: string | null;
  avatarId: string | null;
  country: string;
  state: string;
  city: string;
  updatedAt: string | null;
  role: string;
  hasRealProfile: boolean;
  currency: string;
  language: string;
};

const PROFILE_SYNC_COOLDOWN_MS = 60_000;
const profileSyncInFlight = new Map<string, Promise<void>>();
const profileSyncCooldownUntil = new Map<string, number>();
const profileSyncLastPayload = new Map<string, string>();

const parseNumber = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const readLocalProfile = (): LocalProfile | null => {
  try {
    const raw = localStorage.getItem('user_profile');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as LocalProfile) : null;
  } catch {
    return null;
  }
};

const getLocalProfileUpdatedAt = (profile: LocalProfile | null): string | null => {
  return (
    profile?.updatedAt ||
    localStorage.getItem('profile_updated_at') ||
    profile?.createdAt ||
    localStorage.getItem('user_setup_date') ||
    localStorage.getItem('onboarding_date')
  );
};

const hasPendingLocalProfileSync = (): boolean =>
  localStorage.getItem('profile_sync_pending') === 'true';

const toEpoch = (value?: string | null): number | null => {
  if (!value) return null;
  const ts = Date.parse(value);
  return Number.isNaN(ts) ? null : ts;
};

const isAfter = (left?: string | null, right?: string | null): boolean => {
  const l = toEpoch(left);
  const r = toEpoch(right);
  if (l === null || r === null) return false;
  return l > r;
};

const hasLocalProfileData = (profile: LocalProfile | null): boolean => {
  if (!profile) return false;
  return Boolean(
    profile.displayName ||
    profile.firstName ||
    profile.lastName ||
    profile.mobile ||
    profile.gender ||
    profile.dateOfBirth ||
    profile.jobType ||
    profile.salary ||
    profile.monthlyIncome ||
    profile.profilePhoto ||
    profile.avatarUrl ||
    profile.avatarId ||
    profile.country ||
    profile.state ||
    profile.city
  );
};

const normalizeRemoteProfile = (profile: any): RemoteProfileSnapshot => {
  const firstName = String(profile?.first_name ?? profile?.firstName ?? '').trim();
  const lastName = String(profile?.last_name ?? profile?.lastName ?? '').trim();
  const displayName = String(
    profile?.full_name
    ?? profile?.fullName
    ?? profile?.name
    ?? `${firstName} ${lastName}`.trim()
    ?? '',
  ).trim();
  const phone = String(profile?.phone ?? profile?.mobile ?? '').trim();
  const gender = String(profile?.gender ?? '').trim();
  const dateOfBirth = String(profile?.date_of_birth ?? profile?.dateOfBirth ?? '').trim();
  const jobType = String(profile?.job_type ?? profile?.jobType ?? '').trim();
  const monthlyIncome = parseNumber(profile?.monthly_income ?? profile?.monthlyIncome) ?? 0;
  const annualIncome = parseNumber(profile?.annual_income ?? profile?.salary) ?? (monthlyIncome > 0 ? Math.round(monthlyIncome * 12) : 0);
  const avatarUrl = profile?.avatar_url ?? profile?.avatarUrl ?? null;
  const avatarId = profile?.avatar_id ?? profile?.avatarId ?? null;
  const country = String(profile?.country ?? '').trim();
  const state = String(profile?.state ?? '').trim();
  const city = String(profile?.city ?? '').trim();
  const updatedAt = profile?.updated_at ?? profile?.updatedAt ?? null;
  const role = String(profile?.role ?? '').trim().toLowerCase();
  const currency = String(profile?.currency ?? 'USD').trim();
  const language = String(profile?.language ?? 'en').trim();

  return {
    displayName,
    firstName,
    lastName,
    phone,
    gender,
    dateOfBirth,
    jobType,
    monthlyIncome,
    annualIncome,
    avatarUrl,
    avatarId,
    country,
    state,
    city,
    updatedAt,
    role,
    currency,
    language,
    hasRealProfile: Boolean(
      displayName ||
      firstName ||
      lastName ||
      phone ||
      gender ||
      dateOfBirth ||
      jobType ||
      monthlyIncome ||
      annualIncome ||
      avatarUrl ||
      avatarId ||
      country ||
      state ||
      city
    ),
  };
};

const decodeJwt = (token: string): any => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1];
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decoded);
  } catch (err) {
    console.error('Failed to decode JWT:', err);
    return null;
  }
};

const getRoleFromEmail = (email?: string | null): UserRole | null => {
  if (!email) return null;
  const cleanEmail = email.trim().toLowerCase();
  
  if (
    cleanEmail === 'admin@kanku.com' ||
    cleanEmail === 'superadmin@kanku.com' ||
    cleanEmail === 'admin@example.com' ||
    cleanEmail.startsWith('admin@') ||
    cleanEmail.startsWith('superadmin@') ||
    cleanEmail.includes('admin')
  ) {
    return 'admin';
  }
  
  if (
    cleanEmail === 'manager@kanku.com' ||
    cleanEmail.startsWith('manager@') ||
    cleanEmail.includes('manager')
  ) {
    return 'manager';
  }
  
  if (
    cleanEmail === 'advisor@kanku.com' ||
    cleanEmail === 'advisore@kanku.com' ||
    cleanEmail.startsWith('advisor@') ||
    cleanEmail.includes('advisor')
  ) {
    return 'advisor';
  }
  
  if (
    cleanEmail === 'user@kanku.com' ||
    cleanEmail.startsWith('user@') ||
    cleanEmail.includes('user')
  ) {
    return 'user';
  }
  
  return null;
};

/**
 * Start from a non-privileged role locally. Profile-based permissions are
 * fetched separately so admin/advisor capabilities come from backend-backed
 * profile data instead of client-visible auth metadata.
 */
const resolveUserRole = (_user: User | null): UserRole => {
  if (!_user) return 'user';

  // 1. Try to get role from email (immediate fallback to prevent lockout when localProfile is loading/empty)
  if (_user.email) {
    const roleFromEmail = getRoleFromEmail(_user.email);
    if (roleFromEmail) return roleFromEmail;
  }

  // 2. Check metadata
  if (_user.user_metadata?.role) {
    const metadataRole = String(_user.user_metadata.role).trim().toLowerCase();
    if (['admin', 'manager', 'advisor', 'user'].includes(metadataRole)) {
      return metadataRole as UserRole;
    }
  }

  // 3. Fallback to local profile
  const localProfile = readLocalProfile();
  if (localProfile?.role) {
    const normalizedRole = String(localProfile.role).trim().toLowerCase();
    return (['admin', 'manager', 'advisor', 'user'].includes(normalizedRole))
      ? normalizedRole as UserRole
      : 'user';
  }
  return 'user';
};

/** Clear all user data from the local IndexedDB to ensure data isolation between accounts */
const clearLocalUserData = async () => {
  try {
    await runWithCloudSyncSuppressed(async () => {
      await Promise.all([
        db.accounts.clear(),
        db.transactions.clear(),
        db.loans.clear(),
        db.goals.clear(),
        db.investments.clear(),
        db.notifications.clear(),
        db.groupExpenses.clear(),
        db.friends.clear(),
        db.merchantProfiles.clear(),
        db.userCategoryPreferences.clear(),
        db.documents.clear(),
        db.smsTransactions.clear(),
      ]);
    });
  } catch (err) {
    console.error('Failed to clear local DB on login:', err);
  }
};

const clearLocalAuthPresentationState = (preservePinKeys = false) => {
  [
    'onboarding_completed',
    'profile_updated_at',
    'profile_sync_pending',
    'user_profile',
    'user_settings',
    'user_setup_date',
    'onboarding_date',
    'onboarding_refresh_timestamp',
    'auth_flow_step',
    'pending_auth_email',
    'user_email',
    'user_name',
    'pin_created_at',
    'pin_expiry',
  ].forEach((key) => localStorage.removeItem(key));

  if (!preservePinKeys) {
    pinService.clearPinData();
    clearSecurityData();
  }
};

const fetchWithTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      const timeoutError = new Error(`Supabase sync timeout after ${ms}ms`);
      (timeoutError as any).name = 'TimeoutError';
      (timeoutError as any).timeoutMs = ms;
      setTimeout(() => reject(timeoutError), ms);
    })
  ]);
};

const formatSupabaseError = (error: any) => {
  if (!error) return 'unknown error';
  const parts: string[] = [];

  if (error.name) parts.push(`name=${error.name}`);
  if (error.message) parts.push(`message=${error.message}`);
  if (error.code) parts.push(`code=${error.code}`);
  if (error.status) parts.push(`status=${error.status}`);
  if (error.details) parts.push(`details=${error.details}`);
  if (error.hint) parts.push(`hint=${error.hint}`);

  return parts.length > 0 ? parts.join(', ') : 'unknown error';
};

const isTimeoutError = (error: any) =>
  error?.name === 'TimeoutError' ||
  (error?.message && String(error.message).toLowerCase().includes('timeout'));

const syncProfileFromBackend = async (user: User) => {
  const cooldownUntil = profileSyncCooldownUntil.get(user.id) ?? 0;
  if (cooldownUntil > Date.now()) {
    return;
  }

  const existingSync = profileSyncInFlight.get(user.id);
  if (existingSync) {
    await existingSync;
    return;
  }

  const run = async () => {
    // SECURITY FIX (Bug #1): Route through backend API instead of direct Supabase call
    let profile: any = null;
    try {
      const response = await api.auth.getProfile();
      profile = response.success ? response.data : null;
    } catch (err) {
      console.warn('Failed to fetch profile from backend:', err);
    }

    const remoteProfile = normalizeRemoteProfile(profile);

    let localProfile = readLocalProfile();
    const localUpdatedAt = getLocalProfileUpdatedAt(localProfile);

    if (localProfile) {
      const resolvedAvatar = resolveAvatarSelection({
        avatarId: localProfile.avatarId,
        avatarUrl: localProfile.profilePhoto || localProfile.avatarUrl || null,
      });
      if (
        resolvedAvatar.url !== localProfile.profilePhoto ||
        resolvedAvatar.url !== localProfile.avatarUrl ||
        resolvedAvatar.id !== localProfile.avatarId
      ) {
        const patched = {
          ...localProfile,
          profilePhoto: resolvedAvatar.url,
          avatarUrl: resolvedAvatar.url,
          avatarId: resolvedAvatar.id,
        };
        localStorage.setItem('user_profile', JSON.stringify(patched));
        localProfile = patched;
      }
    }

    const pendingLocalSync = hasPendingLocalProfileSync();

    const remoteUpdatedAt = remoteProfile.updatedAt;
    const remoteIsNewer = !!(remoteUpdatedAt && localUpdatedAt && isAfter(remoteUpdatedAt, localUpdatedAt));

    const writeLocalFromRemote = () => {
      const remoteFirstName = remoteProfile.firstName;
      const remoteLastName = remoteProfile.lastName;
      const remoteFullName = remoteProfile.displayName || `${remoteFirstName} ${remoteLastName}`.trim();
      const fallbackDisplayName = localProfile?.displayName ||
        `${localProfile?.firstName || ''} ${localProfile?.lastName || ''}`.trim();
      const displayName = remoteFullName || fallbackDisplayName;
      const nameParts = displayName.split(/\s+/).filter(Boolean);
      const firstName = remoteFirstName || localProfile?.firstName || nameParts[0] || '';
      const lastName = remoteLastName || localProfile?.lastName || nameParts.slice(1).join(' ') || '';
      const monthlyIncome = remoteProfile.monthlyIncome || (remoteProfile.annualIncome ? Math.round(remoteProfile.annualIncome / 12) : 0);
      const updatedAt = remoteUpdatedAt || new Date().toISOString();
      const resolvedAvatar = resolveAvatarSelection({
        avatarUrl: remoteProfile.avatarUrl,
        avatarId: remoteProfile.avatarId,
      });

      localStorage.setItem('onboarding_completed', 'true');
      localStorage.setItem('profile_updated_at', updatedAt);
      localStorage.setItem('user_profile', JSON.stringify({
        ...localProfile,
        displayName,
        firstName,
        lastName,
        mobile: remoteProfile.phone || '',
        gender: remoteProfile.gender || '',
        dateOfBirth: remoteProfile.dateOfBirth || '',
        jobType: remoteProfile.jobType || '',
        salary: ((remoteProfile.annualIncome || (monthlyIncome * 12)) || 0).toString(),
        monthlyIncome,
        profilePhoto: resolvedAvatar.url,
        avatarUrl: resolvedAvatar.url,
        avatarId: resolvedAvatar.id,
        country: remoteProfile.country || localProfile?.country || '',
        state: remoteProfile.state || localProfile?.state || '',
        city: remoteProfile.city || localProfile?.city || '',
        role: remoteProfile.role || localProfile?.role || 'user',
        currency: remoteProfile.currency,
        language: remoteProfile.language,
        updatedAt,
      }));

      if (remoteProfile.currency) {
        localStorage.setItem('currency', remoteProfile.currency);
      }
      if (remoteProfile.language) {
        localStorage.setItem('language', remoteProfile.language);
      }
      const existingSettingsRaw = localStorage.getItem('user_settings');
      let existingSettings = {};
      try {
        existingSettings = existingSettingsRaw ? JSON.parse(existingSettingsRaw) : {};
      } catch {}
      localStorage.setItem('user_settings', JSON.stringify({
        ...existingSettings,
        currency: remoteProfile.currency,
        defaultCurrency: remoteProfile.currency,
        language: remoteProfile.language,
      }));

      window.dispatchEvent(new CustomEvent('APP_SETTINGS_UPDATED', {
        detail: {
          currency: remoteProfile.currency,
          language: remoteProfile.language,
        }
      }));
    };

    if (remoteProfile.hasRealProfile) {
      const shouldUseRemote =
        (!pendingLocalSync &&
          (!localUpdatedAt || (remoteUpdatedAt && !isAfter(localUpdatedAt, remoteUpdatedAt)))) ||
        (pendingLocalSync && remoteIsNewer);

      if (shouldUseRemote) {
        writeLocalFromRemote();
        localStorage.removeItem('profile_sync_pending');
        return;
      }
    }

    if (!hasLocalProfileData(localProfile)) {
      return;
    }

    const displayName = (localProfile?.displayName || `${localProfile?.firstName || ''} ${localProfile?.lastName || ''}`.trim()).trim();
    const nameParts = displayName.split(/\s+/).filter(Boolean);
    const firstName = localProfile?.firstName || nameParts[0] || '';
    const lastName = localProfile?.lastName || nameParts.slice(1).join(' ') || '';
    const salaryNumber = parseNumber(localProfile?.salary);
    let monthlyIncome = parseNumber(localProfile?.monthlyIncome);
    if (monthlyIncome === undefined && salaryNumber !== undefined) {
      monthlyIncome = Math.round(salaryNumber / 12);
    }
    const annualIncome = salaryNumber ?? (monthlyIncome !== undefined ? Math.round(monthlyIncome * 12) : undefined);
    const resolvedAvatar = resolveAvatarSelection({
      avatarId: localProfile?.avatarId || null,
      avatarUrl: localProfile?.profilePhoto || localProfile?.avatarUrl || null,
    });

    const profilePayload = {
      full_name: displayName || null,
      first_name: firstName || null,
      last_name: lastName || null,
      phone: localProfile?.mobile || null,
      gender: localProfile?.gender || null,
      country: localProfile?.country || null,
      state: localProfile?.state || null,
      city: localProfile?.city || null,
      date_of_birth: localProfile?.dateOfBirth || null,
      job_type: localProfile?.jobType || null,
      monthly_income: monthlyIncome ?? null,
      annual_income: annualIncome ?? null,
      avatar_url: resolvedAvatar.url,
    };

    const payloadKey = JSON.stringify(profilePayload);
    if (profileSyncLastPayload.get(user.id) === payloadKey && pendingLocalSync) {
      return;
    }

    try {
      const response = await api.auth.updateProfile(profilePayload);

      if (response.success) {
        profileSyncLastPayload.set(user.id, payloadKey);
        localStorage.setItem('onboarding_completed', 'true');
        localStorage.setItem('profile_updated_at', new Date().toISOString());
        localStorage.removeItem('profile_sync_pending');
        profileSyncCooldownUntil.delete(user.id);
      } else {
        console.warn('Profile sync to backend failed (local cache retained):', response.message);
        localStorage.setItem('profile_sync_pending', 'true');
      }
    } catch (error: any) {
      if (typeof error?.status === 'number' && error.status === 429) {
        profileSyncCooldownUntil.set(user.id, Date.now() + PROFILE_SYNC_COOLDOWN_MS);
      }
      console.warn('Local profile sync to backend failed (non-blocking):', error);
      localStorage.setItem('profile_sync_pending', 'true');
    }
  };

  const promise = run().finally(() => {
    profileSyncInFlight.delete(user.id);
  });
  profileSyncInFlight.set(user.id, promise);
  await promise;
};

/** Sync user data from Supabase into local Dexie DB on login */
const syncFromSupabase = async (user: User) => {
  try {
    if (shouldSkipOptionalBackendRequests()) {
      await syncProfileFromBackend(user);
      return;
    }

    const timeouts = [12000, 30000];
    let lastError: any = null;

    for (let attempt = 0; attempt < timeouts.length; attempt += 1) {
      try {
        await fetchWithTimeout(Promise.all([
          syncUserDataFromCloud(user.id),
          syncProfileFromBackend(user),
        ]), timeouts[attempt]);
        return;
      } catch (err) {
        lastError = err;
        if (isTimeoutError(err) && shouldSkipOptionalBackendRequests()) {
          console.info(`Supabase sync skipped while backend is in degraded mode after ${timeouts[attempt]}ms.`);
          return;
        }
        if (isTimeoutError(err) && attempt < timeouts.length - 1) {
          console.info(`Supabase sync timed out after ${timeouts[attempt]}ms. Retrying...`);
          continue;
        }
        throw err;
      }
    }

    if (lastError) {
      throw lastError;
    }
  } catch (err) {
    // Non-blocking - app works offline with local DB data
    const errorDetails = formatSupabaseError(err);
    if (isNetworkError(err)) {
      // Supabase project is paused or unreachable - expected in offline/dev mode
      console.info(` Supabase unreachable - running on local data. (${errorDetails})`);
    } else {
      console.error('Supabase sync on login failed (non-blocking):', errorDetails, err);
    }
  }
};

/** Returns true if an error is a network/timeout fault (Supabase unreachable) */
const isNetworkError = (error: any): boolean =>
  error?.name === 'AbortError' ||
  (error?.message && (
    error.message === 'Timeout' ||
    error.message.includes('signal is aborted') ||
    error.message.toLowerCase().includes('failed to fetch') ||
    error.message.toLowerCase().includes('network') ||
    error.message.toLowerCase().includes('timed out') ||
    error.message.toLowerCase().includes('timeout')
  ));

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<UserRole>('user');
  const [dataReady, setDataReady] = useState(false);
  const [dataSyncing, setDataSyncing] = useState(false);
  const [dataSyncError, setDataSyncError] = useState<string | null>(null);
  const activeSyncUserId = useRef<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    let unsubscribeUserCloudSync: (() => void) | null = null;
    let subscribedUserId: string | null = null;

    initializeBackendSync();

    // Pause/resume auto-refresh based on actual network connectivity.
    const handleOffline = () => {
      supabase.auth.stopAutoRefresh();
      console.info(' Offline - Supabase auto-refresh paused.');
    };

    const handleOnline = async () => {
      console.info(' Online - probing Supabase before resuming auto-refresh...');
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!isMounted) return;

        let activeSession = session;
        let nextUser = session?.user ?? null;

        if (!nextUser) {
          const customToken = TokenManager.getAccessToken();
          if (customToken) {
            const decoded = decodeJwt(customToken);
            if (decoded && decoded.userId) {
              const localProfile = readLocalProfile();
              nextUser = {
                id: decoded.userId,
                email: decoded.email || localProfile?.email || '',
                user_metadata: {
                  role: decoded.role || localProfile?.role || 'user',
                  full_name: localProfile?.displayName || '',
                  firstName: localProfile?.firstName || '',
                  lastName: localProfile?.lastName || '',
                },
                app_metadata: {},
                aud: 'authenticated',
                created_at: new Date().toISOString(),
              } as User;

              activeSession = {
                access_token: customToken,
                refresh_token: TokenManager.getRefreshToken() || '',
                expires_in: 3600,
                token_type: 'bearer',
                user: nextUser,
              } as Session;
            }
          }
        }

        setSession(activeSession);
        setUser(nextUser);
        const provisionalRole = resolveUserRole(nextUser);
        setRole(provisionalRole);
        if (nextUser?.id) {
          activeSyncUserId.current = nextUser.id;
          setDataSyncing(true);
          setDataSyncError(null);
          void (async () => {
            try {
              const permissions = await permissionService.fetchUserPermissions(nextUser.id, provisionalRole);
              if (activeSyncUserId.current === nextUser.id) {
                setRole(permissions.role);
              }

              // If we already have local accounts stored in offline Dexie database, set dataReady immediately
              // to avoid showing a blocking sync screen for a clean, smooth, and immediate load.
              const localAccountsCount = await db.accounts.count().catch(() => 0);
              const hasLocalData = localAccountsCount > 0;
              if (hasLocalData && activeSyncUserId.current === nextUser.id) {
                setDataReady(true);
              }

              await syncFromSupabase(nextUser);
              if (activeSyncUserId.current === nextUser.id) {
                setDataReady(true);
              }
            } catch (err) {
              if (activeSyncUserId.current === nextUser.id) {
                setDataSyncError(formatSupabaseError(err));
                setDataReady(true);
              }
            } finally {
              if (activeSyncUserId.current === nextUser.id) {
                setDataSyncing(false);
              }
            }
          })();
        }
        if (session) {
          supabase.auth.startAutoRefresh();
          console.info(' Supabase reachable - auto-refresh resumed.');
        }
      } catch {
        console.warn('Supabase still unreachable after coming online - keeping auto-refresh paused.');
      }
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    let initialSyncDone = false;

    // Listen for auth changes cleanly. This fires immediately with INITIAL_SESSION, 
    // replacing the need to manually call getSession() and dodging React StrictMode lock races.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event: any, session: any) => {
        if (!isMounted) return;

        let activeSession = session;
        let nextUser = session?.user ?? null;

        // Custom JWT fallback session recovery:
        if (!nextUser) {
          const customToken = TokenManager.getAccessToken();
          if (customToken) {
            try {
              const decoded = decodeJwt(customToken);
              if (decoded && decoded.userId) {
                const localProfile = readLocalProfile();
                nextUser = {
                  id: decoded.userId,
                  email: decoded.email || localProfile?.email || '',
                  user_metadata: {
                    role: decoded.role || localProfile?.role || 'user',
                    full_name: localProfile?.displayName || '',
                    firstName: localProfile?.firstName || '',
                    lastName: localProfile?.lastName || '',
                  },
                  app_metadata: {},
                  aud: 'authenticated',
                  created_at: new Date().toISOString(),
                } as User;

                activeSession = {
                  access_token: customToken,
                  refresh_token: TokenManager.getRefreshToken() || '',
                  expires_in: 3600,
                  token_type: 'bearer',
                  user: nextUser,
                } as Session;

                // Validate the token against the backend in background
                void (async () => {
                  try {
                    const profileResponse = await api.auth.getProfile();
                    if (!profileResponse.success) {
                      console.warn('Backend custom JWT profile verification failed:', profileResponse.message);
                    }
                  } catch (err: any) {
                    if (err?.status === 401) {
                      console.warn('Custom token is unauthorized, performing clean signout.');
                      TokenManager.clearTokens();
                      if (isMounted) {
                        setUser(null);
                        setSession(null);
                        setRole('user');
                      }
                    }
                  }
                })();
              }
            } catch (err) {
              console.warn('Error during custom JWT session recovery:', err);
            }
          }
        }

        setSession(activeSession);
        setUser(nextUser);
        const provisionalRole = resolveUserRole(nextUser);
        setRole(provisionalRole);

        // ── TOKEN_REFRESHED early-return ────────────────────────────────────────
        // Supabase fires this every ~1 hour and on tab-focus restore.
        // We must NOT re-run the full data sync — only rotate the token on
        // active services. All data is already in Dexie; socket reconnects
        // if needed via the connectingPromise guard.
        if (event === 'TOKEN_REFRESHED') {
          if (activeSession?.access_token) {
            backendService.setToken(activeSession.access_token);
            const deviceId = localStorage.getItem('device_id') || '';
            if (deviceId) {
              // Re-auth the existing socket with the new token (non-blocking)
              socketClient.connect(activeSession.access_token, deviceId).catch(() => {});
            }
          }
          if (isMounted) setLoading(false);
          return; // ← skip ALL data sync, permission refetch, and re-renders
        }
        // ────────────────────────────────────────────────────────────────────────

        // PERSISTENCE FIX: Sync token to backend service for authenticated requests
        if (activeSession?.access_token) {
          backendService.setToken(activeSession.access_token);

          // Connect WebSocket so this client receives real-time broadcasts (e.g. feature flag updates)
          const deviceId = localStorage.getItem('device_id') || (() => {
            const id = crypto.randomUUID();
            localStorage.setItem('device_id', id);
            return id;
          })();
          socketClient.connect(activeSession.access_token, deviceId).catch((err) => {
            // Non-blocking — app works fine without the socket
            console.warn('[AuthContext] Socket connection failed (non-blocking):', err);
          });
        } else if (event === 'SIGNED_OUT') {
          backendService.clearToken();
          socketClient.disconnect();
          TokenManager.clearTokens();
        }

        try {
          if (nextUser?.id) {
            if (!unsubscribeUserCloudSync || subscribedUserId !== nextUser.id) {
              if (unsubscribeUserCloudSync) {
                unsubscribeUserCloudSync();
              }
              unsubscribeUserCloudSync = subscribeToUserCloudSync(nextUser.id);
              subscribedUserId = nextUser.id;
            }

            const _lastUserId = localStorage.getItem('auth_last_user_id');
            const _isUserSwitch = _lastUserId !== null && _lastUserId !== nextUser.id;
            const isFreshLogin = event === 'SIGNED_IN' && (!initialSyncDone || _isUserSwitch);
            const isAppLoad = event === 'INITIAL_SESSION' && !initialSyncDone;

            if (isFreshLogin || isAppLoad) {
              activeSyncUserId.current = nextUser.id;
              setDataReady(false);
              setDataSyncing(true);
              setDataSyncError(null);

              const lastUserId = localStorage.getItem('auth_last_user_id');
              const isUserSwitch = lastUserId && lastUserId !== nextUser.id;

              if (isUserSwitch) {
                // Different user logged in - clear previous user's local data
                await clearLocalUserData();
                clearLocalAuthPresentationState(false);
              }

              // Always record the current user so we can detect future switches
              localStorage.setItem('auth_last_user_id', nextUser.id);

              // UNBLOCK UI INSTANTLY: Set provisional role and loading to false immediately
              if (isMounted) {
                setRole(provisionalRole);
                setLoading(false);
              }

              // Run permissions fetch and heavy cloud sync in the background
              void (async () => {
                try {
                  const permissions = await permissionService.fetchUserPermissions(nextUser.id, provisionalRole);
                  if (activeSyncUserId.current === nextUser.id && isMounted) {
                    setRole(permissions.role);
                  }
                } catch (permError) {
                  console.warn('Background permission fetch failed/timed out, using provisional role:', permError);
                }

                try {
                  // If we already have local accounts stored in offline Dexie database, set dataReady immediately
                  // to avoid showing a blocking sync screen for a clean, smooth, and immediate load.
                  const localAccountsCount = await db.accounts.count().catch(() => 0);
                  const hasLocalData = localAccountsCount > 0;
                  if (hasLocalData && activeSyncUserId.current === nextUser.id && isMounted) {
                    setDataReady(true);
                  }

                  await syncFromSupabase(nextUser);
                  if (activeSyncUserId.current === nextUser.id && isMounted) {
                    setDataReady(true);
                  }
                } catch (syncError) {
                  console.warn('Background sync failed (non-blocking):', syncError);
                  if (activeSyncUserId.current === nextUser.id && isMounted) {
                    setDataSyncError(formatSupabaseError(syncError));
                    setDataReady(true);
                  }
                } finally {
                  if (activeSyncUserId.current === nextUser.id && isMounted) {
                    setDataSyncing(false);
                  }
                  initialSyncDone = true;
                }
              })();
            } else {
              if (isMounted) setLoading(false);
            }
          } else if (event === 'SIGNED_OUT') {
            if (unsubscribeUserCloudSync) {
              unsubscribeUserCloudSync();
              unsubscribeUserCloudSync = null;
            }
            subscribedUserId = null;
            // On logout, we preserve auth_last_user_id so next login can check if it's the same user.
            permissionService.clearPermissions();
            await handleBackendLogout();
            // Clear local DB on logout too
            await clearLocalUserData();
            clearLocalAuthPresentationState(true); // Preserve PIN keys
            initialSyncDone = false; // Reset for next login
            activeSyncUserId.current = null;
            setDataReady(false);
            setDataSyncing(false);
            setDataSyncError(null);
            if (isMounted) setLoading(false);
          } else {
            // No user session present (e.g. initial load without login)
            if (isMounted) setLoading(false);
          }
        } catch (error) {
          console.error('Error in onAuthStateChange handler:', error);
          if (isMounted) setLoading(false);
        }
      }
    );

    return () => {
      isMounted = false;
      if (unsubscribeUserCloudSync) {
        unsubscribeUserCloudSync();
      }
      subscribedUserId = null;
      subscription.unsubscribe();
      supabase.auth.stopAutoRefresh();
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  const signOut = async () => {
    try {
      const { data: { session: activeSession } } = await supabase.auth.getSession();
      if (activeSession) {
        const { error } = await supabase.auth.signOut({ scope: 'global' });
        if (error) {
          console.warn('Supabase global signOut failed, trying local signOut:', error);
          await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
        }
      } else {
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      }
    } catch (error) {
      console.error('Error signing out from Supabase, clearing local auth state anyway:', error);
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch (localSignOutError) {
        console.error('Local-only sign out fallback also failed:', localSignOutError);
      }
    } finally {
      // Guarantee local DB and presentation clearing to ensure complete isolation
      await handleBackendLogout();
      TokenManager.clearTokens();
      await clearLocalUserData();
      clearLocalAuthPresentationState(true); // Preserve PIN keys

      socketClient.disconnect();
      setUser(null);
      setSession(null);
      setRole('user');
      permissionService.clearPermissions();
      activeSyncUserId.current = null;
      setDataReady(false);
      setDataSyncing(false);
      setDataSyncError(null);
    }
  };

  const triggerDataSync = async () => {
    if (!user?.id || dataSyncing) {
      return;
    }

    const targetUserId = user.id;
    activeSyncUserId.current = targetUserId;
    setDataSyncing(true);
    setDataSyncError(null);

    try {
      const permissions = await permissionService.fetchUserPermissions(targetUserId, resolveUserRole(user));
      setRole(permissions.role);
      await syncFromSupabase(user);
      if (activeSyncUserId.current === targetUserId) {
        setDataReady(true);
      }
    } catch (err) {
      if (activeSyncUserId.current === targetUserId) {
        setDataSyncError(formatSupabaseError(err));
        setDataReady(true);
      }
    } finally {
      if (activeSyncUserId.current === targetUserId) {
        setDataSyncing(false);
      }
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, role, dataReady, dataSyncing, dataSyncError, triggerDataSync, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    if (import.meta.env.DEV) {
      console.warn('useAuth context is undefined (often transient during HMR). Returning temporary fallback context.');
      return {
        user: null,
        session: null,
        loading: true,
        role: 'user' as any,
        dataReady: false,
        dataSyncing: false,
        dataSyncError: null,
        triggerDataSync: async () => {},
        signOut: async () => {},
      };
    }
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
