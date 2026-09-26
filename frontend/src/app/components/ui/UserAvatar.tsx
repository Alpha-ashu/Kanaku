import React, { useState, useEffect, useMemo } from 'react';

export type UserAvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';

export interface UserAvatarProps {
  avatarUrl?: string | null;
  name?: string | null;
  email?: string | null;
  size?: UserAvatarSize;
  rounded?: 'full' | 'xl' | '2xl' | '3xl';
  className?: string;
  imgClassName?: string;
  initialsClassName?: string;
  alt?: string;
  interactive?: boolean;
  onClick?: () => void;
  badge?: React.ReactNode;
  'data-testid'?: string;
}

export const getInitials = (name?: string | null, email?: string | null): string => {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    if (parts.length === 1 && parts[0].length > 0) {
      return parts[0].slice(0, Math.min(2, parts[0].length)).toUpperCase();
    }
  }
  if (email && email.trim()) {
    const local = email.split('@')[0];
    if (local.length >= 2) {
      return local.slice(0, 2).toUpperCase();
    }
    return local.charAt(0).toUpperCase();
  }
  return 'U';
};

export const getStoredProfile = () => {
  if (typeof window === 'undefined') return null;
  try {
    const str = localStorage.getItem('user_profile');
    if (!str) return null;
    return JSON.parse(str);
  } catch {
    return null;
  }
};

const SIZE_MAP: Record<UserAvatarSize, { container: string; text: string }> = {
  xs: { container: 'w-6 h-6', text: 'text-[10px]' },
  sm: { container: 'w-8 h-8', text: 'text-xs' },
  md: { container: 'w-10 h-10', text: 'text-sm' },
  lg: { container: 'w-12 h-12', text: 'text-base' },
  xl: { container: 'w-16 h-16', text: 'text-xl' },
  '2xl': { container: 'w-24 h-24', text: 'text-3xl' },
  '3xl': { container: 'w-32 h-32', text: 'text-4xl' },
};

const ROUNDED_MAP = {
  full: 'rounded-full',
  xl: 'rounded-xl',
  '2xl': 'rounded-2xl',
  '3xl': 'rounded-[28px]',
};

export const UserAvatar: React.FC<UserAvatarProps> = ({
  avatarUrl: propAvatarUrl,
  name: propName,
  email: propEmail,
  size = 'md',
  rounded = 'full',
  className = '',
  imgClassName = '',
  initialsClassName = '',
  alt,
  interactive = false,
  onClick,
  badge,
  'data-testid': testId = 'user-avatar',
}) => {
  const [profileSyncCount, setProfileSyncCount] = useState(0);
  const [eventAvatar, setEventAvatar] = useState<string | null | undefined>(undefined);
  const [imageError, setImageError] = useState(false);

  // Re-sync with localStorage / auth events
  useEffect(() => {
    const handleUpdate = (e?: Event) => {
      const customEvent = e as CustomEvent<{ avatar_url?: string; profilePhoto?: string }> | undefined;
      if (customEvent?.detail?.avatar_url !== undefined) {
        setEventAvatar(customEvent.detail.avatar_url);
      } else if (customEvent?.detail?.profilePhoto !== undefined) {
        setEventAvatar(customEvent.detail.profilePhoto);
      }
      setImageError(false);
      setProfileSyncCount((c) => c + 1);
    };

    window.addEventListener('PROFILE_UPDATED', handleUpdate as EventListener);
    window.addEventListener('KANAKU_PROFILE_UPDATED', handleUpdate as EventListener);
    window.addEventListener('KANAKU_AUTH_CHANGE', handleUpdate as EventListener);
    window.addEventListener('storage', handleUpdate as EventListener);

    return () => {
      window.removeEventListener('PROFILE_UPDATED', handleUpdate as EventListener);
      window.removeEventListener('KANAKU_PROFILE_UPDATED', handleUpdate as EventListener);
      window.removeEventListener('KANAKU_AUTH_CHANGE', handleUpdate as EventListener);
      window.removeEventListener('storage', handleUpdate as EventListener);
    };
  }, []);

  // Reset image error whenever avatar URL changes
  useEffect(() => {
    setImageError(false);
  }, [propAvatarUrl, eventAvatar]);

  const { resolvedAvatarUrl, resolvedName, resolvedEmail } = useMemo(() => {
    const stored = getStoredProfile();
    const storedUrl = eventAvatar !== undefined ? eventAvatar : (stored?.profilePhoto || stored?.avatarUrl || stored?.avatar_url || null);
    const storedName = stored?.displayName || stored?.full_name || (stored?.firstName ? `${stored.firstName} ${stored.lastName || ''}`.trim() : null);
    const storedEmail = stored?.email || (typeof window !== 'undefined' ? localStorage.getItem('user_email') : null);

    return {
      resolvedAvatarUrl: propAvatarUrl !== undefined ? propAvatarUrl : storedUrl,
      resolvedName: propName || storedName || (typeof window !== 'undefined' ? localStorage.getItem('user_name') : null),
      resolvedEmail: propEmail || storedEmail,
    };
  }, [propAvatarUrl, propName, propEmail, profileSyncCount, eventAvatar]);

  const initials = useMemo(
    () => getInitials(resolvedName, resolvedEmail),
    [resolvedName, resolvedEmail],
  );

  const hasValidImage = Boolean(resolvedAvatarUrl && !imageError && resolvedAvatarUrl.trim().length > 0);
  const sizeConfig = SIZE_MAP[size] || SIZE_MAP.md;
  const roundedClass = ROUNDED_MAP[rounded] || ROUNDED_MAP.full;

  return (
    <div
      data-testid={testId}
      onClick={onClick}
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden font-bold select-none ${sizeConfig.container} ${roundedClass} ${
        interactive ? 'cursor-pointer hover:opacity-90 active:scale-95 transition-transform' : ''
      } ${className}`}
    >
      {hasValidImage ? (
        <img
          src={resolvedAvatarUrl!}
          alt={alt || resolvedName || 'User profile'}
          onError={() => setImageError(true)}
          className={`h-full w-full object-cover relative z-10 transition-opacity duration-200 ${roundedClass} ${imgClassName}`}
        />
      ) : (
        <div
          className={`h-full w-full flex items-center justify-center bg-gradient-to-br from-indigo-500 via-violet-600 to-purple-600 text-white shadow-inner font-extrabold tracking-wider ${sizeConfig.text} ${initialsClassName}`}
        >
          {initials}
        </div>
      )}

      {badge && <div className="absolute z-20 pointer-events-none">{badge}</div>}
    </div>
  );
};
