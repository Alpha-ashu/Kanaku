/**
 * Group expense split + settlement math.
 *
 * Everything runs in integer paise, so a ₹5,000 bill split three ways saves as
 * 1666.67 + 1666.67 + 1666.66. The old `total / n` per member stored floats that
 * the backend's Decimal(12,2) rounded independently, so shares could add up to
 * ₹5,000.01 and the "to collect" figure never quite reached zero.
 *
 * Two values per member are deliberately separate:
 *   share — what the member consumed / owes towards the bill
 *   paid  — what the member actually put towards the bill at the counter
 * balance = paid − share. Positive → receives money, negative → pays money.
 */

export type SplitType = 'equal' | 'custom' | 'percentage' | 'shares';

export const SPLIT_TYPES: SplitType[] = ['equal', 'custom', 'percentage', 'shares'];

export const SPLIT_TYPE_LABELS: Record<SplitType, string> = {
  equal: 'Equal Split',
  custom: 'Custom Split',
  percentage: 'Percentage Split',
  shares: 'Shares Split',
};

export const normalizeSplitType = (value: unknown): SplitType =>
  SPLIT_TYPES.includes(value as SplitType) ? (value as SplitType) : 'equal';

// toFixed(4) first: 1.005 * 100 is 100.49999999999999 in floating point.
export const toPaise = (amount: number): number => {
  const n = Number(amount);
  return Number.isFinite(n) ? Math.round(Number((n * 100).toFixed(4))) : 0;
};

export const fromPaise = (paise: number): number => paise / 100;

/** Splits `totalPaise` into `count` parts that differ by at most one paisa. */
export const distributeEvenly = (totalPaise: number, count: number): number[] => {
  if (count <= 0) return [];
  const base = Math.floor(totalPaise / count);
  const extra = totalPaise - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < extra ? 1 : 0));
};

/** Largest-remainder apportionment: parts are proportional to `weights` and sum to `totalPaise`. */
export const distributeByWeights = (totalPaise: number, weights: number[]): number[] => {
  const weightSum = weights.reduce((sum, w) => sum + w, 0);
  if (weightSum <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (totalPaise * w) / weightSum);
  const parts = exact.map(Math.floor);
  const leftover = totalPaise - parts.reduce((sum, p) => sum + p, 0);
  const order = exact
    .map((value, index) => ({ index, fraction: value - parts[index] }))
    .filter(({ index }) => weights[index] > 0)
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let k = 0; k < leftover && order.length > 0; k += 1) {
    parts[order[k % order.length].index] += 1;
  }
  return parts;
};

export type AllocationStatus = 'balanced' | 'under' | 'over' | 'invalid';

export interface SplitMemberInput {
  key: string;
  /** Takes part in this expense's split. Excluded members get a 0 share. */
  included: boolean;
  /**
   * custom → amount, percentage → percent, shares → share units.
   * `null` means "auto": in custom/percentage mode the member splits whatever is
   * left equally with the other auto members; in shares mode it counts as 1 share.
   */
  value: number | null;
}

export interface SplitComputation {
  /** Rupee share per member key (2 decimals, sums to the total when balanced). */
  shares: Record<string, number>;
  total: number;
  allocated: number;
  /** total − allocated; negative when over-allocated. */
  remaining: number;
  status: AllocationStatus;
  /** Why the split cannot be computed, when status is 'invalid'. */
  issue?: string;
  /** Percentage mode: percent assigned so far (auto members included). */
  percentAllocated?: number;
  /** Members whose share was filled in automatically. */
  autoKeys: string[];
}

const statusFor = (remainingPaise: number): AllocationStatus =>
  remainingPaise === 0 ? 'balanced' : remainingPaise > 0 ? 'under' : 'over';

const isValidInput = (value: number | null): boolean =>
  value === null || (Number.isFinite(value) && value >= 0);

