import { resolveAvatarSelection } from '@/lib/avatar-gallery';

/** The server's profile, normalised (see AuthContext's normalizeRemoteProfile). */
export type RemoteProfileSnapshot = {
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

/**
 * Whether the server's profile already holds every value a local push would
 * send — then the push is a no-op write (User + profiles + an audit row).
 */
export const remoteHoldsProfile = (remote: RemoteProfileSnapshot, payload: Record<string, unknown>): boolean => {
  const norm = (value: unknown) => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number') return value === 0 ? '' : String(value);
    return String(value).trim();
  };
  const remoteAvatar = resolveAvatarSelection({ avatarUrl: remote.avatarUrl, avatarId: remote.avatarId });
  const pairs: Array<[unknown, unknown]> = [
    [payload.firstName, remote.firstName],
    [payload.lastName, remote.lastName],
    [payload.phone, remote.phone],
    [payload.gender, remote.gender],
    [payload.country, remote.country],
    [payload.state, remote.state],
    [payload.city, remote.city],
    [norm(payload.dateOfBirth).slice(0, 10), norm(remote.dateOfBirth).slice(0, 10)],
    [payload.jobType, remote.jobType],
    [payload.monthlyIncome, remote.monthlyIncome],
    [payload.annualIncome, remote.annualIncome],
    [payload.avatarUrl, remoteAvatar.url],
    [payload.avatarId, remoteAvatar.id],
  ];
  return pairs.every(([local, server]) => norm(local) === norm(server));
};
