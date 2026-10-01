import { randomUUID } from 'crypto';
import { prisma } from '../../db/prisma';
import { Prisma } from '../../db/prisma-client';
import { logger } from '../../config/logger';
import { audit } from '../../utils/auditLogger';
import { notify } from '../notifications/notify';
import { decryptJsonForUser, encryptJsonForUser, isCryptoConfigured } from '../../security/crypto';
import { WalletError } from './wallet.errors';
import { walletConfig } from './wallet.config';
import { LEDGER_TX_OPTIONS, findEntry, lockKey, lockWallets, postEntry, type Tx } from './wallet.service';

/**
 * Advisor withdrawals.
 *
 * Only coins EARNED from completed sessions can be withdrawn; coins bought with
 * money stay spend-only (closed loop). Withdrawable is
 *
 *   min(available balance, released earnings − reversed earnings − net withdrawals)
 *
 * so spending, refunds and earlier withdrawals all count against it, and a
 * withdrawal can never cash out a purchase.
 *
 * Lifecycle (payouts are made by finance staff outside the app):
 *
 *   REQUESTED ──approve──▶ APPROVED ──mark paid (reference)──▶ PAID
 *       │                     │
 *       ├──cancel (advisor)   └──reject──▶ REJECTED   (coins returned)
 *       └──reject──▶ REJECTED / CANCELLED              (coins returned)
 *
 * The coins leave the wallet when the request is made (ledger WITHDRAWAL), so
 * they cannot be spent twice while staff process it, and come back through a
 * WITHDRAWAL_REVERSAL if it is rejected or cancelled. Approval locks the request
 * against cancellation, so staff never pay a request the advisor has withdrawn.
 * Every transition is a compare-and-set on the status; the reversal's unique
 * ledger reference makes a double return impossible.
 */

export type PayoutMethodType = 'UPI' | 'BANK';

export type PayoutDetails =
  | { method: 'UPI'; upiId: string; name?: string }
  | { method: 'BANK'; accountHolder: string; accountNumber: string; ifsc: string };

export type WithdrawalStatus = 'REQUESTED' | 'APPROVED' | 'PAID' | 'REJECTED' | 'CANCELLED';

const EARNING_TYPES = ['EARNING_RELEASE', 'EARNING_REVERSAL', 'WITHDRAWAL', 'WITHDRAWAL_REVERSAL'];

/** Binds a payout ciphertext to its owner: a row copied onto another user fails to decrypt. */
const payoutAad = (userId: string) => `payout:${userId}`;

type WithdrawalRow = Awaited<ReturnType<typeof prisma.withdrawalRequest.findMany>>[number];

const describeCoins = (n: number) => `${n.toLocaleString('en-IN')} ${n === 1 ? 'coin' : 'coins'}`;
const describeMoney = (minor: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: minor % 100 === 0 ? 0 : 2 }).format(minor / 100);

// ─── Payout details ───────────────────────────────────────────────────────────

const maskTail = (value: string, keep = 4) => `••••${value.slice(-keep)}`;

/** What can be shown anywhere — never enough to pay someone else's money into. */
export const payoutLabel = (details: PayoutDetails): string => {
  if (details.method === 'UPI') {
    const [handle, bank] = details.upiId.split('@');
    return `UPI · ${handle.slice(0, 2)}•••@${bank}`;
  }
  return `Bank · A/c ${maskTail(details.accountNumber)} · ${details.ifsc}`;
};

const requireCrypto = () => {
  if (!isCryptoConfigured()) {
    throw new WalletError('PAYOUTS_UNAVAILABLE', 'Withdrawals are not available right now. Please try again later.', 503);
  }
};

export const getPayoutMethod = (userId: string) => prisma.payoutMethod.findUnique({ where: { userId } });

