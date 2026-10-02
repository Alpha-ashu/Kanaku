import { prisma } from '../../db/prisma';
import { ASSIGNABLE_ACCOUNT_STATUSES } from '../../utils/accountStatus';
import { isProtectedAccount } from '../../utils/protectedAccounts';
import { financialDeletionBlockers } from '../wallet/wallet.guards';

/**
 * The rules for staff changing someone's access — one place, used by an
 * admin's direct role/status change AND by a manager request an admin
 * approves. Before this, those paths each checked a different subset and
 * together allowed: an admin demoting or blocking themselves or the last admin
 * (no one left to run the platform), a manager requesting "admin" (or any
 * string) as a role, making someone an advisor — who receives and withdraws
 * money — without the KYC review, and demoting an advisor with paid sessions,
 * held earnings or a withdrawal still open.
 */
export class StaffActionError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}

export const ROLES = ['admin', 'manager', 'advisor', 'user'] as const;
export type Role = (typeof ROLES)[number];
/** What a manager may ask an admin to set. Advisors come only from the KYC review; admins only from an admin. */
export const REQUESTABLE_ROLES: readonly Role[] = ['user', 'manager'];
const INACTIVE_STATUSES = ['blocked', 'suspended', 'disabled'];

const loadTarget = async (targetId: string) => {
  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, email: true, role: true, status: true },
  });
  if (!target) throw new StaffActionError(404, 'USER_NOT_FOUND', 'User not found.');
  return target;
};

const otherActiveAdmins = (targetId: string) =>
  prisma.user.count({ where: { role: 'admin', id: { not: targetId }, status: { notIn: INACTIVE_STATUSES } } });

const guardTarget = (actorId: string, target: { id: string; email: string | null }) => {
  if (target.id === actorId) {
    throw new StaffActionError(400, 'SELF_ACTION', 'You cannot change your own account. Ask another administrator.');
  }
  if (isProtectedAccount(target.email)) {
    throw new StaffActionError(403, 'PROTECTED_ACCOUNT', 'This is a protected Kanaku role account and cannot be changed.');
  }
};

/** Throws a StaffActionError unless `actorId` may set `targetId`'s role to `nextRole`. */
export const assertRoleChangeAllowed = async (actorId: string, targetId: string, nextRole: unknown) => {
  if (typeof nextRole !== 'string' || !(ROLES as readonly string[]).includes(nextRole)) {
    throw new StaffActionError(400, 'INVALID_ROLE', 'Invalid role specified.');
  }
  const target = await loadTarget(targetId);
  guardTarget(actorId, target);
  if (target.role === nextRole) {
    throw new StaffActionError(409, 'ROLE_UNCHANGED', `This account is already ${nextRole}.`);
  }
  if (target.role === 'admin' && (await otherActiveAdmins(target.id)) === 0) {
    throw new StaffActionError(409, 'LAST_ADMIN', 'This is the only active administrator. Promote another admin first.');
  }
  if (nextRole === 'advisor') {
    const application = await prisma.advisorApplication.findUnique({ where: { userId: target.id }, select: { status: true } });
    if (application?.status !== 'APPROVED') {
      throw new StaffActionError(409, 'ADVISOR_NOT_VERIFIED', 'Advisors receive and withdraw money: approve their advisor application (KYC review) first.');
    }
  }
  if (target.role === 'advisor') {
    const blockers = await financialDeletionBlockers(target.id);
    if (blockers.length) {
      throw new StaffActionError(409, 'ADVISOR_HAS_OPEN_OBLIGATIONS', `This advisor still has open obligations: ${blockers.join('; ')}. Settle them first.`);
    }
  }
  return { fromRole: target.role, email: target.email };
};

/** Throws a StaffActionError unless `actorId` may set `targetId`'s account status to `status`. */
export const assertStatusChangeAllowed = async (actorId: string, targetId: string, status: unknown) => {
  if (typeof status !== 'string' || !(ASSIGNABLE_ACCOUNT_STATUSES as readonly string[]).includes(status)) {
    throw new StaffActionError(400, 'INVALID_STATUS', 'Invalid status specified.');
  }
  const target = await loadTarget(targetId);
  guardTarget(actorId, target);
  if (target.role === 'admin' && INACTIVE_STATUSES.includes(status) && (await otherActiveAdmins(target.id)) === 0) {
    throw new StaffActionError(409, 'LAST_ADMIN', 'This is the only active administrator and cannot be blocked.');
  }
  return { fromStatus: target.status, email: target.email };
};
