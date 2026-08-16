import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { prisma } from '../../db/prisma';
import { approvalService } from '../admin/approval.service';
import { demoService } from '../admin/demo.service';
import { AppError } from '../../utils/AppError';

/**
 * Manager user directory view (permitted user metadata).
 */
export const getManagerUsers = async (req: AuthRequest, res: Response) => {
  try {
    const { role, status, search } = req.query;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

    const where: any = {};
    if (role && role !== 'all') where.role = String(role).toLowerCase();
    if (status && status !== 'all') where.status = String(status).toLowerCase();
    if (search && typeof search === 'string' && search.trim()) {
      const q = search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
          isApproved: true,
          accountType: true,
          demoStatus: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    res.json({
      success: true,
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

/**
 * Submit an approval request for an action requiring Administrator authority.
 */
export const submitApprovalRequest = async (req: AuthRequest, res: Response) => {
  try {
    const { actionType, targetUserId, payload, reason } = req.body;

    if (!actionType) {
      throw AppError.badRequest('actionType is required', 'MISSING_ACTION_TYPE');
    }

    const request = await approvalService.createApprovalRequest({
      requesterId: req.userId!,
      actionType,
      targetUserId,
      payload,
      reason,
    });

    res.status(201).json({
      success: true,
      message: 'Request submitted for administrator review.',
      data: request,
    });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error?.message || 'Failed to submit approval request' });
  }
};

/**
 * View approval requests submitted by the logged-in manager.
 */
export const getMyApprovalRequests = async (req: AuthRequest, res: Response) => {
  try {
    const requests = await prisma.approvalRequest.findMany({
      where: { requesterId: req.userId! },
      include: {
        targetUser: { select: { id: true, name: true, email: true, role: true } },
        reviewer: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, requests });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch approval requests' });
  }
};

/**
 * Request demo account status change (creates approval request).
 */
export const requestDemoStatusChange = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const { status, reason } = req.body;

    const result = await demoService.toggleDemoAccountStatus(
      req.userId!,
      'manager',
      userId,
      String(status).toUpperCase() as 'ENABLED' | 'DISABLED',
      reason,
    );

    res.json(result);
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ error: error?.message || 'Failed to request demo status change' });
  }
};
