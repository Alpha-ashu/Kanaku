import { randomUUID } from 'crypto';
import { Response } from 'express';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { prisma } from '../../db/prisma';
import { logger } from '../../config/logger';
import { isDatabaseUnavailableError } from '../../utils/databaseAvailability';
import { AppError } from '../../utils/AppError';
import { createdAtKeysetOrder, createdAtPosition, readKeysetPage, sliceKeysetPage, withCreatedAtKeyset } from '../../utils/pagination';
import { getSocketManager } from '../../sockets';
import { sanitize } from '../../utils/sanitize';
import { inviteParticipants } from '../collaboration/invitation.service';
import { notifyGroupExpenseChanged } from '../notifications/triggers';
import { FinancialEventDispatcher, GroupExpenseCreatedEvent, GroupSettlementCompletedEvent } from '../transactions/dispatcher';
import { FinancialLedgerService } from '../transactions/ledger.service';
import { findAllocationError, isAllocationAware, owedAmount } from './group.allocation';
import { asClientRequestId } from '../../utils/idempotentCreate';


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

/**
 * Push a `group_expense_updated` refresh to everyone entitled to see this
 * expense, except whoever just changed it.
 *
 * This is a DATA-SYNC signal, not a notification: the client's only reaction is
 * to re-pull /groups (AppContext listens for it and calls syncUserDataFromCloud).
 * Two things follow from that, and both were wrong before:
 *
 *  1. It must reach the same people `getGroups` grants access to — which
 *     includes members matched by EMAIL, not just those with a `userId` on
 *     their member row. Every previous fan-out site was written as
 *     `if (m.userId) …`, so a participant who was added by email before they
 *     registered (or whose userId was never backfilled) could open the group
 *     from a cold start but never saw a live update. Resolving the email here
 *     closes that gap in one place instead of five.
 *
 *  2. It must not be conditional on a notification being created. The create
 *     path used to rely entirely on the collaboration engine's socket emit,
 *     which returns early on a duplicate dedupKey or when the member muted
 *     group notifications — so muting notifications silently stopped that
 *     device from receiving group DATA. Preferences govern what a user is
 *     told, never what their device is allowed to know.
 *
 * Best-effort by design: a socket failure must not fail the mutation that
 * already committed. Clients that miss the event still reconcile on next sync.
 */
