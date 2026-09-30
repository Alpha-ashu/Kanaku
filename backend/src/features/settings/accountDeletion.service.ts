/**
 * Account deletion — the one implementation behind DELETE /auth/account and
 * DELETE /settings/account (the web and mobile clients call the first; the
 * second is the GDPR/DPDP-documented path).
 *
 * Order matters, and every step before the delete can still refuse:
 *
 *   1. Refusals: protected role accounts, admins (another admin must demote
 *      them first, so the platform can never lose its last admin to a stolen
 *      session), and anything the coin wallet still owes or holds.
 *   2. Step-up proof (password or a one-time email code), unless the account is
 *      a fresh, empty sign-up being discarded from onboarding.
 *   3. Counterparties of open bookings are told — the cascade removes those
 *      bookings from THEIR lists too, and silently vanishing sessions are worse.
 *   4. One DB transaction removes `profiles` + `User`; Postgres cascades take
 *      every owned row. Coin ledger rows and payment orders deliberately have no
 *      FK to User and survive as the financial record.
 *   5. After commit: storage objects, the identity-provider user, the presented
 *      tokens and every per-user cache.
 */
import type { Request } from 'express';
import { prisma } from '../../db/prisma';
import { logger } from '../../config/logger';
import { AppError } from '../../utils/AppError';
import { audit, auditFromRequest } from '../../utils/auditLogger';
import { isProtectedAccount } from '../../utils/protectedAccounts';
import { removeObject } from '../../utils/storage';
import { getSupabaseAdminClient } from '../../db/supabase';
import { financialDeletionBlockers } from '../wallet/wallet.guards';
import { verifyStepUp } from '../../security/stepUp';
import { revokeToken } from '../../security/tokenRevocation';
import { readRefreshCookie } from '../../security/refreshCookie';
import { clearIdleSession } from '../../security/idleSession';
import { clearPinUnlock } from '../../security/pinUnlock';
import { invalidateUserSnapshotCache } from '../../middleware/auth';
import { cacheDeleteByUserId } from '../../cache/redis';
import { notify } from '../notifications/notify';

/** A sign-up younger than this, holding no data, can be discarded without re-authentication. */
const DISCARDABLE_ACCOUNT_AGE_MS = 24 * 60 * 60 * 1000;
const OPEN_BOOKING_STATUSES = ['pending', 'accepted', 'reschedule'];

export interface DeletionBlocker {
  code: 'PROTECTED_ACCOUNT' | 'ADMIN_SELF_DELETE_FORBIDDEN' | 'ACCOUNT_HAS_OPEN_BALANCE';
  message: string;
}

export interface DeletionCheck {
  allowed: boolean;
  /** False only for a fresh, empty sign-up (the onboarding "discard" path). */
  requiresProof: boolean;
  blockers: DeletionBlocker[];
  /** Other people's bookings that deleting this account will cancel. */
  openBookings: number;
}

/** True when the account is a just-created shell with nothing in it. */
async function isDiscardableFreshAccount(userId: string, createdAt: Date): Promise<boolean> {
  if (Date.now() - createdAt.getTime() > DISCARDABLE_ACCOUNT_AGE_MS) return false;
  const counts = await Promise.all([
    prisma.account.count({ where: { userId } }),
    prisma.transaction.count({ where: { userId } }),
    prisma.goal.count({ where: { userId } }),
    prisma.loan.count({ where: { userId } }),
    prisma.investment.count({ where: { userId } }),
    prisma.budget.count({ where: { userId } }),
    prisma.friend.count({ where: { userId } }),
    prisma.expenseBill.count({ where: { userId } }),
    prisma.vaultDocument.count({ where: { userId } }),
    prisma.bookingRequest.count({ where: { OR: [{ clientId: userId }, { advisorId: userId }] } }),
    prisma.advisorApplication.count({ where: { userId } }),
  ]);
  return counts.every((n) => n === 0);
}

export async function accountDeletionCheck(userId: string): Promise<DeletionCheck> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, role: true, createdAt: true },
  });
  if (!user) throw AppError.notFound('User');

  const blockers: DeletionBlocker[] = [];
  if (isProtectedAccount(user.email)) {
    blockers.push({ code: 'PROTECTED_ACCOUNT', message: 'This is a protected KANAKU role account and cannot be deleted.' });
  }
  if (user.role === 'admin') {
    blockers.push({
      code: 'ADMIN_SELF_DELETE_FORBIDDEN',
      message: 'Admins cannot delete their own account. Ask another admin to change your role first.',
    });
  }
  for (const reason of await financialDeletionBlockers(userId)) {
    blockers.push({ code: 'ACCOUNT_HAS_OPEN_BALANCE', message: reason });
  }

  const [discardable, openBookings] = await Promise.all([
    isDiscardableFreshAccount(userId, user.createdAt),
    prisma.bookingRequest.count({
      where: { OR: [{ clientId: userId }, { advisorId: userId }], status: { in: OPEN_BOOKING_STATUSES } },
    }),
  ]);

  return { allowed: blockers.length === 0, requiresProof: !discardable, blockers, openBookings };
}

const refusal = (blockers: DeletionBlocker[]): AppError => {
  const first = blockers[0];
  if (first.code === 'ACCOUNT_HAS_OPEN_BALANCE') {
    return AppError.conflict(
      `Your account cannot be deleted yet: ${blockers.map((b) => b.message).join('; ')}. Use or cancel them first, or contact support.`,
      'ACCOUNT_HAS_OPEN_BALANCE',
    ).withDetails({ blockers });
  }
  return AppError.forbidden(first.message, first.code).withDetails({ blockers });
};

