/**
 * Permission Service - Backend-Driven Role-Based Access Control
 * Fetches and manages user permissions from the backend
 */

import { UserRole } from '@/lib/featureFlags';
import {
  clearOptionalBackendUnavailable,
  getConfiguredApiBase,
  shouldSkipOptionalBackendRequests,
} from '@/lib/apiBase';
import { TokenManager } from '@/lib/api';
import supabase from '@/utils/supabase/client';

const API_BASE = getConfiguredApiBase();
// Inner timeout MUST be shorter than the AuthContext outer race (5000ms) so the
// service can fall back gracefully to a cached role instead of hard-rejecting.
// 4s is enough for local backends; Vercel cold-starts are handled separately.
const PROFILE_LOOKUP_TIMEOUT_MS = 4000;
const ROLE_CACHE_KEY = 'auth_role_cache';

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

const normalizeUserRole = (value: unknown): UserRole => {
  if (value === 'admin' || value === 'manager' || value === 'advisor' || value === 'user') {
    return value;
  }
  if (value === 'customer') {
    return 'user';
  }
  return 'user';
};

const resolveEffectiveRole = (role: UserRole, isApproved?: boolean): UserRole => {
  if (role === 'advisor' && isApproved === false) {
    return 'user';
  }

  return role;
};

const getAuthToken = async (): Promise<string | null> => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    return session.access_token;
  }

  return TokenManager.getAccessToken();
};

export interface UserPermissions {
  role: UserRole;
  allowedFeatures: string[];
  permissions: {
    canAccessAdminPanel: boolean;
    canAccessAdvisorPanel: boolean;
    canControlFeatures: boolean;
    canViewAllUsers: boolean;
    canManageAdvisors: boolean;
    canApproveFeatures: boolean;
    canTestNewFeatures: boolean;
    canBookAdvisors: boolean;
    canPayForSessions: boolean;
    canJoinSessions: boolean;
    canViewSessionHistory: boolean;
    canRateAdvisors: boolean;
    canSetAvailability: boolean;
    canStartSessions: boolean;
    canReceiveBookings: boolean;
    canManageSessions: boolean;
    canReceivePayments: boolean;
    canViewClients: boolean;
  };
  lastUpdated: string;
}

type BackendRoleSnapshot = {
  role: UserRole;
  isApproved?: boolean;
  fetchedAt: string;
};

class PermissionService {
  private static instance: PermissionService;
  private permissions: UserPermissions | null = null;
  private listeners: ((permissions: UserPermissions | null) => void)[] = [];
  private inflightRoleLookups = new Map<string, Promise<UserRole>>();
  private roleSnapshots = new Map<string, BackendRoleSnapshot>();

  private constructor() { }

  static getInstance(): PermissionService {
    if (!PermissionService.instance) {
      PermissionService.instance = new PermissionService();
    }
    return PermissionService.instance;
  }

  /**
   * Fetch user permissions from the backend-authenticated profile endpoint.
   * Falls back to the caller-provided role only when the backend cannot be read.
   */
  async fetchUserPermissions(userId: string, fallbackRole?: UserRole): Promise<UserPermissions> {
    const role = await this.resolveUserRole(userId, fallbackRole);
    const permissions = this.getDefaultPermissions(role);
    this.permissions = permissions;
    this.notifyListeners();
    return permissions;
  }

  private async resolveUserRole(userId: string, fallbackRole?: UserRole): Promise<UserRole> {
    const existingLookup = this.inflightRoleLookups.get(userId);
    if (existingLookup) {
      return existingLookup;
    }

    const lookupPromise = this.loadUserRole(userId, fallbackRole);
    this.inflightRoleLookups.set(userId, lookupPromise);

    try {
      return await lookupPromise;
    } finally {
      this.inflightRoleLookups.delete(userId);
    }
  }

