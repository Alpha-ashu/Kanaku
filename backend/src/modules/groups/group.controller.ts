import { randomUUID } from 'crypto';
import { Response } from 'express';
import { Queue } from 'bullmq';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { prisma } from '../../db/prisma';
import { logger } from '../../config/logger';
import { isDatabaseUnavailableError } from '../../utils/databaseAvailability';
import { getSocketManager } from '../../sockets';
import { sanitize } from '../../utils/sanitize';
import { redisConnection } from '../../config/queue';
import { inviteParticipants } from '../collaboration/invitation.service';

// User has no `phone` column — phone numbers live on `profiles` (synced 1:1 with User.id on registration).
async function findUserByEmailOrPhone(email?: string | null, phone?: string | null): Promise<any> {
  if (email) {
    const user = await prisma.user.findFirst({ where: { email } });
    if (user) return user;
  }
  if (phone) {
    const profile = await prisma.profiles.findFirst({ where: { phone } });
    if (profile) return prisma.user.findUnique({ where: { id: profile.id } });
  }
  return null;
}

let _emailQueue: Queue | null = null;
function getEmailQueue(): Queue {
  if (!_emailQueue) {
    _emailQueue = new Queue('email-notifications', { connection: redisConnection as any });
  }
  return _emailQueue;
}

