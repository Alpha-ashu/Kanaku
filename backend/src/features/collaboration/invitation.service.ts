import { prisma } from '../../db/prisma';
import { logger } from '../../config/logger';
import { sendEmail } from '../../utils/email';
import { getSocketManager } from '../../sockets';
import { todoRepository } from '../todos/todo.repository';
import { logInvitationEvent } from '../../utils/invitationLifecycle';

/**
 * Unified Collaboration, Participant Tracking & Notification Engine.
 *
 * Designed to handle the complete participant lifecycle across all group and
 * shared modules (Group Expenses, Split Expenses, Goals, Loans, To-Do Lists,
 * and future collaborative features):
 *
 *   1. Participant created WITH verified email:
 *      ➔ Notification created with channels ['app', 'email']
 *      ➔ Status = 'REGISTERED'
 *
 *   2. Participant created WITH unverified/unregistered email:
 *      ➔ "Join Kanaku" invitation email sent
 *      ➔ Status = 'PENDING_REGISTRATION'
 *
 *   3. Participant created WITHOUT email (name/phone only):
 *      ➔ Record permanently preserved in CollaborationParticipant
 *      ➔ Status = 'PENDING_CONTACT'
 *      ➔ Preserves module metadata (amount, share, due date, etc.)
 *
 *   4. Contact details added later (Friend / Profile updated with email):
 *      ➔ `resolveContactDetailsForFriend` discovers all PENDING_CONTACT rows
 *      ➔ Upgrades to REGISTERED or PENDING_REGISTRATION
 *      ➔ Queues/delivers matching notifications
 *
 *   5. User registers / completes email verification (emailVerified = true):
 *      ➔ `resolveAndDeliverPendingCollaborations` auto-links all modules
 *      ➔ Delivers the actual module notification emails with strict idempotency
 */

export type ModuleType =
  | 'group_expense'
  | 'todo_list'
  | 'goal'
  | 'loan'
  | 'split_expense'
  | 'shared_transaction';

const MODULE_LABELS: Record<ModuleType, string> = {
  group_expense: 'Group Expense',
  todo_list: 'Together To-Do List',
  goal: 'Shared Goal',
  loan: 'Loan / Split Obligation',
  split_expense: 'Split Expense',
  shared_transaction: 'Shared Transaction',
};

const MODULE_ACTION_LABELS: Record<ModuleType, string> = {
  group_expense: 'View Group Expense',
  todo_list: 'View To-Do List',
  goal: 'View Shared Goal',
  loan: 'View Loan',
  split_expense: 'View Split Expense',
  shared_transaction: 'View Transaction',
};

function moduleDeepLink(moduleType: ModuleType, _moduleId: string): string {
  switch (moduleType) {
    case 'group_expense':
    case 'split_expense':
      return '/groups';
    case 'todo_list':
      return '/todo-lists';
    case 'goal':
      return '/goals';
    case 'loan':
      return '/loans';
    case 'shared_transaction':
      return '/transactions';
    default:
      return '/dashboard';
  }
}

export interface InviteParticipantInput {
  email?: string | null;
  phone?: string | null;
  name?: string;
  friendId?: string | null;
  /** Extra context appended to notification/email, e.g. "Total: ₹1,000, Your share: ₹500" */
  detail?: string;
}

export interface ParticipantResolution {
  email: string | null;
  phone: string | null;
  name: string;
  status: 'REGISTERED' | 'PENDING_REGISTRATION' | 'PENDING_CONTACT';
  userId: string | null;
  participantId?: string;
}

/** Helper to find a registered user by email or phone */
async function findVerifiedUser(email?: string | null, phone?: string | null) {
  const cleanEmail = email?.trim().toLowerCase();
  const cleanPhone = phone?.trim();

  if (cleanEmail) {
    const user = await prisma.user.findFirst({
      where: { email: cleanEmail, status: 'verified' },
    });
    if (user) return user;
  }

  if (cleanPhone) {
    const profile = await prisma.profiles.findFirst({
      where: { phone: cleanPhone },
    });
    if (profile) {
      const user = await prisma.user.findUnique({
        where: { id: profile.id },
      });
      if (user && user.status === 'verified') return user;
    }
  }

  return null;
}

