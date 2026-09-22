import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '@/lib/api';

export interface ProfileVerificationState {
  isVerified: boolean;
  isViewOnly: boolean;
  userEmail: string;
  userStatus: string;
  isLoading: boolean;
}

export const VERIFICATION_VALIDITY_DAYS = 90;
export const VERIFICATION_VALIDITY_MS = VERIFICATION_VALIDITY_DAYS * 24 * 60 * 60 * 1000;

export const isLocalVerificationExpired = (verifiedAtStr?: string | null): boolean => {
  if (!verifiedAtStr) return false;
  const time = new Date(verifiedAtStr).getTime();
  if (isNaN(time)) return false;
  return Date.now() - time > VERIFICATION_VALIDITY_MS;
};

export const checkIsProfileVerified = (): boolean => {
  try {
    const emailVerified = localStorage.getItem('email_verified');
    const userStatus = (localStorage.getItem('user_status') || '').toLowerCase().trim();
    const viewOnlyMode = localStorage.getItem('view_only_mode') === 'true';
    const profileVerified = localStorage.getItem('profile_verified');
    const verifiedAt = localStorage.getItem('verified_at');

    if (verifiedAt && isLocalVerificationExpired(verifiedAt)) {
      return false;
    }

    if (viewOnlyMode || profileVerified === 'false' || emailVerified === 'false') {
      return false;
    }

    if (userStatus === 'pending_verification' || userStatus === 'unverified' || userStatus === 'limited_access') {
      return false;
    }

    // Check user_profile object if present
    const profileStr = localStorage.getItem('user_profile');
    if (profileStr) {
      try {
        const p = JSON.parse(profileStr);
        if (p.isVerified === false || p.emailVerified === false || p.status === 'pending_verification' || p.verificationExpired === true) {
          return false;
        }
        if (p.verifiedAt && isLocalVerificationExpired(p.verifiedAt)) {
          return false;
        }
      } catch {
        // ignore JSON parse errors
      }
    }

    // Default: if email_verified is explicitly true and status is not pending, user is verified
    return emailVerified === 'true';
  } catch {
    return false;
  }
};

export const setLocalProfileVerification = (
  verified: boolean,
  status: string = verified ? 'verified' : 'pending_verification',
  verifiedAt?: string | null
) => {
  try {
    if (verified) {
      const timestamp = verifiedAt || new Date().toISOString();
      localStorage.setItem('email_verified', 'true');
      localStorage.setItem('profile_verified', 'true');
      localStorage.setItem('user_status', 'verified');
      localStorage.setItem('verified_at', timestamp);
      localStorage.removeItem('view_only_mode');
    } else {
      localStorage.setItem('email_verified', 'false');
      localStorage.setItem('profile_verified', 'false');
      localStorage.setItem('user_status', status);
      localStorage.setItem('view_only_mode', 'true');
    }

    // Update user_profile cache if present
    const profileStr = localStorage.getItem('user_profile');
    if (profileStr) {
      try {
        const p = JSON.parse(profileStr);
        p.emailVerified = verified;
        p.isVerified = verified;
        p.isViewOnly = !verified;
        p.status = verified ? 'verified' : status;
        if (verified) {
          p.verifiedAt = verifiedAt || p.verifiedAt || new Date().toISOString();
          p.verificationExpired = false;
        }
        localStorage.setItem('user_profile', JSON.stringify(p));
      } catch {
        // ignore
      }
    }

    window.dispatchEvent(new CustomEvent('PROFILE_VERIFICATION_CHANGED', {
      detail: { isVerified: verified, status }
    }));
  } catch (e) {
    console.warn('Failed to update local profile verification:', e);
  }
};

