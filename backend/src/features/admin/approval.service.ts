import { prisma } from '../../db/prisma';
import { logger } from '../../config/logger';
import { AppError } from '../../utils/AppError';
import { invalidateUserSnapshotCache } from '../../middleware/auth';
import { cacheDeleteByPrefix } from '../../cache/redis';

export interface CreateApprovalRequestInput {
  requesterId: string;
  actionType: string;
  targetUserId?: string;
  payload?: any;
  reason?: string;
}

export class ApprovalService {
  /**
   * Submit an approval request (typically by a Manager for an Admin to review).
   */
  async createApprovalRequest(input: CreateApprovalRequestInput) {
    const { requesterId, actionType, targetUserId, payload, reason } = input;

    // Check if identical request is already pending
    const existing = await prisma.approvalRequest.findFirst({
      where: {
        requesterId,
        actionType,
        targetUserId: targetUserId || null,
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
        targetUserId: targetUserId || null,
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
   * Approve a pending request and execute its action atomically.
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
      throw AppError.badRequest(`Request is already ${request.status.toLowerCase()}`, 'REQUEST_ALREADY_RESOLVED');
    }

    const payload = (request.payload as any) || {};

    // Execute the action based on actionType
    await prisma.$transaction(async (tx) => {
      if (request.targetUserId) {
        if (request.actionType === 'ENABLE_DEMO_ACCOUNT') {
          await tx.user.update({
            where: { id: request.targetUserId },
            data: { demoStatus: 'ENABLED' },
          });
        } else if (request.actionType === 'DISABLE_DEMO_ACCOUNT') {
          await tx.user.update({
            where: { id: request.targetUserId },
            data: { demoStatus: 'DISABLED' },
          });
          // Revoke refresh tokens
          await tx.refreshToken.deleteMany({
            where: { userId: request.targetUserId },
          });
        } else if (request.actionType === 'ROLE_CHANGE' && payload.role) {
          await tx.user.update({
            where: { id: request.targetUserId },
            data: {
              role: payload.role,
              // roleMode is the user↔advisor view toggle. Writing `role` alone
              // left it stale: an advisor demoted here kept roleMode='advisor'
              // and still saw the advisor workspace toggle. Only an approved
              // advisor may sit in advisor mode.
              roleMode: payload.role === 'advisor' ? 'advisor' : 'user',
              ...(payload.role !== 'advisor' ? { advisorStatus: 'NOT_AVAILABLE' } : {}),
            },
          });
          // A role change alters what this session is allowed to do, so its
          // refresh tokens go — same treatment STATUS_CHANGE already gives.
          await tx.refreshToken.deleteMany({
            where: { userId: request.targetUserId },
          });
        } else if (request.actionType === 'STATUS_CHANGE' && payload.status) {
          await tx.user.update({
            where: { id: request.targetUserId },
            data: { status: payload.status },
          });
          if (['blocked', 'suspended', 'disabled'].includes(payload.status.toLowerCase())) {
            await tx.refreshToken.deleteMany({
              where: { userId: request.targetUserId },
            });
          }
        } else if (request.actionType === 'APPROVE_ADVISOR') {
          await tx.user.update({
            where: { id: request.targetUserId },
            // Mirrors advisorReview.service.ts's approve path exactly. That one
            // also set roleMode; this one did not, so an advisor approved via
            // the approval queue landed in advisor role but user mode.
            data: { role: 'advisor', isApproved: true, status: 'verified', roleMode: 'advisor' },
          });
          await tx.advisorApplication.updateMany({
            where: { userId: request.targetUserId },
            data: { status: 'APPROVED', reviewedBy: adminId, reviewedAt: new Date() },
          });
        } else if (request.actionType === 'REJECT_ADVISOR') {
          await tx.advisorApplication.updateMany({
            where: { userId: request.targetUserId },
            data: { status: 'REJECTED', reviewedBy: adminId, reviewedAt: new Date(), rejectionReason: request.reason },
          });
        }
      }

      // Mark request as approved
      await tx.approvalRequest.update({
        where: { id: requestId },
        data: {
          status: 'APPROVED',
          reviewedBy: adminId,
          reviewedAt: new Date(),
        },
      });
    });

    if (request.targetUserId) {
      invalidateUserSnapshotCache(request.targetUserId);
      await cacheDeleteByPrefix(`dashboard:${request.targetUserId}:`);
      await cacheDeleteByPrefix(`todos:${request.targetUserId}:`);
    }

    logger.info(`[ApprovalService] Approval request ${requestId} approved by admin ${adminId}`);
    return { success: true, message: 'Request approved and executed successfully' };
  }

  /**
   * Reject a pending approval request.
   */
  async rejectRequest(adminId: string, requestId: string, rejectionReason?: string) {
    const request = await prisma.approvalRequest.findUnique({
      where: { id: requestId },
    });

    if (!request) {
      throw AppError.notFound('Approval request');
    }

    if (request.status !== 'PENDING') {
      throw AppError.badRequest(`Request is already ${request.status.toLowerCase()}`, 'REQUEST_ALREADY_RESOLVED');
    }

    await prisma.approvalRequest.update({
      where: { id: requestId },
      data: {
        status: 'REJECTED',
        reviewedBy: adminId,
        reviewedAt: new Date(),
        rejectionReason: rejectionReason || 'Rejected by administrator',
      },
    });

    logger.info(`[ApprovalService] Approval request ${requestId} rejected by admin ${adminId}`);
    return { success: true, message: 'Request rejected' };
  }
}

export const approvalService = new ApprovalService();
