/**
 * GDPR / DPDP Act compliance endpoints.
 *
 *   GET    /api/v1/settings/export                  — Article 20 (data portability).
 *   DELETE /api/v1/settings/account                 — Article 17 (right to erasure).
 *   GET    /api/v1/settings/account/deletion-check  — what deleting would do / what blocks it.
 *   GET    /api/v1/settings/step-up-methods         — proofs the account can give.
 *   POST   /api/v1/settings/account/cancel-deletion — un-marks a legacy pending_deletion row.
 *
 * Deletion is immediate and permanent once re-authenticated (password or a
 * one-time email code); see accountDeletion.service.ts. Rows still marked
 * `pending_deletion` by the old two-phase flow are swept by cleanup.worker.ts.
 *
 * Admins cannot delete themselves — another admin must change their role first.
 * Every call emits an `AuditLog` row: who requested erasure / export, when, from where.
 */

import type { NextFunction, Response } from 'express';
import type { AuthRequest } from '../../middleware/auth';
import { AppError } from '../../utils/AppError';
import { prisma } from '../../db/prisma';
import { auditFromRequest } from '../../utils/auditLogger';
import { clearRefreshCookie } from '../../security/refreshCookie';
import { stepUpMethods } from '../../security/stepUp';
import { accountDeletionCheck, deleteAccountForUser } from './accountDeletion.service';
import { buildUserExport } from './dataExport.service';

/**
 * GET /api/v1/settings/export
 *
 * Everything the user owns as one JSON download — see dataExport.service.ts for
 * the shape (it is also importable back into KANAKU). Rate limited at the route
 * because each call materialises the whole dataset.
 */
export const exportUserData = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) throw AppError.unauthorized();
    const userId = req.userId;
    const payload = await buildUserExport(userId);

    auditFromRequest(req, 'gdpr.data_export', {
      resource: 'user',
      resourceId: userId,
      meta: {
        counts: {
          transactions: payload.transactions.length,
          accounts: payload.accounts.length,
          goals: payload.goals.length,
          loans: payload.loans.length,
          investments: payload.investments.length,
        },
        truncated: payload.truncated,
      },
    });

    const filename = `kanaku-export-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ success: true, ...payload });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/v1/settings/account
 *
 * Permanent deletion, identical to DELETE /auth/account. The body carries the
 * step-up proof: `{ proof: { method: 'password', password } }` or
 * `{ proof: { method: 'email_code' } }` after verifying a sensitive_action code.
 *
 * This used to be a 30-day soft delete that nothing in the apps called, whose
 * "sign in to cancel" promise the auth middleware never honoured; one path now.
 */
export const deleteAccount = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) throw AppError.unauthorized();
    const result = await deleteAccountForUser(req, req.userId, (req.body as { proof?: unknown } | undefined)?.proof);
    clearRefreshCookie(res);
    res.json({
      success: true,
      message: 'Your account and its data have been permanently deleted.',
      cancelledBookings: result.cancelledBookings,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/settings/account/deletion-check
 *
 * What the confirmation dialog needs before asking: whether deletion is allowed
 * (and why not), whether proof is required, which proofs this account can give,
 * and how many other people's bookings it would cancel.
 */
export const getDeletionCheck = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) throw AppError.unauthorized();
    const [check, methods] = await Promise.all([accountDeletionCheck(req.userId), stepUpMethods(req.userId)]);
    res.json({ success: true, data: { ...check, methods } });
  } catch (error) {
    next(error);
  }
};

/** GET /api/v1/settings/step-up-methods — proofs this account can give (password, email code). */
export const getStepUpMethods = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.userId) throw AppError.unauthorized();
    res.json({ success: true, data: await stepUpMethods(req.userId) });
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

