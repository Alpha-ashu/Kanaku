/**
 * Financial Invariant Validator — Phase 10 Production Hardening.
 *
 * A single, authoritative validator that enforces every financial rule the
 * ledger must never break. All methods are static and throw a typed
 * `LedgerError` with a machine-readable `code` so callers always receive a
 * consistent error shape and callers that already catch `LedgerError` need
 * no changes.
 *
 * Design principles:
 *  - One place to read all the rules — no hunting across services.
 *  - Every new ledger code path MUST call the relevant assertions here.
 *  - Methods are composable — callers may call multiple assertions in sequence.
 *  - Each assertion is individually unit-testable without a real DB.
 *
 * Usage (inside a Prisma $transaction):
 *   await FinancialInvariantValidator.assertAccountOwned(tx, accountId, userId);
 *   FinancialInvariantValidator.assertPositiveAmount(amount);
 *   FinancialInvariantValidator.assertJournalBalances(legs);
 */
import { Decimal } from '@prisma/client/runtime/library';
import { LedgerError } from '../features/transactions/ledger.service';
import type { PrismaTx } from '../features/transactions/dispatcher';
import type { LedgerLeg } from '../features/transactions/ledger.service';
import { journalBalanceErrorsTotal, ledgerPostFailedTotal } from '../config/metrics';

export class FinancialInvariantValidator {
  // ── 1. Amount rules ──────────────────────────────────────────────────────

  /**
   * Amount must be a positive, non-zero, finite number.
   * Rejects NaN, Infinity, 0, and negative values.
   */
  static assertPositiveAmount(amount: number | Decimal, context = 'amount'): void {
    const n = amount instanceof Decimal ? amount.toNumber() : amount;
    if (!Number.isFinite(n) || n <= 0) {
      ledgerPostFailedTotal.labels({ reason: 'LEDGER_INVALID_AMOUNT' }).inc();
      throw new LedgerError(
        'LEDGER_INVALID_AMOUNT',
        `${context} must be a positive non-zero finite number. Received: ${n}`
      );
    }
  }

  // ── 2. Double-entry balance ───────────────────────────────────────────────

  /**
   * For journals with more than one leg (double-entry), total inflows must
   * equal total outflows to the cent.
   * Single-leg journals (standard income/expense) are allowed.
   */
  static assertJournalBalances(legs: LedgerLeg[]): void {
    if (legs.length === 0) {
      ledgerPostFailedTotal.labels({ reason: 'LEDGER_IMBALANCED' }).inc();
      throw new LedgerError('LEDGER_IMBALANCED', 'Journal must have at least one transaction leg.');
    }

    if (legs.length === 1) return; // single-leg journals always balance

    let debitSum = new Decimal(0);
    let creditSum = new Decimal(0);
    for (const leg of legs) {
      const amt = new Decimal(leg.amount);
      const t = leg.type.toLowerCase();
      if (t === 'income' || t === 'transfer_in') {
        debitSum = debitSum.add(amt);
      } else {
        creditSum = creditSum.add(amt);
      }
    }

    if (!debitSum.equals(creditSum)) {
      journalBalanceErrorsTotal.inc();
      ledgerPostFailedTotal.labels({ reason: 'LEDGER_IMBALANCED' }).inc();
      throw new LedgerError(
        'LEDGER_IMBALANCED',
        `Double-entry journal must balance. Inflows (${debitSum.toFixed(2)}) ≠ Outflows (${creditSum.toFixed(2)}).`
      );
    }
  }

  // ── 3. Transfer-specific rules ────────────────────────────────────────────

  /**
   * Transfer journals must have exactly two legs — one TRANSFER_OUT and one
   * TRANSFER_IN — and they must reference different accounts.
   */
  static assertValidTransfer(legs: LedgerLeg[]): void {
    if (legs.length !== 2) {
      throw new LedgerError('LEDGER_INVALID_TRANSFER', 'A transfer must have exactly two transaction legs.');
    }
    const leg1 = legs[0];
    const leg2 = legs[1];
    const t1 = leg1.type.toUpperCase();
    const t2 = leg2.type.toUpperCase();

    if (!((t1 === 'TRANSFER_OUT' && t2 === 'TRANSFER_IN') || (t1 === 'TRANSFER_IN' && t2 === 'TRANSFER_OUT'))) {
      throw new LedgerError(
        'LEDGER_INVALID_TRANSFER',
        'A transfer must consist of exactly one TRANSFER_OUT leg and one TRANSFER_IN leg.'
      );
    }

    if (leg1.accountId === leg2.accountId) {
      throw new LedgerError(
        'LEDGER_INVALID_TRANSFER',
        'Source and destination accounts for a transfer must be different.'
      );
    }
  }

  // ── 4. Account ownership & existence ─────────────────────────────────────

  /**
   * Account must exist, belong to `userId`, and not be soft-deleted.
   * This is the canonical cross-user reference check — it prevents user A
   * from transacting against user B's account.
   */
  static async assertAccountOwned(
    tx: PrismaTx,
    accountId: string,
    userId: string
  ): Promise<{ id: string; balance: Decimal; deletedAt: Date | null; [key: string]: unknown }> {
    const account = await tx.account.findFirst({
      where: { id: accountId, userId, deletedAt: null }
    });
    if (!account) {
      ledgerPostFailedTotal.labels({ reason: 'LEDGER_ACCOUNT_NOT_FOUND' }).inc();
      throw new LedgerError(
        'LEDGER_ACCOUNT_NOT_FOUND',
        `Account ${accountId} not found or does not belong to user ${userId}.`
      );
    }
    return account as any;
  }