export const savePayoutMethod = async (userId: string, details: PayoutDetails) => {
  requireCrypto();
  const label = payoutLabel(details);
  const detailsEncrypted = encryptJsonForUser(userId, details, { aad: payoutAad(userId) });
  const saved = await prisma.payoutMethod.upsert({
    where: { userId },
    create: { userId, method: details.method, label, detailsEncrypted },
    update: { method: details.method, label, detailsEncrypted },
  });
  audit({ event: 'wallet.payout_method_changed', userId, resource: 'PayoutMethod', resourceId: saved.id, meta: { method: details.method, label } });
  // Always told, by email too: a changed payout account is what an account
  // takeover would do first.
  void notify({
    userId,
    topic: 'security',
    type: 'payout_method_changed',
    title: 'Payout details changed',
    message: `Withdrawals will now be paid to ${label}. If you did not make this change, contact support immediately.`,
    deepLink: '/wallet',
    email: true,
    priority: 'high',
    dedupKey: `payout_method_changed:${saved.id}:${saved.updatedAt.getTime()}`,
  });
  return saved;
};

/** Staff only. Every call is audited by the caller with the actor. */
export const decryptPayoutDetails = (request: Pick<WithdrawalRow, 'userId' | 'payoutDetailsEncrypted'>): PayoutDetails => {
  requireCrypto();
  return decryptJsonForUser<PayoutDetails>(request.userId, request.payoutDetailsEncrypted, { aad: payoutAad(request.userId) });
};

// ─── Reads ─────────────────────────────────────────────────────────────────────

/** Earned coins not yet withdrawn: released − reversed − withdrawn + returned. */
export const netEarnedCoins = async (db: Tx | typeof prisma, userId: string): Promise<number> => {
  const result = await db.walletTransaction.aggregate({
    where: { userId, bucket: 'AVAILABLE', type: { in: EARNING_TYPES } },
    _sum: { amount: true },
  });
  return result._sum.amount ?? 0;
};

export const withdrawableCoins = (availableBalance: number, netEarned: number) =>
  Math.max(0, Math.min(availableBalance, netEarned));

export const toWithdrawalView = (row: WithdrawalRow) => ({
  id: row.id,
  coins: row.coins,
  amountMinor: row.amountMinor,
  currency: row.currency,
  status: row.status as WithdrawalStatus,
  method: row.method as PayoutMethodType,
  payoutLabel: row.payoutLabel,
  payoutReference: row.payoutReference,
  decisionNote: row.decisionNote,
  createdAt: row.createdAt,
  approvedAt: row.approvedAt,
  paidAt: row.paidAt,
  rejectedAt: row.rejectedAt,
  cancelledAt: row.cancelledAt,
});

