/**
 * The single path for recording a loan / EMI repayment.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * `PayEMI` and the Loans payment modal each did their own thing, and neither
 * told the server. Both wrote a `loanPayments` row to Dexie, reduced
 * `loan.outstandingBalance` locally, and adjusted the account — so a repayment
 * existed only on the device that recorded it, vanished on logout, and never
 * appeared on a second device. `POST /loans/:id/payment` has existed the whole
 * time and was never called.
 *
 * ── Why the obvious fix is wrong ────────────────────────────────────────────
 *
 * Adding a POST beside the existing local writes would have paid twice. The
 * endpoint computes `outstandingBalance = current − amount` from ITS row, while
 * the client was computing the same subtraction and pushing the result through
 * the ordinary loan sync (`loans` is a synced table, so `db.loans.update`
 * queues an upload). Whichever landed second would subtract again. The account
 * side has the opposite hazard: the endpoint creates no cash transaction unless
 * Ledger V2 is enabled — and it is not — so the repayment row in Dexie is the
 * only record of the money leaving, and removing the local write would make the
 * debit disappear entirely.
 *
 * ── The rule ────────────────────────────────────────────────────────────────
 *
 *   The SERVER owns the loan's outstanding balance.
 *   The repayment ROW owns the account's cash movement.
 *
 * So the local loan write is deliberately made under `runWithCloudSyncSuppressed`
 * — it is an optimistic display value, never pushed — and the server's figure
 * replaces it as soon as the POST returns. The account needs no explicit write
 * at all: `computeAccountDeltas` already derives the debit from the repayment
 * row, which is why the old `applyAccountBalanceDeltas` call was redundant.
 *
 * ── One action, one debit ───────────────────────────────────────────────────
 *
 * Four layers, matching the rest of the app's duplicate-prevention contract:
 *   1. the caller's submit lock (a double-tap never reaches this function);
 *   2. `clientRequestId`, minted ONCE here and persisted on the local row, so
 *      every retry — including an offline row pushed days later — carries the
 *      same key;
 *   3. the same value as the `Idempotency-Key` header;
 *   4. the server's own replay check against `LoanPayment.clientRequestId`,
 *      plus `duplicateSubmitGuard` on the route.
 */
import { db, type Account, type Loan } from '@/lib/database';
import { apiClient } from '@/lib/api';
import {
  refreshTablesForActiveUser,
  runWithCloudSyncSuppressed,
} from '@/lib/auth-sync-integration';
import { getLoanStatusFromDueDate } from '@/lib/loanStatus';

export interface LoanRepaymentInput {
  loan: Loan;
  account: Account;
  amount: number;
  notes?: string;
  documentId?: number;
  /** Defaults to now. PayEMI lets the user back-date a repayment. */
  date?: Date;
}

export interface LoanRepaymentResult {
  /** Dexie id of the recorded repayment. */
  localId: number;
  /** Server id, when the push succeeded. */
  cloudId?: string;
  /** True when the repayment is recorded locally but not yet on the server. */
  pending: boolean;
}

