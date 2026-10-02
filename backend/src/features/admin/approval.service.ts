import { prisma } from '../../db/prisma';
import { logger } from '../../config/logger';
import { AppError } from '../../utils/AppError';
import { invalidateUserSnapshotCache } from '../../middleware/auth';
import { cacheDeleteByPrefix } from '../../cache/redis';
import { ASSIGNABLE_ACCOUNT_STATUSES } from '../../utils/accountStatus';
import { isProtectedAccount } from '../../utils/protectedAccounts';
import { approveAdvisorApplication, rejectAdvisorApplication } from '../advisors/advisorReview.service';
import {
  REQUESTABLE_ROLES,
  StaffActionError,
  assertRoleChangeAllowed,
  assertStatusChangeAllowed,
} from './staffActionPolicy';

export interface CreateApprovalRequestInput {
  requesterId: string;
  actionType: string;
  targetUserId?: string;
  payload?: any;
  reason?: string;
}

/**
 * What a manager may ask an administrator to do. Anything else used to be
 * stored as-is — any action string, any target (yourself, an admin, a protected
 * account) and any payload, so a ROLE_CHANGE could carry "admin" or a garbage
 * role that broke the account's sign-in once approved.
 */
export const APPROVAL_ACTIONS = [
  'ROLE_CHANGE',
  'STATUS_CHANGE',
  'ENABLE_DEMO_ACCOUNT',
  'DISABLE_DEMO_ACCOUNT',
  'APPROVE_ADVISOR',
  'REJECT_ADVISOR',
] as const;
type ApprovalAction = (typeof APPROVAL_ACTIONS)[number];

/** Access changes need a written justification — it is what the reviewing admin decides on. */
const REASON_REQUIRED: readonly ApprovalAction[] = ['ROLE_CHANGE', 'STATUS_CHANGE'];
const MIN_REASON = 5;
const MAX_REASON = 500;

const toAppError = (error: StaffActionError) => new AppError(error.status, error.code, error.message);