const broadcastGroupExpenseChange = async (
  groupExpenseId: string,
  actorUserId: string,
  options: { includeDeletedMembers?: Date | null; alsoNotify?: (string | null | undefined)[] } = {},
): Promise<void> => {
  try {
    const group = await prisma.groupExpense.findUnique({
      where: { id: groupExpenseId },
      select: { userId: true },
    });
    if (!group) return;

    const members = await prisma.groupExpenseMember.findMany({
      where: {
        groupExpenseId,
        // A deletion soft-deletes the member rows in the same instant as the
        // expense, so "who to tell" has to be looked up at that same stamp.
        deletedAt: options.includeDeletedMembers ?? null,
      },
      select: { userId: true, email: true },
    });

    const targets = new Set<string>();
    targets.add(group.userId);
    for (const m of members) if (m.userId) targets.add(m.userId);

    const unresolvedEmails = [
      ...new Set(
        members
          .filter((m) => !m.userId && m.email)
          .map((m) => m.email!.trim().toLowerCase())
          .filter(Boolean),
      ),
    ];
    if (unresolvedEmails.length > 0) {
      const matched = await prisma.user.findMany({
        where: { email: { in: unresolvedEmails } },
        select: { id: true },
      });
      for (const u of matched) targets.add(u.id);
    }

    // People this change removed from the group are no longer members, so the
    // query above cannot find them — but their device is exactly the one that
    // still shows a row it should drop.
    for (const extra of options.alsoNotify ?? []) if (extra) targets.add(extra);

    targets.delete(actorUserId);
    if (targets.size === 0) return;

    const socketManager = getSocketManager();
    for (const targetUserId of targets) {
      try {
        socketManager.notifyUser(targetUserId, 'group_expense_updated', { groupId: groupExpenseId });
      } catch (err) {
        logger.warn('Group expense socket fan-out failed for one recipient', { targetUserId, err });
      }
    }
  } catch (err) {
    logger.warn('Group expense socket fan-out failed', { groupExpenseId, err });
  }
};

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
      contribution: Number(m.contributedAmount ?? 0),
      splitValue: m.splitValue != null ? Number(m.splitValue) : null,
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
  // Rows from before member-level payments have no yourPaidAmount: the creator
  // paid the whole bill, which is what those expenses always meant.
  const creatorContribution = group.yourPaidAmount != null ? Number(group.yourPaidAmount) : Number(group.totalAmount);
  const creatorSettled = Boolean(group.yourSettledAt) || owedAmount(creatorShare, creatorContribution) === 0;

  const creatorMember = {
    name: isCreatorMe ? 'You' : (creatorName || 'Creator'),
    share: creatorShare,
    contribution: creatorContribution,
    splitValue: group.yourSplitValue != null ? Number(group.yourSplitValue) : null,
    paid: creatorSettled,
    isCurrentUser: isCreatorMe,
    paidAmount: creatorSettled ? creatorShare : 0,
    paymentStatus: creatorSettled ? 'paid' as const : 'pending' as const,
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
    yourPaidAmount: creatorContribution,
    yourSplitValue: group.yourSplitValue != null ? Number(group.yourSplitValue) : null,
    yourSettled: creatorSettled,
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
    // typical accounts (page 1, 100 rows). A request with `cursor` gets keyset
    // pages instead (see utils/pagination) and skips the count.
    const keyset = readKeysetPage(req.query);
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

    const [rows, total] = await Promise.all([
      prisma.groupExpense.findMany({
        where: withCreatedAtKeyset(where, keyset),
        orderBy: keyset ? createdAtKeysetOrder() : { createdAt: 'desc' },
        ...(keyset ? { take: keyset.limit + 1 } : { skip: (page - 1) * limit, take: limit }),
      }),
      keyset ? Promise.resolve(0) : prisma.groupExpense.count({ where }),
    ]);
    const { items: groups, nextCursor } = keyset
      ? sliceKeysetPage(rows, keyset, createdAtPosition)
      : { items: rows, nextCursor: null };

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

    if (keyset) {
      return res.json({ success: true, data: { items: data, nextCursor } });
    }
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
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ success: false, error: error.message, code: error.code });
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

const normalizeEmail = (value?: string | null) => (value || '').trim().toLowerCase() || null;
const normalizePhone = (value?: string | null) => (value || '').replace(/\D/g, '') || null;

// Finds the stored row an incoming member refers to, strongest identity first.
// A bare name only matches when the two sides carry no conflicting contact
// details, since friends may share a display name. `taken` stops one stored row
// from absorbing two incoming members.
const findMatchingExistingMember = (incoming: any, existingList: any[], taken: Set<string> = new Set()) => {
  const available = existingList.filter((m) => !taken.has(m.id));
  const friendId = incoming.friendId ? String(incoming.friendId) : null;
  const email = normalizeEmail(incoming.email);
  const phone = normalizePhone(incoming.phone);
  const name = (incoming.name || '').trim().toLowerCase();
  return (
    (incoming.userId && available.find((m) => m.userId === incoming.userId)) ||
    (friendId && available.find((m) => m.friendId === friendId)) ||
    (email && available.find((m) => normalizeEmail(m.email) === email)) ||
    (phone && available.find((m) => normalizePhone(m.phone) === phone)) ||
    available.find((m) =>
      Boolean(name) && (m.name || '').trim().toLowerCase() === name &&
      !(email && m.email) && !(phone && m.phone),
    ) ||
    null
  );
};

// The client sends the friend's server id when it has one; two friends can share
// a display name, so the name is only a fallback.
const findOwnFriend = async (tx: any, userId: string, member: { friendId?: unknown; name: string }) => {
  if (typeof member.friendId === 'string' && member.friendId) {
    const byId = await tx.friend.findFirst({ where: { id: member.friendId, userId, deletedAt: null } });
    if (byId) return byId;
  }
  return tx.friend.findFirst({
    where: { userId, name: { equals: member.name, mode: 'insensitive' }, deletedAt: null },
  });
};