async function queueGroupExpenseEmail(notificationId: string, userId: string, title: string, message: string): Promise<void> {
  try {
    await getEmailQueue().add('send-notification-email', {
      notificationId,
      userId,
      title,
      message,
      category: 'group_expense',
      deepLink: '/groups',
    }, {
      priority: 1,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    });
  } catch (err) {
    logger.warn('Failed to queue group expense email notification', err);
  }
}

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
      friendId: m.friendId || friendRecord?.id || undefined,
      email: m.email || friendRecord?.email || undefined,
      phone: m.phone || friendRecord?.phone || undefined,
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

    // Also match by email for member rows where userId wasn't set at creation
    // time (stale rows from before the normalizedMembers fix, or rows where the
    // participant wasn't yet registered when the expense was created).
    const currentUser = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    const emailConditions = currentUser?.email
      ? [{ groupMembers: { some: { email: currentUser.email, deletedAt: null } } }]
      : [];

    const groups = await prisma.groupExpense.findMany({
      where: {
        deletedAt: null,
        OR: [
          { userId },
          { groupMembers: { some: { userId, deletedAt: null } } },
          ...emailConditions,
        ],
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

export const getGroup = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const currentUser = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    const emailConditions = currentUser?.email
      ? [{ groupMembers: { some: { email: currentUser.email, deletedAt: null } } }]
      : [];

    const group = await prisma.groupExpense.findFirst({
      where: {
        id,
        deletedAt: null,
        OR: [
          { userId },
          { groupMembers: { some: { userId, deletedAt: null } } },
          ...emailConditions,
        ],
      },
    });

    if (!group) {
      return res.status(404).json({ success: false, error: 'Group not found or access denied' });
    }

    const data = await buildGroupResponse(group, userId);
    res.json({ success: true, data });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      logger.warn('Group detail fallback: database unavailable.');
      return res.status(503).json({ success: false, error: 'Database temporarily unavailable' });
    }

    logger.error('Failed to fetch group', { error });
    res.status(500).json({ success: false, error: 'Failed to fetch group' });
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
        paid: m.paid || m.paymentStatus === 'paid' || false,
        email: m.email,
        phone: m.phone,
        isCurrentUser: m.isCurrentUser,
      };
    });

    // Filter out creator from participants
    const participants = normalizedMembers.filter((m: any) => !m.isCurrentUser && m.name.toLowerCase() !== 'you');

    // Create GroupExpenseMember entries and notifications
    for (const m of participants) {
      let friend = await prisma.friend.findFirst({
        where: { userId, name: { equals: m.name, mode: 'insensitive' }, deletedAt: null }
      });

      const memberEmail = (m.email || '').trim().toLowerCase() || null;
      const memberPhone = (m.phone || '').trim() || null;

      // Fall back to matching an existing friend by contact info if the name didn't match.
      if (!friend && (memberEmail || memberPhone)) {
        friend = await prisma.friend.findFirst({
          where: {
            userId,
            deletedAt: null,
            OR: [memberEmail ? { email: memberEmail } : null, memberPhone ? { phone: memberPhone } : null].filter(Boolean) as any,
          },
        });
      }

      // Every participant added to a group expense must become a manageable
      // entity — auto-create a Friend record if one doesn't exist yet.
      if (!friend && (memberEmail || memberPhone)) {
        friend = await prisma.friend.create({
          data: { userId, name: sanitize(m.name), email: memberEmail, phone: memberPhone, syncStatus: 'synced' },
        });
      }

      const targetUser = await findUserByEmailOrPhone(friend?.email, friend?.phone);

      const email = (memberEmail || friend?.email || '').trim().toLowerCase() || null;

      await prisma.groupExpenseMember.create({
        data: {
          groupExpenseId: group.id,
          userId: targetUser ? targetUser.id : null,
          friendId: friend?.id || null,
          name: m.name,
          email,
          phone: friend?.phone || memberPhone,
          shareAmount: m.share,
          hasPaid: m.paid,
        }
      });

      if (email) {
        // Resolves registered vs. pending, tracks the invite, and sends the
        // matching in-app notification or "Join Kanaku" invitation email.
        try {
          const detail = `Total: ₹${Number(group.totalAmount).toFixed(0)}, Your share: ₹${Number(m.share).toFixed(0)}.`;
          await inviteParticipants({
            moduleType: 'group_expense',
            moduleId: group.id,
            moduleName: group.name,
            creatorId: userId,
            participants: [{ email, name: m.name, detail }],
          });
        } catch (err) {
          logger.warn('Failed to invite group expense participant', err);
        }
      } else if (targetUser) {
        // Resolved via phone only (no email on file) — fall back to a direct
        // in-app notification since there's no email to track a pending invite by.
        const notifTitle = 'New Group Expense';
        const notifMsg = `${currentUser?.name || 'Someone'} added you to a split expense "${group.name}". Total: ₹${Number(group.totalAmount).toFixed(0)}, Your share: ₹${m.share.toFixed(0)}.`;
        const notification = await prisma.notification.create({
          data: {
            userId: targetUser.id,
            sourceUserId: userId,
            title: notifTitle,
            message: notifMsg,
            type: 'group_expense',
            priority: 'high',
            channels: '["app","email"]',
            deliveryStatus: '{"app":"sent","email":"queued"}',
          }
        });

        await queueGroupExpenseEmail(notification.id, targetUser.id, notifTitle, notifMsg);

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
            paid: m.paid || m.paymentStatus === 'paid' || false,
            email: m.email,
            phone: m.phone,
            isCurrentUser: m.isCurrentUser,
          };
        });

        const participants = normalizedMembers.filter((m: any) => !m.isCurrentUser && m.name.toLowerCase() !== 'you');

        for (const m of participants) {
          let friend = await prisma.friend.findFirst({
            where: { userId, name: { equals: m.name, mode: 'insensitive' }, deletedAt: null }
          });

          const memberEmail = (m.email || '').trim().toLowerCase() || null;
          const memberPhone = (m.phone || '').trim() || null;

          if (!friend && (memberEmail || memberPhone)) {
            friend = await prisma.friend.findFirst({
              where: {
                userId,
                deletedAt: null,
                OR: [memberEmail ? { email: memberEmail } : null, memberPhone ? { phone: memberPhone } : null].filter(Boolean) as any,
              },
            });
          }
          if (!friend && (memberEmail || memberPhone)) {
            friend = await prisma.friend.create({
              data: { userId, name: sanitize(m.name), email: memberEmail, phone: memberPhone, syncStatus: 'synced' },
            });
          }

          const targetUser = await findUserByEmailOrPhone(friend?.email, friend?.phone);
          const email = memberEmail || friend?.email || null;

          await prisma.groupExpenseMember.create({
            data: {
              groupExpenseId: id,
              userId: targetUser ? targetUser.id : null,
              friendId: friend?.id || null,
              name: m.name,
              email,
              phone: friend?.phone || memberPhone,
              shareAmount: m.share,
              hasPaid: m.paid,
            }
          });

          if (email) {
            try {
              const detail = `Total: ₹${Number(updated.totalAmount).toFixed(0)}, Your share: ₹${Number(m.share).toFixed(0)}.`;
              await inviteParticipants({
                moduleType: 'group_expense',
                moduleId: id,
                moduleName: updated.name,
                creatorId: userId,
                participants: [{ email, name: m.name, detail }],
              });
            } catch (err) {
              logger.warn('Failed to invite group expense participant on update', err);
            }
          } else if (targetUser) {
            // Resolved via phone only (no email on file) — fall back to a direct
            // in-app notification since there's no email to track a pending invite by.
            const updNotifTitle = 'Group Expense Updated';
            const updNotifMsg = `${currentUser.name} updated the split expense "${updated.name}".`;
            const notification = await prisma.notification.create({
              data: {
                userId: targetUser.id,
                sourceUserId: userId,
                title: updNotifTitle,
                message: updNotifMsg,
                type: 'group_expense',
                priority: 'normal',
                channels: '["app","email"]',
                deliveryStatus: '{"app":"sent","email":"queued"}',
              }
            });

            await queueGroupExpenseEmail(notification.id, targetUser.id, updNotifTitle, updNotifMsg);

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

          // Notify creator
          const settleNotifTitle = 'Split Expense Settled';
          const settleNotifMsg = `${currentUser.name} marked their share as paid for "${existing.name}".`;
          const notificationCreator = await prisma.notification.create({
            data: {
              userId: existing.userId,
              sourceUserId: userId,
              title: settleNotifTitle,
              message: settleNotifMsg,
              type: 'group_expense',
              priority: 'normal',
              channels: '["app","email"]',
              deliveryStatus: '{"app":"sent","email":"queued"}',
            }
          });
          await queueGroupExpenseEmail(notificationCreator.id, existing.userId, settleNotifTitle, settleNotifMsg);

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

/**
 * Repairs ALL stale GroupExpenseMember rows across all groups owned by this
 * user. Called automatically by the frontend on Groups page mount.
 */
export const repairAllGroupMembers = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);

    // Find all group expenses owned by this user
    const groups = await prisma.groupExpense.findMany({
      where: { userId, deletedAt: null },
      select: { id: true, name: true, totalAmount: true },
    });

    if (!groups.length) {
      return res.json({ success: true, message: 'No groups to repair', repaired: 0 });
    }

    const groupIds = groups.map(g => g.id);
    const staleMembers = await prisma.groupExpenseMember.findMany({
      where: { groupExpenseId: { in: groupIds }, deletedAt: null, friendId: null, email: null },
    });

    if (!staleMembers.length) {
      return res.json({ success: true, message: 'No stale members', repaired: 0 });
    }

    const friends = await prisma.friend.findMany({
      where: { userId, deletedAt: null },
    });
    const friendByNameLower = new Map(friends.map(f => [f.name.toLowerCase(), f]));
    const groupById = new Map(groups.map(g => [g.id, g]));

    let repaired = 0;
    for (const m of staleMembers) {
      const friend = friendByNameLower.get(m.name.toLowerCase());
      if (!friend || !friend.email) continue;

      const targetUser = await findUserByEmailOrPhone(friend.email, friend.phone);
      await prisma.groupExpenseMember.update({
        where: { id: m.id },
        data: { email: friend.email, phone: friend.phone || null, friendId: friend.id, userId: targetUser?.id || null },
      });

      const group = groupById.get(m.groupExpenseId);
      if (group) {
        try {
          const detail = `Total: ₹${Number(group.totalAmount).toFixed(0)}, Your share: ₹${Number(m.shareAmount).toFixed(0)}.`;
          await inviteParticipants({
            moduleType: 'group_expense',
            moduleId: group.id,
            moduleName: group.name,
            creatorId: userId,
            participants: [{ email: friend.email, name: m.name, detail }],
          });
        } catch (err) {
          logger.warn('Failed to send deferred invite during bulk repair', err);
        }
      }
      repaired++;
    }

    res.json({ success: true, repaired, total: staleMembers.length });
  } catch (error) {
    logger.error('Failed to repair all group members', { error });
    res.status(500).json({ success: false, error: 'Failed to repair group members' });
  }
};

