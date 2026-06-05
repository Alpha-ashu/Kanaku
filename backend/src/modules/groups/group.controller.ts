import { randomUUID } from 'crypto';
import { Response } from 'express';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { prisma } from '../../db/prisma';
import { logger } from '../../config/logger';
import { isDatabaseUnavailableError } from '../../utils/databaseAvailability';
import { getSocketManager } from '../../sockets';
import { sanitize } from '../../utils/sanitize';

// Helper to convert internal Prisma model to the response format dynamically
const buildGroupResponse = async (group: any, requestingUserId: string) => {
  // Fetch active groupMembers
  const members = await prisma.groupExpenseMember.findMany({
    where: { groupExpenseId: group.id, deletedAt: null }
  });

  // Fetch requesting user's friends list
  const userFriends = await prisma.friend.findMany({
    where: { userId: requestingUserId, deletedAt: null }
  });

  const memberResponses = members.map((m) => {
    const friendRecord = userFriends.find((f) => 
      (m.email && f.email === m.email) ||
      (m.phone && f.phone === m.phone) ||
      (f.name.toLowerCase() === m.name.toLowerCase())
    );

    return {
      name: m.name,
      share: Number(m.shareAmount),
      paid: m.hasPaid,
      isCurrentUser: m.userId === requestingUserId,
      paidAmount: m.hasPaid ? Number(m.shareAmount) : 0,
      paymentStatus: m.hasPaid ? 'paid' : 'pending',
      friendId: friendRecord?.id || undefined,
    };
  });

  // Creator item
  const creatorUser = await prisma.user.findUnique({ where: { id: group.userId } });
  const isCreatorMe = group.userId === requestingUserId;
  const creatorShare = Number(group.yourShare ?? (group.totalAmount / (members.length + 1)));

  const creatorMember = {
    name: isCreatorMe ? 'You' : (creatorUser?.name || 'Creator'),
    share: creatorShare,
    paid: true,
    isCurrentUser: isCreatorMe,
    paidAmount: creatorShare,
    paymentStatus: 'paid' as const,
  };

  return {
    id: group.id,
    userId: group.userId,
    name: group.name,
    totalAmount: Number(group.totalAmount),
    paidBy: group.paidBy,
    date: group.date,
    members: [creatorMember, ...memberResponses],
    items: group.items ? JSON.parse(group.items) : [],
    description: group.description,
    category: group.category,
    splitType: group.splitType,
    yourShare: creatorShare,
    status: group.status || 'pending',
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
  };
};

export const getGroups = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);

    // Fetch groups created by user OR where user is a member
    const groups = await prisma.groupExpense.findMany({
      where: {
        deletedAt: null,
        OR: [
          { userId },
          {
            groupMembers: {
              some: {
                userId,
                deletedAt: null
              }
            }
          }
        ]
      },
      orderBy: { createdAt: 'desc' }
    });

    const data = await Promise.all(groups.map(g => buildGroupResponse(g, userId)));

    res.json({ success: true, data });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      logger.warn('Groups fallback: database unavailable, returning empty dataset.');
      return res.json({ success: true, data: [] });
    }

    logger.error('Failed to fetch groups', { error });
    res.status(500).json({ success: false, error: 'Failed to fetch groups' });
  }
};

