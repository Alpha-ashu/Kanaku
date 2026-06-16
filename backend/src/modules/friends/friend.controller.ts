import { Response, NextFunction } from 'express';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { prisma } from '../../db/prisma';
import { sanitize } from '../../utils/sanitize';
import { logger } from '../../config/logger';
import { AppError } from '../../utils/AppError';
import { isDatabaseUnavailableError } from '../../utils/databaseAvailability';
import { getSocketManager } from '../../sockets';

async function getRegisteredUserMap(emails: string[], phones: string[]): Promise<Map<string, { id: string; name: string }>> {
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

    const friends = await prisma.friend.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    const registeredMap = await getRegisteredUserMap(friends.map(f => f.email!), friends.map(f => f.phone!));

    // Aggregate expense totals per friend in one query rather than N+1
    const memberRows = await prisma.groupExpenseMember.findMany({
      where: { friendId: { in: friends.map(f => f.id) }, deletedAt: null },
      select: { friendId: true, shareAmount: true, hasPaid: true },
    });
    const totalsByFriend = new Map<string, { totalExpenses: number; outstanding: number }>();
    for (const m of memberRows) {
      if (!m.friendId) continue;
      const entry = totalsByFriend.get(m.friendId) || { totalExpenses: 0, outstanding: 0 };
      entry.totalExpenses += 1;
      if (!m.hasPaid) entry.outstanding += Number(m.shareAmount);
      totalsByFriend.set(m.friendId, entry);
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

    res.json({ success: true, data });
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

    const members = await prisma.groupExpenseMember.findMany({
      where: { friendId: friend.id, deletedAt: null },
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

    if (!email && !phone) {
      throw AppError.badRequest('Either email or phone is required to identify a friend.', 'CONTACT_REQUIRED');
    }

    const cleanName = name.trim();
    const cleanEmail = email ? String(email).trim().toLowerCase() : null;
    const cleanPhone = phone ? String(phone).trim() : null;

    // 1. Prevent duplicate friend records — no two friends of the same user
    // may share a name, email, or phone number.
    const existing = await prisma.friend.findFirst({
      where: {
        userId,
        deletedAt: null,
        OR: [
          { name: { equals: cleanName, mode: 'insensitive' } },
          cleanEmail ? { email: cleanEmail } : null,
          cleanPhone ? { phone: cleanPhone } : null,
        ].filter(Boolean) as any,
      },
    });

    if (existing) {
      const reason = existing.name.toLowerCase() === cleanName.toLowerCase()
        ? 'A friend with this name already exists.'
        : (cleanEmail && existing.email === cleanEmail)
          ? 'A friend with this email already exists.'
          : 'A friend with this phone number already exists.';
      throw AppError.badRequest(reason, 'FRIEND_ALREADY_EXISTS');
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

    // Create friend record for current user
    const friend = await prisma.friend.create({
      data: {
        userId,
        name: sanitize(name.trim()),
        email: cleanEmail,
        phone: cleanPhone,
        syncStatus: 'synced',
      },
    });

    if (targetUser) {
      if (isMutual) {
        // Send notification to B (target user) that B's request was accepted
        const notificationB = await prisma.notification.create({
          data: {
            userId: targetUser.id,
            sourceUserId: userId,
            title: 'Friend Request Accepted',
            message: `${currentUser.name} accepted your friend request.`,
            type: 'friend_accepted',
            priority: 'high',
            channels: '["app"]',
            deliveryStatus: '{}',
          },
        });

        // Send notification to A (current user) that they are now friends
        const notificationA = await prisma.notification.create({
          data: {
            userId,
            sourceUserId: targetUser.id,
            title: 'Friend Request Accepted',
            message: `You are now friends with ${targetUser.name}.`,
            type: 'friend_accepted',
            priority: 'high',
            channels: '["app"]',
            deliveryStatus: '{}',
          },
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
        const notificationB = await prisma.notification.create({
          data: {
            userId: targetUser.id,
            sourceUserId: userId,
            title: 'New Friend Request',
            message: `${currentUser.name} sent you a friend request.`,
            type: 'friend_request',
            priority: 'high',
            channels: '["app"]',
            deliveryStatus: '{}',
          },
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

    const conflict = await prisma.friend.findFirst({
      where: {
        userId,
        deletedAt: null,
        id: { not: id },
        OR: [
          { name: { equals: nextName, mode: 'insensitive' } },
          nextEmail ? { email: nextEmail } : null,
          nextPhone ? { phone: nextPhone } : null,
        ].filter(Boolean) as any,
      },
    });
    if (conflict) {
      const reason = conflict.name.toLowerCase() === nextName.toLowerCase()
        ? 'Another friend with this name already exists.'
        : (nextEmail && conflict.email === nextEmail)
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
    const existingNameKeys = new Set(existing.map(f => f.name.toLowerCase()));
    const existingContactKeys = new Set(
      existing.flatMap(f => [f.email?.toLowerCase(), f.phone].filter(Boolean) as string[])
    );

    const created: any[] = [];
    const skipped: { name: string; reason: string }[] = [];

    for (const row of rawList) {
      const name = String(row?.name || '').trim();
      const cleanEmail = row?.email ? String(row.email).trim().toLowerCase() : null;
      const cleanPhone = row?.phone ? String(row.phone).trim() : null;

      if (!name) {
        skipped.push({ name: name || '(unnamed)', reason: 'Name is required' });
        continue;
      }
      if (!cleanEmail && !cleanPhone) {
        skipped.push({ name, reason: 'Email or phone is required' });
        continue;
      }
      if (existingNameKeys.has(name.toLowerCase())) {
        skipped.push({ name, reason: 'A friend with this name already exists' });
        continue;
      }
      if ((cleanEmail && existingContactKeys.has(cleanEmail)) || (cleanPhone && existingContactKeys.has(cleanPhone))) {
        skipped.push({ name, reason: 'Already added' });
        continue;
      }

      const friend = await prisma.friend.create({
        data: { userId, name: sanitize(name), email: cleanEmail, phone: cleanPhone, syncStatus: 'synced' },
      });
      created.push(friend);
      existingNameKeys.add(name.toLowerCase());
      if (cleanEmail) existingContactKeys.add(cleanEmail);
      if (cleanPhone) existingContactKeys.add(cleanPhone);
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
