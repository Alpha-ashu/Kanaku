import { Queue } from 'bullmq';
import { prisma } from '../../db/prisma';
import { logger } from '../../config/logger';
import { sendEmail } from '../../utils/email';
import { getSocketManager } from '../../sockets';
import { redisConnection } from '../../config/queue';
import { todoRepository } from '../todos/todo.repository';
import { logInvitationEvent } from '../../utils/invitationLifecycle';

/**
 * Unified Collaboration, Invitation & Notification System.
 * Reused across Group Expenses, Together To-Do Lists, Together Goals, and
 * future collaborative modules. Module-specific tables (GroupExpenseMember,
 * todo_list_shares, GoalMember) keep holding feature-specific data; this
 * service only resolves registered-vs-pending status, tracks it in
 * CollaborationParticipant, and drives the matching notification/invite email.
 */

export type ModuleType = 'group_expense' | 'todo_list' | 'goal';

const MODULE_LABELS: Record<ModuleType, string> = {
  group_expense: 'Group Expense',
  todo_list: 'Together To-Do List',
  goal: 'Shared Goal',
};

const MODULE_ACTION_LABELS: Record<ModuleType, string> = {
  group_expense: 'View Group Expense',
  todo_list: 'View To-Do List',
  goal: 'View Shared Goal',
};

function moduleDeepLink(moduleType: ModuleType, moduleId: string): string {
  const path = moduleType === 'group_expense' ? 'groups' : moduleType === 'todo_list' ? 'todo-lists' : 'goals';
  return `/${path}/${moduleId}`;
}

let _emailQueue: Queue | null = null;
function getEmailQueue(): Queue {
  if (!_emailQueue) {
    _emailQueue = new Queue('email-notifications', { connection: redisConnection as any });
  }
  return _emailQueue;
}

async function queueCollaborationEmail(notificationId: string, userId: string, title: string, message: string, category: string, deepLink: string): Promise<void> {
  try {
    await getEmailQueue().add('send-notification-email', {
      notificationId,
      userId,
      title,
      message,
      category,
      deepLink,
    }, {
      priority: 1,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    });
    logInvitationEvent('EMAIL_QUEUED', { notificationId, userId, moduleType: category });
  } catch (err) {
    logger.warn('Failed to queue collaboration email notification', err);
    logInvitationEvent('EMAIL_FAILED', { notificationId, userId, moduleType: category, reason: 'queue_error' });
  }
}

export interface InviteParticipantInput {
  email: string;
  name?: string;
  /** Extra context appended to the notification/email message, e.g. amount/share details for a group expense. */
  detail?: string;
}

export interface ParticipantResolution {
  email: string;
  name: string;
  status: 'REGISTERED' | 'PENDING_REGISTRATION';
  userId: string | null;
}

/**
 * Resolve each participant as REGISTERED (active Kanaku account) or
 * PENDING_REGISTRATION, record it, and fire the matching notification/email.
 */
export async function inviteParticipants(params: {
  moduleType: ModuleType;
  moduleId: string;
  moduleName: string;
  creatorId: string;
  participants: InviteParticipantInput[];
}): Promise<ParticipantResolution[]> {
  const { moduleType, moduleId, moduleName, creatorId, participants } = params;
  if (!participants.length) return [];

  const creator = await prisma.user.findUnique({ where: { id: creatorId } });
  const creatorName = creator?.name || 'Someone';

  const results: ParticipantResolution[] = [];

  for (const p of participants) {
    const email = p.email?.trim().toLowerCase();
    if (!email) continue;

    const targetUser = await prisma.user.findFirst({
      where: { email, status: 'verified' },
    });

    const status: 'REGISTERED' | 'PENDING_REGISTRATION' = targetUser ? 'REGISTERED' : 'PENDING_REGISTRATION';
    const name = p.name || targetUser?.name || email;

    const participant = await prisma.collaborationParticipant.upsert({
      where: { moduleType_moduleId_email: { moduleType, moduleId, email } },
      create: {
        moduleType,
        moduleId,
        moduleName,
        email,
        name,
        userId: targetUser?.id || null,
        status,
        invitedBy: creatorId,
        linkedAt: targetUser ? new Date() : null,
      },
      update: {
        moduleName,
        userId: targetUser?.id || null,
        status,
      },
    });

    logInvitationEvent('INVITATION_CREATED', {
      email, moduleType, moduleId, status, participantId: participant.id,
    });

    if (targetUser) {
      await notifyRegisteredParticipant({ moduleType, moduleId, moduleName, targetUserId: targetUser.id, creatorId, creatorName, detail: p.detail });
    } else {
      await sendInvitationEmail({ moduleType, moduleName, email, name, creatorName, detail: p.detail });
    }

    results.push({ email, name, status, userId: targetUser?.id || null });
  }

  return results;
}

