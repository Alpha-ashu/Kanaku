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
export const LOCKED_ACCOUNT_STATUSES = ['suspended', 'blocked'] as const;

/** Statuses the admin status-toggle endpoint accepts. */
export const ASSIGNABLE_ACCOUNT_STATUSES = ['verified', 'active', 'blocked', 'suspended'] as const;

export const isAccountLocked = (status?: string | null): boolean =>
  typeof status === 'string' && (LOCKED_ACCOUNT_STATUSES as readonly string[]).includes(status);