export function computeSplit(total: number, splitType: SplitType, members: SplitMemberInput[]): SplitComputation {
  const totalPaise = toPaise(total);
  const paise: Record<string, number> = {};
  members.forEach((m) => { paise[m.key] = 0; });

  const finish = (allocatedPaise: number, status: AllocationStatus, extra: Partial<SplitComputation> = {}): SplitComputation => ({
    shares: Object.fromEntries(Object.entries(paise).map(([key, p]) => [key, fromPaise(p)])),
    total: fromPaise(totalPaise),
    allocated: fromPaise(allocatedPaise),
    remaining: fromPaise(totalPaise - allocatedPaise),
    status,
    autoKeys: [],
    ...extra,
  });

  const included = members.filter((m) => m.included);
  if (totalPaise <= 0) return finish(0, 'invalid', { issue: 'Enter the expense amount first' });
  if (included.length === 0) return finish(0, 'invalid', { issue: 'Select at least one person in the split' });
  if (splitType !== 'equal' && !included.every((m) => isValidInput(m.value))) {
    return finish(0, 'invalid', { issue: 'Split values cannot be negative' });
  }

  switch (splitType) {
    case 'equal': {
      distributeEvenly(totalPaise, included.length).forEach((p, i) => { paise[included[i].key] = p; });
      return finish(totalPaise, 'balanced');
    }

    case 'custom': {
      const fixed = included.filter((m) => m.value !== null);
      const auto = included.filter((m) => m.value === null);
      let fixedPaise = 0;
      for (const m of fixed) {
        paise[m.key] = toPaise(m.value as number);
        fixedPaise += paise[m.key];
      }
      const autoKeys = auto.map((m) => m.key);
      if (auto.length === 0) return finish(fixedPaise, statusFor(totalPaise - fixedPaise));
      const rest = totalPaise - fixedPaise;
      if (rest < 0) return finish(fixedPaise, 'over', { autoKeys });
      distributeEvenly(rest, auto.length).forEach((p, i) => { paise[auto[i].key] = p; });
      return finish(totalPaise, 'balanced', { autoKeys });
    }

    case 'percentage': {
      // Basis points (0.01 %) keep the percent arithmetic exact too.
      const fixed = included.filter((m) => m.value !== null);
      const auto = included.filter((m) => m.value === null);
      const fixedBp = fixed.map((m) => Math.round((m.value as number) * 100));
      const fixedBpSum = fixedBp.reduce((sum, bp) => sum + bp, 0);
      const autoKeys = auto.map((m) => m.key);
      const restBp = 10000 - fixedBpSum;

      if (auto.length > 0 && restBp >= 0) {
        // The auto members' combined slice is apportioned alongside the fixed
        // ones, then spread evenly between them — so the total stays exact.
        const parts = distributeByWeights(totalPaise, [...fixedBp, restBp]);
        fixed.forEach((m, i) => { paise[m.key] = parts[i]; });
        distributeEvenly(parts[parts.length - 1], auto.length).forEach((p, i) => { paise[auto[i].key] = p; });
        return finish(totalPaise, 'balanced', { autoKeys, percentAllocated: 100 });
      }

      if (fixedBpSum === 10000) {
        distributeByWeights(totalPaise, fixedBp).forEach((p, i) => { paise[fixed[i].key] = p; });
        return finish(totalPaise, 'balanced', { autoKeys, percentAllocated: 100 });
      }

      let allocatedPaise = 0;
      fixed.forEach((m, i) => {
        paise[m.key] = Math.round((totalPaise * fixedBp[i]) / 10000);
        allocatedPaise += paise[m.key];
      });
      const status: AllocationStatus = fixedBpSum > 10000 ? 'over' : 'under';
      return finish(allocatedPaise, status, { autoKeys, percentAllocated: fixedBpSum / 100 });
    }

    case 'shares': {
      // Hundredths of a share, so "1.5 shares" works.
      const units = included.map((m) => Math.round((m.value === null ? 1 : m.value) * 100));
      if (units.every((u) => u === 0)) {
        return finish(0, 'invalid', { issue: 'Give at least one person a share' });
      }
      distributeByWeights(totalPaise, units).forEach((p, i) => { paise[included[i].key] = p; });
      return finish(totalPaise, 'balanced', { autoKeys: included.filter((m) => m.value === null).map((m) => m.key) });
    }

    default:
      return finish(0, 'invalid', { issue: 'Unknown split method' });
  }
}

export interface PaymentComputation {
  total: number;
  allocated: number;
  remaining: number;
  status: AllocationStatus;
}

/** Checks that what everyone paid at the counter adds up to the bill. */
export function computePaymentAllocation(total: number, paidAmounts: number[]): PaymentComputation {
  const totalPaise = toPaise(total);
  if (totalPaise <= 0) return { total: 0, allocated: 0, remaining: 0, status: 'invalid' };
  if (paidAmounts.some((p) => !Number.isFinite(p) || p < 0)) {
    return { total: fromPaise(totalPaise), allocated: 0, remaining: fromPaise(totalPaise), status: 'invalid' };
  }
  const allocatedPaise = paidAmounts.reduce((sum, p) => sum + toPaise(p), 0);
  return {
    total: fromPaise(totalPaise),
    allocated: fromPaise(allocatedPaise),
    remaining: fromPaise(totalPaise - allocatedPaise),
    status: statusFor(totalPaise - allocatedPaise),
  };
}

