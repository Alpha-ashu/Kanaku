import { randomUUID } from 'crypto';
import { Response } from 'express';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { prisma } from '../../db/prisma';
import { logger } from '../../config/logger';
import { isDatabaseUnavailableError } from '../../utils/databaseAvailability';
import { getSocketManager } from '../../sockets';
import { sanitize } from '../../utils/sanitize';
import { inviteParticipants } from '../collaboration/invitation.service';
import { FinancialEventDispatcher, GroupExpenseCreatedEvent, GroupSettlementCompletedEvent } from '../transactions/dispatcher';
import { FinancialLedgerService } from '../transactions/ledger.service';
import { Decimal } from '@prisma/client/runtime/library';


async function findUserByEmailOrPhone(email?: string | null, phone?: string | null, client: any = prisma): Promise<any> {
  if (email) {
    const user = await client.user.findFirst({ where: { email } });
    if (user) return user;
  }
  if (phone) {
    const profile = await client.profiles.findFirst({ where: { phone } });
    if (profile) return client.user.findUnique({ where: { id: profile.id } });
  }
  return null;
}

// Pure assembler — converts a GroupExpense + its already-fetched context into
// the response shape. No DB access here so it can be reused by both the single-
// group path (buildGroupResponse) and the batched list path (getGroups),
// avoiding the previous N+1 (3 queries per group + the friends list re-fetched
// once per group).
const assembleGroupResponse = (
  group: any,
  requestingUserId: string,
  members: any[],
  userFriends: any[],
  creatorName: string | undefined,
) => {
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

  const isCreatorMe = group.userId === requestingUserId;
  const creatorShare = Number(group.yourShare ?? (group.totalAmount / (members.length + 1)));

  const creatorMember = {
    name: isCreatorMe ? 'You' : (creatorName || 'Creator'),
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

// Single-group helper — fetches this group's context then assembles. Used by
// the create/update/get-one paths where only one group is in play.
const buildGroupResponse = async (group: any, requestingUserId: string) => {
  const [members, userFriends, creatorUser] = await Promise.all([
    prisma.groupExpenseMember.findMany({ where: { groupExpenseId: group.id, deletedAt: null } }),
    prisma.friend.findMany({ where: { userId: requestingUserId, deletedAt: null } }),
    prisma.user.findUnique({ where: { id: group.userId }, select: { name: true } }),
  ]);
  return assembleGroupResponse(group, requestingUserId, members, userFriends, creatorUser?.name);
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

    // Pagination — bounded page size so a user with many groups can't force an
    // unbounded response. Defaults keep the previous "all recent" behaviour for
    // typical accounts (page 1, 100 rows).
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 100));

    const where = {
      deletedAt: null,
      OR: [
        { userId },
        { groupMembers: { some: { userId, deletedAt: null } } },
        ...emailConditions,
      ],
    };

    const [groups, total] = await Promise.all([
      prisma.groupExpense.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.groupExpense.count({ where }),
    ]);

    // Batch-load everything the assembler needs in a fixed number of queries
    // (was 3 queries PER group + the friends list re-fetched each iteration):
    //   1 members query for all groups, 1 friends query, 1 creators query.
    const groupIds = groups.map((g) => g.id);
    const creatorIds = [...new Set(groups.map((g) => g.userId))];
    const [allMembers, userFriends, creators] = await Promise.all([
      groupIds.length
        ? prisma.groupExpenseMember.findMany({ where: { groupExpenseId: { in: groupIds }, deletedAt: null } })
        : Promise.resolve([]),
      prisma.friend.findMany({ where: { userId, deletedAt: null } }),
      creatorIds.length
        ? prisma.user.findMany({ where: { id: { in: creatorIds } }, select: { id: true, name: true } })
        : Promise.resolve([]),
    ]);

    const membersByGroup = new Map<string, any[]>();
    for (const m of allMembers) {
      const list = membersByGroup.get(m.groupExpenseId) ?? [];
      list.push(m);
      membersByGroup.set(m.groupExpenseId, list);
    }
    const creatorNameById = new Map<string, string>(
      creators.map((c): [string, string] => [c.id, c.name]),
    );

    const data = groups.map((g) =>
      assembleGroupResponse(g, userId, membersByGroup.get(g.id) ?? [], userFriends, creatorNameById.get(g.userId)),
    );

    res.json({
      success: true,
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
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

const findMatchingExistingMember = (newM: any, existingList: any[]) => {
  return existingList.find(extM => {
    if (newM.userId && extM.userId === newM.userId) return true;
    if (newM.friendId && extM.friendId === newM.friendId) return true;
    if (newM.email && extM.email && newM.email.trim().toLowerCase() === extM.email.trim().toLowerCase()) return true;
    if (newM.name && extM.name && newM.name.trim().toLowerCase() === extM.name.trim().toLowerCase()) return true;
    return false;
  });
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

    const invitationsToSend: { email: string; name: string; share: number }[] = [];
    const socketNotificationsToSend: { targetUserId: string; notification?: any; groupExpenseId: string }[] = [];

    const result = await prisma.$transaction(async (tx) => {
      const group = await tx.groupExpense.create({
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

      const currentUser = await tx.user.findUnique({ where: { id: userId } });

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
        let friend = await tx.friend.findFirst({
          where: { userId, name: { equals: m.name, mode: 'insensitive' }, deletedAt: null }
        });

        const memberEmail = (m.email || '').trim().toLowerCase() || null;
        const memberPhone = (m.phone || '').trim() || null;

        // Fall back to matching an existing friend by contact info if the name didn't match.
        if (!friend && (memberEmail || memberPhone)) {
          friend = await tx.friend.findFirst({
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
          friend = await tx.friend.create({
            data: { userId, name: sanitize(m.name), email: memberEmail, phone: memberPhone, syncStatus: 'synced' },
          });
        }

        const targetUser = await findUserByEmailOrPhone(friend?.email, friend?.phone, tx);

        const email = (memberEmail || friend?.email || '').trim().toLowerCase() || null;

        await tx.groupExpenseMember.create({
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
          invitationsToSend.push({ email, name: m.name, share: m.share });
        } else if (targetUser) {
          const notifTitle = 'New Group Expense';
          const notifMsg = `${currentUser?.name || 'Someone'} added you to a split expense "${group.name}". Total: ₹${Number(group.totalAmount).toFixed(0)}, Your share: ₹${m.share.toFixed(0)}.`;
          const notification = await tx.notification.create({
            data: {
              userId: targetUser.id,
              sourceUserId: userId,
              title: notifTitle,
              message: notifMsg,
              type: 'group_expense',
              category: 'group_expense',
              deepLink: '/groups',
              priority: 'high',
              channels: '["app","email"]',
              deliveryStatus: '{"app":"sent","email":"queued"}',
              status: 'pending',
            }
          });

          socketNotificationsToSend.push({
            targetUserId: targetUser.id,
            notification,
            groupExpenseId: group.id
          });
        }
      }

      // Ledger V2 Integration
      if (FinancialLedgerService.isEnabled('groups')) {
        let accountId = group.paidBy;
        if (!accountId) {
          const defaultAccount = await tx.account.findFirst({
            where: { userId, isActive: true, deletedAt: null },
            orderBy: { createdAt: 'asc' }
          });
          accountId = defaultAccount?.id || null;
        }

        if (accountId) {
          await FinancialEventDispatcher.publish(tx, new GroupExpenseCreatedEvent(
            userId,
            group.id,
            accountId,
            Number(group.totalAmount),
            group.name,
            group.category || 'Group Expense',
            `group-expense-create-${group.id}`
          ));
        }
      }

      return group;
    }, { timeout: 30000 });

    await FinancialEventDispatcher.flushDeferred();

    // Execute invitations outside of the transaction block
    for (const inv of invitationsToSend) {
      try {
        const detail = `Total: ₹${Number(result.totalAmount).toFixed(0)}, Your share: ₹${Number(inv.share).toFixed(0)}.`;
        await inviteParticipants({
          moduleType: 'group_expense',
          moduleId: result.id,
          moduleName: result.name,
          creatorId: userId,
          participants: [{ email: inv.email, name: inv.name, detail }],
        });
      } catch (err) {
        logger.warn('Failed to invite group expense participant', err);
      }
    }

    // Execute socket updates outside of the transaction block
    for (const item of socketNotificationsToSend) {
      try {
        const socketManager = getSocketManager();
        if (item.notification) {
          socketManager.notifyUser(item.targetUserId, 'notification', item.notification);
        }
        socketManager.notifyUser(item.targetUserId, 'group_expense_updated', { groupId: item.groupExpenseId });
      } catch (err) {
        logger.warn('Socket notification failed for group expense', err);
      }
    }

    const data = await buildGroupResponse(result, userId);
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

    let updatedGroup: any;
    const invitationsToSend: { email: string; name: string; share: number; totalAmount: number; groupName: string }[] = [];
    const socketNotificationsToSend: { targetUserId: string; notification?: any; groupExpenseId: string }[] = [];

    if (isCreator) {
      // Owner can update everything
      updatedGroup = await prisma.$transaction(async (tx) => {
        const updated = await tx.groupExpense.update({
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

        const transitions: { member: any; email: string | null; targetUserId: string | null; friendId: string | null; oldMemberId?: string | null }[] = [];

        // Update members if provided
        if (body.members) {
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
            const existingMember = findMatchingExistingMember(m, existingMembers);
            const wasPaid = existingMember?.hasPaid || false;
            const nextPaid = m.paid || false;

            if (nextPaid && !wasPaid) {
              transitions.push({
                member: m,
                email: m.email || existingMember?.email || null,
                targetUserId: existingMember?.userId || null,
                friendId: existingMember?.friendId || null,
                oldMemberId: existingMember?.id || null
              });
            }
          }

          // Soft delete/hard delete existing members first
          await tx.groupExpenseMember.deleteMany({
            where: { groupExpenseId: id }
          });

          for (const m of participants) {
            let friend = await tx.friend.findFirst({
              where: { userId, name: { equals: m.name, mode: 'insensitive' }, deletedAt: null }
            });

            const memberEmail = (m.email || '').trim().toLowerCase() || null;
            const memberPhone = (m.phone || '').trim() || null;

            if (!friend && (memberEmail || memberPhone)) {
              friend = await tx.friend.findFirst({
                where: {
                  userId,
                  deletedAt: null,
                  OR: [memberEmail ? { email: memberEmail } : null, memberPhone ? { phone: memberPhone } : null].filter(Boolean) as any,
                },
              });
            }
            if (!friend && (memberEmail || memberPhone)) {
              friend = await tx.friend.create({
                data: { userId, name: sanitize(m.name), email: memberEmail, phone: memberPhone, syncStatus: 'synced' },
              });
            }

            const targetUser = await findUserByEmailOrPhone(friend?.email, friend?.phone, tx);
            const email = memberEmail || friend?.email || null;

            const createdMember = await tx.groupExpenseMember.create({
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

            const matchingTransition = transitions.find(t =>
              t.member.name === m.name ||
              (t.member.userId && t.member.userId === targetUser?.id) ||
              (t.member.email && t.member.email.toLowerCase() === email?.toLowerCase())
            );
            if (matchingTransition) {
              matchingTransition.member.newId = createdMember.id;
            }

            if (email) {
              invitationsToSend.push({
                email,
                name: m.name,
                share: m.share,
                totalAmount: Number(updated.totalAmount),
                groupName: updated.name
              });
            } else if (targetUser) {
              const updNotifTitle = 'Group Expense Updated';
              const updNotifMsg = `${currentUser.name} updated the split expense "${updated.name}".`;
              const notification = await tx.notification.create({
                data: {
                  userId: targetUser.id,
                  sourceUserId: userId,
                  title: updNotifTitle,
                  message: updNotifMsg,
                  type: 'group_expense',
                  category: 'group_expense',
                  deepLink: '/groups',
                  priority: 'normal',
                  channels: '["app","email"]',
                  deliveryStatus: '{"app":"sent","email":"queued"}',
                  status: 'pending',
                }
              });

              socketNotificationsToSend.push({
                targetUserId: targetUser.id,
                notification,
                groupExpenseId: id
              });
            }
          }
        } else {
          // Just trigger socket updates to existing participants
          for (const m of existingMembers) {
            if (m.userId) {
              socketNotificationsToSend.push({
                targetUserId: m.userId,
                groupExpenseId: id
              });
            }
          }
        }

        // Publish settlement completed events
        if (FinancialLedgerService.isEnabled('groups')) {
          let accountId = updated.paidBy;
          if (!accountId) {
            const defaultAccount = await tx.account.findFirst({
              where: { userId, isActive: true, deletedAt: null },
              orderBy: { createdAt: 'asc' }
            });
            accountId = defaultAccount?.id || null;
          }

          if (accountId) {
            for (const t of transitions) {
              const settlementId = t.member.newId;
              if (!settlementId) continue;

              await FinancialEventDispatcher.publish(tx, new GroupSettlementCompletedEvent(
                updated.userId,
                id,
                settlementId,
                t.targetUserId,
                updated.userId,
                Number(t.member.share),
                accountId,
                updated.category || 'Group Expense',
                `Settlement Received - ${updated.name}`,
                new Date(),
                `group-settlement-${id}-${settlementId}`,
                t.oldMemberId
              ));
            }
          }
        }

        return updated;
      }, { timeout: 30000 });

      await FinancialEventDispatcher.flushDeferred();

      // Execute invitations after creator update transaction
      for (const inv of invitationsToSend) {
        try {
          const detail = `Total: ₹${inv.totalAmount.toFixed(0)}, Your share: ₹${inv.share.toFixed(0)}.`;
          await inviteParticipants({
            moduleType: 'group_expense',
            moduleId: id,
            moduleName: inv.groupName,
            creatorId: userId,
            participants: [{ email: inv.email, name: inv.name, detail }],
          });
        } catch (err) {
          logger.warn('Failed to invite group expense participant on update', err);
        }
      }
    } else {
      // Participant: can only update their own paid status
      updatedGroup = existing;
      if (body.members) {
        const myMemberEntry = body.members.find((m: any) => m.isCurrentUser || m.userId === userId || m.email === currentUser.email);
        if (myMemberEntry) {
          const nextPaid = myMemberEntry.paid || myMemberEntry.paymentStatus === 'paid';
          const existingMember = existingMembers.find(m => m.userId === userId);
          const wasPaid = existingMember?.hasPaid || false;

          await prisma.$transaction(async (tx) => {
            if (nextPaid && !wasPaid && existingMember) {
              await tx.groupExpenseMember.updateMany({
                where: { groupExpenseId: id, userId },
                data: {
                  hasPaid: true,
                  paidAt: new Date(),
                }
              });

              if (FinancialLedgerService.isEnabled('groups')) {
                let accountId = existing.paidBy;
                if (!accountId) {
                  const defaultAccount = await tx.account.findFirst({
                    where: { userId: existing.userId, isActive: true, deletedAt: null },
                    orderBy: { createdAt: 'asc' }
                  });
                  accountId = defaultAccount?.id || null;
                }

                if (accountId) {
                  await FinancialEventDispatcher.publish(tx, new GroupSettlementCompletedEvent(
                    existing.userId,
                    id,
                    existingMember.id,
                    userId,
                    existing.userId,
                    Number(existingMember.shareAmount),
                    accountId,
                    existing.category || 'Group Expense',
                    `Settlement Received - ${existing.name}`,
                    new Date(),
                    `group-settlement-${id}-${existingMember.id}`
                  ));
                }
              }

              // Notify creator via outbox row (within tx)
              const settleNotifTitle = 'Split Expense Settled';
              const settleNotifMsg = `${currentUser.name} marked their share as paid for "${existing.name}".`;
              const notificationCreator = await tx.notification.create({
                data: {
                  userId: existing.userId,
                  sourceUserId: userId,
                  title: settleNotifTitle,
                  message: settleNotifMsg,
                  type: 'group_expense',
                  category: 'group_expense',
                  deepLink: '/groups',
                  priority: 'normal',
                  channels: '["app","email"]',
                  deliveryStatus: '{"app":"sent","email":"queued"}',
                  status: 'pending',
                }
              });

              socketNotificationsToSend.push({
                targetUserId: existing.userId,
                notification: notificationCreator,
                groupExpenseId: id
              });

              for (const m of existingMembers) {
                if (m.userId && m.userId !== userId) {
                  socketNotificationsToSend.push({
                    targetUserId: m.userId,
                    groupExpenseId: id
                  });
                }
              }
            } else {
              // Just update the status
              await tx.groupExpenseMember.updateMany({
                where: { groupExpenseId: id, userId },
                data: {
                  hasPaid: nextPaid,
                  paidAt: nextPaid ? new Date() : null,
                }
              });
            }
          }, { timeout: 30000 });

          await FinancialEventDispatcher.flushDeferred();
        }
      }
    }

    // Execute socket updates after transaction block
    for (const item of socketNotificationsToSend) {
      try {
        const socketManager = getSocketManager();
        if (item.notification) {
          socketManager.notifyUser(item.targetUserId, 'notification', item.notification);
        }
        socketManager.notifyUser(item.targetUserId, 'group_expense_updated', { groupId: item.groupExpenseId });
      } catch (err) {
        // Ignore
      }
    }

    const data = await buildGroupResponse(updatedGroup, userId);
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

export const getGroupAnalytics = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);

    // Get all groups created by the user
    const groups = await prisma.groupExpense.findMany({
      where: { userId, deletedAt: null }
    });

    const groupIds = groups.map(g => g.id);

    // Get all members for these groups
    const members = await prisma.groupExpenseMember.findMany({
      where: { groupExpenseId: { in: groupIds }, deletedAt: null }
    });

    // Calculations
    let totalGroupExpenses = 0;
    let netGroupSpending = 0;
    for (const g of groups) {
      totalGroupExpenses += Number(g.totalAmount);
      netGroupSpending += Number(g.yourShare || 0);
    }

    let totalRecoveredAmount = 0;
    let pendingCollection = 0;
    let totalPaidCount = 0;
    let totalMembersCount = 0;
    let totalSettlementDays = 0;
    let overdueSettlements = 0;

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const friendStatsMap = new Map<string, { recovered: number; pending: number }>();
    const categoryStatsMap = new Map<string, number>();

    for (const m of members) {
      const share = Number(m.shareAmount);
      totalMembersCount++;

      const friendKey = m.name || 'Unknown';
      if (!friendStatsMap.has(friendKey)) {
        friendStatsMap.set(friendKey, { recovered: 0, pending: 0 });
      }
      const friendStat = friendStatsMap.get(friendKey)!;

      if (m.hasPaid) {
        totalRecoveredAmount += share;
        totalPaidCount++;
        friendStat.recovered += share;

        const groupExp = groups.find(g => g.id === m.groupExpenseId);
        if (groupExp && m.paidAt) {
          const createTime = new Date(groupExp.createdAt).getTime();
          const payTime = new Date(m.paidAt).getTime();
          const diffDays = Math.max(0, (payTime - createTime) / (1000 * 60 * 60 * 24));
          totalSettlementDays += diffDays;
        }
      } else {
        pendingCollection += share;
        friendStat.pending += share;

        const groupExp = groups.find(g => g.id === m.groupExpenseId);
        if (groupExp && new Date(groupExp.createdAt) < oneWeekAgo) {
          overdueSettlements++;
        }
      }
    }

    for (const g of groups) {
      const cat = g.category || 'Group Expense';
      const amt = Number(g.totalAmount);
      categoryStatsMap.set(cat, (categoryStatsMap.get(cat) || 0) + amt);
    }

    const recoveryRate = (totalRecoveredAmount + pendingCollection) > 0
      ? (totalRecoveredAmount / (totalRecoveredAmount + pendingCollection)) * 100
      : 0;

    const avgSettlementTimeDays = totalPaidCount > 0
      ? totalSettlementDays / totalPaidCount
      : 0;

    const collectionEfficiency = totalMembersCount > 0
      ? (totalPaidCount / totalMembersCount) * 100
      : 0;

    const topFriends = Array.from(friendStatsMap.entries()).map(([name, stats]) => ({
      name,
      recovered: stats.recovered,
      pending: stats.pending,
      total: stats.recovered + stats.pending
    })).sort((a, b) => b.recovered - a.recovered).slice(0, 5);

    const categoryBreakdown = Array.from(categoryStatsMap.entries()).map(([category, amount]) => ({
      category,
      amount
    })).sort((a, b) => b.amount - a.amount);

    res.json({
      success: true,
      data: {
        totalGroupExpenses,
        totalRecoveredAmount,
        pendingCollection,
        netGroupSpending,
        recoveryRate,
        avgSettlementTimeDays,
        collectionEfficiency,
        overdueSettlements,
        topFriends,
        categoryBreakdown
      }
    });
  } catch (error) {
    logger.error('Failed to fetch group analytics', { error });
    res.status(500).json({ success: false, error: 'Failed to fetch group analytics' });
  }
};