const toOptionalDecimal = (value: unknown) => (value === undefined ? undefined : value === null ? null : Number(value));

export const createGroup = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const body = req.body;
    const groupRequestKey = asClientRequestId(body?.clientRequestId);

    // Replay of a group we already created. Checked before the same-day
    // name+amount heuristic below, because this identifies the exact submission
    // rather than "a group that looks like this one".
    if (groupRequestKey) {
      const replay = await prisma.groupExpense.findFirst({
        where: { userId, clientRequestId: groupRequestKey },
      });
      if (replay) return res.status(200).json({ success: true, data: replay });
    }

    const targetDate = new Date(body.date);
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const duplicate = await prisma.groupExpense.findFirst({
      where: {
        userId,
        name: body.name,
        totalAmount: body.totalAmount,
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

    if (isAllocationAware(body)) {
      const allocationError = findAllocationError(body);
      if (allocationError) {
        return res.status(400).json({ success: false, error: allocationError, code: 'ALLOCATION_MISMATCH' });
      }
    }

    const invitationsToSend: { email: string | null; phone: string | null; name: string; friendId: string | null; share: number }[] = [];

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
          yourPaidAmount: toOptionalDecimal(body.yourPaidAmount),
          yourSplitValue: toOptionalDecimal(body.yourSplitValue),
          yourSettledAt: body.yourSettled ? new Date() : null,
          status: body.status || 'pending',
          syncStatus: 'synced',
          clientRequestId: groupRequestKey,
        }
      });

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
          friendId: m.friendId,
          share: m.share ?? (body.totalAmount / (rawMembers.length + 1)),
          contribution: m.contribution ?? 0,
          splitValue: m.splitValue ?? null,
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
        let friend = await findOwnFriend(tx, userId, m);

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
        if (!friend) {
          friend = await tx.friend.create({
            data: {
              userId,
              name: sanitize(m.name),
              email: memberEmail || null,
              phone: memberPhone || null,
              syncStatus: 'synced',
            },
          });
        }

        const targetUser = await findUserByEmailOrPhone(friend?.email, friend?.phone, tx);
        const email = (memberEmail || friend?.email || '').trim().toLowerCase() || null;
        const phone = friend?.phone || memberPhone || null;

        await tx.groupExpenseMember.create({
          data: {
            groupExpenseId: group.id,
            userId: targetUser ? targetUser.id : null,
            friendId: friend?.id || null,
            name: m.name,
            email,
            phone,
            shareAmount: m.share,
            contributedAmount: m.contribution ?? 0,
            splitValue: m.splitValue ?? null,
            hasPaid: m.paid,
            paidAt: m.paid ? new Date() : null,
          }
        });

        invitationsToSend.push({
          email,
          phone,
          name: m.name,
          friendId: friend?.id || null,
          share: m.share,
        });
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

    // Execute unified participant tracking and invitation outside the transaction block
    if (invitationsToSend.length > 0) {
      try {
        await inviteParticipants({
          moduleType: 'group_expense',
          moduleId: result.id,
          moduleName: result.name,
          creatorId: userId,
          participants: invitationsToSend.map(inv => ({
            email: inv.email,
            phone: inv.phone,
            name: inv.name,
            friendId: inv.friendId,
            detail: `Total: ₹${Number(result.totalAmount).toFixed(0)}, Your share: ₹${Number(inv.share).toFixed(0)}.`,
          })),
        });
      } catch (err) {
        logger.warn('Failed to track/invite group expense participants', err);
      }
    }

    // Tell every participant's device to re-pull. Previously this loop drained a
    // queue that nothing ever pushed to, so a newly created group expense reached
    // other members only via the collaboration engine's own emit — which is
    // skipped on a duplicate dedupKey or when the member muted group
    // notifications. That is why a member could not see a new group expense until
    // they relaunched the app.
    await broadcastGroupExpenseChange(result.id, userId);

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
    const isMemberByEmail = Boolean(currentUser.email && existingMembers.some(m => m.email && m.email.toLowerCase() === currentUser.email?.toLowerCase()));
    const isParticipant = existingMembers.some(m => m.userId === userId) || isMemberByEmail;

    if (!isCreator && !isParticipant) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    if (isCreator && body.members && isAllocationAware(body)) {
      const allocationError = findAllocationError({
        ...body,
        totalAmount: body.totalAmount ?? Number(existing.totalAmount),
      });
      if (allocationError) {
        return res.status(400).json({ success: false, error: allocationError, code: 'ALLOCATION_MISMATCH' });
      }
    }

    let updatedGroup: any;
    // Only members added by THIS edit are invited; everyone already in the
    // group gets a "changed" notice instead (notifyGroupExpenseChanged below).
    const invitationsToSend: { email: string | null; phone: string | null; name: string; share: number; totalAmount: number; groupName: string }[] = [];
    // Only needed for people the edit REMOVES: everyone still in the group is
    // resolved by broadcastGroupExpenseChange at the end.
    const removedMemberUserIds: string[] = [];
    // Set inside the transaction callbacks; the cast stops TS narrowing it to null.
    let changeToAnnounce = null as 'updated' | 'settled' | 'payment' | null;

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
            yourPaidAmount: toOptionalDecimal(body.yourPaidAmount),
            yourSplitValue: toOptionalDecimal(body.yourSplitValue),
            yourSettledAt: body.yourSettled === undefined
              ? undefined
              : body.yourSettled ? (existing.yourSettledAt ?? new Date()) : null,
            status: body.status !== undefined ? body.status : undefined,
            updatedAt: new Date()
          }
        });

        // Members who settled with this edit — each books one settlement.
        const transitions: { memberId: string; targetUserId: string | null; owed: number }[] = [];

        // Update members if provided
        if (body.members) {
          // Parse and normalize members
          const rawMembers = body.members || [];
          const normalizedMembers = rawMembers.map((m: any) => {
            if (typeof m === 'string') {
              return {
                name: m,
                share: (body.totalAmount ?? Number(existing.totalAmount)) / (rawMembers.length + 1),
                contribution: 0,
                splitValue: null,
                paid: false
              };
            }
            return {
              name: m.name,
              friendId: m.friendId,
              share: m.share ?? ((body.totalAmount ?? Number(existing.totalAmount)) / (rawMembers.length + 1)),
              contribution: m.contribution ?? 0,
              splitValue: m.splitValue ?? null,
              paid: m.paid || m.paymentStatus === 'paid' || false,
              email: m.email,
              phone: m.phone,
              isCurrentUser: m.isCurrentUser,
            };
          });

          const participants = normalizedMembers.filter((m: any) => !m.isCurrentUser && m.name.toLowerCase() !== 'you');

          // Reconcile rows in place — one row per member for the life of the
          // expense. Replacing them on every edit churned member ids (which are the
          // settlement references) and left nothing stopping a duplicate set.
          const matchedIds = new Set<string>();
          for (const m of participants) {
            const existingMember = findMatchingExistingMember(m, existingMembers, matchedIds);
            if (existingMember) matchedIds.add(existingMember.id);

            let friend = await findOwnFriend(tx, userId, m);

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
            const phone = friend?.phone || memberPhone;
            const wasPaid = existingMember?.hasPaid || false;
            const nextPaid = Boolean(m.paid);

            const memberData = {
              userId: targetUser ? targetUser.id : (existingMember?.userId ?? null),
              friendId: friend?.id || existingMember?.friendId || null,
              name: m.name,
              email,
              phone,
              shareAmount: m.share,
              contributedAmount: m.contribution ?? 0,
              splitValue: m.splitValue ?? null,
              hasPaid: nextPaid,
              paidAt: nextPaid ? (wasPaid ? (existingMember?.paidAt ?? new Date()) : new Date()) : null,
            };
            const savedMember = existingMember
              ? await tx.groupExpenseMember.update({ where: { id: existingMember.id }, data: memberData })
              : await tx.groupExpenseMember.create({ data: { groupExpenseId: id, ...memberData } });

            if (nextPaid && !wasPaid) {
              transitions.push({
                memberId: savedMember.id,
                targetUserId: savedMember.userId,
                owed: owedAmount(m.share, m.contribution ?? 0),
              });
            }

            if (!existingMember && (email || phone)) {
              invitationsToSend.push({
                email,
                phone,
                name: m.name,
                share: m.share,
                totalAmount: Number(updated.totalAmount),
                groupName: updated.name
              });
            }
          }

          // Members this edit removed: their allocation goes with them.
          const removedMembers = existingMembers.filter((m) => !matchedIds.has(m.id));
          if (removedMembers.length > 0) {
            await tx.groupExpenseMember.updateMany({
              where: { id: { in: removedMembers.map((m) => m.id) } },
              data: { deletedAt: new Date() },
            });
            for (const m of removedMembers) {
              if (m.userId) removedMemberUserIds.push(m.userId);
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
              // A member who paid at least their share owes nothing to settle.
              if (t.owed <= 0) continue;

              await FinancialEventDispatcher.publish(tx, new GroupSettlementCompletedEvent(
                updated.userId,
                id,
                t.memberId,
                t.targetUserId,
                updated.userId,
                t.owed,
                accountId,
                updated.category || 'Group Expense',
                `Settlement Received - ${updated.name}`,
                new Date(),
                `group-settlement-${id}-${t.memberId}`
              ));
            }
          }
        }

        changeToAnnounce = body.status === 'settled' && existing.status !== 'settled'
          ? 'settled'
          : transitions.length > 0 ? 'payment' : 'updated';

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
            participants: [{ email: inv.email, phone: inv.phone, name: inv.name, detail }],
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
          const existingMember = existingMembers.find(m =>
            m.userId === userId ||
            (currentUser.email && m.email && m.email.toLowerCase() === currentUser.email.toLowerCase())
          );
          const wasPaid = existingMember?.hasPaid || false;

          await prisma.$transaction(async (tx) => {
            if (nextPaid && !wasPaid && existingMember) {
              await tx.groupExpenseMember.updateMany({
                where: {
                  groupExpenseId: id,
                  OR: [
                    { userId },
                    ...(currentUser.email ? [{ email: { equals: currentUser.email, mode: 'insensitive' as const } }] : []),
                  ]
                },
                data: {
                  hasPaid: true,
                  paidAt: new Date(),
                  userId,
                }
              });

              const owed = owedAmount(existingMember.shareAmount, existingMember.contributedAmount);
              if (owed > 0 && FinancialLedgerService.isEnabled('groups')) {
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
                    owed,
                    accountId,
                    existing.category || 'Group Expense',
                    `Settlement Received - ${existing.name}`,
                    new Date(),
                    `group-settlement-${id}-${existingMember.id}`
                  ));
                }
              }

              // The creator and other members are told after the commit (below).
              changeToAnnounce = 'payment';
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

    // Every authorized viewer re-pulls, including members matched only by email
    // and the members this edit just removed.
    await broadcastGroupExpenseChange(id, userId, { alsoNotify: removedMemberUserIds });

    if (changeToAnnounce) {
      void notifyGroupExpenseChanged({
        groupExpenseId: id,
        actorUserId: userId,
        change: changeToAnnounce,
        detail: changeToAnnounce === 'payment' && !isCreator ? `${currentUser.name} paid their share.` : undefined,
        skipEmails: invitationsToSend.map((inv) => inv.email).filter((e): e is string => Boolean(e)),
      });
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

    // The member allocations are removed with the expense, stamped with the same
    // instant so the deletion notice can still find who to tell.
    const deletedAt = new Date();
    await prisma.$transaction([
      prisma.groupExpense.update({
        where: { id },
        data: { deletedAt, updatedAt: deletedAt },
      }),
      prisma.groupExpenseMember.updateMany({
        where: { groupExpenseId: id, deletedAt: null },
        data: { deletedAt },
      }),
    ]);

    // Notify participants of deletion. The member rows were soft-deleted in the
    // same instant as the expense, so the fan-out has to look them up at that
    // stamp — and it resolves email-matched members too, who previously kept
    // showing a deleted group until their next cold start.
    await broadcastGroupExpenseChange(id, userId, { includeDeletedMembers: deletedAt });

    void notifyGroupExpenseChanged({ groupExpenseId: id, actorUserId: userId, change: 'deleted' });

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
      // What the member owes the bill — someone who paid part of it owes less.
      const share = owedAmount(m.shareAmount, m.contributedAmount);
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

