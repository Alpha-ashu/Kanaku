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

/** `owned: false` when Kai touched a pre-existing row (e.g. updated an existing goal) — never deleted on undo */
export type RecordRef =
  | { table: KaiRecordTable; localId: number; owned?: boolean }
  /** Budgets are keyed by a string id in Dexie. */
  | { table: 'budgets'; budgetId: string; owned?: boolean };

/** `draft` is understood but not written yet — it is waiting for the user to confirm. */
export type KaiActionStatus = 'draft' | 'pending' | 'saving' | 'saved' | 'failed' | 'deleted' | 'answered';

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
  /** a draft is on screen and Kai is waiting for confirm / edit / cancel */
  | 'awaiting_confirmation'
  | 'completed'
  | 'stopping'
  | 'error';

export const MONEY_KINDS: ReadonlyArray<KaiActionKind> = [
  'expense', 'income', 'transfer', 'loan_borrow', 'loan_lend', 'investment', 'group_expense', 'subscription',
];

export const isMoneyKind = (kind: KaiActionKind): boolean => MONEY_KINDS.includes(kind);

/** Kinds that create/modify records (everything except questions, answers and corrections). */
export const isRecordKind = (kind: KaiActionKind): boolean =>
  isMoneyKind(kind) || kind === 'goal' || kind === 'goal_update' || kind === 'todo' || kind === 'budget';

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
    case 'budget':
      return `${e.category || e.description || 'Category'} budget`;
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

// ─── Confirmation ─────────────────────────────────────────────────────────────

/**
 * When a reading is shown for confirmation instead of being written straight
 * away. A plain, confident "spent 200 on coffee" still saves itself — that is
 * what voice capture is for — but anything that splits money between people,
 * carries several records at once, or that Kai is unsure about is worth one
 * look first, because undoing a wrong group split means unpicking every share.
 */
export interface ConfirmationPolicy {
  /** Records at or above this amount are always confirmed first. */
  amountCeiling: number;
  /** Below this model confidence, confirm first. */
  minConfidence: number;
}

export const DEFAULT_CONFIRMATION_POLICY: ConfirmationPolicy = {
  amountCeiling: 10_000,
  minConfidence: 0.8,
};

export function needsConfirmation(
  action: Pick<KaiAction, 'kind' | 'entities' | 'confidence' | 'requiresReview'>,
  options: { recordsInUtterance?: number; policy?: ConfirmationPolicy } = {},
): boolean {
  const policy = options.policy ?? DEFAULT_CONFIRMATION_POLICY;
  if (!isRecordKind(action.kind)) return false;
  if (action.requiresReview) return true;
  if (action.kind === 'group_expense' && (action.entities.members?.length ?? 0) > 0) return true;
  if ((options.recordsInUtterance ?? 1) > 1) return true;
  if (action.confidence < policy.minConfidence) return true;
  // The ceiling is about money leaving or arriving. A goal target or a budget
  // limit is a number to aim at, not a payment, so a big one is not a risk.
  if (!isMoneyKind(action.kind)) return false;
  return (actionAmount(action) ?? 0) >= policy.amountCeiling;
}

/** What Kai says (and the card asks) while a draft waits. */
export const confirmationPrompt = (summaries: string[]): string =>
  summaries.length === 1
    ? `I understood this as ${summaries[0]}. Shall I save it?`
    : `I understood ${summaries.length} entries: ${joinNames(summaries)}. Shall I save them?`;

const AFFIRMATION = /^(?:yes|yeah|yep|yup|ya|sure|correct|right|confirm(?:ed|\sit)?|save(?:\sit|\sthat)?|go\sahead|ok(?:ay)?|haan?|ha|theek\shai|sahi)\b[\s.!]*$/i;
const NEGATION = /^(?:no|nope|nah|cancel(?:\sit|\sthat)?|discard|don'?t(?:\ssave)?|delete(?:\sit|\sthat)?|wrong|not\sright|nahi+n?)\b[\s.!]*$/i;
/** "add Preeti also", "actually make it 4,500" — changes to the draft on screen. */
const AMENDMENT = /^(?:add|also|include|plus|and|with|aur)\b|\b(?:actually|instead|change|make\sit|correction|not\s\d)\b/i;

/** Greetings and thanks: nothing to record, and nothing worth opening chat for. */
const PLEASANTRY = /^(?:hi|hey|hello|yo|namaste|thanks?|thank you|thank u|shukriya|good (?:morning|evening|night)|bye|goodbye|nothing|never ?mind)\b[\s.!]*$/i;
/** Asks for an opinion, an explanation or a plan — an answer to read, not a record. */
const CONVERSATIONAL = /\?|^(?:how|what|why|when|which|should|can|could|would|do|does|is|are|tell|explain|suggest|help|give me|advice|any (?:tips|idea))\b/i;

/**
 * Whether an utterance that produced no records deserves the chat window. A
 * greeting does not: moving the user out of voice capture for "hi" would be
 * worse than saying nothing.
 */
export function looksConversational(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || PLEASANTRY.test(trimmed)) return false;
  return CONVERSATIONAL.test(trimmed) || trimmed.split(/\s+/).length >= 4;
}

export type ConfirmationReply = 'confirm' | 'cancel' | 'amend' | 'unrelated';

/**
 * How an utterance relates to the draft on screen. Anything that is not an
 * answer, an addition or a correction is a fresh request: the draft stays put
 * rather than swallowing the next sentence.
 */
export function classifyConfirmationReply(text: string, isFragment: (t: string) => boolean): ConfirmationReply {
  const trimmed = text.trim();
  if (!trimmed) return 'unrelated';
  if (AFFIRMATION.test(trimmed)) return 'confirm';
  if (NEGATION.test(trimmed)) return 'cancel';
  if (AMENDMENT.test(trimmed)) return 'amend';
  // A bare name or name list right after a draft is the rest of that request.
  return isFragment(trimmed) ? 'amend' : 'unrelated';
}

/** Merge a correction/clarification patch into an action's entities (and kind). */
export function applyPatch(action: KaiAction, patch: KaiEntityPatch): KaiAction {
  const { kind, ...fields } = patch;
  const entities: KaiActionEntities = { ...action.entities, ...fields };
  if (fields.members) entities.members = Array.from(new Set([...(fields.members ?? [])]));
  return { ...action, kind: kind ?? action.kind, entities };
}
