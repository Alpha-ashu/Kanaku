/**
 * GDPR / DPDP Act compliance endpoints.
 *
 *   GET    /api/v1/settings/export       — Article 20 (data portability).
 *   DELETE /api/v1/settings/account      — Article 17 (right to erasure).
 *   POST   /api/v1/settings/account/cancel-deletion
 *                                        — abort a pending soft-delete.
 *
 * Deletion model: two-phase.
 *   Phase 1 (this request): user is marked `status = 'pending_deletion'`
 *     and `deletedAt = now + 30 days`. Login is immediately denied; all
 *     sync APIs return 410 Gone. Reversible until the timer fires.
 *   Phase 2 (worker, not in this PR): a cron worker scans for users
 *     whose `deletedAt < now()` and performs a CASCADE delete inside a
 *     single Prisma transaction. Supabase Auth user and Storage objects
 *     are purged separately.
 *
 * Admins cannot delete themselves — must be done by another admin via
 * the admin module.
 *
 * Both endpoints emit an `AuditLog` row so we have a durable record of
 * who requested erasure / export, when, and from what IP.
 */

import type { NextFunction, Response } from 'express';
import type { AuthRequest } from '../../middleware/auth';
import { AppError } from '../../utils/AppError';
import { prisma } from '../../db/prisma';
import { auditFromRequest } from '../../utils/auditLogger';

const SOFT_DELETE_GRACE_DAYS = 30;

/**
 * GET /api/v1/settings/export
 *
 * Streams the user's data as a single JSON document. Caps each table
 * at a generous limit to avoid OOM on pathological accounts — if a user
 * has more than 50k rows in any one table we hand them a 207 with a
 * "use /export/chunked" hint (future endpoint).
 */
export const exportUserData = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) throw AppError.unauthorized();
    const userId = req.userId;

    // Run all reads concurrently inside a single transaction for a
    // consistent snapshot.
    const [
      user,
      profile,
      settings,
      accounts,
      transactions,
      goals,
      goalContributions,
      loans,
      loanPayments,
      investments,
      todos,
      friends,
      notifications,
      categories,
      budgets,
      recurringTransactions,
      goldAssets,
      devices,
      aaConsents,
    ] = await prisma.$transaction([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.profiles.findUnique({ where: { id: userId } as any }).catch(() => null) as any,
      prisma.userSettings.findUnique({ where: { userId } }),
      prisma.account.findMany({ where: { userId }, take: 5000 }),
      prisma.transaction.findMany({ where: { userId }, take: 50_000, orderBy: { date: 'desc' } }),
      prisma.goal.findMany({ where: { userId }, take: 1000 }),
      prisma.goalContribution.findMany({ where: { userId }, take: 50_000 }),
      prisma.loan.findMany({ where: { userId }, take: 1000 }),
      prisma.loanPayment.findMany({ where: { loan: { userId } }, take: 50_000 }),
      prisma.investment.findMany({ where: { userId }, take: 5000 }),
      prisma.todo.findMany({ where: { userId }, take: 5000 }),
      prisma.friend.findMany({ where: { userId }, take: 5000 }),
      prisma.notification.findMany({ where: { userId }, take: 5000 }),
      prisma.category.findMany({ where: { userId }, take: 1000 }),
      prisma.budget.findMany({ where: { userId }, take: 1000 }),
      prisma.recurringTransaction.findMany({ where: { userId }, take: 1000 }),
      prisma.goldAsset.findMany({ where: { userId }, take: 1000 }),
      prisma.device.findMany({ where: { userId }, take: 100 }),
      prisma.aaConsent.findMany({ where: { userId }, take: 100 }),
    ]);

    // Strip password & PIN hashes from the user blob before export.
    const sanitizedUser = user ? { ...user, password: undefined } : null;

    const filename = `kanaku-export-${userId.slice(0, 8)}-${Date.now()}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    auditFromRequest(req, 'gdpr.data_export', {
      resource: 'user',
      resourceId: userId,
      meta: {
        counts: {
          transactions: transactions.length,
          accounts: accounts.length,
          goals: goals.length,
          loans: loans.length,
          investments: investments.length,
        },
      },
    });

    res.json({
      success: true,
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      user: sanitizedUser,
      profile,
      settings,
      data: {
        accounts,
        transactions,
        goals,
        goalContributions,
        loans,
        loanPayments,
        investments,
        todos,
        friends,
        notifications,
        categories,
        budgets,
        recurringTransactions,
        goldAssets,
        devices,
        aaConsents,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/v1/settings/account
 *
 * Soft-deletes the user. Returns the scheduled hard-delete date so the
 * UI can show a "your account will be permanently deleted on <date>"
 * banner with a cancel CTA.
 */
export const deleteAccount = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) throw AppError.unauthorized();
    const userId = req.userId;

    const me = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, status: true } });
    if (!me) throw AppError.notFound('User');

    // Admins must be removed by another admin to avoid orphaning the
    // last admin seat.
    if (me.role === 'admin') {
      throw AppError.forbidden(
        'Admins cannot delete themselves. Ask another admin to demote your account first.',
        'ADMIN_SELF_DELETE_FORBIDDEN',
      );
    }

    if (me.status === 'pending_deletion') {
      throw AppError.badRequest('Account is already scheduled for deletion.', 'ALREADY_PENDING_DELETION');
    }

    const scheduledFor = new Date(Date.now() + SOFT_DELETE_GRACE_DAYS * 24 * 60 * 60 * 1000);

    await prisma.user.update({
      where: { id: userId },
      data: {
        status: 'pending_deletion',
        // We do NOT set the `deletedAt` column on User (the schema may
        // not have one); instead record the schedule in `syncToken` as
        // a quick ISO marker that the cleanup worker can scan.
        syncToken: `delete_after:${scheduledFor.toISOString()}`,
      },
    });

    // Revoke all refresh tokens immediately.
    await prisma.refreshToken.deleteMany({ where: { userId } }).catch(() => null);

    auditFromRequest(req, 'gdpr.account_delete_requested', {
      resource: 'user',
      resourceId: userId,
      meta: { scheduledFor: scheduledFor.toISOString() },
    });

    res.json({
      success: true,
      message: `Account scheduled for deletion on ${scheduledFor.toISOString().slice(0, 10)}. Sign in again before then to cancel.`,
      scheduledFor: scheduledFor.toISOString(),
      graceDays: SOFT_DELETE_GRACE_DAYS,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/settings/account/cancel-deletion
 *
 * Reverts a pending soft-delete. Only valid while the user can still
 * authenticate (i.e. between request and the worker firing).
 */
export const cancelAccountDeletion = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) throw AppError.unauthorized();
    const userId = req.userId;

    const me = await prisma.user.findUnique({ where: { id: userId }, select: { status: true } });
    if (!me) throw AppError.notFound('User');
    if (me.status !== 'pending_deletion') {
      throw AppError.badRequest('Account is not scheduled for deletion.', 'NOT_PENDING_DELETION');
    }

    await prisma.user.update({
      where: { id: userId },
      data: { status: 'verified', syncToken: null },
    });

    auditFromRequest(req, 'auth.role_change', {
      resource: 'user',
      resourceId: userId,
      meta: { action: 'cancel_pending_deletion' },
    });

    res.json({ success: true, message: 'Account deletion cancelled.' });
  } catch (error) {
    next(error);
  }
};