/**
 * Unified entry point for all collaborative modules.
 * Tracks every participant in CollaborationParticipant regardless of whether
 * an email is currently known, preserving the relationship permanently.
 */
export async function trackAndInviteParticipants(params: {
  moduleType: ModuleType;
  moduleId: string;
  moduleName: string;
  creatorId: string;
  participants: InviteParticipantInput[];
}): Promise<ParticipantResolution[]> {
  const { moduleType, moduleId, moduleName, creatorId, participants } = params;
  if (!participants || participants.length === 0) return [];

  const creator = await prisma.user.findUnique({ where: { id: creatorId } });
  const creatorName = creator?.name || 'Someone';

  const results: ParticipantResolution[] = [];

  for (const p of participants) {
    const email = p.email?.trim().toLowerCase() || null;
    const phone = p.phone?.trim() || null;
    const friendId = p.friendId || null;
    const name = p.name?.trim() || (email ? email.split('@')[0] : 'Participant');
    const detail = p.detail || undefined;

    const targetUser = await findVerifiedUser(email, phone);

    let status: 'REGISTERED' | 'PENDING_REGISTRATION' | 'PENDING_CONTACT';
    if (targetUser) {
      status = 'REGISTERED';
    } else if (email) {
      status = 'PENDING_REGISTRATION';
    } else {
      status = 'PENDING_CONTACT';
    }

    // Upsert or create CollaborationParticipant record
    let participant;
    if (email) {
      // Find existing by (moduleType, moduleId, email)
      const existing = await prisma.collaborationParticipant.findFirst({
        where: { moduleType, moduleId, email },
      });
      if (existing) {
        participant = await prisma.collaborationParticipant.update({
          where: { id: existing.id },
          data: {
            moduleName,
            name,
            phone: phone || existing.phone,
            friendId: friendId || existing.friendId,
            userId: targetUser?.id || existing.userId,
            status,
            metadata: detail ? { detail } : (existing.metadata as any),
            linkedAt: targetUser ? (existing.linkedAt || new Date()) : existing.linkedAt,
          },
        });
      } else {
        participant = await prisma.collaborationParticipant.create({
          data: {
            moduleType,
            moduleId,
            moduleName,
            email,
            phone,
            friendId,
            name,
            userId: targetUser?.id || null,
            status,
            invitedBy: creatorId,
            metadata: detail ? { detail } : undefined,
            linkedAt: targetUser ? new Date() : null,
          },
        });
      }
    } else {
      // Find existing PENDING_CONTACT by friendId or name
      const existing = await prisma.collaborationParticipant.findFirst({
        where: {
          moduleType,
          moduleId,
          invitedBy: creatorId,
          OR: [
            friendId ? { friendId } : null,
            { name: { equals: name, mode: 'insensitive' } },
          ].filter(Boolean) as any,
        },
      });

      if (existing) {
        participant = await prisma.collaborationParticipant.update({
          where: { id: existing.id },
          data: {
            moduleName,
            name,
            phone: phone || existing.phone,
            friendId: friendId || existing.friendId,
            userId: targetUser?.id || existing.userId,
            status,
            metadata: detail ? { detail } : (existing.metadata as any),
          },
        });
      } else {
        participant = await prisma.collaborationParticipant.create({
          data: {
            moduleType,
            moduleId,
            moduleName,
            email: null,
            phone,
            friendId,
            name,
            userId: targetUser?.id || null,
            status: 'PENDING_CONTACT',
            invitedBy: creatorId,
            metadata: detail ? { detail } : undefined,
          },
        });
      }
    }

    logInvitationEvent('INVITATION_CREATED', {
      email: email || undefined,
      phone: phone || undefined,
      moduleType,
      moduleId,
      status,
      participantId: participant.id,
    });

    // Notification delivery based on resolved state
    if (targetUser) {
      await notifyRegisteredParticipant({
        moduleType,
        moduleId,
        moduleName,
        targetUserId: targetUser.id,
        creatorId,
        creatorName,
        detail,
      });
    } else if (email) {
      await sendInvitationEmail({
        moduleType,
        moduleName,
        email,
        name,
        creatorName,
        detail,
      });
    }

    results.push({
      email,
      phone,
      name,
      status,
      userId: targetUser?.id || null,
      participantId: participant.id,
    });
  }

  return results;
}