export const createGroup = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const body = req.body;

    const targetDate = new Date(body.date);
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const duplicate = await prisma.groupExpense.findFirst({
      where: {
        userId,
        name: body.name,
        date: {
          gte: startOfDay,
          lte: endOfDay
        },
        deletedAt: null
      }
    });

    if (duplicate) {
      logger.info(`Duplicate group expense creation prevented: "${body.name}" on ${targetDate.toDateString()}`);
      const data = await buildGroupResponse(duplicate, userId);
      return res.status(200).json({ success: true, data });
    }

    const group = await prisma.groupExpense.create({
      data: {
        id: randomUUID(),
        userId,
        name: body.name,
        totalAmount: body.totalAmount,
        paidBy: body.paidBy ? String(body.paidBy) : null,
        date: new Date(body.date),
        members: JSON.stringify(body.members || []),
        items: JSON.stringify(body.items || []),
        description: body.description,
        category: body.category,
        splitType: body.splitType || 'equal',
        yourShare: body.yourShare,
        status: body.status || 'pending',
        syncStatus: 'synced'
      }
    });

    const currentUser = await prisma.user.findUnique({ where: { id: userId } });

    // Parse and normalize members
    const rawMembers = body.members || [];
    const normalizedMembers = rawMembers.map((m: any) => {
      if (typeof m === 'string') {
        return {
          name: m,
          share: body.totalAmount / (rawMembers.length + 1),
          paid: false
        };
      }
      return {
        name: m.name,
        share: m.share ?? (body.totalAmount / (rawMembers.length + 1)),
        paid: m.paid || m.paymentStatus === 'paid' || false
      };
    });

    // Filter out creator from participants
    const participants = normalizedMembers.filter((m: any) => !m.isCurrentUser && m.name.toLowerCase() !== 'you');

    // Create GroupExpenseMember entries and notifications
    for (const m of participants) {
      const friend = await prisma.friend.findFirst({
        where: { userId, name: { equals: m.name, mode: 'insensitive' }, deletedAt: null }
      });

      let targetUser: any = null;
      if (friend && (friend.email || friend.phone)) {
        targetUser = await prisma.user.findFirst({
          where: {
            OR: [
              friend.email ? { email: friend.email } : null,
              friend.phone ? { phone: friend.phone } : null
            ].filter(Boolean) as any
          }
        });
      }

      await prisma.groupExpenseMember.create({
        data: {
          groupExpenseId: group.id,
          userId: targetUser ? targetUser.id : null,
          name: m.name,
          email: friend?.email || null,
          phone: friend?.phone || null,
          shareAmount: m.share,
          hasPaid: m.paid,
        }
      });

      if (targetUser) {
        const notification = await prisma.notification.create({
          data: {
            userId: targetUser.id,
            sourceUserId: userId,
            title: 'New Group Expense',
            message: `${currentUser?.name || 'Someone'} added you to a split expense "${group.name}".`,
            type: 'group_expense',
            priority: 'high',
            channels: '["app"]',
            deliveryStatus: '{}',
          }
        });

        try {
          const socketManager = getSocketManager();
          socketManager.notifyUser(targetUser.id, 'notification', notification);
          socketManager.notifyUser(targetUser.id, 'group_expense_updated', { groupId: group.id });
        } catch (err) {
          logger.warn('Socket notification failed for group expense', err);
        }
      }
    }

    const data = await buildGroupResponse(group, userId);
    res.status(201).json({ success: true, data });
  } catch (error) {
    logger.error('Failed to create group', { error });
    res.status(500).json({ success: false, error: 'Failed to create group' });
  }
};

