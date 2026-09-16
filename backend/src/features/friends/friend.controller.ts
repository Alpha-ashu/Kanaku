import { Response, NextFunction } from 'express';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { prisma } from '../../db/prisma';
import { sanitize } from '../../utils/sanitize';
import { logger } from '../../config/logger';
import { AppError } from '../../utils/AppError';
import { isDatabaseUnavailableError } from '../../utils/databaseAvailability';
import { createdAtKeysetOrder, createdAtPosition, readKeysetPage, sliceKeysetPage, withCreatedAtKeyset } from '../../utils/pagination';
import { getSocketManager } from '../../sockets';
import { inviteParticipants, resolveContactDetailsForFriend } from '../collaboration/invitation.service';
import { dispatchNotification } from '../notifications/notification.dispatcher';

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

export function cleanFriendName(rawName?: string | null, fallback?: { email?: string | null; phone?: string | null }): string {
  if (!rawName) return fallback?.email ? fallback.email.split('@')[0] : (fallback?.phone ? `Contact (${fallback.phone.replace(/\D/g, '').slice(-4)})` : 'Contact');
  let name = String(rawName);

  // 1. Decode Quoted-Printable if it contains hex sequences (=XX)
  if (name.includes('=')) {
    try {
      const normalized = name.replace(/=[\r\n]+/g, '');
      const bytes: number[] = [];
      for (let i = 0; i < normalized.length; i++) {
        if (normalized[i] === '=' && i + 2 < normalized.length) {
          const hex = normalized.slice(i + 1, i + 3);
          if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
            bytes.push(parseInt(hex, 16));
            i += 2;
            continue;
          }
        }
        const code = normalized.charCodeAt(i);
        if (code < 128) {
          bytes.push(code);
        } else {
          const enc = Buffer.from(normalized[i], 'utf8');
          for (const b of enc) bytes.push(b);
        }
      }
      name = Buffer.from(bytes).toString('utf8');
    } catch {}
  }

  // 2. Unescape vCard escape sequences
  name = name.replace(/\\[,;:nN]/g, ' ').replace(/\\/g, '');

  // 3. Strip residual quoted printable patterns (e.g. =2D, =3A)
  name = name.replace(/(=[A-Fa-f0-9]{2})+/g, '');

  // 4. Remove emoticons and punctuation clusters (like -:;)=d, :-), =D)
  name = name.replace(/[-:;=~_#*+!?,.]{2,}[a-zA-Z0-9]?/g, ' ');
  name = name.replace(/(?:^|\s)(?:[-:;=8][oO\-]?[)\]\(\[dDpP/\\|*]|[<>]?[:;=8][)\]\(\[dDpP/\\|*])(?:\s|$)/gi, ' ');
  name = name.replace(/(?:^|\s)[=:;]-?[)\]\(\[dDpP](?:\s|$)/gi, ' ');

  // 5. Clean dangling punctuation from start/end
  name = name.replace(/^[-:;=,._~#*+|/\s]+|[-:;=,._~#*+|/\s]+$/gu, '');
  name = name.replace(/\s+/g, ' ').trim();

  if (!name || name.length === 0) {
    if (fallback?.email) {
      return fallback.email.split('@')[0];
    }
    if (fallback?.phone) {
      const digits = fallback.phone.replace(/\D/g, '');
      return `Contact (${digits.slice(-4)})`;
    }
    return 'Contact';
  }

  return name;
}

async function linkStaleGroupMembersForFriend(friend: any, userId: string) {
  try {
    const matchedStaleMembers = await prisma.groupExpenseMember.findMany({
      where: {
        friendId: null,
        name: { equals: friend.name, mode: 'insensitive' },
        groupExpense: { userId, deletedAt: null },
        deletedAt: null,
      },
      include: { groupExpense: true },
    });

    if (matchedStaleMembers.length > 0) {
      const targetUser = await findUserByEmailOrPhone(friend.email, friend.phone);
      for (const m of matchedStaleMembers) {
        await prisma.groupExpenseMember.update({
          where: { id: m.id },
          data: {
            friendId: friend.id,
            email: friend.email || null,
            phone: friend.phone || null,
            userId: targetUser?.id || null,
          },
        });

        // Trigger invitation email if email is now present
        if (friend.email) {
          try {
            const detail = `Total: ₹${Number(m.groupExpense.totalAmount).toFixed(0)}, Your share: ₹${Number(m.shareAmount).toFixed(0)}.`;
            await inviteParticipants({
              moduleType: 'group_expense',
              moduleId: m.groupExpenseId,
              moduleName: m.groupExpense.name,
              creatorId: userId,
              participants: [{ email: friend.email, name: m.name, detail }],
            });
          } catch (err) {
            logger.warn('Failed to send invite after auto-linking stale member', err);
          }
        }
      }
    }
  } catch (err) {
    logger.error('Error auto-linking stale group members for friend', { friendId: friend.id, error: err });
  }
}


async function getRegisteredUserMap(emails: (string | null)[], phones: (string | null)[]): Promise<Map<string, { id: string; name: string }>> {
  const map = new Map<string, { id: string; name: string }>();
  const cleanEmails = emails.filter(Boolean) as string[];
  const cleanPhones = phones.filter(Boolean) as string[];
  if (!cleanEmails.length && !cleanPhones.length) return map;

  // User has no `phone` column — phone numbers live on `profiles` (synced 1:1 with User.id on registration).
  if (cleanEmails.length) {
    const users = await prisma.user.findMany({
      where: { email: { in: cleanEmails } },
      select: { id: true, name: true, email: true },
    });
    for (const u of users) {
      if (u.email) map.set(`email:${u.email.toLowerCase()}`, { id: u.id, name: u.name });
    }
  }

  if (cleanPhones.length) {
    const profiles = await prisma.profiles.findMany({
      where: { phone: { in: cleanPhones } },
      select: { id: true, phone: true, full_name: true },
    });
    for (const p of profiles) {
      if (p.phone) map.set(`phone:${p.phone}`, { id: p.id, name: p.full_name || '' });
    }
  }

  return map;
}

function resolveRegistration(map: Map<string, { id: string; name: string }>, email?: string | null, phone?: string | null) {
  const match = (email && map.get(`email:${email.toLowerCase()}`)) || (phone && map.get(`phone:${phone}`)) || null;
  return { isRegistered: !!match, linkedUserId: match?.id || null };
}

export const getFriends = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const page = readKeysetPage(req.query);

    const rows = await prisma.friend.findMany({
      where: withCreatedAtKeyset({ userId, deletedAt: null }, page),
      orderBy: page ? createdAtKeysetOrder() : { createdAt: 'desc' },
      ...(page ? { take: page.limit + 1 } : {}),
    });
    // Enrich only the page being returned.
    const paged = page ? sliceKeysetPage(rows, page, createdAtPosition) : null;
    const friends = paged ? paged.items : rows;

    const registeredMap = await getRegisteredUserMap(friends.map(f => f.email!), friends.map(f => f.phone!));

    // Aggregate expense totals per friend — match by friendId OR email to handle
    // stale rows where friendId was never set (pre-normalizedMembers-fix rows).
    const friendEmails = friends.map(f => f.email).filter(Boolean) as string[];
    const memberRows = await prisma.groupExpenseMember.findMany({
      where: {
        deletedAt: null,
        OR: [
          { friendId: { in: friends.map(f => f.id) } },
          ...(friendEmails.length ? [{ email: { in: friendEmails } }] : []),
        ],
      },
      select: { friendId: true, email: true, shareAmount: true, hasPaid: true },
    });
    // Build a quick email→friendId lookup so email-matched rows can be attributed
    const emailToFriendId = new Map(friends.filter(f => f.email).map(f => [f.email!.toLowerCase(), f.id]));
    const totalsByFriend = new Map<string, { totalExpenses: number; outstanding: number }>();
    for (const m of memberRows) {
      const fid = m.friendId || (m.email ? emailToFriendId.get(m.email.toLowerCase()) : null);
      if (!fid) continue;
      const entry = totalsByFriend.get(fid) || { totalExpenses: 0, outstanding: 0 };
      entry.totalExpenses += 1;
      if (!m.hasPaid) entry.outstanding += Number(m.shareAmount);
      totalsByFriend.set(fid, entry);
    }

    const data = friends.map((f) => {
      const { isRegistered, linkedUserId } = resolveRegistration(registeredMap, f.email, f.phone);
      const totals = totalsByFriend.get(f.id) || { totalExpenses: 0, outstanding: 0 };
      return {
        ...f,
        isRegistered,
        linkedUserId,
        totalExpenses: totals.totalExpenses,
        outstandingAmount: totals.outstanding,
      };
    });

    res.json({ success: true, data: paged ? { items: data, nextCursor: paged.nextCursor } : data });
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      logger.warn('Friends fallback: database unavailable, returning empty dataset.');
      return res.json({ success: true, data: [] });
    }

    next(error);
  }
};

