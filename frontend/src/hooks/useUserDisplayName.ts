import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

const PROFILE_KEY = 'user_profile';

function readProfileName(): string | null {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(PROFILE_KEY) : null;
    if (!raw) return null;
    const profile = JSON.parse(raw) as { full_name?: string; displayName?: string; firstName?: string };
    const name = profile.firstName || profile.displayName || profile.full_name;
    return name ? name.trim().split(/\s+/)[0] : null;
  } catch {
    return null;
  }
}

/** The user's first name for greetings — profile first, then the auth email, then a neutral fallback. */
export function useUserDisplayName(fallback = 'there'): string {
  const { user } = useAuth();
  const [name, setName] = useState<string | null>(() => readProfileName());

  useEffect(() => {
    const refresh = () => setName(readProfileName());
    refresh();
    window.addEventListener('storage', refresh);
    window.addEventListener('KANAKU_PROFILE_UPDATED', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('KANAKU_PROFILE_UPDATED', refresh);
    };
  }, [user?.id]);

  if (name) return name;
  const emailName = user?.email?.split('@')[0];
  if (emailName) return emailName.charAt(0).toUpperCase() + emailName.slice(1);
  return fallback;
}