/** Backward-compatible alias for existing callers */
export const inviteParticipants = trackAndInviteParticipants;

/**
 * Creates/queues an in-app and email notification for a registered user.
 * Protected by `Notification.dedupKey @unique` to prevent duplicate sends.
 */
export async function notifyRegisteredParticipant(args: {
  moduleType: ModuleType;
  moduleId: string;
  moduleName: string;
  targetUserId: string;
  creatorId: string;
  creatorName: string;
  detail?: string;
}): Promise<void> {
  const { moduleType, moduleId, moduleName, targetUserId, creatorId, creatorName, detail } = args;

  // Idempotency key prevents creating duplicate notification rows
  const dedupKey = `collab_notif:${moduleType}:${moduleId}:${targetUserId}`;

  // Check if already sent / created
  const existing = await prisma.notification.findUnique({
    where: { dedupKey },
  });
  if (existing) {
    logger.info(`[collaboration] Notification already exists for dedupKey=${dedupKey} — skipping duplicate`);
    return;
  }

  const deepLink = moduleDeepLink(moduleType, moduleId);
  const noun = MODULE_LABELS[moduleType] || 'Shared Item';
  const title = `You were added to a ${noun}`;
  const message = `${creatorName} added you to "${moduleName}".${detail ? ` ${detail}` : ''}`;

  try {
    const notification = await prisma.notification.create({
      data: {
        userId: targetUserId,
        sourceUserId: creatorId,
        title,
        message,
        type: moduleType,
        category: moduleType,
        deepLink,
        priority: 'high',
        channels: JSON.stringify(['app', 'email']),
        deliveryStatus: JSON.stringify({ app: 'sent', email: 'queued' }),
        // 'pending' hands the email delivery to the outbox worker
        status: 'pending',
        dedupKey,
        metadata: {
          moduleType,
          moduleId,
          moduleName,
          creatorId,
          creatorName,
          detail,
          emailTitle: title,
          emailBody: message,
        },
      },
    });

    logInvitationEvent('EMAIL_QUEUED', { notificationId: notification.id, userId: targetUserId, moduleType, moduleId });

    try {
      const socketManager = getSocketManager();
      socketManager.notifyUser(targetUserId, 'notification', notification);
      socketManager.notifyUser(targetUserId, `${moduleType}_updated`, { id: moduleId });
    } catch (err) {
      logger.warn('[collaboration] Socket notification failed for collaboration invite', err);
    }
  } catch (err: any) {
    if (err?.code === 'P2002') {
      logger.info(`[collaboration] Duplicate notification prevented by DB unique constraint for dedupKey=${dedupKey}`);
    } else {
      throw err;
    }
  }
}

/**
 * Sends an invitation email to an unregistered recipient.
 */
export async function sendInvitationEmail(args: {
  moduleType: ModuleType;
  moduleName: string;
  email: string;
  name: string;
  creatorName: string;
  detail?: string;
}): Promise<void> {
  const { moduleType, moduleName, email, creatorName, detail } = args;
  const frontendUrl = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
  const joinUrl = `${frontendUrl}/register?invite=${encodeURIComponent(moduleType)}&email=${encodeURIComponent(email)}`;
  const noun = MODULE_LABELS[moduleType] || 'Shared Item';
  const subject = `You were added to a Kanaku ${noun}`;

  const sent = await sendEmail({
    to: email,
    subject,
    html: buildInvitationEmailHtml({ moduleType, moduleName, creatorName, joinUrl, detail }),
    categories: ['kanaku-invitation', moduleType],
    customArgs: { kind: 'pending_invite', moduleType, email },
  });

  if (sent) {
    logInvitationEvent('EMAIL_SENT', { email, moduleType, path: 'pending_invite' });
  } else {
    logInvitationEvent('EMAIL_FAILED', { email, moduleType, path: 'pending_invite', reason: 'sendgrid_send_failed' });
  }
}