export interface SettlementMemberInput {
  key: string;
  share: number;
  paid: number;
  /** The member has cleared what they owed. Ignored for members who owe nothing. */
  settled: boolean;
}

export interface MemberBalance {
  key: string;
  share: number;
  paid: number;
  /** paid − share. */
  balance: number;
  owes: number;
  receives: number;
  settled: boolean;
  /** Still to pay (debtor) or still to receive (creditor), after settlements. */
  outstanding: number;
}

export interface SettlementTransfer {
  from: string;
  to: string;
  amount: number;
  settled: boolean;
}

export interface SettlementSummary {
  balances: MemberBalance[];
  transfers: SettlementTransfer[];
  /** Every member who owed something has settled. */
  isSettled: boolean;
}

/**
 * Who pays whom. Greedy largest-debtor → largest-creditor matching, which for
 * the usual single-payer bill is simply "everyone pays the payer their share".
 * A transfer counts as done once its debtor is marked settled.
 */
export function computeSettlement(members: SettlementMemberInput[]): SettlementSummary {
  const rows = members.map((m, index) => {
    const sharePaise = toPaise(m.share);
    const paidPaise = toPaise(m.paid);
    return { ...m, index, sharePaise, paidPaise, balancePaise: paidPaise - sharePaise };
  });

  const byLargest = (a: { left: number; index: number }, b: { left: number; index: number }) =>
    b.left - a.left || a.index - b.index;
  const creditors = rows.filter((r) => r.balancePaise > 0).map((r) => ({ key: r.key, index: r.index, left: r.balancePaise })).sort(byLargest);
  const debtors = rows.filter((r) => r.balancePaise < 0).map((r) => ({ key: r.key, index: r.index, left: -r.balancePaise, settled: r.settled })).sort(byLargest);

  const transfers: SettlementTransfer[] = [];
  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const amount = Math.min(creditors[ci].left, debtors[di].left);
    transfers.push({ from: debtors[di].key, to: creditors[ci].key, amount: fromPaise(amount), settled: debtors[di].settled });
    creditors[ci].left -= amount;
    debtors[di].left -= amount;
    if (creditors[ci].left === 0) ci += 1;
    if (debtors[di].left === 0) di += 1;
  }

  const balances: MemberBalance[] = rows.map((r) => {
    const owesPaise = Math.max(0, -r.balancePaise);
    const receivesPaise = Math.max(0, r.balancePaise);
    let outstandingPaise = 0;
    if (owesPaise > 0) {
      outstandingPaise = r.settled ? 0 : owesPaise;
    } else if (receivesPaise > 0) {
      outstandingPaise = transfers
        .filter((t) => t.to === r.key && !t.settled)
        .reduce((sum, t) => sum + toPaise(t.amount), 0);
    }
    return {
      key: r.key,
      share: fromPaise(r.sharePaise),
      paid: fromPaise(r.paidPaise),
      balance: fromPaise(r.balancePaise),
      owes: fromPaise(owesPaise),
      receives: fromPaise(receivesPaise),
      settled: owesPaise === 0 ? true : r.settled,
      outstanding: fromPaise(outstandingPaise),
    };
  });

  return {
    balances,
    transfers,
    isSettled: rows.every((r) => r.balancePaise >= 0 || r.settled),
  };
}

// ── Stored group expenses ────────────────────────────────────────────────────

export interface StoredGroupMember {
  name: string;
  share: number;
  paid?: boolean;
  paymentStatus?: string;
  isCurrentUser?: boolean;
  /** Amount this member paid towards the bill. Absent on pre-allocation records. */
  contribution?: number | null;
  splitValue?: number | null;
}

export interface StoredGroupExpense {
  totalAmount: number;
  members: StoredGroupMember[];
  splitType?: string;
}

/**
 * Settlement inputs for a saved group expense. Records written before
 * member-level payments existed carry no `contribution`; for those the creator
 * (always the first member, locally and in API responses) paid the whole bill,
 * which is what every older screen assumed.
 */
export function toSettlementInputs(expense: StoredGroupExpense): SettlementMemberInput[] {
  const members = Array.isArray(expense.members) ? expense.members : [];
  const hasPayments = members.some((m) => typeof m.contribution === 'number');
  return members.map((m, index) => ({
    key: String(index),
    share: Number(m.share) || 0,
    paid: hasPayments ? Number(m.contribution) || 0 : index === 0 ? Number(expense.totalAmount) || 0 : 0,
    settled: Boolean(m.paid || m.paymentStatus === 'paid'),
  }));
}

export function getGroupExpenseSettlement(expense: StoredGroupExpense): SettlementSummary {
  return computeSettlement(toSettlementInputs(expense));
}