const newClientRequestId = (): string => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // Non-secure context / old WebView.
  }
  return `emi_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
};

const extractPaymentId = (payload: unknown): string | undefined => {
  const body = payload as { id?: string; data?: { id?: string } } | null;
  const id = body?.data?.id ?? body?.id;
  return id ? String(id) : undefined;
};

/**
 * Record a repayment. Throws a user-readable message when the input cannot be
 * saved; a failed PUSH is not an error — the row is kept and retried.
 */
export async function recordLoanRepayment({
  loan,
  account,
  amount,
  notes,
  documentId,
  date,
}: LoanRepaymentInput): Promise<LoanRepaymentResult> {
  if (!loan.id) throw new Error('Loan not found');
  if (!account.id) throw new Error('Select an account for this payment');
  if (!(amount > 0)) throw new Error('Enter a valid payment amount');
  if (amount > Number(loan.outstandingBalance)) {
    throw new Error('Payment cannot exceed the outstanding balance');
  }

  const clientRequestId = newClientRequestId();
  const trimmedNotes = notes?.trim() || undefined;

  // 1. Local first — the app is offline-first, and this row IS the account debit.
  const localId = (await db.loanPayments.add({
    loanId: loan.id,
    clientRequestId,
    amount,
    accountId: account.id,
    date: date ?? new Date(),
    notes: trimmedNotes,
    documentId,
  })) as number;

  // 2. Optimistic loan balance, SUPPRESSED so it is never pushed. The server
  //    does this subtraction itself; sending ours too would apply it twice.
  const optimisticOutstanding = Math.max(0, Number(loan.outstandingBalance) - amount);
  await runWithCloudSyncSuppressed(async () => {
    await db.loans.update(loan.id!, {
      outstandingBalance: optimisticOutstanding,
      status: optimisticOutstanding <= 0
        ? 'completed'
        : getLoanStatusFromDueDate(loan.dueDate, optimisticOutstanding),
      updatedAt: new Date(),
    });
  });

  // 3. Push. A failure here is recoverable: the row keeps its key and
  //    `pushPendingLoanRepayments()` retries it under the same one.
  const canPush = Boolean(loan.cloudId && account.cloudId) && navigator.onLine !== false;
  if (!canPush) {
    return { localId, pending: true };
  }

  try {
    const response = await apiClient.post(
      `/loans/${loan.cloudId}/payment`,
      {
        amount,
        accountId: account.cloudId,
        notes: trimmedNotes,
        clientRequestId,
      },
      { showErrorToast: false, idempotencyKey: clientRequestId },
    );

    const cloudId = extractPaymentId(response.data);
    if (cloudId) {
      await db.loanPayments.update(localId, { cloudId });
    }

    // 4. Take the server's outstanding balance. Pulling `loans` also runs
    //    `mergeLoanPaymentsFromBackend`, so the repayment history on this device
    //    converges with the server's in the same round trip.
    await refreshTablesForActiveUser(['loans']).catch(() => undefined);

    return { localId, cloudId, pending: false };
  } catch (error) {
    console.warn('[loanRepayment] Push failed — kept locally for retry', error);
    return { localId, pending: true };
  }
}

/**
 * Push repayments recorded while the server was unreachable.
 *
 * Each retries under the key stored on its own row, so a payment that did in
 * fact reach the server (a response lost in transit, say) is recognised as a
 * replay and returns the original row rather than paying again.
 */
export async function pushPendingLoanRepayments(): Promise<number> {
  if (navigator.onLine === false) return 0;

  const pending = await db.loanPayments
    .filter((p) => !p.cloudId && Boolean(p.clientRequestId))
    .toArray();
  if (pending.length === 0) return 0;

  const [loans, accounts] = await Promise.all([db.loans.toArray(), db.accounts.toArray()]);
  const loanById = new Map(loans.filter((l) => l.id).map((l) => [l.id as number, l]));
  const accountById = new Map(accounts.filter((a) => a.id).map((a) => [a.id as number, a]));

  let pushed = 0;
  for (const payment of pending) {
    const loan = loanById.get(payment.loanId);
    const account = accountById.get(payment.accountId);
    // Not yet pushable: the parent loan or the account has no server identity,
    // so there is nothing to attach the repayment to. Try again next time.
    if (!loan?.cloudId || !account?.cloudId || !payment.id) continue;

    try {
      const response = await apiClient.post(
        `/loans/${loan.cloudId}/payment`,
        {
          amount: payment.amount,
          accountId: account.cloudId,
          notes: payment.notes,
          clientRequestId: payment.clientRequestId,
        },
        { showErrorToast: false, idempotencyKey: payment.clientRequestId },
      );
      const cloudId = extractPaymentId(response.data);
      if (cloudId) {
        await db.loanPayments.update(payment.id, { cloudId });
        pushed += 1;
      }
    } catch (error) {
      console.warn('[loanRepayment] Retry failed; will try again later', error);
    }
  }

  if (pushed > 0) {
    await refreshTablesForActiveUser(['loans']).catch(() => undefined);
  }
  return pushed;
}
