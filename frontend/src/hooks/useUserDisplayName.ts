import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';

const PROFILE_KEY = 'user_profile';

function capitalize(s: string): string {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function extractFirstName(fullNameOrFirst?: string | null): string | null {
  if (!fullNameOrFirst || typeof fullNameOrFirst !== 'string') return null;
  const trimmed = fullNameOrFirst.trim();
  if (!trimmed) return null;
  const first = trimmed.split(/\s+/)[0];
  return first ? capitalize(first) : null;
}

function decodeTokenName(): string | null {
  try {
    if (typeof window === 'undefined') return null;
    const token = localStorage.getItem('auth_token') || localStorage.getItem('accessToken');
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '=');
    const payload = JSON.parse(atob(padded));
    if (payload.firstName) return extractFirstName(payload.firstName);
    if (payload.first_name) return extractFirstName(payload.first_name);
    if (payload.name) return extractFirstName(payload.name);
    if (payload.fullName) return extractFirstName(payload.fullName);
    return null;
  } catch {
    return null;
  }
}

function readProfileName(): string | null {
  try {
    if (typeof window === 'undefined') return null;

    // 1. Direct first name cache
    const directFirst = localStorage.getItem('user_first_name');
    if (directFirst && directFirst.trim()) {
      return extractFirstName(directFirst);
    }

    // 2. Direct full name cache
    const directName = localStorage.getItem('user_name');
    if (directName && directName.trim()) {
      return extractFirstName(directName);
    }

    // 3. User profile JSON
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) {
      const profile = JSON.parse(raw) as {
        full_name?: string;
        displayName?: string;
        firstName?: string;
        first_name?: string;
        name?: string;
      };
      const candidate = profile.firstName || profile.first_name || profile.displayName || profile.full_name || profile.name;
      const extracted = extractFirstName(candidate);
      if (extracted) return extracted;
    }

    // 4. Session storage fallback
    const sessionFirst = sessionStorage.getItem('user_first_name');
    if (sessionFirst && sessionFirst.trim()) {
      return extractFirstName(sessionFirst);
    }
    const sessionName = sessionStorage.getItem('user_name');
    if (sessionName && sessionName.trim()) {
      return extractFirstName(sessionName);
    }

    // 5. JWT token claims
    const tokenName = decodeTokenName();
    if (tokenName) return tokenName;

    return null;
  } catch {
    return null;
  }
}

function cleanEmailFallback(email?: string | null): string | null {
  if (!email) return null;
  const username = email.split('@')[0];
  if (!username) return null;
  // Strip trailing numbers (e.g. mohammedsha27 -> mohammedsha)
  const noTrailingDigits = username.replace(/[0-9]+$/g, '');
  if (!noTrailingDigits) return null;
  // If dot/underscore/hyphen delimited (e.g. mohammed.sha -> Mohammed)
  const firstPart = noTrailingDigits.split(/[._-]+/).filter(Boolean)[0];
  if (firstPart && firstPart.length >= 2) {
    return capitalize(firstPart);
  }
  return null;
}

/** The user's first name for greetings — profile first, then metadata, then API/token, then neutral fallback. */
export function useUserDisplayName(fallback = 'User'): string {
  const { user } = useAuth();
  const [name, setName] = useState<string | null>(() => readProfileName());

  useEffect(() => {
    let isCancelled = false;

    const refresh = () => {
      const current = readProfileName();
      if (current) {
        setName(current);
      }
    };

    refresh();

    // Check remote profile if we don't have a reliable first name cached yet,
    // or to keep it synchronized with the backend.
    const fetchRemote = async () => {
      try {
        const res = await api.auth.getProfile();
        if (isCancelled) return;
        if (res.success && res.data) {
          const p = res.data;
          const remoteFirst = extractFirstName(p.firstName || p.first_name || p.name || p.fullName);
          const remoteFull = (p.name || p.fullName || `${p.firstName || ''} ${p.lastName || ''}`).trim();
          if (remoteFirst) {
            setName(remoteFirst);
            try {
              localStorage.setItem('user_first_name', remoteFirst);
              if (remoteFull) {
                localStorage.setItem('user_name', remoteFull);
              }
              const rawProfile = localStorage.getItem(PROFILE_KEY);
              if (rawProfile) {
                const parsed = JSON.parse(rawProfile);
                parsed.firstName = remoteFirst;
                if (!parsed.displayName && remoteFull) parsed.displayName = remoteFull;
                localStorage.setItem(PROFILE_KEY, JSON.stringify(parsed));
              }
            } catch {
              // Ignore storage errors
            }
          }
        }
      } catch {
        // Non-blocking
      }
    };

    fetchRemote();

    window.addEventListener('storage', refresh);
    window.addEventListener('KANAKU_PROFILE_UPDATED', refresh);
    return () => {
      isCancelled = true;
      window.removeEventListener('storage', refresh);
      window.removeEventListener('KANAKU_PROFILE_UPDATED', refresh);
    };
  }, [user?.id]);

  if (name) return name;

  // Supabase / Context user metadata
  const meta = user?.user_metadata;
  const metaName = meta?.first_name || meta?.firstName || meta?.full_name || meta?.name || meta?.displayName;
  const extractedMeta = extractFirstName(metaName);
  if (extractedMeta) {
    return extractedMeta;
  }

  // Clean email fallback (without trailing digits)
  const emailName = cleanEmailFallback(user?.email || (typeof window !== 'undefined' ? localStorage.getItem('user_email') : null));
  if (emailName) {
    return emailName;
  }

  return fallback;
}