/**
 * Settled flag to store for a member after an edit: someone who owes nothing is
 * trivially settled; someone who had settled keeps that only if what they owe is
 * unchanged — a changed amount reopens the balance rather than hiding it.
 */
export function resolveSettledAfterEdit(owes: number, previous?: { owes: number; settled: boolean }): boolean {
  if (toPaise(owes) === 0) return true;
  if (!previous) return false;
  return previous.settled && toPaise(previous.owes) === toPaise(owes) && toPaise(previous.owes) > 0;
}

// ── Editor drafts ────────────────────────────────────────────────────────────

/** Key of the current user's row in a split draft. */
export const SELF_SPLIT_KEY = 'self';

export interface SplitDraftRow {
  key: string;
  name: string;
  isCurrentUser?: boolean;
  included: boolean;
  /** Raw split input as typed; '' = auto. */
  valueInput: string;
  /** Raw "paid at the counter" input, used when several people paid. */
  paidInput: string;
}

export type PayerSelection = { mode: 'single'; key: string } | { mode: 'multiple' };

export interface SplitDraftEvaluation {
  split: SplitComputation;
  payment: PaymentComputation;
  /** What each row paid towards the bill. */
  contributions: Record<string, number>;
  /** Parsed split input per row (null = auto / not applicable). */
  splitValues: Record<string, number | null>;
  settlement: SettlementSummary;
  /** Split and payments both reconcile — safe to save. */
  isValid: boolean;
}

/** '' → null, otherwise the number (NaN when unparseable, which fails validation). */
export const parseDecimalInput = (raw: string): number | null => {
  const trimmed = (raw ?? '').trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : Number.NaN;
};

/** Keeps digits and one decimal point, capped at `decimals` places. */
export const sanitizeDecimalInput = (raw: string, decimals = 2): string => {
  const cleaned = raw.replace(/[^\d.]/g, '');
  const [whole, ...rest] = cleaned.split('.');
  if (rest.length === 0) return whole;
  return `${whole}.${rest.join('').slice(0, decimals)}`;
};

export function evaluateSplitDraft(
  total: number,
  splitType: SplitType,
  rows: SplitDraftRow[],
  payer: PayerSelection,
): SplitDraftEvaluation {
  const splitValues: Record<string, number | null> = {};
  for (const row of rows) {
    splitValues[row.key] = splitType === 'equal' ? null : parseDecimalInput(row.valueInput);
  }
  const split = computeSplit(
    total,
    splitType,
    rows.map((row) => ({ key: row.key, included: row.included, value: splitValues[row.key] })),
  );

  const contributions: Record<string, number> = {};
  const singlePayerKey = payer.mode === 'single' && rows.some((r) => r.key === payer.key)
    ? payer.key
    : SELF_SPLIT_KEY;
  for (const row of rows) {
    if (payer.mode === 'multiple') {
      const paid = parseDecimalInput(row.paidInput);
      contributions[row.key] = paid === null ? 0 : paid;
    } else {
      contributions[row.key] = row.key === singlePayerKey ? fromPaise(toPaise(total)) : 0;
    }
  }
  const payment = computePaymentAllocation(total, rows.map((row) => contributions[row.key]));

  const settlement = computeSettlement(rows.map((row) => ({
    key: row.key,
    share: split.shares[row.key] ?? 0,
    paid: Number.isFinite(contributions[row.key]) ? contributions[row.key] : 0,
    settled: false,
  })));

  return {
    split,
    payment,
    contributions,
    splitValues,
    settlement,
    isValid: split.status === 'balanced' && payment.status === 'balanced',
  };
}

/** The first thing stopping a draft from being saved, phrased for a toast. */
export function describeSplitProblem(
  evaluation: SplitDraftEvaluation,
  splitType: SplitType,
  formatAmount: (amount: number) => string,
): string | null {
  const { split, payment } = evaluation;
  if (split.status === 'invalid') return split.issue ?? 'Check the split amounts';
  if (split.status === 'under') {
    return splitType === 'percentage'
      ? `Percentages add up to ${split.percentAllocated ?? 0}% — they need to total 100%`
      : `${formatAmount(split.remaining)} remaining to allocate`;
  }
  if (split.status === 'over') {
    return splitType === 'percentage'
      ? `Percentages add up to ${split.percentAllocated ?? 0}% — they need to total 100%`
      : `${formatAmount(-split.remaining)} over the expense amount`;
  }
  if (payment.status === 'invalid') return 'Paid amounts cannot be negative';
  if (payment.status === 'under') return `Paid amounts are ${formatAmount(payment.remaining)} short of the bill`;
  if (payment.status === 'over') return `Paid amounts are ${formatAmount(-payment.remaining)} more than the bill`;
  return null;
}