function buildInvitationEmailHtml(args: {
  moduleType: ModuleType;
  moduleName: string;
  creatorName: string;
  joinUrl: string;
  detail?: string;
}): string {
  const { moduleType, moduleName, creatorName, joinUrl, detail } = args;
  const noun = MODULE_LABELS[moduleType] || 'Shared Item';
  const actionText = MODULE_ACTION_LABELS[moduleType] || 'View Item';

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; color: #1e293b; background-color: #f8fafc; margin: 0; padding: 0; }
          .container { max-width: 520px; margin: 24px auto; padding: 24px; }
          .card { background-color: #ffffff; border-radius: 20px; padding: 36px 28px; box-shadow: 0 4px 12px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; text-align: center; }
          .logo { font-size: 24px; font-weight: 900; color: #4f46e5; letter-spacing: -0.02em; margin-bottom: 12px; }
          .title { font-size: 19px; font-weight: 800; color: #0f172a; margin: 16px 0 10px 0; }
          .message { font-size: 15px; color: #475569; line-height: 1.6; margin-bottom: 20px; }
          .detail-box { background-color: #f1f5f9; border-radius: 12px; padding: 14px 18px; margin: 18px 0; text-align: left; font-size: 13px; color: #334155; font-weight: 600; }
          .button { display: inline-block; padding: 14px 28px; background-color: #4f46e5; color: #ffffff !important; text-decoration: none; border-radius: 12px; font-weight: 700; font-size: 14px; margin-top: 10px; }
          .footer { margin-top: 28px; font-size: 12px; color: #94a3b8; line-height: 1.5; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="card">
            <div class="logo">KANAKU</div>
            <div class="title">You were added to a ${noun}</div>
            <p class="message"><strong>${creatorName}</strong> added you to "<strong>${moduleName}</strong>" on Kanaku.</p>
            ${detail ? `<div class="detail-box">${detail}</div>` : ''}
            <p class="message" style="font-size: 13px; color: #64748b;">Join Kanaku to collaborate, view details, and stay in sync.</p>
            <a class="button" href="${joinUrl}">${actionText} on Kanaku</a>
            <div class="footer">
              <p>If you don't want to join, you can safely ignore this email.</p>
              <p>&copy; ${new Date().getFullYear()} Kanaku. All rights reserved.</p>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
}

/**
 * Discovers and resolves all pending collaborative items for a friend whose
 * contact details (email and/or phone) were just added or updated.
 */
export async function resolveContactDetailsForFriend(params: {
  friendId: string;
  userId: string;
  email?: string | null;
  phone?: string | null;
  name?: string;
}): Promise<void> {
  const { friendId, userId, email, phone, name } = params;
  const cleanEmail = email?.trim().toLowerCase() || null;
  const cleanPhone = phone?.trim() || null;

  if (!cleanEmail && !cleanPhone) return;

  logger.info('[collaboration] Resolving pending collaborations for friend contact update', {
    friendId,
    userId,
    hasEmail: Boolean(cleanEmail),
    hasPhone: Boolean(cleanPhone),
  });

  // 1. Auto-update module-specific member rows linked by friendId
  if (cleanEmail || cleanPhone) {
    await prisma.groupExpenseMember.updateMany({
      where: { friendId, deletedAt: null },
      data: {
        ...(cleanEmail ? { email: cleanEmail } : {}),
        ...(cleanPhone ? { phone: cleanPhone } : {}),
        ...(name ? { name } : {}),
      },
    });

    await prisma.goalMember.updateMany({
      where: {
        goal: { userId, deletedAt: null },
        deletedAt: null,
        ...(name ? { name: { equals: name, mode: 'insensitive' } } : {}),
      },
      data: {
        ...(cleanEmail ? { email: cleanEmail } : {}),
        ...(cleanPhone ? { phone: cleanPhone } : {}),
      },
    });

    await prisma.loan.updateMany({
      where: {
        userId,
        deletedAt: null,
        ...(name ? { contactPerson: { equals: name, mode: 'insensitive' } } : {}),
      },
      data: {
        ...(cleanEmail ? { contactEmail: cleanEmail } : {}),
        ...(cleanPhone ? { contactPhone: cleanPhone } : {}),
      },
    });
  }

  // 2. Find all pending CollaborationParticipant rows for this friend/creator
  const pendingCollabs = await prisma.collaborationParticipant.findMany({
    where: {
      invitedBy: userId,
      status: { in: ['PENDING_CONTACT', 'PENDING_REGISTRATION'] },
      OR: [
        { friendId },
        name ? { name: { equals: name, mode: 'insensitive' } } : null,
        cleanEmail ? { email: cleanEmail } : null,
      ].filter(Boolean) as any,
    },
  });

  if (pendingCollabs.length === 0) {
    logger.info('[collaboration] No pending collaborations found for friend', { friendId });
    return;
  }

  logger.info(`[collaboration] Found ${pendingCollabs.length} pending collaborations for friend ${friendId}`);

  // 3. Resolve target user status with the new contact info
  const targetUser = await findVerifiedUser(cleanEmail, cleanPhone);

  const creator = await prisma.user.findUnique({ where: { id: userId } });
  const creatorName = creator?.name || 'Someone';

  for (const collab of pendingCollabs) {
    const meta = (collab.metadata as any) || {};
    const detail = meta.detail || undefined;

    if (targetUser) {
      // User is already a registered Kanaku member
      await prisma.collaborationParticipant.update({
        where: { id: collab.id },
        data: {
          email: cleanEmail || collab.email,
          phone: cleanPhone || collab.phone,
          name: name || collab.name,
          userId: targetUser.id,
          status: 'REGISTERED',
          linkedAt: new Date(),
        },
      });

      // Link module member rows to targetUser.id
      if (collab.moduleType === 'group_expense') {
        await prisma.groupExpenseMember.updateMany({
          where: { groupExpenseId: collab.moduleId, friendId, deletedAt: null },
          data: { userId: targetUser.id },
        });
      } else if (collab.moduleType === 'goal') {
        await prisma.goalMember.updateMany({
          where: { goalId: collab.moduleId, email: cleanEmail || undefined, deletedAt: null },
          data: { userId: targetUser.id },
        });
      }

      // Deliver the notification
      await notifyRegisteredParticipant({
        moduleType: collab.moduleType as ModuleType,
        moduleId: collab.moduleId,
        moduleName: collab.moduleName || 'Shared Item',
        targetUserId: targetUser.id,
        creatorId: userId,
        creatorName,
        detail,
      });
    } else if (cleanEmail) {
      // User is not yet registered, but has a valid email now
      await prisma.collaborationParticipant.update({
        where: { id: collab.id },
        data: {
          email: cleanEmail,
          phone: cleanPhone || collab.phone,
          name: name || collab.name,
          status: 'PENDING_REGISTRATION',
        },
      });

      // Send invitation email
      await sendInvitationEmail({
        moduleType: collab.moduleType as ModuleType,
        moduleName: collab.moduleName || 'Shared Item',
        email: cleanEmail,
        name: name || collab.name || cleanEmail,
        creatorName,
        detail,
      });
    }
  }
}

/**
 * Called when a user completes registration or verifies their email (emailVerified = true).
 * Discovers all pending invitations, links them to the account, attaches module
 * memberships, and DELIVERS the actual notification emails for each module.
 */
export async function resolveAndDeliverPendingCollaborations(userId: string, email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();

  // Find user's profile to check if they also have a phone number
  const profile = await prisma.profiles.findUnique({ where: { id: userId } as any }).catch(() => null);
  const userPhone = profile?.phone || null;

  const pending = await prisma.collaborationParticipant.findMany({
    where: {
      status: { in: ['PENDING_REGISTRATION', 'PENDING_CONTACT'] },
      OR: [
        { email: normalizedEmail },
        userPhone ? { phone: userPhone } : null,
      ].filter(Boolean) as any,
    },
  });

  logInvitationEvent('REGISTRATION_COMPLETED', { email: normalizedEmail, userId, pendingCount: pending.length });

  if (pending.length === 0) return;

  logger.info(`[collaboration] Linking ${pending.length} pending collaborations for user ${userId} (${normalizedEmail})`);

  // 1. Mark all pending collaborations as REGISTERED
  await prisma.collaborationParticipant.updateMany({
    where: {
      id: { in: pending.map(p => p.id) },
    },
    data: {
      userId,
      email: normalizedEmail,
      status: 'REGISTERED',
      linkedAt: new Date(),
    },
  });

  // 2. Attach module-specific relationships & deliver individual notifications
  for (const p of pending) {
    try {
      let isSourceActive = true;
      let creatorName = 'Someone';

      // Find the creator
      const creator = await prisma.user.findUnique({ where: { id: p.invitedBy } });
      if (creator?.name) creatorName = creator.name;

      if (p.moduleType === 'todo_list') {
        const list = await prisma.todo.findFirst({ where: { id: p.moduleId, deletedAt: null } as any }).catch(() => null);
        if (!list) {
          // List was deleted or not found
          isSourceActive = false;
        } else {
          await todoRepository.createShare(Number(p.moduleId), userId, p.invitedBy, 'view');
        }
      } else if (p.moduleType === 'group_expense' || p.moduleType === 'split_expense') {
        const group = await prisma.groupExpense.findFirst({ where: { id: p.moduleId, deletedAt: null } });
        if (!group) {
          isSourceActive = false;
        } else {
          await prisma.groupExpenseMember.updateMany({
            where: {
              groupExpenseId: p.moduleId,
              deletedAt: null,
              OR: [
                { email: normalizedEmail },
                userPhone ? { phone: userPhone } : null,
                p.friendId ? { friendId: p.friendId } : null,
              ].filter(Boolean) as any,
            },
            data: { userId, email: normalizedEmail },
          });
        }
      } else if (p.moduleType === 'goal') {
        const goal = await prisma.goal.findFirst({ where: { id: p.moduleId, deletedAt: null } });
        if (!goal) {
          isSourceActive = false;
        } else {
          await prisma.goalMember.updateMany({
            where: {
              goalId: p.moduleId,
              deletedAt: null,
              OR: [
                { email: normalizedEmail },
                userPhone ? { phone: userPhone } : null,
              ].filter(Boolean) as any,
            },
            data: { userId, email: normalizedEmail },
          });
        }
      } else if (p.moduleType === 'loan') {
        const loan = await prisma.loan.findFirst({ where: { id: p.moduleId, deletedAt: null } });
        if (!loan) {
          isSourceActive = false;
        }
      }

      logInvitationEvent('INVITATION_LINKED', {
        email: normalizedEmail,
        userId,
        moduleType: p.moduleType,
        moduleId: p.moduleId,
        participantId: p.id,
      });

      // 3. Deliver the actual module notification & email if source is still active
      if (isSourceActive) {
        const meta = (p.metadata as any) || {};
        const detail = meta.detail || undefined;

        await notifyRegisteredParticipant({
          moduleType: p.moduleType as ModuleType,
          moduleId: p.moduleId,
          moduleName: p.moduleName || 'Shared Item',
          targetUserId: userId,
          creatorId: p.invitedBy,
          creatorName,
          detail,
        });
      }
    } catch (err) {
      logger.warn(`Failed to attach deferred collaboration (${p.moduleType}/${p.moduleId}) for user ${userId}`, err);
    }
  }

  // 4. Send combined in-app welcome summary
  const counts = new Map<string, number>();
  for (const p of pending) {
    counts.set(p.moduleType, (counts.get(p.moduleType) || 0) + 1);
  }
  const summary = Array.from(counts.entries())
    .map(([type, count]) => `${count} ${MODULE_LABELS[type as ModuleType] || type}${count > 1 ? 's' : ''}`)
    .join(' and ');

  await prisma.notification.create({
    data: {
      userId,
      title: 'Welcome to Kanaku',
      message: `You were previously invited to ${summary}.`,
      type: 'welcome_invitations',
      category: 'collaboration',
      priority: 'normal',
      channels: JSON.stringify(['app']),
      deliveryStatus: JSON.stringify({ app: 'sent' }),
      dedupKey: `welcome_invitations:${userId}`,
    },
  }).catch(() => {/* best-effort duplicate safety */});
}

/** Backward-compatible alias for existing callers */
export const linkPendingInvitationsForUser = resolveAndDeliverPendingCollaborations;

export { MODULE_LABELS, MODULE_ACTION_LABELS, moduleDeepLink };