  private getCachedRole(userId: string): UserRole | null {
    // 1. Check in-memory snapshot first (fastest)
    const snapshot = this.roleSnapshots.get(userId);
    if (snapshot) {
      return resolveEffectiveRole(snapshot.role, snapshot.isApproved);
    }

    // 2. Fall back to localStorage so repeat loads (refresh/hot-reload)
    //    resolve role instantly without a network round-trip.
    try {
      const stored = localStorage.getItem(ROLE_CACHE_KEY);
      if (stored) {
        const parsed: BackendRoleSnapshot & { userId: string } = JSON.parse(stored);
        if (parsed.userId === userId) {
          // Restore into memory cache for the rest of this session
          this.roleSnapshots.set(userId, parsed);
          return resolveEffectiveRole(parsed.role, parsed.isApproved);
        }
      }
    } catch {
      // ignore parse errors
    }

    return null;
  }

  private rememberResolvedRole(userId: string, role: UserRole, isApproved?: boolean): UserRole {
    const snapshot: BackendRoleSnapshot & { userId: string } = {
      userId,
      role,
      isApproved,
      fetchedAt: new Date().toISOString(),
    };
    this.roleSnapshots.set(userId, snapshot);

    // Persist to localStorage so next page load skips the network round-trip
    try {
      localStorage.setItem(ROLE_CACHE_KEY, JSON.stringify(snapshot));
    } catch {
      // ignore storage errors
    }

    return resolveEffectiveRole(role, isApproved);
  }

  private async loadUserRole(userId: string, fallbackRole?: UserRole): Promise<UserRole> {
    let safeFallback = normalizeUserRole(fallbackRole);
    
    // Check email fallback if safeFallback is 'user'
    if (safeFallback === 'user') {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const emailRole = getRoleFromEmail(session?.user?.email);
        if (emailRole) {
          safeFallback = emailRole;
        }
      } catch (err) {
        console.warn('Failed to fetch session for email fallback role:', err);
      }
    }

    const cachedRole = this.getCachedRole(userId);

    // If we already have a cached role (from a previous session or this session),
    // return it immediately so the AuthContext 5s race completes instantly.
    // Then refresh the role from the backend in the background.
    if (cachedRole) {
      void this.refreshRoleInBackground(userId, safeFallback);
      return cachedRole;
    }