  /**
   * Account must not be soft-deleted. Used for mid-transaction re-checks where
   * the account was already loaded but could have been deleted between reads.
   */
  static assertAccountNotDeleted(
    account: { id: string; deletedAt: Date | null } | null,
    accountId: string
  ): void {
    if (!account || account.deletedAt !== null) {
      ledgerPostFailedTotal.labels({ reason: 'LEDGER_ACCOUNT_NOT_FOUND' }).inc();
      throw new LedgerError(
        'LEDGER_ACCOUNT_NOT_FOUND',
        `Account ${accountId} was deleted and cannot receive transactions.`
      );
    }
  }

  // ── 5. Idempotency ────────────────────────────────────────────────────────

  /**
   * Returns the existing JournalEntry if an idempotency key has already been
   * processed, or null if this is a fresh operation.
   * Callers should return the existing journal immediately on non-null.
   */
  static async checkIdempotencyKey(
    tx: PrismaTx,
    userId: string,
    sourceModule: string,
    idempotencyKey: string
  ): Promise<{ journalEntry: any } | null> {
    const existingTx = await tx.transaction.findFirst({
      where: { userId, sourceModule: sourceModule as any, idempotencyKey },
      include: { journalEntry: true }
    });
    return existingTx?.journalEntry ? existingTx as any : null;
  }

  // ── 6. Cross-user reference guard ─────────────────────────────────────────

  /**
   * Asserts that `resourceUserId` matches `requestingUserId`. Prevents user A
   * from modifying resources owned by user B.
   */
  static assertSameUser(
    resourceUserId: string,
    requestingUserId: string,
    resourceType = 'resource'
  ): void {
    if (resourceUserId !== requestingUserId) {
      throw new LedgerError(
        'LEDGER_CROSS_USER_REFERENCE',
        `Cross-user reference rejected: ${resourceType} belongs to a different user.`
      );
    }
  }

  // ── 7. Balance floor (negative balance) ───────────────────────────────────

  /**
   * Enforces a minimum balance floor after a debit.
   * `floor` defaults to -Infinity (no restriction). Pass 0 to reject negative balances.
   */
  static assertBalanceFloor(
    currentBalance: Decimal,
    debitAmount: Decimal,
    floor: number = -Infinity,
    accountId = 'unknown'
  ): void {
    const resultingBalance = currentBalance.minus(debitAmount);
    if (resultingBalance.lessThan(floor)) {
      throw new LedgerError(
        'LEDGER_INSUFFICIENT_FUNDS',
        `Transaction would cause account ${accountId} to fall below the minimum balance floor of ${floor}. ` +
        `Current: ${currentBalance.toFixed(2)}, Debit: ${debitAmount.toFixed(2)}, Result: ${resultingBalance.toFixed(2)}.`
      );
    }
  }

  // ── 8. Settlement-specific rules ─────────────────────────────────────────

  /**
   * Settlement amount must not exceed the pending amount.
   */
  static assertSettlementAmount(
    settledAmount: Decimal,
    pendingAmount: Decimal,
    transactionId: string
  ): void {
    if (settledAmount.lessThanOrEqualTo(0)) {
      throw new LedgerError('LEDGER_INVALID_AMOUNT', 'Settlement amount must be positive.');
    }
    if (settledAmount.greaterThan(pendingAmount)) {
      throw new LedgerError(
        'LEDGER_INVALID_AMOUNT',
        `Settlement amount (${settledAmount.toFixed(2)}) cannot exceed pending amount (${pendingAmount.toFixed(2)}) for transaction ${transactionId}.`
      );
    }
  }

  // ── 9. Comprehensive pre-post validation ──────────────────────────────────

  /**
   * Convenience method that runs the full set of pre-post validations on all
   * legs of a journal in one call. Called by `postJournalEntry` before any
   * DB writes.
   *
   * Returns a map of accountId → loaded account row for callers to reuse.
   */
  static async validateJournalLegs(
    tx: PrismaTx,
    journal: { userId: string; referenceType: string },
    legs: LedgerLeg[]
  ): Promise<Map<string, any>> {
    const { LedgerReferenceType } = await import('../db/prisma-client');
    // Rule 1: at least one leg
    this.assertJournalBalances(legs);

    // Rule 2: transfer shape
    if (journal.referenceType === LedgerReferenceType.TRANSFER) {
      this.assertValidTransfer(legs);
    }

    const accounts = new Map<string, any>();

    for (const leg of legs) {
      // Rule 3: positive amounts
      this.assertPositiveAmount(leg.amount, `leg amount for account ${leg.accountId}`);

      // Rule 4: account ownership (includes not-deleted check)
      const account = await this.assertAccountOwned(tx, leg.accountId, journal.userId);
      accounts.set(leg.accountId, account);
    }

    return accounts;
  }
}
