/**
 * Account lock-status helper.
 *
 * The admin dashboard's Block/Unblock action writes `status: 'blocked'`
 * (AdminDashboard.tsx → POST /admin/users/:userId/status) while the original
 * enforcement checks — auth middleware, login, refresh, sockets — only compared
 * against 'suspended'. That mismatch made "Block user" cosmetic: a blocked user
 * could still authenticate and call every API.
 *
 * Every enforcement point must treat BOTH vocabularies as locked, so a single
 * helper owns the comparison.
 */
export const LOCKED_ACCOUNT_STATUSES = ['suspended', 'blocked', 'disabled'] as const;

/** Statuses the admin status-toggle endpoint accepts. */
export const ASSIGNABLE_ACCOUNT_STATUSES = ['verified', 'active', 'blocked', 'suspended', 'disabled', 'pending_verification'] as const;

export const isAccountLocked = (status?: string | null): boolean => {
  if (!status || typeof status !== 'string') return false;
  const normalized = status.trim().toLowerCase();
  return (LOCKED_ACCOUNT_STATUSES as readonly string[]).includes(normalized);
};

export const isAccountPending = (status?: string | null, emailVerified?: boolean | null): boolean => {
  if (emailVerified === false) return true;
  if (!status || typeof status !== 'string') return false;
  const normalized = status.trim().toLowerCase();
  return normalized === 'pending_verification' || normalized === 'pending' || normalized === 'unverified';
};

export const isDemoDisabled = (accountType?: string | null, demoStatus?: string | null): boolean => {
  if (!accountType || typeof accountType !== 'string') return false;
  if (accountType.trim().toUpperCase() !== 'DEMO') return false;
  return demoStatus?.trim().toUpperCase() === 'DISABLED';
};