/** Tell the other side of every open booking before the cascade removes it. */
async function notifyCounterparties(userId: string, displayName: string) {
  const open = await prisma.bookingRequest.findMany({
    where: { OR: [{ clientId: userId }, { advisorId: userId }], status: { in: OPEN_BOOKING_STATUSES } },
    select: { id: true, clientId: true, advisorId: true, proposedDate: true, proposedTime: true },
    take: 500,
  });
  await Promise.allSettled(open.map((booking) => {
    const otherParty = booking.clientId === userId ? booking.advisorId : booking.clientId;
    const day = booking.proposedDate ? booking.proposedDate.toISOString().slice(0, 10) : '';
    const when = day && booking.proposedTime ? `${day} at ${booking.proposedTime}` : day;
    return notify({
      userId: otherParty,
      topic: 'booking',
      type: 'booking_cancelled_account_closed',
      title: 'Session cancelled',
      message: `${displayName} closed their KANAKU account, so your session${when ? ` on ${when}` : ''} was cancelled.`,
      dedupKey: `booking-account-closed:${booking.id}`,
      priority: 'high',
    });
  }));
  return open.length;
}

/** Every storage object the cascade will orphan. Collected while the rows exist. */
async function collectStoragePaths(userId: string): Promise<string[]> {
  const [bills, attachments, vaultDocs, vaultVersions, application] = await Promise.all([
    prisma.expenseBill.findMany({ where: { userId }, select: { storagePath: true } }),
    // Sessions cascade with either participant, taking BOTH sides' messages.
    prisma.chatMessage.findMany({
      where: {
        attachmentPath: { not: null },
        OR: [{ senderId: userId }, { session: { OR: [{ clientId: userId }, { advisorId: userId }] } }],
      },
      select: { attachmentPath: true },
    }),
    prisma.vaultDocument.findMany({ where: { userId }, select: { storagePath: true } }),
    prisma.vaultDocumentVersion.findMany({ where: { document: { userId } }, select: { storagePath: true } }),
    prisma.advisorApplication.findUnique({
      where: { userId },
      select: { panDocumentPath: true, aadhaarDocumentPath: true, certDocumentPath: true },
    }),
  ]);
  const paths = [
    ...bills.map((b) => b.storagePath),
    ...attachments.map((m) => m.attachmentPath),
    ...vaultDocs.map((d) => d.storagePath),
    ...vaultVersions.map((v) => v.storagePath),
    application?.panDocumentPath,
    application?.aadhaarDocumentPath,
    application?.certDocumentPath,
  ];
  return [...new Set(paths.filter((p): p is string => Boolean(p)))];
}

async function deleteIdentityProviderUser(userId: string) {
  try {
    const admin = getSupabaseAdminClient();
    if (!admin) return;
    const { error } = await admin.auth.admin.deleteUser(userId);
    // A user who never existed at the provider answers "not found" — nothing to do.
    if (error && !/not.?found/i.test(error.message)) {
      logger.warn('[account-delete] identity provider user was not removed', { userId, error });
    }
  } catch (error) {
    logger.warn('[account-delete] identity provider deletion failed', { userId, error });
  }
}

export interface DeletionResult {
  deleted: true;
  cancelledBookings: number;
  removedFiles: number;
}

export async function deleteAccountForUser(req: Request, userId: string, proof: unknown): Promise<DeletionResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, role: true },
  });
  if (!user) throw AppError.notFound('User');

  const check = await accountDeletionCheck(userId);
  if (!check.allowed) {
    auditFromRequest(req, 'gdpr.account_delete_refused', {
      userId, resource: 'user', resourceId: userId,
      meta: { reasons: check.blockers.map((b) => b.code) },
    });
    throw refusal(check.blockers);
  }

  const method = check.requiresProof ? await verifyStepUp(req, userId, proof, 'account.delete') : 'fresh_discard';

  const cancelledBookings = await notifyCounterparties(userId, user.name || 'Your KANAKU contact');
  const storagePaths = await collectStoragePaths(userId);

  try {
    await prisma.$transaction(async (tx) => {
      // profiles.id is uuid; compare as text so a non-uuid id cannot throw.
      await tx.$executeRaw`DELETE FROM public.profiles WHERE id::text = ${userId}`;
      await tx.user.delete({ where: { id: userId } });
    }, { timeout: 30_000 });
  } catch (error) {
    // A concurrent request (double tap) may have finished first — that is success.
    if ((error as { code?: string })?.code === 'P2025') {
      return { deleted: true, cancelledBookings, removedFiles: 0 };
    }
    // Production carries constraints no migration created; a blocked delete rolls
    // back whole, so the account is untouched. Log the constraint, not the user.
    logger.error('[account-delete] delete failed and was rolled back', { userId, error });
    throw new AppError(500, 'ACCOUNT_DELETE_FAILED', 'We could not delete your account right now and nothing was removed. Please try again or contact support.');
  }

  const removed = await Promise.allSettled(storagePaths.map((p) => removeObject(p)));
  await deleteIdentityProviderUser(userId);

  // The auth middleware already rejects every token of a user that no longer
  // exists; revoking the presented pair also covers its snapshot-cache window.
  revokeToken((req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
  revokeToken(readRefreshCookie(req) || (req.headers['x-refresh-token'] as string | undefined));
  invalidateUserSnapshotCache(userId);
  await Promise.allSettled([clearIdleSession(userId), clearPinUnlock(userId), cacheDeleteByUserId(userId)]);

  audit({
    event: 'gdpr.account_delete_executed',
    userId,
    resource: 'user',
    resourceId: userId,
    meta: { role: user.role, method, cancelledBookings, files: storagePaths.length },
  });

  return {
    deleted: true,
    cancelledBookings,
    removedFiles: removed.filter((r) => r.status === 'fulfilled').length,
  };
}
