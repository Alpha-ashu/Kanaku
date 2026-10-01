/**
 * The background profile sync only writes when the server is missing something.
 *
 * Every page's data sync runs the profile sync. A profile the server does not
 * count as "real" (date of birth or job type skipped at onboarding) was pushed
 * back unchanged on every navigation — a User + profiles + audit-row write each
 * time, with a "Profile updated successfully" toast on whatever page was open.
 */
import { describe, expect, it } from 'vitest';
import { resolveAvatarSelection } from '@/lib/avatar-gallery';
import { remoteHoldsProfile, type RemoteProfileSnapshot } from '@/lib/remoteProfile';

const avatar = resolveAvatarSelection({ avatarId: 'new-1' });

// An advisor who skipped date of birth and job type, as /auth/profile returns it.
const server: RemoteProfileSnapshot = {
  displayName: 'Priya Advisor', firstName: 'Priya', lastName: 'Advisor', phone: '', gender: '',
  dateOfBirth: '', jobType: '', monthlyIncome: 0, annualIncome: 0,
  avatarUrl: avatar.url, avatarId: avatar.id, country: '', state: '', city: '',
  updatedAt: '2026-10-01T10:48:14.723Z', role: 'advisor', hasRealProfile: false, currency: 'INR', language: 'en',
};

// What AuthContext would push from this device's cached copy of the same profile.
const push = {
  firstName: 'Priya', lastName: 'Advisor', phone: null, mobile: null, gender: null, country: null, state: null,
  city: null, dateOfBirth: null, jobType: null, monthlyIncome: null, annualIncome: null,
  avatarUrl: avatar.url, avatarId: avatar.id,
};

describe('remoteHoldsProfile', () => {
  it('sees an incomplete profile the server already has as nothing to push', () => {
    expect(server.hasRealProfile).toBe(false);
    expect(remoteHoldsProfile(server, push)).toBe(true);
  });

  it('treats empty, null and zero as the same "not set"', () => {
    expect(remoteHoldsProfile(server, { ...push, phone: '', monthlyIncome: 0, city: '  ' })).toBe(true);
  });

  it('compares a date of birth by day, whatever time part either side carries', () => {
    const remote = { ...server, dateOfBirth: '1990-04-12T00:00:00.000Z' };
    expect(remoteHoldsProfile(remote, { ...push, dateOfBirth: '1990-04-12' })).toBe(true);
    expect(remoteHoldsProfile(remote, { ...push, dateOfBirth: '1990-04-13' })).toBe(false);
  });

  it('pushes when this device has something the server lacks or holds differently', () => {
    expect(remoteHoldsProfile(server, { ...push, city: 'Chennai' })).toBe(false);
    expect(remoteHoldsProfile(server, { ...push, monthlyIncome: 52000 })).toBe(false);
    expect(remoteHoldsProfile(server, { ...push, lastName: 'Advisor-Rao' })).toBe(false);
    const other = resolveAvatarSelection({ avatarId: 'new-2' });
    if (other.id !== avatar.id) expect(remoteHoldsProfile(server, { ...push, avatarId: other.id, avatarUrl: other.url })).toBe(false);
  });

  it('matches an avatar the server stored by id against the same avatar resolved locally', () => {
    expect(remoteHoldsProfile({ ...server, avatarUrl: null }, push)).toBe(true);
  });
});