export const getWithdrawalOverview = async (userId: string) => {
  const [wallet, netEarned, method, open, recent] = await Promise.all([
    prisma.wallet.findUnique({ where: { userId }, select: { availableBalance: true, status: true } }),
    netEarnedCoins(prisma, userId),
    getPayoutMethod(userId),
    prisma.withdrawalRequest.findUnique({ where: { openKey: userId } }),
    prisma.withdrawalRequest.findMany({ where: { userId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 20 }),
  ]);
  const available = wallet?.availableBalance ?? 0;
  const paid = await prisma.withdrawalRequest.aggregate({ where: { userId, status: 'PAID' }, _sum: { amountMinor: true, coins: true } });
  return {
    enabled: walletConfig.withdrawalsEnabled && isCryptoConfigured(),
    minCoins: walletConfig.minWithdrawalCoins,
    maxCoins: walletConfig.maxWithdrawalCoins,
    coinValueMinor: walletConfig.coinValueMinor,
    currency: 'INR',
    availableBalance: available,
    withdrawableCoins: wallet?.status === 'FROZEN' ? 0 : withdrawableCoins(available, netEarned),
    walletStatus: (wallet?.status ?? 'ACTIVE') as 'ACTIVE' | 'FROZEN',
    paidOut: { coins: paid._sum.coins ?? 0, amountMinor: paid._sum.amountMinor ?? 0 },
    payoutMethod: method ? { method: method.method as PayoutMethodType, label: method.label, updatedAt: method.updatedAt } : null,
    open: open ? toWithdrawalView(open) : null,
    recent: recent.map(toWithdrawalView),
  };
};

// ─── Advisor actions ───────────────────────────────────────────────────────────

export interface CreateWithdrawalInput {
  userId: string;
  coins: number;
  /** Client-supplied; a retried request returns the first result. */
  idempotencyKey: string;
}

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

export const createWithdrawal = async (input: CreateWithdrawalInput) => {
  const { userId, coins, idempotencyKey } = input;
  if (!walletConfig.withdrawalsEnabled) {
    throw new WalletError('WITHDRAWALS_DISABLED', 'Withdrawals are paused right now. Please try again later.', 503);
  }
  requireCrypto();
  if (!Number.isInteger(coins) || coins < walletConfig.minWithdrawalCoins) {
    throw new WalletError('WITHDRAWAL_BELOW_MINIMUM', `The minimum withdrawal is ${describeCoins(walletConfig.minWithdrawalCoins)}.`, 400, { minCoins: walletConfig.minWithdrawalCoins });
  }
  if (coins > walletConfig.maxWithdrawalCoins) {
    throw new WalletError('WITHDRAWAL_ABOVE_MAXIMUM', `The maximum for one withdrawal is ${describeCoins(walletConfig.maxWithdrawalCoins)}.`, 400, { maxCoins: walletConfig.maxWithdrawalCoins });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // One withdrawal decision at a time per user: the replay check, the
      // one-open-request rule and the balance check all see the same state.
      await lockKey(tx, `withdrawal:user:${userId}`);
      const replay = await tx.withdrawalRequest.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey } } });
      if (replay) return { request: replay, replayed: true };

      const open = await tx.withdrawalRequest.findUnique({ where: { openKey: userId } });
      if (open) {
        throw new WalletError('WITHDRAWAL_ALREADY_OPEN', 'You already have a withdrawal in progress. You can request another once it is paid or cancelled.', 409, { withdrawalId: open.id });
      }
      const method = await tx.payoutMethod.findUnique({ where: { userId } });
      if (!method) throw new WalletError('PAYOUT_METHOD_REQUIRED', 'Add your UPI ID or bank account before requesting a withdrawal.', 409);

      await lockWallets(tx, [userId]);
      const wallet = await tx.wallet.findUnique({ where: { userId }, select: { availableBalance: true } });
      const withdrawable = withdrawableCoins(wallet?.availableBalance ?? 0, await netEarnedCoins(tx, userId));
      if (coins > withdrawable) {
        throw new WalletError(
          'WITHDRAWAL_EXCEEDS_EARNINGS',
          withdrawable > 0
            ? `You can withdraw up to ${describeCoins(withdrawable)} right now. Only coins earned from completed sessions can be withdrawn.`
            : 'You have no earned coins to withdraw yet. Only coins earned from completed sessions can be withdrawn.',
          409,
          { withdrawableCoins: withdrawable },
        );
      }

      const id = randomUUID();
      const request = await tx.withdrawalRequest.create({
        data: {
          id,
          userId,
          coins,
          amountMinor: coins * walletConfig.coinValueMinor,
          currency: 'INR',
          status: 'REQUESTED',
          openKey: userId,
          method: method.method,
          payoutLabel: method.label,
          // A snapshot: changing the payout method later does not redirect a
          // request already made.
          payoutDetailsEncrypted: method.detailsEncrypted,
          idempotencyKey,
        },
      });
      await postEntry(tx, {
        userId,
        type: 'WITHDRAWAL',
        amount: -coins,
        reference: `withdrawal:${id}`,
        description: `Withdrawal to ${method.label}`,
        actorId: userId,
        actorRole: 'advisor',
        userInitiated: true,
        metadata: { withdrawalId: id },
      });
      return { request, replayed: false };
    }, LEDGER_TX_OPTIONS);

    if (!result.replayed) {
      const { request } = result;
      audit({ event: 'wallet.withdrawal_requested', userId, resource: 'WithdrawalRequest', resourceId: request.id, meta: { coins: request.coins, amountMinor: request.amountMinor, method: request.method } });
      void notify({
        userId,
        topic: 'wallet',
        type: 'withdrawal_requested',
        title: 'Withdrawal requested',
        message: `${describeMoney(request.amountMinor)} (${describeCoins(request.coins)}) will be paid to ${request.payoutLabel} once our team has processed it.`,
        deepLink: '/wallet',
        dedupKey: `withdrawal_requested:${request.id}`,
        metadata: { withdrawalId: request.id },
      });
      void notifyFinanceStaff(request);
    }
    return result;
  } catch (error) {
    // The advisory lock makes these unreachable in practice; the unique indexes
    // are the backstop if it is ever bypassed.
    if (isUniqueViolation(error)) {
      const replay = await prisma.withdrawalRequest.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey } } });
      if (replay) return { request: replay, replayed: true };
      throw new WalletError('WITHDRAWAL_ALREADY_OPEN', 'You already have a withdrawal in progress.', 409);
    }
    throw error;
  }
};