    // No cache — must wait for the network (first-ever login for this user)
    return this.fetchRoleFromNetwork(userId, safeFallback);
  }

  private async refreshRoleInBackground(userId: string, fallback: UserRole): Promise<void> {
    const snapshot = this.roleSnapshots.get(userId);
    if (snapshot?.fetchedAt) {
      const lastFetch = new Date(snapshot.fetchedAt).getTime();
      // 5-minute cooldown (300,000 ms) to avoid excessive backend profile endpoint lookup hammering
      if (!isNaN(lastFetch) && (Date.now() - lastFetch < 5 * 60 * 1000)) {
        return;
      }
    }

    try {
      const freshRole = await this.fetchRoleFromNetwork(userId, fallback);
      // If the backend says the role changed, update permissions state
      if (freshRole !== this.permissions?.role) {
        const permissions = this.getDefaultPermissions(freshRole);
        this.permissions = permissions;
        this.notifyListeners();
      }
    } catch {
      // Ignore background refresh failures — cached role stays in effect
    }
  }

  private async fetchRoleFromNetwork(userId: string, safeFallback: UserRole): Promise<UserRole> {
    const cachedRole = this.getCachedRole(userId);
    let resolvedFallback = safeFallback;

    // Check email fallback if resolvedFallback is 'user'
    if (resolvedFallback === 'user') {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const emailRole = getRoleFromEmail(session?.user?.email);
        if (emailRole) {
          resolvedFallback = emailRole;
        }
      } catch (err) {
        // ignore
      }
    }

    try {
      const token = await getAuthToken();
      if (!token) {
        console.warn('No auth token available for permission lookup, using fallback permissions.', { userId });
        return cachedRole ?? resolvedFallback;
      }

      if (shouldSkipOptionalBackendRequests(API_BASE)) {
        return cachedRole ?? resolvedFallback;
      }

      const { api } = await import('@/lib/api');
      const profileResponse = await Promise.race([
        api.auth.getProfile(),
        new Promise<never>((_, reject) => {
          window.setTimeout(
            () => reject(new Error('Profile lookup timed out')),
            PROFILE_LOOKUP_TIMEOUT_MS,
          );
        }),
      ]);

      if (!profileResponse.success) {
        if (cachedRole) {
          console.warn('Failed to load backend profile role, using cached permissions role:', profileResponse.message);
          return cachedRole;
        }

        console.warn('Failed to load backend profile role, using fallback permissions:', profileResponse.message);
        return resolvedFallback;
      }

      const backendRole = normalizeUserRole(profileResponse.data?.role ?? resolvedFallback);
      clearOptionalBackendUnavailable();
      return this.rememberResolvedRole(userId, backendRole, profileResponse.data?.isApproved);
    } catch (error) {
      if (cachedRole) {
        console.warn('Unexpected backend role lookup failure, using cached permissions role:', error);
        return cachedRole;
      }

      console.warn('Unexpected backend role lookup failure, using fallback permissions:', error);
      return resolvedFallback;
    }
  }

  /**
   * Get default permissions for a role (fallback)
   */
  private getDefaultPermissions(role: UserRole): UserPermissions {
    const defaults: Record<UserRole, UserPermissions> = {
      admin: {
        role: 'admin',
        allowedFeatures: [
          'accounts', 'transactions', 'loans', 'goals', 'groups',
          'investments', 'reports', 'calendar', 'todoLists',
          'transfer', 'taxCalculator', 'bookAdvisor',
          'adminPanel', 'featureControl', 'advisorPanel'
        ],
        permissions: {
          canAccessAdminPanel: true,
          canAccessAdvisorPanel: true,
          canControlFeatures: true,
          canViewAllUsers: true,
          canManageAdvisors: true,
          canApproveFeatures: true,
          canTestNewFeatures: true,
          canBookAdvisors: true,
          canPayForSessions: true,
          canJoinSessions: true,
          canViewSessionHistory: true,
          canRateAdvisors: true,
          canSetAvailability: false,
          canStartSessions: false,
          canReceiveBookings: false,
          canManageSessions: false,
          canReceivePayments: false,
          canViewClients: false,
        },
        lastUpdated: new Date().toISOString()
      },
      manager: {
        role: 'manager',
        allowedFeatures: [
          'accounts', 'transactions', 'loans', 'goals', 'groups',
          'investments', 'reports', 'calendar', 'todoLists',
          'transfer', 'taxCalculator', 'bookAdvisor',
          'advisorPanel'
        ],
        permissions: {
          canAccessAdminPanel: false,
          canAccessAdvisorPanel: true,
          canControlFeatures: false,
          canViewAllUsers: false,
          canManageAdvisors: true,
          canApproveFeatures: false,
          canTestNewFeatures: false,
          canBookAdvisors: true,
          canPayForSessions: true,
          canJoinSessions: true,
          canViewSessionHistory: true,
          canRateAdvisors: true,
          canSetAvailability: false,
          canStartSessions: false,
          canReceiveBookings: false,
          canManageSessions: false,
          canReceivePayments: false,
          canViewClients: true,
        },
        lastUpdated: new Date().toISOString()
      },
      advisor: {
        role: 'advisor',
        allowedFeatures: [
          'accounts', 'transactions', 'loans', 'goals', 'groups',
          'investments', 'reports', 'calendar', 'todoLists',
          'transfer', 'taxCalculator', 'bookAdvisor',
          'advisorPanel'
        ],
        permissions: {
          canAccessAdminPanel: false,
          canAccessAdvisorPanel: true,
          canControlFeatures: false,
          canViewAllUsers: false,
          canManageAdvisors: false,
          canApproveFeatures: false,
          canTestNewFeatures: false,
          canBookAdvisors: false,
          canPayForSessions: false,
          canJoinSessions: true,
          canViewSessionHistory: true,
          canRateAdvisors: true,
          canSetAvailability: true,
          canStartSessions: true,
          canReceiveBookings: true,
          canManageSessions: true,
          canReceivePayments: true,
          canViewClients: true,
        },
        lastUpdated: new Date().toISOString()
      },
      user: {
        role: 'user',
        allowedFeatures: [
          'accounts', 'transactions', 'loans', 'goals', 'groups',
          'investments', 'reports', 'calendar', 'todoLists',
          'transfer', 'taxCalculator', 'bookAdvisor'
        ],
        permissions: {
          canAccessAdminPanel: false,
          canAccessAdvisorPanel: false,
          canControlFeatures: false,
          canViewAllUsers: false,
          canManageAdvisors: false,
          canApproveFeatures: false,
          canTestNewFeatures: false,
          canBookAdvisors: true,
          canPayForSessions: true,
          canJoinSessions: true,
          canViewSessionHistory: true,
          canRateAdvisors: true,
          canSetAvailability: false,
          canStartSessions: false,
          canReceiveBookings: false,
          canManageSessions: false,
          canReceivePayments: false,
          canViewClients: false,
        },
        lastUpdated: new Date().toISOString()
      }
    };

    return defaults[role];
  }

  /**
   * Get current permissions
   */
  getPermissions(): UserPermissions | null {
    return this.permissions;
  }

  /**
   * Check if user has access to a feature
   */
  hasFeatureAccess(feature: string): boolean {
    if (!this.permissions) {
      console.warn(' No permissions loaded, denying access to:', feature);
      return false;
    }
    return this.permissions.allowedFeatures.includes(feature);
  }

  /**
   * Check if user can perform a specific action
   */
  canPerformAction(action: string): boolean {
    if (!this.permissions) {
      console.warn(' No permissions loaded, denying action:', action);
      return false;
    }
    const permissionKey = `can${action.charAt(0).toUpperCase()}${action.slice(1)}`;
    return this.permissions.permissions[permissionKey as keyof typeof this.permissions.permissions] === true;
  }

  /**
   * Get user role
   */
  getUserRole(): UserRole | null {
    return this.permissions?.role || null;
  }

  /**
   * Update permissions (called when admin changes permissions)
   */
  updatePermissions(newPermissions: Partial<UserPermissions>): void {
    if (!this.permissions) return;

    this.permissions = {
      ...this.permissions,
      ...newPermissions,
      lastUpdated: new Date().toISOString()
    };

    console.log(' Permissions updated:', this.permissions);
    this.notifyListeners();
  }

  /**
   * Subscribe to permission changes
   */
  subscribe(listener: (permissions: UserPermissions | null) => void): () => void {
    this.listeners.push(listener);
    listener(this.permissions);

    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Notify all listeners of permission changes
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.permissions));
  }

  /**
   * Clear permissions (logout)
   */
  clearPermissions(): void {
    this.permissions = null;
    this.inflightRoleLookups.clear();
    this.roleSnapshots.clear();
    // Clear localStorage cache so next user gets a fresh role fetch
    try { localStorage.removeItem(ROLE_CACHE_KEY); } catch { /* ignore */ }
    this.notifyListeners();
  }

  /**
   * Reset the fetchedAt timestamp of a cached role snapshot, forcing the
   * 5-minute cooldown to be bypassed on the next background refresh.
   * Useful when the profile cache is deliberately invalidated (e.g. after
   * profile updates or in test environments) so the next permission fetch
   * triggers a real network request.
   */
  invalidateRoleCacheTimestamp(userId: string): void {
    const snapshot = this.roleSnapshots.get(userId);
    if (snapshot) {
      this.roleSnapshots.set(userId, {
        ...snapshot,
        fetchedAt: new Date(0).toISOString(), // epoch → cooldown guard treats it as stale
      });
    }
  }

  /**
   * Refresh permissions from backend
   */
  async refreshPermissions(userId?: string): Promise<void> {
    let targetUserId = userId;
    if (!targetUserId) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        targetUserId = user?.id;
      } catch {}
    }
    if (!targetUserId) {
      const token = await getAuthToken();
      if (token) {
        try {
          const parts = token.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
            targetUserId = payload.userId;
          }
        } catch {}
      }
    }
    if (targetUserId) {
      await this.fetchUserPermissions(targetUserId);
    }
  }
}

export const permissionService = PermissionService.getInstance();
export default permissionService;
