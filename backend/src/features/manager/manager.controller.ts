import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { prisma } from '../../db/prisma';
import { approvalService } from '../admin/approval.service';
import { demoService } from '../admin/demo.service';
import { AppError } from '../../utils/AppError';
import { getManagedUserIds, hasPermission } from '../../security/permissions';
import { deriveLifecycle } from '../wallet/sessionPayment.service';

/**
 * Manager user directory view (permitted user metadata).
 *
 * Scoped to the manager's assigned team. The full directory (every account's
 * email) used to be open to every manager; it now needs the explicit
 * `users.directory.read` grant.
 */
export const getManagerUsers = async (req: AuthRequest, res: Response) => {
  try {
    const { role, status, search } = req.query;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

    const where: any = {};
    if (!(await hasPermission(req.userId!, req.user?.role, 'users.directory.read'))) {
      where.id = { in: await getManagedUserIds(req.userId!) };
    }
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

// ─── Team (assigned users & advisors) ─────────────────────────────────────────

const teamOf = async (req: AuthRequest) => getManagedUserIds(req.userId!);

/** The users and advisors assigned to this manager, with light activity figures. */
export const getTeam = async (req: AuthRequest, res: Response) => {
  try {
    const ids = await teamOf(req);
    const members = await prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, email: true, role: true, status: true, isApproved: true, advisorStatus: true, createdAt: true },
      orderBy: { name: 'asc' },
    });
    const [advisorSessions, clientBookings] = await Promise.all([
      prisma.advisorSession.groupBy({ by: ['advisorId', 'status'], where: { advisorId: { in: ids } }, _count: { _all: true } }),
      prisma.bookingRequest.groupBy({ by: ['clientId'], where: { clientId: { in: ids } }, _count: { _all: true } }),
    ]);
    res.json({
      success: true,
      data: {
        members: members.map((m) => ({
          ...m,
          sessions: Object.fromEntries(advisorSessions.filter((g) => g.advisorId === m.id).map((g) => [g.status, g._count._all])),
          bookingsAsClient: clientBookings.find((g) => g.clientId === m.id)?._count._all ?? 0,
        })),
      },
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch team' });
  }
};

/**
 * Bookings involving anyone on the team. Read-only and minimal: no booking
 * notes, no contact details, no chat — what a manager needs to follow up.
 */
export const getTeamBookings = async (req: AuthRequest, res: Response) => {
  try {
    const ids = await teamOf(req);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const cursor = typeof req.query.cursor === 'string' && req.query.cursor ? req.query.cursor : null;
    const bookings = await prisma.bookingRequest.findMany({
      where: { OR: [{ advisorId: { in: ids } }, { clientId: { in: ids } }] },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true, status: true, paymentStatus: true, coinCost: true, duration: true, sessionType: true,
        proposedDate: true, proposedTime: true, startsAt: true, endsAt: true, timeZone: true, createdAt: true,
        advisor: { select: { id: true, name: true } },
        client: { select: { id: true, name: true } },
        session: { select: { id: true, status: true, rating: true } },
      },
    });
    const hasMore = bookings.length > limit;
    const items = hasMore ? bookings.slice(0, limit) : bookings;
    const now = new Date();
    res.json({
      success: true,
      data: {
        items: items.map((b) => ({ ...b, lifecycle: deriveLifecycle(b, b.session?.status, now) })),
        nextCursor: hasMore ? items[items.length - 1].id : null,
        serverNow: now.toISOString(),
      },
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch team bookings' });
  }
};

/** Per-advisor performance for the advisors on the team. */
export const getTeamPerformance = async (req: AuthRequest, res: Response) => {
  try {
    const ids = await teamOf(req);
    const advisors = await prisma.user.findMany({ where: { id: { in: ids }, role: 'advisor' }, select: { id: true, name: true } });
    const advisorIds = advisors.map((a) => a.id);
    const [completed, cancelled, ratings, bookings] = await Promise.all([
      prisma.advisorSession.groupBy({ by: ['advisorId'], where: { advisorId: { in: advisorIds }, status: 'completed' }, _count: { _all: true } }),
      prisma.advisorSession.groupBy({ by: ['advisorId'], where: { advisorId: { in: advisorIds }, status: 'cancelled' }, _count: { _all: true } }),
      prisma.advisorSession.groupBy({ by: ['advisorId'], where: { advisorId: { in: advisorIds }, rating: { not: null } }, _avg: { rating: true }, _count: { _all: true } }),
      prisma.bookingRequest.groupBy({ by: ['advisorId', 'status'], where: { advisorId: { in: advisorIds } }, _count: { _all: true } }),
    ]);
    const count = (rows: Array<{ advisorId: string; _count: { _all: number } }>, id: string) => rows.find((r) => r.advisorId === id)?._count._all ?? 0;
    res.json({
      success: true,
      data: {
        advisors: advisors.map((a) => {
          const r = ratings.find((x) => x.advisorId === a.id);
          const byStatus: Record<string, number> = Object.fromEntries(bookings.filter((b) => b.advisorId === a.id).map((b) => [b.status, b._count._all]));
          const requested = Object.values(byStatus).reduce((x, y) => x + y, 0);
          return {
            id: a.id,
            name: a.name,
            completedSessions: count(completed, a.id),
            cancelledSessions: count(cancelled, a.id),
            averageRating: r?._avg.rating ?? null,
            ratingCount: r?._count._all ?? 0,
            bookingsByStatus: byStatus,
            acceptanceRate: requested ? ((byStatus.accepted ?? 0) + (byStatus.completed ?? 0)) / requested : null,
          };
        }),
      },
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch team performance' });
  }
};