export const getFriendDetail = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const friend = await prisma.friend.findFirst({ where: { id, userId, deletedAt: null } });
    if (!friend) {
      throw AppError.notFound('Friend');
    }

    const registeredMap = await getRegisteredUserMap([friend.email!], [friend.phone!]);
    const { isRegistered, linkedUserId } = resolveRegistration(registeredMap, friend.email, friend.phone);

    // Match by friendId OR email to handle stale rows where friendId was never
    // set (created before the normalizedMembers email-stripping bug was fixed).
    const friendEmailCondition = friend.email ? [{ email: friend.email }] : [];
    const members = await prisma.groupExpenseMember.findMany({
      where: {
        deletedAt: null,
        OR: [{ friendId: friend.id }, ...friendEmailCondition],
      },
      include: { groupExpense: { select: { id: true, name: true, date: true, totalAmount: true, category: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const expenses = members
      .filter(m => m.groupExpense)
      .map(m => ({
        groupExpenseId: m.groupExpenseId,
        name: m.groupExpense!.name,
        date: m.groupExpense!.date,
        category: m.groupExpense!.category,
        totalAmount: Number(m.groupExpense!.totalAmount),
        shareAmount: Number(m.shareAmount),
        status: m.hasPaid ? 'paid' : 'pending',
        paidAt: m.paidAt,
      }));

    const totalOutstanding = expenses.filter(e => e.status === 'pending').reduce((sum, e) => sum + e.shareAmount, 0);
    const totalPaid = expenses.filter(e => e.status === 'paid').reduce((sum, e) => sum + e.shareAmount, 0);

    res.json({
      success: true,
      data: {
        ...friend,
        isRegistered,
        linkedUserId,
        expenses,
        totalOutstanding,
        totalPaid,
        totalExpenses: expenses.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const createFriend = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { name, email, phone } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      throw AppError.badRequest('Friend name is required.', 'NAME_REQUIRED');
    }

    // Name-only friends are allowed: voice capture ("borrowed 5000 from Jijo")
    // and quick loan entry legitimately know only a name. Contact info is
    // required later for invites/settlement emails, not for existing as a
    // ledger counterparty — the name-based duplicate check below still applies.

    const cleanEmail = email ? String(email).trim().toLowerCase() : null;
    const cleanPhone = phone ? String(phone).trim() : null;
    const cleanName = cleanFriendName(name, { email: cleanEmail, phone: cleanPhone });

    // 1. Prevent duplicate friend records — unique email and unique phone per user.
    // User name CAN be duplicate (e.g. multiple friends can share display names).
    const contactConditions = [
      cleanEmail ? { email: { equals: cleanEmail, mode: 'insensitive' } } : null,
      cleanPhone ? { phone: cleanPhone } : null,
    ].filter(Boolean) as any;

    const existing = contactConditions.length > 0
      ? await prisma.friend.findFirst({
          where: {
            userId,
            OR: contactConditions,
          },
        })
      : null;

    if (existing) {
      if (existing.deletedAt === null) {
        const reason = (cleanEmail && existing.email?.toLowerCase() === cleanEmail.toLowerCase())
          ? 'A friend with this email already exists.'
          : 'A friend with this phone number already exists.';
        throw AppError.badRequest(reason, 'FRIEND_ALREADY_EXISTS');
      } else {
        // Restore soft-deleted friend!
        const restoredFriend = await prisma.friend.update({
          where: { id: existing.id },
          data: {
            name: cleanName,
            email: cleanEmail || existing.email,
            phone: cleanPhone || existing.phone,
            deletedAt: null,
            updatedAt: new Date(),
          },
        });
        
        const registeredMap = await getRegisteredUserMap([restoredFriend.email!], [restoredFriend.phone!]);
        const { isRegistered, linkedUserId } = resolveRegistration(registeredMap, restoredFriend.email, restoredFriend.phone);

        return res.status(200).json({
          success: true,
          data: {
            ...restoredFriend,
            isRegistered,
            linkedUserId,
          },
        });
      }
    }

    // Fetch current user details
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!currentUser) {
      throw AppError.notFound('User');
    }

    // 2. Check if the target user exists in the system
    // User has no `phone` column — phone numbers live on `profiles` (synced 1:1 with User.id on registration).
    let targetUser = cleanEmail ? await prisma.user.findFirst({ where: { email: cleanEmail } }) : null;
    if (!targetUser && cleanPhone) {
      const targetProfile = await prisma.profiles.findFirst({ where: { phone: cleanPhone } });
      if (targetProfile) {
        targetUser = await prisma.user.findUnique({ where: { id: targetProfile.id } });
      }
    }

    let isMutual = false;
    let targetFriendRecordId: string | null = null;

    if (targetUser) {
      const currentProfile = await prisma.profiles.findUnique({
        where: { id: userId },
        select: { phone: true }
      });
      const userPhone = currentProfile?.phone || null;

      // Check if target user has already added current user
      const targetFriend = await prisma.friend.findFirst({
        where: {
          userId: targetUser.id,
          deletedAt: null,
          OR: [
            currentUser.email ? { email: currentUser.email } : null,
            userPhone ? { phone: userPhone } : null,
          ].filter(Boolean) as any,
        },
      });

      if (targetFriend) {
        isMutual = true;
        targetFriendRecordId = targetFriend.id;
      }
    }

    // Create friend record for current user.
    //
    // The findFirst above is a check-then-insert: two concurrent requests can both
    // miss it and both insert (observed — two "Prijith" rows 3ms apart). The
    // Friend_userId_name_ci_key unique index is what actually serialises this; the
    // loser lands here as P2002 and is answered idempotently with the row that won,
    // rather than a 500 the caller would retry into yet another attempt.
    let friend;
    try {
      friend = await prisma.friend.create({
        data: {
          userId,
          name: sanitize(name.trim()),
          email: cleanEmail,
          phone: cleanPhone,
          syncStatus: 'synced',
        },
      });
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code !== 'P2002') throw err;
      const winner = await prisma.friend.findFirst({
        where: {
          userId,
          deletedAt: null,
          OR: [
            cleanEmail ? { email: { equals: cleanEmail, mode: 'insensitive' } } : null,
            cleanPhone ? { phone: cleanPhone } : null,
          ].filter(Boolean) as any,
        },
      });
      if (!winner) throw err;
      logger.warn('[Duplicate prevented] Friend create lost a concurrent race', {
        userId,
        entity: 'Friend',
        existingRecordId: winner.id,
        detectionReason: 'unique contact conflict',
        action: 'returned existing record',
      });
      return res.status(200).json({ success: true, data: winner, deduplicated: true });
    }

    // Auto-link any existing GroupExpenseMember rows that were created local-only (without friendId/email)
    await linkStaleGroupMembersForFriend(friend, userId);

    if (targetUser) {
      if (isMutual) {
        // Send multi-channel notification to B (target user) that B's request was accepted
        const notificationB = await dispatchNotification({
          userId: targetUser.id,
          sourceUserId: userId,
          title: 'Friend Request Accepted',
          message: `${currentUser.name} accepted your friend request.`,
          type: 'friend_accepted',
          category: 'friend',
          deepLink: '/friends',
          priority: 'high',
          channels: ['app', 'email', 'push'],
        });

        // Send multi-channel notification to A (current user) that they are now friends
        const notificationA = await dispatchNotification({
          userId,
          sourceUserId: targetUser.id,
          title: 'Friend Request Accepted',
          message: `You are now friends with ${targetUser.name}.`,
          type: 'friend_accepted',
          category: 'friend',
          deepLink: '/friends',
          priority: 'high',
          channels: ['app', 'email', 'push'],
        });

        // Notify both via sockets immediately
        try {
          const socketManager = getSocketManager();
          socketManager.notifyUser(targetUser.id, 'friend_accepted', { friendId: friend.id, friendName: currentUser.name });
          socketManager.notifyUser(targetUser.id, 'notification', notificationB);

          socketManager.notifyUser(userId, 'friend_accepted', { friendId: targetFriendRecordId, friendName: targetUser.name });
          socketManager.notifyUser(userId, 'notification', notificationA);
        } catch (socketError) {
          logger.warn('Socket notification failed', { error: socketError });
        }
      } else {
        // B hasn't added A yet, this is a new friend request to B
        const notificationB = await dispatchNotification({
          userId: targetUser.id,
          sourceUserId: userId,
          title: 'New Friend Request',
          message: `${currentUser.name} sent you a friend request on Kanaku.`,
          type: 'friend_request',
          category: 'friend',
          deepLink: '/friends',
          priority: 'high',
          channels: ['app', 'email', 'push'],
        });

        // Notify B via sockets
        try {
          const socketManager = getSocketManager();
          socketManager.notifyUser(targetUser.id, 'friend_request', { friendId: friend.id, friendName: currentUser.name });
          socketManager.notifyUser(targetUser.id, 'notification', notificationB);
        } catch (socketError) {
          logger.warn('Socket notification failed', { error: socketError });
        }
      }
    }

    res.status(201).json({ success: true, data: friend });
  } catch (error) {
    next(error);
  }
};

export const updateFriend = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const { name, email, phone } = req.body;

    const existing = await prisma.friend.findFirst({ where: { id, userId } });
    if (!existing) {
      throw AppError.notFound('Friend');
    }

    const nextName = name !== undefined ? String(name).trim() : existing.name;
    const nextEmail = email !== undefined ? (email ? String(email).trim().toLowerCase() : null) : existing.email;
    const nextPhone = phone !== undefined ? (phone ? String(phone).trim() : null) : existing.phone;

    const contactConditions = [
      nextEmail ? { email: { equals: nextEmail, mode: 'insensitive' } } : null,
      nextPhone ? { phone: nextPhone } : null,
    ].filter(Boolean) as any;

    const conflict = contactConditions.length > 0
      ? await prisma.friend.findFirst({
          where: {
            userId,
            deletedAt: null,
            id: { not: id },
            OR: contactConditions,
          },
        })
      : null;

    if (conflict) {
      const reason = (nextEmail && conflict.email?.toLowerCase() === nextEmail.toLowerCase())
        ? 'Another friend with this email already exists.'
        : 'Another friend with this phone number already exists.';
      throw AppError.badRequest(reason, 'FRIEND_ALREADY_EXISTS');
    }

    const updated = await prisma.friend.update({
      where: { id },
      data: {
        name: name !== undefined ? sanitize(String(name).trim()) : undefined,
        email: email !== undefined ? (email ? String(email).trim().toLowerCase() : null) : undefined,
        phone: phone !== undefined ? (phone ? String(phone).trim() : null) : undefined,
      },
    });

    // Propagate name/contact changes across every expense this friend is part of.
    if (name !== undefined || email !== undefined || phone !== undefined) {
      await prisma.groupExpenseMember.updateMany({
        where: { friendId: id, deletedAt: null },
        data: {
          name: name !== undefined ? updated.name : undefined,
          email: email !== undefined ? updated.email : undefined,
          phone: phone !== undefined ? updated.phone : undefined,
        },
      });
    }

    // Unified contact resolution: discovers and resolves all pending collaborative items
    // (Group Expenses, Goals, Loans, To-Do Lists) associated with this friend.
    await resolveContactDetailsForFriend({
      friendId: id,
      userId,
      email: updated.email,
      phone: updated.phone,
      name: updated.name,
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

export const bulkCreateFriends = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const rawList = req.body?.friends;

    if (!Array.isArray(rawList) || rawList.length === 0) {
      throw AppError.badRequest('A non-empty "friends" array is required.', 'FRIENDS_REQUIRED');
    }
    if (rawList.length > 200) {
      throw AppError.badRequest('A maximum of 200 friends can be added at once.', 'TOO_MANY_FRIENDS');
    }

    const existing = await prisma.friend.findMany({ where: { userId, deletedAt: null } });
    const existingNames = new Set(existing.map(f => f.name.toLowerCase().trim()));
    const existingContactKeys = new Set(
      existing.flatMap(f => [
        f.email ? f.email.toLowerCase().trim() : null,
        f.phone ? f.phone.trim() : null,
      ].filter(Boolean) as string[])
    );

    const toCreate: { name: string; email: string | null; phone: string | null }[] = [];
    const skipped: { name: string; reason: string }[] = [];

    for (const row of rawList) {
      const cleanEmail = row?.email ? String(row.email).trim().toLowerCase() : null;
      const cleanPhone = row?.phone ? String(row.phone).trim() : null;
      const name = cleanFriendName(row?.name, { email: cleanEmail, phone: cleanPhone });

      if (!name) {
        skipped.push({ name: name || '(unnamed)', reason: 'Name is required' });
        continue;
      }
      // When email or phone is present, uniqueness is checked on email / phone
      if (cleanEmail && existingContactKeys.has(cleanEmail)) {
        skipped.push({ name, reason: `Email ${cleanEmail} already exists` });
        continue;
      }
      if (cleanPhone && existingContactKeys.has(cleanPhone)) {
        skipped.push({ name, reason: `Phone ${cleanPhone} already exists` });
        continue;
      }
      // When neither email nor phone is provided, check by name to avoid duplicate re-imports
      if (!cleanEmail && !cleanPhone && existingNames.has(name.toLowerCase())) {
        skipped.push({ name, reason: 'A friend with this name already exists' });
        continue;
      }

      toCreate.push({ name, email: cleanEmail, phone: cleanPhone });
      if (!cleanEmail && !cleanPhone) existingNames.add(name.toLowerCase());
      if (cleanEmail) existingContactKeys.add(cleanEmail);
      if (cleanPhone) existingContactKeys.add(cleanPhone);
    }

    // One INSERT for the whole batch. Per-row creates cost a DB round trip each,
    // and at production app↔DB latency a 200-contact import outlasted the
    // client's 15s timeout (→ local-only fallback while the server kept writing).
    const created = toCreate.length > 0
      ? await prisma.friend.createManyAndReturn({
          data: toCreate.map((f) => ({
            userId, name: sanitize(f.name), email: f.email, phone: f.phone, syncStatus: 'synced',
          })),
        })
      : [];

    // The link step is several queries per friend, so only run it for friends
    // whose name matches an unlinked group member — found with a single query.
    if (created.length > 0) {
      const staleMembers = await prisma.groupExpenseMember.findMany({
        where: { friendId: null, deletedAt: null, groupExpense: { userId, deletedAt: null } },
        select: { name: true },
      });
      const staleNameKeys = new Set(staleMembers.map((m) => m.name.toLowerCase()));
      for (const friend of created) {
        if (staleNameKeys.has(friend.name.toLowerCase())) {
          await linkStaleGroupMembersForFriend(friend, userId);
        }
      }
    }

    const registeredMap = await getRegisteredUserMap(created.map(f => f.email), created.map(f => f.phone));
    const data = created.map(f => ({ ...f, ...resolveRegistration(registeredMap, f.email, f.phone) }));

    res.status(201).json({
      success: true,
      data: { created: data, skipped, createdCount: data.length, skippedCount: skipped.length },
    });
  } catch (error) {
    next(error);
  }
};

function parseFriendsCsv(text: string): { name: string; email: string; phone: string }[] {
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) return [];

  const splitRow = (line: string) => line.split(',').map(cell => cell.trim().replace(/^"|"$/g, ''));
  const header = splitRow(lines[0]).map(h => h.toLowerCase());
  const nameIdx = header.findIndex(h => h.includes('name'));
  const emailIdx = header.findIndex(h => h.includes('email'));
  const phoneIdx = header.findIndex(h => h.includes('phone') || h.includes('mobile'));

  const hasHeader = nameIdx !== -1 || emailIdx !== -1 || phoneIdx !== -1;
  const dataLines = hasHeader ? lines.slice(1) : lines;
  const cols = hasHeader
    ? { name: nameIdx, email: emailIdx, phone: phoneIdx }
    : { name: 0, email: 1, phone: 2 };

  return dataLines.map(line => {
    const cells = splitRow(line);
    return {
      name: cols.name >= 0 ? (cells[cols.name] || '') : '',
      email: cols.email >= 0 ? (cells[cols.email] || '') : '',
      phone: cols.phone >= 0 ? (cells[cols.phone] || '') : '',
    };
  }).filter(row => row.name || row.email || row.phone);
}

export const importFriendsCsv = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const file = (req as any).file;
    if (!file) {
      throw AppError.badRequest('A CSV file is required.', 'FILE_REQUIRED');
    }

    const rows = parseFriendsCsv(file.buffer.toString('utf-8'));
    if (rows.length === 0) {
      throw AppError.badRequest('No valid rows found in the CSV file.', 'EMPTY_CSV');
    }
    if (rows.length > 200) {
      throw AppError.badRequest('A maximum of 200 friends can be imported at once.', 'TOO_MANY_FRIENDS');
    }

    req.body = { friends: rows };
    return bulkCreateFriends(req, res, next);
  } catch (error) {
    next(error);
  }
};

export const deleteFriend = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const existing = await prisma.friend.findFirst({ where: { id, userId } });
    if (!existing) {
      throw AppError.notFound('Friend');
    }

    await prisma.friend.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    res.json({ success: true, message: 'Friend deleted successfully' });
  } catch (error) {
    next(error);
  }
};