/**
 * Repairs stale GroupExpenseMember rows where email/friendId were never set
 * (created before the normalizedMembers bug was fixed). For each such row,
 * looks up the Friend by name, back-fills email/friendId, and triggers
 * inviteParticipants so the overdue notification/email is sent now.
 */
export const repairGroupMembers = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const group = await prisma.groupExpense.findFirst({ where: { id, userId, deletedAt: null } });
    if (!group) {
      return res.status(404).json({ success: false, error: 'Group not found or access denied' });
    }

    const staleMembers = await prisma.groupExpenseMember.findMany({
      where: { groupExpenseId: id, deletedAt: null, friendId: null, email: null },
    });

    if (!staleMembers.length) {
      return res.json({ success: true, message: 'No stale members to repair', repaired: 0 });
    }

    let repaired = 0;
    const details: any[] = [];

    for (const m of staleMembers) {
      const friend = await prisma.friend.findFirst({
        where: { userId, name: { equals: m.name, mode: 'insensitive' }, deletedAt: null },
      });

      if (!friend || !friend.email) {
        details.push({ name: m.name, result: 'skipped_no_friend_email' });
        continue;
      }

      const targetUser = await findUserByEmailOrPhone(friend.email, friend.phone);

      await prisma.groupExpenseMember.update({
        where: { id: m.id },
        data: {
          email: friend.email,
          phone: friend.phone || null,
          friendId: friend.id,
          userId: targetUser?.id || null,
        },
      });

      try {
        const detail = `Total: ₹${Number(group.totalAmount).toFixed(0)}, Your share: ₹${Number(m.shareAmount).toFixed(0)}.`;
        await inviteParticipants({
          moduleType: 'group_expense',
          moduleId: id,
          moduleName: group.name,
          creatorId: userId,
          participants: [{ email: friend.email, name: m.name, detail }],
        });
      } catch (err) {
        logger.warn('Failed to send deferred invite during repair', err);
      }

      repaired++;
      details.push({ name: m.name, email: friend.email, result: 'repaired' });
    }

    res.json({ success: true, repaired, total: staleMembers.length, details });
  } catch (error) {
    logger.error('Failed to repair group members', { error });
    res.status(500).json({ success: false, error: 'Failed to repair group members' });
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
