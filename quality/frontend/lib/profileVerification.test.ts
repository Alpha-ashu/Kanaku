import { describe, expect, it, beforeEach } from 'vitest';
import {
  checkIsProfileVerified,
  setLocalProfileVerification,
} from '@/hooks/useProfileVerification';

describe('profile verification state & security enforcement', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('reports unverified when email_verified is not set or false', () => {
    expect(checkIsProfileVerified()).toBe(false);

    localStorage.setItem('email_verified', 'false');
    expect(checkIsProfileVerified()).toBe(false);
  });

  it('reports unverified when view_only_mode is active', () => {
    localStorage.setItem('email_verified', 'true');
    localStorage.setItem('view_only_mode', 'true');
    expect(checkIsProfileVerified()).toBe(false);
  });

  it('reports unverified when user status is pending_verification or limited_access', () => {
    localStorage.setItem('email_verified', 'true');
    localStorage.setItem('user_status', 'pending_verification');
    expect(checkIsProfileVerified()).toBe(false);

    localStorage.setItem('user_status', 'limited_access');
    expect(checkIsProfileVerified()).toBe(false);
  });

  it('reports verified when email_verified is true and status is verified', () => {
    localStorage.setItem('email_verified', 'true');
    localStorage.setItem('user_status', 'verified');
    expect(checkIsProfileVerified()).toBe(true);
  });

  it('sets local profile verification state to true properly', () => {
    let eventDetail: { isVerified?: boolean; status?: string } | null = null;
    const listener = (e: Event) => {
      eventDetail = (e as CustomEvent).detail;
    };
    window.addEventListener('PROFILE_VERIFICATION_CHANGED', listener);

    setLocalProfileVerification(true);

    expect(localStorage.getItem('email_verified')).toBe('true');
    expect(localStorage.getItem('profile_verified')).toBe('true');
    expect(localStorage.getItem('user_status')).toBe('verified');
    expect(localStorage.getItem('view_only_mode')).toBeNull();
    expect(eventDetail).toEqual({ isVerified: true, status: 'verified' });

    window.removeEventListener('PROFILE_VERIFICATION_CHANGED', listener);
  });

  it('sets local profile verification state to false (view-only mode) properly', () => {
    setLocalProfileVerification(false);

    expect(localStorage.getItem('email_verified')).toBe('false');
    expect(localStorage.getItem('profile_verified')).toBe('false');
    expect(localStorage.getItem('user_status')).toBe('pending_verification');
    expect(localStorage.getItem('view_only_mode')).toBe('true');
    expect(checkIsProfileVerified()).toBe(false);
  });
});