async function notifyRegisteredParticipant(args: {
  moduleType: ModuleType;
  moduleId: string;
  moduleName: string;
  targetUserId: string;
  creatorId: string;
  creatorName: string;
  detail?: string;
}): Promise<void> {
  const { moduleType, moduleId, moduleName, targetUserId, creatorId, creatorName, detail } = args;
  const deepLink = moduleDeepLink(moduleType, moduleId);
  const title = `You were added to a ${MODULE_LABELS[moduleType]}`;
  const message = `${creatorName} added you to "${moduleName}".${detail ? ` ${detail}` : ''}`;

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
      channels: '["app","email"]',
      deliveryStatus: '{"app":"sent","email":"queued"}',
    },
  });

  await queueCollaborationEmail(notification.id, targetUserId, title, message, moduleType, deepLink);

  try {
    const socketManager = getSocketManager();
    socketManager.notifyUser(targetUserId, 'notification', notification);
    socketManager.notifyUser(targetUserId, `${moduleType}_updated`, { id: moduleId });
  } catch (err) {
    logger.warn('Socket notification failed for collaboration invite', err);
  }
}

async function sendInvitationEmail(args: {
  moduleType: ModuleType;
  moduleName: string;
  email: string;
  name: string;
  creatorName: string;
  detail?: string;
}): Promise<void> {
  const { moduleType, moduleName, email, creatorName, detail } = args;
  const frontendUrl = process.env.FRONTEND_URL || '';
  const joinUrl = `${frontendUrl}/register?invite=${moduleType}`;
  const subject = `You were added to a Kanaku ${MODULE_LABELS[moduleType]}`;

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

function buildInvitationEmailHtml(args: { moduleType: ModuleType; moduleName: string; creatorName: string; joinUrl: string; detail?: string }): string {
  const { moduleType, moduleName, creatorName, joinUrl, detail } = args;
  const noun = MODULE_LABELS[moduleType];
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; color: #333; }
          .container { max-width: 480px; margin: 0 auto; padding: 20px; background-color: #f9fafb; }
          .card { background-color: white; border-radius: 8px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); text-align: center; }
          .logo { font-size: 22px; font-weight: bold; color: #5B21B6; margin-bottom: 8px; }
          .title { font-size: 20px; font-weight: 600; margin: 16px 0 8px 0; color: #1f2937; }
          .message { font-size: 15px; color: #4b5563; line-height: 1.6; }
          .button { display: inline-block; padding: 12px 24px; background-color: #5B21B6; color: white; text-decoration: none; border-radius: 6px; font-weight: 500; margin-top: 20px; }
          .footer { margin-top: 24px; font-size: 12px; color: #9ca3af; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="card">
            <div class="logo">KANAKU</div>
            <div class="title">You were added to a ${noun}</div>
            <p class="message">${creatorName} added you to "${moduleName}" on Kanaku.${detail ? ` ${detail}` : ''} Join Kanaku to view it and stay in sync.</p>
            <a class="button" href="${joinUrl}">Join Kanaku</a>
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
 * Called after a new user completes registration. Matches their email
 * against pending invitations, links the account, attaches deferred
 * collaborations, and sends a welcome notification summarizing what they
 * were invited to.
 */
export async function linkPendingInvitationsForUser(userId: string, email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();

  const pending = await prisma.collaborationParticipant.findMany({
    where: { email: normalizedEmail, status: 'PENDING_REGISTRATION' },
  });

  logInvitationEvent('REGISTRATION_COMPLETED', { email: normalizedEmail, userId, pendingCount: pending.length });

  if (!pending.length) return;

  await prisma.collaborationParticipant.updateMany({
    where: { email: normalizedEmail, status: 'PENDING_REGISTRATION' },
    data: { userId, status: 'REGISTERED', linkedAt: new Date() },
  });

  for (const p of pending) {
    try {
      if (p.moduleType === 'todo_list') {
        await todoRepository.createShare(Number(p.moduleId), userId, p.invitedBy, 'view');
      } else if (p.moduleType === 'group_expense') {
        await prisma.groupExpenseMember.updateMany({
          where: { groupExpenseId: p.moduleId, email: normalizedEmail, userId: null },
          data: { userId },
        });
      } else if (p.moduleType === 'goal') {
        await prisma.goalMember.updateMany({
          where: { goalId: p.moduleId, email: normalizedEmail, userId: null },
          data: { userId },
        });
      }
      logInvitationEvent('INVITATION_LINKED', { email: normalizedEmail, userId, moduleType: p.moduleType, moduleId: p.moduleId, participantId: p.id });
    } catch (err) {
      logger.warn(`Failed to attach deferred collaboration (${p.moduleType}/${p.moduleId}) for newly registered user ${userId}`, err);
    }
  }

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
      channels: '["app"]',
      deliveryStatus: '{"app":"sent"}',
    },
  });

  try {
    const socketManager = getSocketManager();
    socketManager.notifyUser(userId, 'notification', { title: 'Welcome to Kanaku', message: `You were previously invited to ${summary}.` });
  } catch (err) {
    logger.warn('Socket notification failed for welcome invitations', err);
  }
}

export { MODULE_LABELS, MODULE_ACTION_LABELS, moduleDeepLink };