/** Admins who can act on payouts hear about each new request. */
const notifyFinanceStaff = async (request: WithdrawalRow) => {
  try {
    const admins = await prisma.user.findMany({ where: { role: 'admin' }, select: { id: true }, take: 20 });
    await Promise.all(admins.map((admin) => notify({
      userId: admin.id,
      topic: 'wallet',
      type: 'withdrawal_pending_review',
      title: 'Withdrawal waiting for payout',
      message: `An advisor requested ${describeMoney(request.amountMinor)}. Review it in Payments & Wallets → Withdrawals.`,
      deepLink: '/admin-finance',
      dedupKey: `withdrawal_pending_review:${request.id}:${admin.id}`,
      metadata: { withdrawalId: request.id },
    })));
  } catch (error) {
    logger.warn('[withdrawals] staff notification failed', { withdrawalId: request.id, error });
  }
};

interface Actor { id: string; role: string }

/**
 * Moves a request from one of `from` to `to` atomically. Returns the updated
 * row, or throws WITHDRAWAL_STATE_CHANGED when someone else moved it first.
 */
const transition = async (
  tx: Tx,
  where: Prisma.WithdrawalRequestWhereInput & { id: string },
  from: WithdrawalStatus[],
  data: Prisma.WithdrawalRequestUpdateManyMutationInput,
) => {
  const moved = await tx.withdrawalRequest.updateMany({ where: { ...where, status: { in: from } }, data });
  const row = await tx.withdrawalRequest.findFirst({ where });
  if (!row) throw new WalletError('WITHDRAWAL_NOT_FOUND', 'Withdrawal not found.', 404);
  if (moved.count === 0) {
    throw new WalletError('WITHDRAWAL_STATE_CHANGED', `This withdrawal is already ${row.status.toLowerCase()}.`, 409, { status: row.status });
  }
  return row;
};

/** Gives the coins back for a rejected or cancelled request — at most once, by reference. */
const returnCoins = async (tx: Tx, request: WithdrawalRow, actor: Actor, reason: string) => {
  const reference = `withdrawal:${request.id}:reversal`;
  if (await findEntry(tx, reference)) return;
  const hold = await findEntry(tx, `withdrawal:${request.id}`);
  await lockWallets(tx, [request.userId]);
  await postEntry(tx, {
    userId: request.userId,
    type: 'WITHDRAWAL_REVERSAL',
    amount: request.coins,
    reference,
    reversalOfId: hold?.id ?? null,
    description: request.status === 'CANCELLED' ? 'Withdrawal cancelled — coins returned' : 'Withdrawal not paid — coins returned',
    reason,
    actorId: actor.id,
    actorRole: actor.role,
    metadata: { withdrawalId: request.id },
  });
};

export const cancelWithdrawal = async (userId: string, withdrawalId: string) => {
  const request = await prisma.$transaction(async (tx) => {
    const row = await transition(tx, { id: withdrawalId, userId }, ['REQUESTED'], {
      status: 'CANCELLED', openKey: null, cancelledAt: new Date(),
    });
    await returnCoins(tx, row, { id: userId, role: 'advisor' }, 'Cancelled by the advisor');
    return row;
  }, LEDGER_TX_OPTIONS);
  audit({ event: 'wallet.withdrawal_cancelled', userId, resource: 'WithdrawalRequest', resourceId: request.id, meta: { coins: request.coins } });
  return request;
};

