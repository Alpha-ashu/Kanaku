import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';
import { clearSecurityData, backupPINKeys, restorePINKeys } from '@/lib/encryption';

interface SecurityContextType {
  isAuthenticated: boolean;
  encryptionKey: string | null;
  setAuthenticated: (key: string) => void;
  logout: () => void;
  isNativePlatform: boolean;
  lockTimeout: number;
  setLockTimeout: (timeout: number) => void;
}

const SecurityContext = createContext<SecurityContextType | undefined>(undefined);

// Persisted across reloads so the auto-lock preference survives a page refresh.
const LOCK_TIMEOUT_KEY = 'KANAKU_lock_timeout_minutes';
// Auto-lock after 5 minutes of inactivity by default. Set to 0 to disable.
const DEFAULT_LOCK_TIMEOUT_MINUTES = 5;

const readStoredLockTimeout = (): number => {
  try {
    const stored = localStorage.getItem(LOCK_TIMEOUT_KEY);
    if (stored !== null) {
      const parsed = Number(stored);
      if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
  } catch {
    /* localStorage unavailable (private mode / SSR) — fall through to default */
  }
  return DEFAULT_LOCK_TIMEOUT_MINUTES;
};

export const SecurityProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return sessionStorage.getItem('session_active') === 'true';
  });
  const [encryptionKey, setEncryptionKey] = useState<string | null>(() => {
    return sessionStorage.getItem('session_encryption_key');
  });
  // Minutes of inactivity before the app auto-locks. 0 = disabled (only locks on close).
  const [lockTimeout, setLockTimeoutState] = useState<number>(readStoredLockTimeout);
  const isNativePlatform = Capacitor.isNativePlatform();

  const setLockTimeout = (timeout: number) => {
    const safe = Number.isFinite(timeout) && timeout >= 0 ? timeout : 0;
    setLockTimeoutState(safe);
    try {
      localStorage.setItem(LOCK_TIMEOUT_KEY, String(safe));
    } catch {
      /* ignore persistence failure */
    }
  };

  useEffect(() => {
    // Auto-lock after a period of inactivity. Disabled when not authenticated
    // or when the timeout is 0 (lock-on-close only).
    if (!isAuthenticated || lockTimeout <= 0) return;

    const timeoutMs = lockTimeout * 60 * 1000;
    let timeoutId: ReturnType<typeof setTimeout>;
    let lastActivity = Date.now();
    let lastArm = 0;

    // Lock and flag *why*, so the PIN screen can show an "inactivity" notice.
    const lockForInactivity = () => {
      try {
        sessionStorage.setItem('KANAKU_lock_reason', 'inactivity');
      } catch {
        /* ignore */
      }
      handleLock();
    };

    const armTimer = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(lockForInactivity, timeoutMs);
    };

    const handleActivity = () => {
      const now = Date.now();
      lastActivity = now;
      // Throttle re-arming so high-frequency events (mousemove/scroll) don't
      // churn the timer on every fire — at most once per second.
      if (now - lastArm < 1000) return;
      lastArm = now;
      armTimer();
    };

    // Background tabs throttle setTimeout, so the timer can fire late or never.
    // When the tab/window regains focus, reconcile against wall-clock elapsed
    // time and lock immediately if the inactivity window already passed.
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastActivity >= timeoutMs) {
        lockForInactivity();
      } else {
        armTimer();
      }
    };

    const activityEvents = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll', 'click'];
    activityEvents.forEach((ev) => window.addEventListener(ev, handleActivity, { passive: true }));
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);

    armTimer();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      activityEvents.forEach((ev) => window.removeEventListener(ev, handleActivity));
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
    };
  }, [isAuthenticated, lockTimeout]);

  const setAuthenticated = (key: string) => {
    setEncryptionKey(key);
    setIsAuthenticated(true);

    // Store in session
    sessionStorage.setItem('session_active', 'true');
    sessionStorage.setItem('session_encryption_key', key);
  };

  const handleLock = () => {
    setIsAuthenticated(false);
    setEncryptionKey(null);
    sessionStorage.removeItem('session_active');
    sessionStorage.removeItem('session_encryption_key');
    // SECURITY: tell AuthContext to halt syncing and re-engage the data gate, so no
    // financial data is fetched while locked and a fresh sync runs on the next unlock.
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('KANAKU_PIN_LOCKED'));
    }
  };

  // Re-lock when the server rejects a request for lack of a live PIN unlock
  // (403 PIN_VERIFICATION_REQUIRED). Mirrors the inactivity lock so the PIN
  // screen reappears and a fresh /pin/verify re-establishes the server unlock.
  useEffect(() => {
    const onForceLock = () => {
      try { sessionStorage.setItem('KANAKU_lock_reason', 'pin_required'); } catch { /* ignore */ }
      setIsAuthenticated(false);
      setEncryptionKey(null);
      sessionStorage.removeItem('session_active');
      sessionStorage.removeItem('session_encryption_key');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('KANAKU_PIN_LOCKED'));
      }
    };
    window.addEventListener('KANAKU_FORCE_PIN_LOCK', onForceLock);
    return () => window.removeEventListener('KANAKU_FORCE_PIN_LOCK', onForceLock);
  }, []);

  const logout = async () => {
    handleLock();

    // Preserve PIN keys across storage clear
    const pinBackup = backupPINKeys();

    clearSecurityData();

    if (isNativePlatform) {
      await Preferences.remove({ key: 'user_authenticated' });
    }

    // Clear all data
    localStorage.clear();
    sessionStorage.clear();

    // Restore PIN keys
    restorePINKeys(pinBackup);

    // Reload app
    window.location.reload();
  };

  return (
    <SecurityContext.Provider
      value={{
        isAuthenticated,
        encryptionKey,
        setAuthenticated,
        logout,
        isNativePlatform,
        lockTimeout,
        setLockTimeout,
      }}
    >
      {children}
    </SecurityContext.Provider>
  );
};

export const useSecurity = () => {
  const context = useContext(SecurityContext);
  if (context === undefined) {
    if (import.meta.env.DEV) {
      console.warn('useSecurity context is undefined (often transient during HMR). Returning temporary fallback context.');
      return {
        isAuthenticated: false,
        encryptionKey: null,
        setAuthenticated: () => {},
        logout: () => {},
        isNativePlatform: false,
        lockTimeout: 0,
        setLockTimeout: () => {},
      };
    }
    throw new Error('useSecurity must be used within a SecurityProvider');
  }
  return context;
};