export class ApprovalService {
  /**
   * Submit an approval request (typically by a Manager for an Admin to review).
   */
  async createApprovalRequest(input: CreateApprovalRequestInput) {
    const { requesterId, actionType, targetUserId, payload } = input;
    const reason = typeof input.reason === 'string' ? input.reason.trim().slice(0, MAX_REASON) : '';

    if (!(APPROVAL_ACTIONS as readonly string[]).includes(actionType)) {
      throw AppError.badRequest(`Unknown request type. Allowed: ${APPROVAL_ACTIONS.join(', ')}.`, 'INVALID_ACTION_TYPE');
    }
    const action = actionType as ApprovalAction;
    if (!targetUserId || typeof targetUserId !== 'string') {
      throw AppError.badRequest('targetUserId is required.', 'MISSING_TARGET');
    }
    if (REASON_REQUIRED.includes(action) && reason.length < MIN_REASON) {
      throw AppError.badRequest('Explain why this change is needed (at least 5 characters).', 'REASON_REQUIRED');
    }

    const target = await prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true, email: true, role: true } });
    if (!target) throw AppError.notFound('User', 'USER_NOT_FOUND');
    if (target.id === requesterId) {
      throw AppError.forbidden('You cannot file a request about your own account.', 'SELF_REQUEST');
    }
    if (target.role === 'admin' || isProtectedAccount(target.email)) {
      throw AppError.forbidden('Requests cannot target administrators or protected accounts.', 'TARGET_NOT_ALLOWED');
    }
    if (action === 'ROLE_CHANGE' && !REQUESTABLE_ROLES.includes(payload?.role)) {
      throw AppError.badRequest(`A role request may ask for: ${REQUESTABLE_ROLES.join(', ')}. Advisors are approved through their application.`, 'INVALID_ROLE');
    }
    if (action === 'STATUS_CHANGE' && !(ASSIGNABLE_ACCOUNT_STATUSES as readonly string[]).includes(payload?.status)) {
      throw AppError.badRequest('Invalid status specified.', 'INVALID_STATUS');
    }

    // Check if identical request is already pending
    const existing = await prisma.approvalRequest.findFirst({
      where: {
        requesterId,
        actionType,
        targetUserId,
        status: 'PENDING',
      },
    });

    if (existing) {
      throw AppError.conflict('A pending approval request for this action already exists.', 'DUPLICATE_APPROVAL_REQUEST');
    }

    const request = await prisma.approvalRequest.create({
      data: {
        requesterId,
        actionType,
        targetUserId,
        payload: payload || {},
        reason: reason || null,
        status: 'PENDING',
      },
      include: {
        requester: { select: { id: true, name: true, email: true, role: true } },
        targetUser: { select: { id: true, name: true, email: true, role: true, accountType: true, demoStatus: true } },
      },
    });

    logger.info(`[ApprovalService] Approval request created: ${request.id} by ${requesterId} for action ${actionType}`);
    return request;
  }

  /**
   * List approval requests with optional status filter and pagination.
   */
  async listApprovalRequests(filter?: { status?: string; page?: number; limit?: number }) {
    const page = Math.max(1, Number(filter?.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filter?.limit) || 20));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (filter?.status && filter.status !== 'all') {
      where.status = filter.status.toUpperCase();
    }

    const [requests, total] = await Promise.all([
      prisma.approvalRequest.findMany({
        where,
        include: {
          requester: { select: { id: true, name: true, email: true, role: true } },
          targetUser: { select: { id: true, name: true, email: true, role: true, accountType: true, demoStatus: true, status: true } },
          reviewer: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.approvalRequest.count({ where }),
    ]);

    return {
      requests,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Approve a pending request and execute its action — exactly once.
   *
   * The PENDING check used to run outside the transaction and the request was
   * then marked with a plain update, so a double click or two admins executed
   * it twice, and an approve racing a reject could leave a request "rejected"
   * whose action had already run. Now the request is CLAIMED with a
   * conditional update inside the same transaction as the action; whoever
   * loses the claim changes nothing. The stored payload is re-checked against
   * today's rules before it runs — it was written before any validation existed.
   */
  async approveRequest(adminId: string, requestId: string) {
    const request = await prisma.approvalRequest.findUnique({
      where: { id: requestId },
      include: { targetUser: true },
    });

    if (!request) {
      throw AppError.notFound('Approval request');
    }

    if (request.status !== 'PENDING') {
      throw AppError.conflict(`Request is already ${request.status.toLowerCase()}`, 'REQUEST_ALREADY_RESOLVED');
    }
    if (!request.targetUserId) {
      throw AppError.badRequest('This request has no target account.', 'MISSING_TARGET');
    }
    const targetUserId = request.targetUserId;
    if (targetUserId === adminId) {
      throw AppError.forbidden('You cannot approve a request about your own account.', 'SELF_ACTION');
    }

    const payload = (request.payload as any) || {};
    const claim = (db: Pick<typeof prisma, 'approvalRequest'>) =>
      db.approvalRequest.updateMany({
        where: { id: requestId, status: 'PENDING' },
        data: { status: 'APPROVED', reviewedBy: adminId, reviewedAt: new Date() },
      });
    const resolvedMeanwhile = () => AppError.conflict('This request was resolved by someone else meanwhile.', 'REQUEST_ALREADY_RESOLVED');

    if (request.actionType === 'APPROVE_ADVISOR' || request.actionType === 'REJECT_ADVISOR') {
      // One implementation of the advisor decision (compare-and-set on the
      // application, staff accounts refused, applicant notified). This queue
      // used to write role/isApproved/application status itself.
      const outcome = request.actionType === 'APPROVE_ADVISOR'
        ? await approveAdvisorApplication(targetUserId, adminId)
        : await rejectAdvisorApplication(targetUserId, adminId, request.reason);
      if (outcome.ok === false) throw new AppError(outcome.status, outcome.code, outcome.error);
      const { count } = await claim(prisma);
      if (count === 0) throw resolvedMeanwhile();
    } else {
      try {
        if (request.actionType === 'ROLE_CHANGE') {
          if (!REQUESTABLE_ROLES.includes(payload.role)) {
            throw new StaffActionError(400, 'INVALID_ROLE', `A request may only ask for: ${REQUESTABLE_ROLES.join(', ')}.`);
          }
          await assertRoleChangeAllowed(adminId, targetUserId, payload.role);
        } else if (request.actionType === 'STATUS_CHANGE') {
          await assertStatusChangeAllowed(adminId, targetUserId, payload.status);
        } else if (!['ENABLE_DEMO_ACCOUNT', 'DISABLE_DEMO_ACCOUNT'].includes(request.actionType)) {
          throw new StaffActionError(400, 'INVALID_ACTION_TYPE', 'Unknown request type.');
        }
      } catch (error) {
        if (error instanceof StaffActionError) throw toAppError(error);
        throw error;
      }

      await prisma.$transaction(async (tx) => {
        const { count } = await claim(tx);
        if (count === 0) throw resolvedMeanwhile();

        if (request.actionType === 'ENABLE_DEMO_ACCOUNT') {
          await tx.user.update({ where: { id: targetUserId }, data: { demoStatus: 'ENABLED' } });
        } else if (request.actionType === 'DISABLE_DEMO_ACCOUNT') {
          await tx.user.update({ where: { id: targetUserId }, data: { demoStatus: 'DISABLED' } });
          // Revoke refresh tokens
          await tx.refreshToken.deleteMany({ where: { userId: targetUserId } });
        } else if (request.actionType === 'ROLE_CHANGE') {
          await tx.user.update({
            where: { id: targetUserId },
            data: {
              role: payload.role,
              // roleMode is the user↔advisor view toggle; requests never grant
              // advisor, so it always returns to 'user'.
              roleMode: 'user',
              advisorStatus: 'NOT_AVAILABLE',
            },
          });
          // A role change alters what this session is allowed to do, so its
          // refresh tokens go — same treatment STATUS_CHANGE already gives.
          await tx.refreshToken.deleteMany({ where: { userId: targetUserId } });
        } else if (request.actionType === 'STATUS_CHANGE') {
          await tx.user.update({ where: { id: targetUserId }, data: { status: payload.status } });
          if (['blocked', 'suspended', 'disabled'].includes(String(payload.status).toLowerCase())) {
            await tx.refreshToken.deleteMany({ where: { userId: targetUserId } });
          }
        }
      });
    }

    invalidateUserSnapshotCache(targetUserId);
    await cacheDeleteByPrefix(`dashboard:${targetUserId}:`);
    await cacheDeleteByPrefix(`todos:${targetUserId}:`);

    logger.info(`[ApprovalService] Approval request ${requestId} approved by admin ${adminId}`);
    return { success: true, message: 'Request approved and executed successfully' };
  }

  /**
   * Reject a pending approval request. Conditional, like approve: a request an
   * approver already executed can no longer be turned into "rejected".
   */
  async rejectRequest(adminId: string, requestId: string, rejectionReason?: string) {
    const request = await prisma.approvalRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      throw AppError.notFound('Approval request');
    }

    const { count } = await prisma.approvalRequest.updateMany({
      where: { id: requestId, status: 'PENDING' },
      data: {
        status: 'REJECTED',
        reviewedBy: adminId,
        reviewedAt: new Date(),
        rejectionReason: (typeof rejectionReason === 'string' && rejectionReason.trim().slice(0, MAX_REASON)) || 'Rejected by administrator',
      },
    });
    if (count === 0) {
      const current = await prisma.approvalRequest.findUnique({ where: { id: requestId }, select: { status: true } });
      throw AppError.conflict(`Request is already ${String(current?.status ?? request.status).toLowerCase()}`, 'REQUEST_ALREADY_RESOLVED');
    }

    logger.info(`[ApprovalService] Approval request ${requestId} rejected by admin ${adminId}`);
    return { success: true, message: 'Request rejected' };
  }
}

export const approvalService = new ApprovalService();