export const updateGroup = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const body = req.body;

    const currentUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!currentUser) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Verify creator or participant permission
    const existing = await prisma.groupExpense.findFirst({
      where: { id, deletedAt: null }
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Group not found' });
    }

    const isCreator = existing.userId === userId;
    const existingMembers = await prisma.groupExpenseMember.findMany({
      where: { groupExpenseId: id, deletedAt: null }
    });
    const isParticipant = existingMembers.some(m => m.userId === userId);

    if (!isCreator && !isParticipant) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    if (isCreator) {
      // Owner can update everything
      const updated = await prisma.groupExpense.update({
        where: { id },
        data: {
          name: body.name !== undefined ? body.name : undefined,
          totalAmount: body.totalAmount !== undefined ? body.totalAmount : undefined,
          paidBy: body.paidBy !== undefined ? (body.paidBy ? String(body.paidBy) : null) : undefined,
          date: body.date !== undefined ? new Date(body.date) : undefined,
          members: body.members !== undefined ? JSON.stringify(body.members) : undefined,
          items: body.items !== undefined ? JSON.stringify(body.items) : undefined,
          description: body.description !== undefined ? body.description : undefined,
          category: body.category !== undefined ? body.category : undefined,
          splitType: body.splitType !== undefined ? body.splitType : undefined,
          yourShare: body.yourShare !== undefined ? body.yourShare : undefined,
          status: body.status !== undefined ? body.status : undefined,
          updatedAt: new Date()
        }
      });

      // Update members if provided
      if (body.members) {
        // Soft delete/hard delete existing members first
        await prisma.groupExpenseMember.deleteMany({
          where: { groupExpenseId: id }
        });

        // Parse and normalize members
        const rawMembers = body.members || [];
        const normalizedMembers = rawMembers.map((m: any) => {
          if (typeof m === 'string') {
            return {
              name: m,
              share: (body.totalAmount ?? Number(existing.totalAmount)) / (rawMembers.length + 1),
              paid: false
            };
          }
          return {
            name: m.name,
            share: m.share ?? ((body.totalAmount ?? Number(existing.totalAmount)) / (rawMembers.length + 1)),
            paid: m.paid || m.paymentStatus === 'paid' || false
          };
        });

        const participants = normalizedMembers.filter((m: any) => !m.isCurrentUser && m.name.toLowerCase() !== 'you');

        for (const m of participants) {
          const friend = await prisma.friend.findFirst({
            where: { userId, name: { equals: m.name, mode: 'insensitive' }, deletedAt: null }
          });

          let targetUser: any = null;
          if (friend && (friend.email || friend.phone)) {
            targetUser = await prisma.user.findFirst({
              where: {
                OR: [
                  friend.email ? { email: friend.email } : null,
                  friend.phone ? { phone: friend.phone } : null
                ].filter(Boolean) as any
              }
            });
          }

          await prisma.groupExpenseMember.create({
            data: {
              groupExpenseId: id,
              userId: targetUser ? targetUser.id : null,
              name: m.name,
              email: friend?.email || null,
              phone: friend?.phone || null,
              shareAmount: m.share,
              hasPaid: m.paid,
            }
          });

          // Send update notifications
          if (targetUser) {
            const notification = await prisma.notification.create({
              data: {
                userId: targetUser.id,
                sourceUserId: userId,
                title: 'Group Expense Updated',
                message: `${currentUser.name} updated the split expense "${updated.name}".`,
                type: 'group_expense',
                priority: 'normal',
                channels: '["app"]',
                deliveryStatus: '{}',
              }
            });

            try {
              getSocketManager().notifyUser(targetUser.id, 'notification', notification);
              getSocketManager().notifyUser(targetUser.id, 'group_expense_updated', { groupId: id });
            } catch (err) {
              // Ignore socket failures
            }
          }
        }
      } else {
        // Just trigger socket updates to existing participants
        for (const m of existingMembers) {
          if (m.userId) {
            try {
              getSocketManager().notifyUser(m.userId, 'group_expense_updated', { groupId: id });
            } catch (err) {
              // Ignore
            }
          }
        }
      }
    } else {
      // Participant: can only update their own paid status
      if (body.members) {
        const myMemberEntry = body.members.find((m: any) => m.isCurrentUser || m.userId === userId || m.email === currentUser.email);
        if (myMemberEntry) {
          const nextPaid = myMemberEntry.paid || myMemberEntry.paymentStatus === 'paid';
          await prisma.groupExpenseMember.updateMany({
            where: { groupExpenseId: id, userId },
            data: {
              hasPaid: nextPaid,
              paidAt: nextPaid ? new Date() : null,
            }
          });

          // Notify creator B
          const notificationCreator = await prisma.notification.create({
            data: {
              userId: existing.userId,
              sourceUserId: userId,
              title: 'Split Expense Settled',
              message: `${currentUser.name} marked their share as paid for "${existing.name}".`,
              type: 'group_expense',
              priority: 'normal',
              channels: '["app"]',
              deliveryStatus: '{}',
            }
          });

          try {
            getSocketManager().notifyUser(existing.userId, 'notification', notificationCreator);
            getSocketManager().notifyUser(existing.userId, 'group_expense_updated', { groupId: id });
          } catch (err) {
            // Ignore
          }

          // Socket updates to other participants
          for (const m of existingMembers) {
            if (m.userId && m.userId !== userId) {
              try {
                getSocketManager().notifyUser(m.userId, 'group_expense_updated', { groupId: id });
              } catch (err) {
                // Ignore
              }
            }
          }
        }
      }
    }

    const data = await buildGroupResponse(existing, userId);
    res.json({ success: true, data });
  } catch (error) {
    logger.error('Failed to update group', { error });
    res.status(500).json({ success: false, error: 'Failed to update group' });
  }
};

export const deleteGroup = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    // Verify ownership
    const existing = await prisma.groupExpense.findFirst({
      where: { id, userId, deletedAt: null }
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Group not found' });
    }

    await prisma.groupExpense.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        updatedAt: new Date()
      }
    });

    // Notify participants of deletion
    const existingMembers = await prisma.groupExpenseMember.findMany({
      where: { groupExpenseId: id, deletedAt: null }
    });

    for (const m of existingMembers) {
      if (m.userId) {
        try {
          getSocketManager().notifyUser(m.userId, 'group_expense_updated', { groupId: id });
        } catch (err) {
          // Ignore
        }
      }
    }

    res.json({ success: true, message: 'Group deleted' });
  } catch (error) {
    logger.error('Failed to delete group', { error });
    res.status(500).json({ success: false, error: 'Failed to delete group' });
  }
};
