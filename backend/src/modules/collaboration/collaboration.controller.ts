import { Response, NextFunction } from 'express';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { prisma } from '../../db/prisma';
import { AppError } from '../../utils/AppError';
import { isDatabaseUnavailableError } from '../../utils/databaseAvailability';
import { logger } from '../../config/logger';

/**
 * Collaboration read/management API. Invitations themselves are created
 * implicitly when a user shares a module (group expense / todo list / goal)
 * via that module's own share endpoint — see invitation.service.ts. This
 * controller exposes the unified participant records for listing and revoking.
 */

/**
 * GET /collaborations
 * Every collaboration the current user is part of — either ones they were
 * invited to (matched by linked userId or their email) or ones they created.
 */
export const listCollaborations = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { moduleType, status } = req.query as { moduleType?: string; status?: string };

    const me = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    const email = me?.email?.toLowerCase();

    const participants = await prisma.collaborationParticipant.findMany({
      where: {
        AND: [
          moduleType ? { moduleType } : {},
          status ? { status } : {},
          {
            OR: [
              { userId },
              { invitedBy: userId },
              ...(email ? [{ email }] : []),
            ],
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: participants });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return res.json({ success: true, data: [] });
    }
    next(error);
  }
};

/**
 * GET /collaborations/pending
 * Invitations addressed to the current user's email that are still awaiting
 * acceptance/linking.
 */
export const listPendingCollaborations = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const me = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    const email = me?.email?.toLowerCase();
    if (!email) {
      return res.json({ success: true, data: [] });
    }

    const pending = await prisma.collaborationParticipant.findMany({
      where: { email, status: 'PENDING_REGISTRATION' },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: pending });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return res.json({ success: true, data: [] });
    }
    next(error);
  }
};

/**
 * GET /collaborations/:id
 */
export const getCollaboration = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const me = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    const email = me?.email?.toLowerCase();

    const participant = await prisma.collaborationParticipant.findFirst({
      where: {
        id,
        OR: [
          { userId },
          { invitedBy: userId },
          ...(email ? [{ email }] : []),
        ],
      },
    });

    if (!participant) {
      throw AppError.notFound('Collaboration');
    }

    res.json({ success: true, data: participant });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /collaborations/:id
 * Revoke a participation. Allowed for the inviter (remove someone) or the
 * participant themselves (leave). The module-specific membership row
 * (GroupExpenseMember / todo_list_shares / GoalMember) is owned by that
 * module's endpoints; this clears the unified participant record.
 */
export const revokeCollaboration = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const me = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    const email = me?.email?.toLowerCase();

    const participant = await prisma.collaborationParticipant.findUnique({ where: { id } });
    if (!participant) {
      throw AppError.notFound('Collaboration');
    }

    const isInviter = participant.invitedBy === userId;
    const isParticipant = participant.userId === userId || (email && participant.email === email);
    if (!isInviter && !isParticipant) {
      throw new AppError(403, 'FORBIDDEN', 'You do not have permission to revoke this collaboration');
    }

    await prisma.collaborationParticipant.delete({ where: { id } });
    logger.info('Collaboration participant revoked', { id, by: userId });

    res.json({ success: true, message: 'Collaboration revoked' });
  } catch (error) {
    next(error);
  }
};
