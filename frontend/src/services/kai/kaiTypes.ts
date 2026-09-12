/**
 * Client-side types for a Kai voice session, plus the pure helpers that have
 * no Dexie/network dependency (so they can be unit-tested directly).
 */
import type {
  KaiAction,
  KaiActionEntities,
  KaiActionKind,
  KaiContextAction,
  KaiEntityPatch,
} from '@kanaku/shared';
import type { SyncedTableName } from '@/lib/auth-sync-integration';

export type { KaiAction, KaiActionEntities, KaiActionKind, KaiEntityPatch };

export type KaiRecordTable = SyncedTableName | 'goalContributions' | 'loanPayments';

export interface RecordRef {
  table: KaiRecordTable;
  localId: number;
  /** false when Kai touched a pre-existing row (e.g. updated an existing goal) — never deleted on undo */
  owned?: boolean;
}

export type KaiActionStatus = 'pending' | 'saving' | 'saved' | 'failed' | 'deleted' | 'answered';

export interface KaiExecutedAction extends KaiAction {
  status: KaiActionStatus;
  refs: RecordRef[];
  /** accountId → balance change applied locally when saved (reversed on delete) */
  balanceDelta: Record<string, number>;
  summary: string;
  utteranceSeq: number;
  createdAt: string;
  error?: string;
}

export type KaiState =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'executing'
  | 'completed'
  | 'stopping'
  | 'error';

export const MONEY_KINDS: ReadonlyArray<KaiActionKind> = [
  'expense', 'income', 'transfer', 'loan_borrow', 'loan_lend', 'investment', 'group_expense', 'subscription',
];

export const isMoneyKind = (kind: KaiActionKind): boolean => MONEY_KINDS.includes(kind);

/** Kinds that create/modify records (everything except questions, answers and corrections). */
export const isRecordKind = (kind: KaiActionKind): boolean =>
  isMoneyKind(kind) || kind === 'goal' || kind === 'goal_update' || kind === 'todo';

const fnv1a = (seed: string, basis: number): number => {
  let h = basis >>> 0;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // final avalanche (murmur3 fmix32)
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
};

/**
 * Deterministic UUID-shaped key from a seed. The backend accepts any UUID as a
 * transaction `dedupHash` / `clientRequestId`, so the same spoken action always
 * maps to the same server row even if the request is retried.
 */
export function deterministicUuid(seed: string): string {
  const lanes = [0x811c9dc5, 0x9747b28c, 0x5bd1e995, 0x27d4eb2f].map((basis) => fnv1a(seed, basis).toString(16).padStart(8, '0'));
  const hex = lanes.join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${(parseInt(hex[16], 16) & 0x3 | 0x8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export const formatInr = (n: number): string => `₹${Math.round(n).toLocaleString('en-IN')}`;

const joinNames = (names: string[]): string =>
  names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

/** Short human label for a card / the session context. */
export function describeAction(action: Pick<KaiAction, 'kind' | 'entities' | 'rawSegment'>): string {
  const e = action.entities;
  switch (action.kind) {
    case 'expense':
    case 'subscription':
      return e.description || e.category || 'Expense';
    case 'income':
      return e.description || e.category || 'Income';
    case 'transfer':
      return `Transfer to ${e.person || e.merchant || e.description || 'another account'}`;
    case 'investment':
      return `Invested in ${e.description || 'asset'}`;
    case 'group_expense':
      return `${e.description || 'Group expense'}${e.members?.length ? ` with ${joinNames(e.members)}` : ''}`;
    case 'loan_borrow':
      return `Borrowed from ${e.person || 'someone'}`;
    case 'loan_lend':
      return `Lent to ${e.person || 'someone'}`;
    case 'goal':
      return `${e.goalName || e.description || 'Savings'} goal`;
    case 'goal_update':
      return `${e.goalName || 'Goal'} updated`;
    case 'todo':
      return e.title || 'Reminder';
    case 'query':
      return action.rawSegment;
    case 'clarify':
      return e.question || 'Needs a quick answer';
    case 'update_previous':
      return 'Correction';
    default:
      return action.rawSegment;
  }
}

/** The amount a card should display for an action, if any. */
export function actionAmount(action: Pick<KaiAction, 'kind' | 'entities'>): number | undefined {
  const e = action.entities;
  if (action.kind === 'goal' || action.kind === 'goal_update') return e.targetAmount ?? e.amount;
  return e.amount;
}

export function toContextAction(a: KaiExecutedAction): KaiContextAction {
  return {
    actionId: a.actionId,
    kind: a.kind,
    summary: a.summary,
    amount: actionAmount(a),
    person: a.entities.person,
    goalName: a.entities.goalName,
    date: a.entities.date ?? a.entities.targetDate ?? a.entities.dueDate,
    status: a.status === 'saved' ? 'saved' : 'pending',
  };
}

/** Merge a correction/clarification patch into an action's entities (and kind). */
export function applyPatch(action: KaiAction, patch: KaiEntityPatch): KaiAction {
  const { kind, ...fields } = patch;
  const entities: KaiActionEntities = { ...action.entities, ...fields };
  if (fields.members) entities.members = Array.from(new Set([...(fields.members ?? [])]));
  return { ...action, kind: kind ?? action.kind, entities };
}