export const useProfileVerification = () => {
  const [isVerified, setIsVerified] = useState<boolean>(() => checkIsProfileVerified());
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [userEmail, setUserEmail] = useState<string>(() => localStorage.getItem('user_email') || '');
  const [userStatus, setUserStatus] = useState<string>(() => localStorage.getItem('user_status') || '');

  const syncState = useCallback(() => {
    const verified = checkIsProfileVerified();
    setIsVerified(verified);
    setUserEmail(localStorage.getItem('user_email') || '');
    setUserStatus(localStorage.getItem('user_status') || '');
  }, []);

  useEffect(() => {
    syncState();

    const handleVerificationChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ isVerified?: boolean }>;
      if (customEvent.detail && typeof customEvent.detail.isVerified === 'boolean') {
        setIsVerified(customEvent.detail.isVerified);
      } else {
        syncState();
      }
    };

    window.addEventListener('PROFILE_VERIFICATION_CHANGED', handleVerificationChange);
    window.addEventListener('storage', syncState);
    window.addEventListener('ONBOARDING_COMPLETED', syncState);
    window.addEventListener('KANAKU_AUTH_CHANGE', syncState);

    return () => {
      window.removeEventListener('PROFILE_VERIFICATION_CHANGED', handleVerificationChange);
      window.removeEventListener('storage', syncState);
      window.removeEventListener('ONBOARDING_COMPLETED', syncState);
      window.removeEventListener('KANAKU_AUTH_CHANGE', syncState);
    };
  }, [syncState]);

  // Optionally fetch cross-device status from backend on mount
  useEffect(() => {
    let isMounted = true;
    const checkServerStatus = async () => {
      try {
        setIsLoading(true);
        const res = await api.auth.getProfile();
        if (isMounted && res.success && res.data) {
          const p = res.data;
          const isExpired = Boolean(p.verificationExpired || (p.verifiedAt && isLocalVerificationExpired(String(p.verifiedAt))));
          const serverVerified = Boolean((p.isVerified ?? (p.emailVerified && p.status !== 'pending_verification')) && !isExpired);
          if (p.verifiedAt) {
            localStorage.setItem('verified_at', String(p.verifiedAt));
          }
          if (typeof p.email === 'string' && p.email) {
            setUserEmail(p.email);
            localStorage.setItem('user_email', p.email);
          }
          if (p.status) {
            setUserStatus(p.status);
          }
          setIsVerified((prev) => {
            if (serverVerified !== prev) {
              setLocalProfileVerification(
                serverVerified,
                p.status || (serverVerified ? 'verified' : 'pending_verification'),
                p.verifiedAt ? String(p.verifiedAt) : undefined
              );
              return serverVerified;
            }
            return prev;
          });
        }
      } catch {
        // Fall back to local synchronous state without disruption
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    checkServerStatus();
    return () => { isMounted = false; };
  }, []);

  const [verificationModalOpen, setVerificationModalOpen] = useState<boolean>(false);
  const [requiredModalOpen, setRequiredModalOpen] = useState<boolean>(false);
  const [blockedActionName, setBlockedActionName] = useState<string | undefined>(undefined);
  const pendingActionRef = useRef<(() => void) | undefined>(undefined);

  useEffect(() => {
    const handleOpenVerify = () => setVerificationModalOpen(true);
    const handleOpenRequired = (e: Event) => {
      const detail = (e as CustomEvent<{ actionName?: string; onVerified?: () => void }>).detail;
      setBlockedActionName(detail?.actionName);
      pendingActionRef.current = detail?.onVerified;
      setRequiredModalOpen(true);
    };

    window.addEventListener('OPEN_PROFILE_VERIFICATION_MODAL', handleOpenVerify);
    window.addEventListener('OPEN_VERIFICATION_REQUIRED_MODAL', handleOpenRequired);

    return () => {
      window.removeEventListener('OPEN_PROFILE_VERIFICATION_MODAL', handleOpenVerify);
      window.removeEventListener('OPEN_VERIFICATION_REQUIRED_MODAL', handleOpenRequired);
    };
  }, []);

  const openVerificationModal = useCallback(() => {
    setVerificationModalOpen(true);
    window.dispatchEvent(new CustomEvent('OPEN_PROFILE_VERIFICATION_MODAL'));
  }, []);

  const closeVerificationModal = useCallback(() => {
    setVerificationModalOpen(false);
  }, []);

  const closeRequiredModal = useCallback(() => {
    setRequiredModalOpen(false);
  }, []);

  const handleVerificationSuccess = useCallback(() => {
    setVerificationModalOpen(false);
    setRequiredModalOpen(false);
    const cb = pendingActionRef.current;
    pendingActionRef.current = undefined;
    cb?.();
  }, []);

  const promptVerification = useCallback((actionName?: string, onVerified?: () => void): boolean => {
    if (checkIsProfileVerified()) {
      onVerified?.();
      return true;
    }

    setBlockedActionName(actionName);
    pendingActionRef.current = onVerified;
    setRequiredModalOpen(true);

    // Also dispatch event for any external listeners
    window.dispatchEvent(new CustomEvent('OPEN_VERIFICATION_REQUIRED_MODAL', {
      detail: { actionName, onVerified }
    }));
    return false;
  }, []);

    const isExpired = Boolean(
      isLocalVerificationExpired(localStorage.getItem('verified_at')) ||
      (() => {
        try {
          const p = JSON.parse(localStorage.getItem('user_profile') || '{}');
          return p.verificationExpired || (p.verifiedAt && isLocalVerificationExpired(p.verifiedAt));
        } catch {
          return false;
        }
      })()
    );

    return {
      isVerified,
      isViewOnly: !isVerified,
      isExpired,
      userEmail,
      userStatus,
      isLoading,
      verificationModalOpen,
      requiredModalOpen,
      blockedActionName,
      openVerificationModal,
      closeVerificationModal,
      closeRequiredModal,
      handleVerificationSuccess,
      promptVerification,
      setVerified: (verified: boolean, verifiedAt?: string | null) => setLocalProfileVerification(verified, verified ? 'verified' : 'pending_verification', verifiedAt),
    };
  };
