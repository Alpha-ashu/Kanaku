import type { Response } from 'express';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { verifyStepUp } from '../../security/stepUp';
import { requestIdOf, sendWalletError } from './wallet.http';
import {
  cancelWithdrawal,
  createWithdrawal,
  getWithdrawalOverview,
  savePayoutMethod,
  toWithdrawalView,
  type PayoutDetails,
} from './withdrawal.service';

/**
 * The advisor's own withdrawals. Like the rest of /wallet, every handler acts
 * on the authenticated user only — no route takes a user id.
 */

export const getMyWithdrawals = async (req: AuthRequest, res: Response) => {
  try {
    res.json({ success: true, data: await getWithdrawalOverview(getUserId(req)) });
  } catch (error) {
    sendWalletError(res, error, 'get withdrawals', requestIdOf(req));
  }
};

/**
 * Saving where the money goes needs the password or an emailed code on top of
 * the PIN unlock: a stolen session must not be able to redirect payouts.
 */
export const saveMyPayoutMethod = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    await verifyStepUp(req, userId, req.body.proof, 'payout.method_change');
    const saved = await savePayoutMethod(userId, req.body.details as PayoutDetails);
    res.json({ success: true, data: { payoutMethod: { method: saved.method, label: saved.label, updatedAt: saved.updatedAt } } });
  } catch (error) {
    sendWalletError(res, error, 'save payout method', requestIdOf(req));
  }
};

export const requestWithdrawal = async (req: AuthRequest, res: Response) => {
  try {
    const { coins, clientRequestId } = req.body as { coins: number; clientRequestId: string };
    const result = await createWithdrawal({ userId: getUserId(req), coins, idempotencyKey: clientRequestId });
    res.status(result.replayed ? 200 : 201).json({ success: true, data: { withdrawal: toWithdrawalView(result.request), replayed: result.replayed } });
  } catch (error) {
    sendWalletError(res, error, 'request withdrawal', requestIdOf(req));
  }
};

export const cancelMyWithdrawal = async (req: AuthRequest, res: Response) => {
  try {
    const request = await cancelWithdrawal(getUserId(req), req.params.id);
    res.json({ success: true, data: { withdrawal: toWithdrawalView(request) } });
  } catch (error) {
    sendWalletError(res, error, 'cancel withdrawal', requestIdOf(req));
  }
};