// ─── Staff actions ─────────────────────────────────────────────────────────────

const refuseOwnRequest = async (withdrawalId: string, actor: Actor) => {
  const row = await prisma.withdrawalRequest.findUnique({ where: { id: withdrawalId }, select: { userId: true } });
  if (!row) throw new WalletError('WITHDRAWAL_NOT_FOUND', 'Withdrawal not found.', 404);
  if (row.userId === actor.id) {
    throw new WalletError('WITHDRAWAL_SELF_REVIEW', 'You cannot review your own withdrawal.', 403);
  }
};

export const approveWithdrawal = async (withdrawalId: string, actor: Actor) => {
  await refuseOwnRequest(withdrawalId, actor);
  const request = await prisma.$transaction((tx) => transition(tx, { id: withdrawalId }, ['REQUESTED'], {
    status: 'APPROVED', approvedAt: new Date(), reviewedBy: actor.id,
  }), LEDGER_TX_OPTIONS);
  audit({ event: 'wallet.withdrawal_approved', userId: actor.id, resource: 'WithdrawalRequest', resourceId: request.id, meta: { advisorId: request.userId, coins: request.coins } });
  void notify({
    userId: request.userId,
    topic: 'wallet',
    type: 'withdrawal_approved',
    title: 'Withdrawal approved',
    message: `Your withdrawal of ${describeMoney(request.amountMinor)} is approved and being paid to ${request.payoutLabel}.`,
    deepLink: '/wallet',
    dedupKey: `withdrawal_approved:${request.id}`,
    metadata: { withdrawalId: request.id },
  });
  return request;
};

export const markWithdrawalPaid = async (withdrawalId: string, actor: Actor, payoutReference: string, note?: string | null) => {
  await refuseOwnRequest(withdrawalId, actor);
  const request = await prisma.$transaction((tx) => transition(tx, { id: withdrawalId }, ['APPROVED'], {
    status: 'PAID', openKey: null, paidAt: new Date(), payoutReference, decisionNote: note || null, reviewedBy: actor.id,
  }), LEDGER_TX_OPTIONS);
  audit({ event: 'wallet.withdrawal_paid', userId: actor.id, resource: 'WithdrawalRequest', resourceId: request.id, meta: { advisorId: request.userId, coins: request.coins, amountMinor: request.amountMinor, payoutReference } });
  void notify({
    userId: request.userId,
    topic: 'wallet',
    type: 'withdrawal_paid',
    title: 'Withdrawal paid',
    message: `${describeMoney(request.amountMinor)} was paid to ${request.payoutLabel}. Reference: ${payoutReference}.`,
    deepLink: '/wallet',
    email: true,
    priority: 'high',
    dedupKey: `withdrawal_paid:${request.id}`,
    metadata: { withdrawalId: request.id },
  });
  return request;
};

export const rejectWithdrawal = async (withdrawalId: string, actor: Actor, reason: string) => {
  await refuseOwnRequest(withdrawalId, actor);
  const request = await prisma.$transaction(async (tx) => {
    const row = await transition(tx, { id: withdrawalId }, ['REQUESTED', 'APPROVED'], {
      status: 'REJECTED', openKey: null, rejectedAt: new Date(), decisionNote: reason, reviewedBy: actor.id,
    });
    await returnCoins(tx, row, actor, reason);
    return row;
  }, LEDGER_TX_OPTIONS);
  audit({ event: 'wallet.withdrawal_rejected', userId: actor.id, resource: 'WithdrawalRequest', resourceId: request.id, meta: { advisorId: request.userId, coins: request.coins, reason } });
  void notify({
    userId: request.userId,
    topic: 'wallet',
    type: 'withdrawal_rejected',
    title: 'Withdrawal not completed',
    message: `Your withdrawal of ${describeMoney(request.amountMinor)} was not completed and ${describeCoins(request.coins)} are back in your wallet. Reason: ${reason}`,
    deepLink: '/wallet',
    email: true,
    priority: 'high',
    dedupKey: `withdrawal_rejected:${request.id}`,
    metadata: { withdrawalId: request.id },
  });
  return request;
};
