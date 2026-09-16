/**
 * Server-side checks for a group expense's member-level allocation.
 *
 * The client (frontend/src/lib/groupSplit.ts) computes every share in paise; the
 * server only confirms the numbers reconcile, so a stale client or a hand-rolled
 * API call cannot store a bill whose shares or payments don't add up to it.
 *
 * Only "allocation-aware" payloads are checked — ones that say who paid what
 * (`yourPaidAmount` or a member `contribution`). Older clients, KAI and the
 * importers still post plain equal splits without those fields; rejecting them
 * would make the sync queue drop the record as a permanent 400.
 */

export const GROUP_SPLIT_TYPES = ['equal', 'custom', 'percentage', 'shares'] as const;
export type GroupSplitType = (typeof GROUP_SPLIT_TYPES)[number];

type MemberLike = {
  name?: string;
  share?: number;
  contribution?: number | null;
  isCurrentUser?: boolean;
};

export interface AllocationPayload {
  totalAmount: number;
  yourShare?: number | null;
  yourPaidAmount?: number | null;
  members: Array<MemberLike | string>;
}

const toPaise = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(Number((n * 100).toFixed(4))) : 0;
};

const formatRupees = (paise: number) => `₹${(paise / 100).toFixed(2)}`;

/** The creator's own entry in a members array ("You" / isCurrentUser). */
export const isCreatorEntry = (m: MemberLike | string): boolean =>
  typeof m === 'object' && m !== null && (Boolean(m.isCurrentUser) || (m.name ?? '').trim().toLowerCase() === 'you');

export const isAllocationAware = (body: { yourPaidAmount?: unknown; members?: unknown }): boolean =>
  body.yourPaidAmount !== undefined && body.yourPaidAmount !== null
    ? true
    : Array.isArray(body.members) &&
      body.members.some((m) => typeof m === 'object' && m !== null && (m as MemberLike).contribution != null);

/** Amount a member still owes towards the bill: share − what they paid, never negative. */
export const owedAmount = (share: unknown, contributed: unknown): number =>
  Math.max(0, toPaise(share) - toPaise(contributed)) / 100;

/**
 * Returns a user-facing reason when the allocation does not reconcile, or null.
 * The creator's share/payment come from the top-level fields when present,
 * otherwise from their own entry in `members`.
 */
export function findAllocationError(payload: AllocationPayload): string | null {
  const totalPaise = toPaise(payload.totalAmount);
  if (totalPaise <= 0) return 'The expense amount must be greater than zero';

  const creator = payload.members.find(isCreatorEntry) as MemberLike | undefined;
  const participants = payload.members.filter((m): m is MemberLike => typeof m === 'object' && m !== null && !isCreatorEntry(m));

  const creatorShare = payload.yourShare ?? creator?.share ?? 0;
  const creatorPaid = payload.yourPaidAmount ?? creator?.contribution ?? 0;

  const amounts = [creatorShare, creatorPaid, ...participants.flatMap((m) => [m.share ?? 0, m.contribution ?? 0])];
  if (amounts.some((a) => !Number.isFinite(Number(a)) || Number(a) < 0)) {
    return 'Shares and payments cannot be negative';
  }

  const shareSum = toPaise(creatorShare) + participants.reduce((sum, m) => sum + toPaise(m.share ?? 0), 0);
  if (shareSum !== totalPaise) {
    const diff = totalPaise - shareSum;
    return diff > 0
      ? `${formatRupees(diff)} of the expense is not allocated to anyone`
      : `Shares are ${formatRupees(-diff)} over the expense amount`;
  }

  const paidSum = toPaise(creatorPaid) + participants.reduce((sum, m) => sum + toPaise(m.contribution ?? 0), 0);
  if (paidSum !== totalPaise) {
    return `Payments add up to ${formatRupees(paidSum)} but the expense is ${formatRupees(totalPaise)}`;
  }

  return null;
}
