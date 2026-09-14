import { prisma } from '../../db/prisma';
import { logger } from '../../config/logger';
import { invalidateUserSnapshotCache } from '../../middleware/auth';
import { sendRoleAssignedEmail } from '../../emails';

/**
 * The single implementation of an advisor-application decision.
 *
 * Both review surfaces call it — the Manager/Admin verification queue
 * (PUT /advisors/admin/:id/approve|reject) and the older admin console
 * (POST /admin/users/:id/approve|reject). They used to carry separate copies:
 * the admin copy flipped `User.isApproved` without touching the application,
 * so an advisor could be live in the directory while the Manager queue still
 * showed the request as Pending.
 *
 * Every decision is a compare-and-set on the application status, applied in
 * the same transaction as the role change:
 *   approve: PENDING | REJECTED -> APPROVED   (REJECTED = reviewer overturns a rejection)
 *   reject:  PENDING | APPROVED -> REJECTED   (APPROVED = revoking an active advisor)
 * Repeating a decision (double-click, two reviewers at once) changes nothing and
 * sends nothing; the caller gets APPLICATION_ALREADY_REVIEWED.
 */

type ReviewedUser = { id: string; name: string; email: string; role: string; isApproved: boolean };

export type ReviewOutcome =
  | { ok: true; user: ReviewedUser; previousStatus: string }
  | { ok: false; status: 403 | 404 | 409; code: string; error: string };

const STAFF_ROLES = ['admin', 'manager'];
const USER_SELECT = { id: true, name: true, email: true, role: true, isApproved: true } as const;

const alreadyReviewed = (status: string | undefined): ReviewOutcome => ({
  ok: false,
  status: 409,
  code: 'APPLICATION_ALREADY_REVIEWED',
  error: `This application is already ${status?.toLowerCase() ?? 'reviewed'}.`,
});

const loadApplicant = async (userId: string, reviewerId: string): Promise<ReviewOutcome | ReviewedUser> => {
  if (userId === reviewerId) {
    return { ok: false, status: 403, code: 'SELF_REVIEW', error: 'You cannot review your own advisor application.' };
  }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: USER_SELECT });
  if (!user) return { ok: false, status: 404, code: 'USER_NOT_FOUND', error: 'User not found' };
  const application = await prisma.advisorApplication.findUnique({ where: { userId }, select: { id: true } });
  if (!application) return { ok: false, status: 404, code: 'APPLICATION_NOT_FOUND', error: 'No application found for this user' };
  return user;
};

export const approveAdvisorApplication = async (userId: string, reviewerId: string): Promise<ReviewOutcome> => {
  const applicant = await loadApplicant(userId, reviewerId);
  if ('ok' in applicant) return applicant;
  if (STAFF_ROLES.includes(applicant.role)) {
    // Approving would overwrite the staff role with 'advisor'.
    return { ok: false, status: 409, code: 'STAFF_ACCOUNT', error: 'Staff accounts cannot be approved as advisors.' };
  }

  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.advisorApplication.findUniqueOrThrow({ where: { userId }, select: { status: true } });
    if (current.status !== 'PENDING' && current.status !== 'REJECTED') return { blockedBy: current.status };
    const { count } = await tx.advisorApplication.updateMany({
      where: { userId, status: current.status },
      data: { status: 'APPROVED', reviewedBy: reviewerId, reviewedAt: new Date(), rejectionReason: null },
    });
    if (count === 0) return { blockedBy: 'APPROVED' }; // a concurrent reviewer got there first
    const user = await tx.user.update({
      where: { id: userId },
      data: { role: 'advisor', isApproved: true, roleMode: 'advisor' },
      select: USER_SELECT,
    });
    return { user, previousStatus: current.status };
  });
  if (!result.user) return alreadyReviewed(result.blockedBy);
  invalidateUserSnapshotCache(userId);

  await prisma.notification.create({
    data: {
      userId,
      title: 'Advisor Application Approved!',
      message: 'Congratulations! Your advisor application has been approved. You can now accept client bookings.',
      category: 'system',
      deepLink: '/advisor-panel',
    },
  });
  logger.info('Advisor approved', { advisorId: userId, reviewerId, previousStatus: result.previousStatus });

  // Best-effort role-assigned email (no-op if SendGrid is unconfigured).
  if (result.user.email) {
    void sendRoleAssignedEmail(result.user.email, 'advisor', result.user.name || undefined).catch(() => {});
  }
  return { ok: true, user: result.user, previousStatus: result.previousStatus };
};

export const rejectAdvisorApplication = async (
  userId: string,
  reviewerId: string,
  reason?: string | null,
): Promise<ReviewOutcome> => {
  const applicant = await loadApplicant(userId, reviewerId);
  if ('ok' in applicant) return applicant;

  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.advisorApplication.findUniqueOrThrow({ where: { userId }, select: { status: true } });
    if (current.status !== 'PENDING' && current.status !== 'APPROVED') return { blockedBy: current.status };
    const { count } = await tx.advisorApplication.updateMany({
      where: { userId, status: current.status },
      data: { status: 'REJECTED', rejectionReason: reason || null, reviewedBy: reviewerId, reviewedAt: new Date() },
    });
    if (count === 0) return { blockedBy: 'REJECTED' };
    // Drops advisor access for a revoked advisor, and undoes the pending 'advisor'
    // role that applications submitted before 2026-09-14 set at submit time.
    // Staff roles are never 'advisor', so they are untouched.
    await tx.user.updateMany({
      where: { id: userId, role: 'advisor' },
      data: { role: 'user', isApproved: false, roleMode: 'user' },
    });
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: USER_SELECT });
    return { user, previousStatus: current.status };
  });
  if (!result.user) return alreadyReviewed(result.blockedBy);
  invalidateUserSnapshotCache(userId);

  const revoked = result.previousStatus === 'APPROVED';
  await prisma.notification.create({
    data: {
      userId,
      title: revoked ? 'Advisor Access Revoked' : 'Advisor Application Update',
      message: revoked
        ? `Your advisor access has been revoked${reason ? `: ${reason}` : '. Please contact support for more details.'}`
        : reason
          ? `Your advisor application was not approved: ${reason}`
          : 'Your advisor application was not approved at this time. Please contact support for more details.',
      category: 'system',
    },
  });
  logger.info(revoked ? 'Advisor revoked' : 'Advisor rejected', { advisorId: userId, reviewerId, reason });
  return { ok: true, user: result.user, previousStatus: result.previousStatus };
};
