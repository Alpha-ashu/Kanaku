/**
 * Tells a user's open clients that their role just changed.
 *
 * The backend resolves authorisation from a 60-second DB snapshot
 * (`middleware/auth.ts`), so an approval or a revoke takes effect on the API
 * almost immediately and needs no re-login. The CLIENT is the slow half: it
 * caches the role in `localStorage` under `auth_role_cache` and only refreshes
 * it in the background once every five minutes
 * (`frontend/src/services/permissionService.ts`).
 *
 * The result was a flow that looked broken from both ends. A newly approved
 * advisor kept the plain-user shell — no User/Advisor toggle — for up to five
 * minutes after being told they were approved, and a revoked advisor kept
 * seeing advisor actions that the API had already started refusing. Neither
 * was a permissions bug; there was simply no way for the server to say
 * "re-read your role now".
 *
 * There is no fallback needed here: `permissionService` still refreshes on its
 * own schedule, so a client that misses this event (offline, socket blocked)
 * converges as before — just slower. This only removes the delay.
 */
import { getSocketManager } from '../../sockets';
import { logger } from '../../config/logger';

export interface RoleChangePayload {
  role: string;
  isApproved: boolean;
  at: string;
}

/**
 * Emit `role_changed` to every device the user has open.
 *
 * Best-effort and never throws: a decision that succeeded in the database must
 * not be reported as a failure because a socket was unavailable. In a worker
 * process or under test there is no socket server at all.
 */
export const announceRoleChange = (userId: string, role: string, isApproved: boolean): void => {
  const payload: RoleChangePayload = { role, isApproved, at: new Date().toISOString() };
  try {
    getSocketManager().notifyUser(userId, 'role_changed', payload);
    logger.info('[roleChange] announced', { userId, role, isApproved });
  } catch {
    // No socket server in this process — the client's own refresh picks it up.
  }
};
