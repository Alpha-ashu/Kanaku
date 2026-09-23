/**
 * The Kai voice session: a small state machine around a continuous listener,
 * a strictly-ordered utterance queue, and the executed-action list the screen
 * renders as cards.
 *
 *   idle ─tap─► listening ⇄ processing → executing → completed ─► listening
 *                                     ↘ awaiting_confirmation ─confirm─► executing
 *          ◄─tap─ stopping (drains the queue, says the wrap-up)
 *
 * Speech reaches the session as whole requests, not as engine chunks: the
 * listener's finals go through an `UtteranceAggregator` that holds them until
 * the sentence is finished (see utteranceAggregator.ts). Utterances are then
 * processed one at a time, in order, so a correction always sees the record it
 * refers to. Corrections, clarification answers and card edits all flow
 * through `applyUpdate`, so voice and touch share one path.
 *
 * A reading that splits money between people, carries several records or that
 * Kai is unsure of is held as a `draft` and confirmed first; everything else
 * still saves as it is spoken.
 */
import type { KaiAction, KaiEntityPatch, KaiSessionContext } from '@kanaku/shared';
import { VoiceContextStore } from '@/services/voiceContextStore';
import { KaiListener, type KaiListenerCallbacks } from './kaiListener';
import { UtteranceAggregator, isFragment, joinChunks, type AggregatorOptions } from './utteranceAggregator';
import { understandUtterance, type UnderstandResult } from './kaiUnderstandService';
import {
  actionOutflow,
  executeKaiAction,
  removeKaiAction,
  resolveAccountForAction,
  updateKaiAction,
  type ExecutionContext,
} from './kaiActionExecutor';
import { isKaiMuted, speak } from './kaiSpeech';
import {
  actionAmount,
  applyPatch,
  classifyConfirmationReply,
  confirmationPrompt,
  describeAction,
  formatInr,
  isRecordKind,
  looksConversational,
  needsConfirmation,
  toContextAction,
  type ConfirmationPolicy,
  type KaiActionKind,
  type KaiExecutedAction,
  type KaiState,
} from './kaiTypes';

export interface KaiPendingClarification {
  actionId: string;
  question: string;
  options: string[];
}

/** Drafts from one request, waiting for confirm / edit / cancel. */
export interface KaiPendingConfirmation {
  actionIds: string[];
  question: string;
}

export interface KaiSessionSnapshot {
  state: KaiState;
  engineListening: boolean;
  sessionId: string;
  seq: number;
  actions: KaiExecutedAction[];
  liveTranscript: string;
  lastTranscript: string;
  lastSay: string;
  queueLength: number;
  parser?: string;
  offline: boolean;
  error?: string;
  pending?: KaiPendingClarification;
  confirmation?: KaiPendingConfirmation;
  /** The request the current drafts came from — an addition re-reads it with the new words. */
  draftSource?: string;
  /** Kai asked "anything else?" and is waiting: "no" ends the session. */
  awaitingFollowUp?: boolean;
  savedCount: number;
  muted: boolean;
  wrapUp?: string;
}

export interface KaiSessionDeps {
  understand: typeof understandUtterance;
  execute: typeof executeKaiAction;
  update: typeof updateKaiAction;
  remove: typeof removeKaiAction;
  resolveAccount: (
    outflow?: number,
    action?: Pick<KaiAction, 'kind' | 'entities' | 'rawSegment'>,
  ) => Promise<{ id?: number } | null>;
  speak: (text: string) => Promise<void>;
  isMuted: () => boolean;
  createListener: (callbacks: KaiListenerCallbacks) => Pick<KaiListener, 'begin' | 'end' | 'pause' | 'resume' | 'isActive'>;
  refreshContext: () => Promise<{ knownGoals: string[]; knownContacts: string[] }>;
  rememberActions: (actions: KaiExecutedAction[]) => void;
  onRecordsChanged?: () => void;
  /** An utterance that is conversation rather than capture — the screen moves it into chat. */
  onConversation?: (transcript: string, say?: string) => void;
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  completedHoldMs?: number;
  aggregator?: AggregatorOptions;
  confirmationPolicy?: ConfirmationPolicy;
  /** Quiet time after a save before Kai asks whether there is anything else. 0 disables. */
  followUpMs?: number;
  /** How long a "no" still counts as the answer to that question. */
  followUpAnswerMs?: number;
}

const STORAGE_KEY = 'KANAKU_kai_session';
const CONTEXT_ACTIONS = 5;
const ORDINALS = ['first', 'second', 'third', 'fourth'];

/** Which clarification option (0-based) an utterance picks — by number, ordinal or by echoing the label. */
export function matchOptionLabel(utterance: string, labels: string[]): number {
  const lower = utterance.toLowerCase().trim();
  for (let i = 0; i < labels.length; i += 1) {
    if (new RegExp(`\\b(?:option\\s+)?${i + 1}\\b`).test(lower) || new RegExp(`\\b${ORDINALS[i]}\\b`).test(lower)) return i;
  }
  const scored = labels.map((label, i) => {
    const words = label.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !['with', 'the', 'and'].includes(w));
    const hits = words.filter((w) => lower.includes(w)).length;
    return { i, score: words.length ? hits / words.length : 0 };
  }).sort((a, b) => b.score - a.score);
  return scored[0] && scored[0].score >= 0.5 ? scored[0].i : -1;
}

/**
 * A spoken answer to a pending clarification arrives as `chosenOption` (from
 * the LLM or the offline heuristics) or as free text that echoes an option.
 * Either way the option's own patch is what finalises the record — the model
 * never has to reproduce it.
 */
function resolveOptionPatch(target: KaiExecutedAction, patch: KaiEntityPatch, utterance: string): KaiEntityPatch {
  const options = target.entities.options ?? [];
  if (target.status !== 'pending' || options.length === 0) return patch;
  const { chosenOption, ...rest } = patch;
  let index = typeof chosenOption === 'number' ? chosenOption - 1 : -1;
  if (index < 0 && !rest.kind) index = matchOptionLabel(utterance, options.map((o) => o.label));
  if (index < 0 || !options[index]) return rest;
  const extra = omitKeys(rest, ['description']);
  return { ...options[index].patch, ...extra };
}

function omitKeys<T extends object>(obj: T, keys: string[]): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([k]) => !keys.includes(k))) as Partial<T>;
}

const newId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

const envNumber = (value: unknown): number | undefined => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

/**
 * How long Kai waits mid-sentence is a feel decision, not a constant to guess
 * once: a slower speaker needs a longer window. Defaults live in
 * utteranceAggregator.ts; these override them per build.
 */
const aggregatorFromEnv = (): AggregatorOptions => {
  const env = (typeof import.meta !== 'undefined' ? import.meta.env : undefined) as Record<string, string> | undefined;
  return {
    pauseMs: envNumber(env?.VITE_KAI_PAUSE_MS),
    continuationMs: envNumber(env?.VITE_KAI_CONTINUATION_MS),
    maxHoldMs: envNumber(env?.VITE_KAI_MAX_HOLD_MS),
  };
};

const defaultDeps = (): KaiSessionDeps => ({
  aggregator: aggregatorFromEnv(),
  understand: understandUtterance,
  execute: executeKaiAction,
  update: updateKaiAction,
  remove: removeKaiAction,
  resolveAccount: (outflow, action) => resolveAccountForAction(action, outflow),
  speak,
  isMuted: isKaiMuted,
  createListener: (callbacks) => new KaiListener(callbacks),
  refreshContext: async () => {
    const ctx = await VoiceContextStore.refresh();
    return { knownGoals: ctx.knownGoals, knownContacts: ctx.knownContacts };
  },
  rememberActions: (actions) =>
    VoiceContextStore.addRecentActions(actions.map((a) => ({
      type: a.kind,
      description: a.summary,
      amount: a.entities.amount,
      person: a.entities.person,
    }))),
  storage: typeof window !== 'undefined' ? window.sessionStorage : null,
});

export class KaiSession {
  private snapshot: KaiSessionSnapshot;
  private readonly subscribers = new Set<() => void>();
  private readonly deps: KaiSessionDeps;
  private listener: ReturnType<KaiSessionDeps['createListener']> | null = null;
  private queue: string[] = [];
  private draining = false;
  private stopping = false;
  private completedTimer: ReturnType<typeof setTimeout> | null = null;
  private followUpTimer: ReturnType<typeof setTimeout> | null = null;
  private userId: string | undefined;
  /** Account the stored cards belong to — they must never surface for another one. */
  private ownerId: string | undefined;
  private known: { knownGoals: string[]; knownContacts: string[] } = { knownGoals: [], knownContacts: [] };
  private readonly aggregator: UtteranceAggregator;

  constructor(deps: Partial<KaiSessionDeps> = {}) {
    this.deps = { ...defaultDeps(), ...deps };
    this.aggregator = new UtteranceAggregator((text) => this.enqueue(text), this.deps.aggregator);
    this.snapshot = this.restore();
  }

  // ─── Store API ──────────────────────────────────────────────────────────────

  subscribe = (fn: () => void): (() => void) => {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  };

  getSnapshot = (): KaiSessionSnapshot => this.snapshot;

  setUserId(userId?: string): void {
    if (userId && this.ownerId && this.ownerId !== userId) {
      // Another account signed in on this tab: drop the previous account's
      // cards so they can't be seen, edited or deleted from here.
      const listener = this.listener;
      this.listener = null;
      void listener?.end();
      this.clear();
    }
    this.userId = userId;
    if (userId && this.ownerId !== userId) {
      this.ownerId = userId;
      this.persist();
    }
  }

  /** Called after any record is created, updated or deleted — the app refreshes its views. */
  setRecordsChangedHandler(handler?: () => void): void {
    this.deps.onRecordsChanged = handler;
  }

  /**
   * Called when an utterance is conversation rather than capture, so the screen
   * can move it into the chat window where a long answer is readable. Without a
   * handler Kai just says there was nothing to record.
   */
  setConversationHandler(handler?: (transcript: string, say?: string) => void): void {
    this.deps.onConversation = handler;
  }

  private set(patch: Partial<KaiSessionSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.persist();
    for (const fn of this.subscribers) fn();
  }

  private restore(): KaiSessionSnapshot {
    const base: KaiSessionSnapshot = {
      state: 'idle',
      engineListening: false,
      sessionId: newId(),
      seq: 0,
      actions: [],
      liveTranscript: '',
      lastTranscript: '',
      lastSay: '',
      queueLength: 0,
      offline: false,
      savedCount: 0,
      muted: this.deps.isMuted(),
    };
    try {
      const raw = this.deps.storage?.getItem(STORAGE_KEY);
      if (!raw) return base;
      const stored = JSON.parse(raw) as Partial<KaiSessionSnapshot> & { ownerId?: string };
      this.ownerId = stored.ownerId;
      const actions = Array.isArray(stored.actions)
        ? stored.actions.map((a) => (a.status === 'saving' ? { ...a, status: 'failed' as const, error: 'Interrupted — tap retry' } : a))
        : [];
      const drafts = actions.filter((a) => a.status === 'draft');
      return {
        ...base,
        sessionId: stored.sessionId || base.sessionId,
        seq: stored.seq ?? 0,
        actions,
        draftSource: stored.draftSource,
        savedCount: actions.filter((a) => a.status === 'saved').length,
        pending: actions.find((a) => a.status === 'pending' && a.kind === 'clarify')
          ? this.pendingFrom(actions.filter((a) => a.status === 'pending' && a.kind === 'clarify').slice(-1)[0])
          : undefined,
        // Drafts were never written, so a reload must still ask before saving them.
        confirmation: drafts.length > 0
          ? { actionIds: drafts.map((a) => a.actionId), question: confirmationPrompt(drafts.map((a) => a.summary)) }
          : undefined,
      };
    } catch {
      return base;
    }
  }

  private persist(): void {
    try {
      this.deps.storage?.setItem(STORAGE_KEY, JSON.stringify({
        ownerId: this.ownerId,
        sessionId: this.snapshot.sessionId,
        seq: this.snapshot.seq,
        actions: this.snapshot.actions,
        draftSource: this.snapshot.draftSource,
      }));
    } catch {
      // ignore — per-viewer convenience only
    }
  }

  private pendingFrom(action: KaiExecutedAction): KaiPendingClarification {
    return {
      actionId: action.actionId,
      question: action.entities.question ?? 'Could you clarify?',
      options: (action.entities.options ?? []).map((o) => o.label),
    };
  }

  // ─── Listening ──────────────────────────────────────────────────────────────

  async toggleListening(): Promise<void> {
    if (this.listener?.isActive || this.snapshot.state === 'stopping') {
      await this.stop();
      return;
    }
    await this.startListening();
  }

  async startListening(): Promise<void> {
    if (this.listener?.isActive) return;
    this.stopping = false;
    this.clearCompletedTimer();
    this.set({ state: 'listening', error: undefined, wrapUp: undefined, liveTranscript: '' });
    try {
      this.known = await this.deps.refreshContext();
    } catch {
      // context is best-effort
    }
    this.listener = this.deps.createListener({
      // What is on screen is everything held so far plus the words being spoken,
      // so a buffered sentence never looks lost while Kai waits for the rest.
      onPartial: (text) => this.set({ liveTranscript: joinChunks(this.aggregator.buffered, text) }),
      onFinal: (text) => {
        this.aggregator.push(text);
        this.set({ liveTranscript: this.aggregator.buffered });
      },
      onEngineState: (listening) => this.set({ engineListening: listening }),
      onFatal: (_reason, message) => {
        this.listener = null;
        this.set({ state: 'error', error: message, engineListening: false, liveTranscript: '' });
      },
    });
    await this.listener.begin();
  }

  async stop(): Promise<void> {
    if (!this.listener && this.queue.length === 0 && !this.draining) {
      this.set({ state: 'idle' });
      return;
    }
    this.stopping = true;
    this.clearFollowUp();
    this.set({ state: 'stopping', liveTranscript: '' });
    const listener = this.listener;
    this.listener = null;
    if (listener) await listener.end();
    // Anything still buffered was said before the tap — process it, don't drop it.
    this.aggregator.flush();
    await this.drain();
    const saved = this.snapshot.actions.filter((a) => a.status === 'saved').length;
    const waiting = this.drafts().length;
    const savedLine = saved > 0
      ? `Done. I've saved ${saved} update${saved === 1 ? '' : 's'}. Your records are up to date.`
      : "Okay, I've stopped listening.";
    // Drafts were never written — say so rather than implying everything is filed.
    const wrapUp = waiting > 0
      ? `${savedLine} ${waiting} ${waiting === 1 ? 'entry is' : 'entries are'} still waiting for your confirmation.`
      : savedLine;
    this.set({ state: waiting > 0 ? 'awaiting_confirmation' : 'idle', engineListening: false, wrapUp, lastSay: wrapUp });
    await this.say(wrapUp);
    this.stopping = false;
  }

  /** Typed input takes the identical path as a spoken sentence. */
  submitText(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) return;
    // Typing ends whatever was being said, and keeps the spoken part first.
    this.aggregator.flush();
    this.enqueue(trimmed);
  }

  clear(): void {
    this.queue = [];
    this.aggregator.reset();
    this.clearFollowUp();
    this.set({
      sessionId: newId(),
      seq: 0,
      actions: [],
      savedCount: 0,
      pending: undefined,
      confirmation: undefined,
      draftSource: undefined,
      wrapUp: undefined,
      lastSay: '',
      lastTranscript: '',
      liveTranscript: '',
      error: undefined,
      state: this.listener?.isActive ? 'listening' : 'idle',
    });
    try {
      this.deps.storage?.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  setMuted(muted: boolean): void {
    this.set({ muted });
  }

  // ─── Queue ──────────────────────────────────────────────────────────────────

  private enqueue(text: string): void {
    this.queue.push(text);
    this.set({ queueLength: this.queue.length, liveTranscript: '' });
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queue.length > 0) {
        const text = this.queue.shift()!;
        this.set({ queueLength: this.queue.length });
        await this.handleUtterance(text);
      }
    } finally {
      this.draining = false;
    }
  }

  private buildContext(): KaiSessionContext {
    const recent = this.snapshot.actions
      .filter((a) => a.kind !== 'query' && a.status !== 'deleted')
      .slice(-CONTEXT_ACTIONS)
      .reverse()
      .map(toContextAction);
    return {
      recentActions: recent,
      knownGoals: this.known.knownGoals.slice(0, 30),
      knownContacts: this.known.knownContacts.slice(0, 50),
      pendingClarification: this.snapshot.pending,
    };
  }

  private async handleUtterance(text: string): Promise<void> {
    this.clearCompletedTimer();
    const answeringFollowUp = this.snapshot.awaitingFollowUp === true;
    this.clearFollowUp();
    const seq = this.snapshot.seq + 1;
    this.set({ state: 'processing', seq, lastTranscript: text, error: undefined, liveTranscript: '' });

    // A draft on screen owns the next words unless they are a fresh request:
    // "yes" saves it, "no" drops it, and names or "add Preeti" belong to it.
    if (this.drafts().length > 0) {
      switch (classifyConfirmationReply(text, isFragment)) {
        case 'confirm':
          await this.confirmDrafts();
          return;
        case 'cancel':
          await this.cancelDrafts();
          return;
        case 'amend':
          await this.amendDrafts(text, seq);
          return;
        default:
          break;
      }
    } else if (answeringFollowUp) {
      // "Anything else?" — "no" finishes the session, "yes" just keeps the mic open.
      const reply = classifyConfirmationReply(text, isFragment);
      if (reply === 'cancel') {
        await this.stop();
        return;
      }
      if (reply === 'confirm') {
        const say = 'Go ahead.';
        this.set({ lastSay: say });
        await this.say(say);
        await this.finishUtterance();
        return;
      }
    }

    let understood: UnderstandResult;
    try {
      understood = await this.deps.understand({
        transcript: text,
        sessionId: this.snapshot.sessionId,
        utteranceSeq: seq,
        context: this.buildContext(),
      });
    } catch (err) {
      this.set({ state: this.listenerState(), error: err instanceof Error ? err.message : 'Kai could not process that.' });
      return;
    }
    this.set({ parser: understood.parser, offline: understood.offline });

    if (understood.actions.length === 0) {
      // Nothing to record and nothing to look up: a question belongs in the
      // chat window where a long answer can be read. A greeting stays here.
      if (this.deps.onConversation && looksConversational(text)) {
        this.deps.onConversation(text);
        const say = 'Let me answer that in chat.';
        this.set({ lastSay: say });
        await this.say(say);
        await this.finishUtterance();
        return;
      }
      const say = 'Nothing to record there — go ahead whenever you\'re ready.';
      this.set({ lastSay: say });
      await this.finishUtterance();
      return;
    }

    const recordsInUtterance = understood.actions.filter((a) => isRecordKind(a.kind)).length;
    const touched: KaiExecutedAction[] = [];
    for (const action of understood.actions) {
      const result = await this.handleAction(action, seq, { recordsInUtterance, source: text });
      if (result) touched.push(result);
    }
    await this.announceDrafts();

    const saved = touched.filter((a) => a.status === 'saved');
    if (saved.length > 0) {
      this.deps.rememberActions(saved);
      this.deps.onRecordsChanged?.();
      this.scheduleFollowUp();
    }
    await this.finishUtterance();
  }

  private listenerState(): KaiState {
    if (this.stopping) return 'stopping';
    if (this.drafts().length > 0) return 'awaiting_confirmation';
    return this.listener?.isActive ? 'listening' : 'idle';
  }

  private async finishUtterance(): Promise<void> {
    if (this.stopping) return;
    // A draft is still on screen: stay in the question, don't flash "Done".
    if (this.drafts().length > 0) {
      this.set({ state: 'awaiting_confirmation' });
      return;
    }
    this.set({ state: 'completed', savedCount: this.snapshot.actions.filter((a) => a.status === 'saved').length });
    const hold = this.deps.completedHoldMs ?? 1200;
    await new Promise<void>((resolve) => {
      this.completedTimer = setTimeout(resolve, hold);
    });
    this.completedTimer = null;
    if (this.snapshot.state === 'completed') this.set({ state: this.listenerState() });
  }

  private clearCompletedTimer(): void {
    if (this.completedTimer) {
      clearTimeout(this.completedTimer);
      this.completedTimer = null;
    }
  }

  // ─── Follow-up ──────────────────────────────────────────────────────────────

  /**
   * After something is saved the session keeps listening, and silence is
   * ambiguous: the user may be thinking, or may be done. Rather than guess, Kai
   * asks once — and a "no" then ends the session instead of being heard as a
   * correction. Only asked aloud, so a muted session never waits on an answer
   * the user never heard.
   */
  private scheduleFollowUp(): void {
    this.clearFollowUp();
    const wait = this.deps.followUpMs ?? 7000;
    if (wait <= 0 || this.stopping || !this.listener?.isActive || this.deps.isMuted()) return;
    this.followUpTimer = setTimeout(() => { void this.askFollowUp(); }, wait);
  }

  private async askFollowUp(): Promise<void> {
    this.followUpTimer = null;
    // Mid-sentence is the one moment not to ask: words already buffered, or a
    // partial on screen, mean the user is still talking.
    const speaking = this.aggregator.buffered.trim().length > 0 || this.snapshot.liveTranscript.trim().length > 0;
    const busy = speaking || this.queue.length > 0 || this.draining || this.drafts().length > 0;
    if (busy || this.stopping || !this.listener?.isActive) return;
    const say = 'Anything else?';
    this.set({ awaitingFollowUp: true, lastSay: say });
    await this.say(say);
    // A "no" ten minutes later is about something else, not this question.
    const window = this.deps.followUpAnswerMs ?? 20_000;
    this.followUpTimer = setTimeout(() => {
      this.followUpTimer = null;
      if (this.snapshot.awaitingFollowUp) this.set({ awaitingFollowUp: false });
    }, window);
  }

  private clearFollowUp(): void {
    if (this.followUpTimer) {
      clearTimeout(this.followUpTimer);
      this.followUpTimer = null;
    }
    if (this.snapshot.awaitingFollowUp) this.set({ awaitingFollowUp: false });
  }

  // ─── Actions ────────────────────────────────────────────────────────────────

  private upsertAction(action: KaiExecutedAction): void {
    const exists = this.snapshot.actions.some((a) => a.actionId === action.actionId);
    const actions = exists
      ? this.snapshot.actions.map((a) => (a.actionId === action.actionId ? action : a))
      : [...this.snapshot.actions, action];
    this.set({ actions, savedCount: actions.filter((a) => a.status === 'saved').length });
  }

  private shell(action: KaiAction, seq: number, status: KaiExecutedAction['status']): KaiExecutedAction {
    return {
      ...action,
      status,
      refs: [],
      balanceDelta: {},
      summary: describeAction(action),
      utteranceSeq: seq,
      createdAt: new Date().toISOString(),
    };
  }

  private async handleAction(
    action: KaiAction,
    seq: number,
    utterance: { recordsInUtterance: number; source: string } = { recordsInUtterance: 1, source: '' },
  ): Promise<KaiExecutedAction | null> {
    if (action.kind === 'query') {
      const answered = this.shell(action, seq, 'answered');
      this.upsertAction(answered);
      const say = action.say ?? action.answer?.summary ?? '';
      if (say) {
        this.set({ lastSay: say });
        await this.say(action.answer?.summary ?? say);
      }
      return answered;
    }

    if (action.kind === 'clarify') {
      const pending = this.shell(action, seq, 'pending');
      this.upsertAction(pending);
      const question = action.entities.question ?? 'Could you clarify?';
      this.set({ pending: this.pendingFrom(pending), lastSay: question });
      await this.say(question);
      return pending;
    }

    if (action.kind === 'update_previous') {
      const targetId = action.entities.targetActionId;
      const target = targetId ? this.snapshot.actions.find((a) => a.actionId === targetId) : undefined;
      if (!target || !action.entities.patch) {
        const say = "I'm not sure which entry you mean — tap Edit on the card instead.";
        this.set({ lastSay: say });
        await this.say(say);
        return null;
      }
      return this.applyUpdate(target, resolveOptionPatch(target, action.entities.patch, action.rawSegment), action.say);
    }

    if (isRecordKind(action.kind)) {
      if (needsConfirmation(action, {
        recordsInUtterance: utterance.recordsInUtterance,
        policy: this.deps.confirmationPolicy,
      })) {
        return this.holdForConfirmation(action, seq, utterance.source);
      }
      return this.runRecord(action, seq);
    }
    return null;
  }

  // ─── Drafts awaiting confirmation ───────────────────────────────────────────

  private drafts(): KaiExecutedAction[] {
    return this.snapshot.actions.filter((a) => a.status === 'draft');
  }

  /** Show the reading as a card and wait; nothing is written yet. */
  private holdForConfirmation(action: KaiAction, seq: number, source: string): KaiExecutedAction {
    const draft = this.shell(action, seq, 'draft');
    this.upsertAction(draft);
    this.set({ state: 'awaiting_confirmation', draftSource: source || action.rawSegment });
    return draft;
  }

  /** One question for everything this request produced, asked after the last card is on screen. */
  private async announceDrafts(): Promise<void> {
    const drafts = this.drafts();
    if (drafts.length === 0) return;
    const question = confirmationPrompt(drafts.map((d) => d.summary));
    this.set({
      confirmation: { actionIds: drafts.map((d) => d.actionId), question },
      state: 'awaiting_confirmation',
      lastSay: question,
    });
    await this.say(question);
  }

  /** Write every held draft, in the order it was understood. */
  async confirmDrafts(): Promise<void> {
    const drafts = this.drafts();
    if (drafts.length === 0) return;
    this.set({ confirmation: undefined, draftSource: undefined });
    const saved: KaiExecutedAction[] = [];
    for (const draft of drafts) {
      const result = await this.runRecord(this.toAction(draft), draft.utteranceSeq, draft);
      if (result.status === 'saved') saved.push(result);
    }
    if (saved.length > 0) {
      this.deps.rememberActions(saved);
      this.deps.onRecordsChanged?.();
      this.scheduleFollowUp();
    }
    await this.finishUtterance();
  }

  async cancelDrafts(): Promise<void> {
    const drafts = this.drafts();
    if (drafts.length === 0) return;
    const ids = new Set(drafts.map((d) => d.actionId));
    const actions = this.snapshot.actions.filter((a) => !ids.has(a.actionId));
    const say = "Okay, I haven't saved that.";
    this.set({ actions, confirmation: undefined, draftSource: undefined, lastSay: say });
    await this.say(say);
    // "No" to a draft only refused that entry. Asking again gives the user the
    // plain way to end the session, since the same word does both jobs.
    this.scheduleFollowUp();
    await this.finishUtterance();
  }

  /**
   * More words for the request on screen — the rest of a list of names, or a
   * correction. The whole request is read again with the new words so the model
   * re-decides what it is; the first draft keeps its actionId, which is what
   * the idempotency keys are derived from.
   */
  private async amendDrafts(text: string, seq: number): Promise<void> {
    const drafts = this.drafts();
    const combined = joinChunks(this.snapshot.draftSource ?? drafts[0]?.rawSegment ?? '', text);

    let understood: UnderstandResult;
    try {
      understood = await this.deps.understand({
        transcript: combined,
        sessionId: this.snapshot.sessionId,
        utteranceSeq: seq,
        context: this.buildContext(),
      });
    } catch (err) {
      this.set({ state: 'awaiting_confirmation', error: err instanceof Error ? err.message : 'Kai could not process that.' });
      return;
    }
    this.set({ parser: understood.parser, offline: understood.offline });

    const records = understood.actions.filter((a) => isRecordKind(a.kind));
    if (records.length === 0) {
      const say = "I didn't catch that — say yes to save it, or tell me what to change.";
      this.set({ state: 'awaiting_confirmation', lastSay: say });
      await this.say(say);
      return;
    }

    const kept = new Set(drafts.map((d) => d.actionId));
    const remaining = this.snapshot.actions.filter((a) => !kept.has(a.actionId));
    const rebuilt = records.map((action, index) => this.shell(
      { ...action, actionId: drafts[index]?.actionId ?? action.actionId, rawSegment: combined },
      drafts[index]?.utteranceSeq ?? seq,
      'draft',
    ));
    this.set({ actions: [...remaining, ...rebuilt], draftSource: combined });
    await this.announceDrafts();
  }

  /** A stored card back to the action shape the executor takes. */
  private toAction(draft: KaiExecutedAction): KaiAction {
    return {
      actionId: draft.actionId,
      kind: draft.kind,
      rawSegment: draft.rawSegment,
      entities: draft.entities,
      confidence: draft.confidence,
      requiresReview: false,
      say: draft.say,
    };
  }

  private async executionContext(action: Pick<KaiAction, 'kind' | 'entities' | 'rawSegment'>): Promise<ExecutionContext> {
    if (action.entities?.accountId) {
      return { userId: this.userId, accountId: action.entities.accountId };
    }
    const account = await this.deps.resolveAccount(actionOutflow(action), action);
    if (!account?.id) throw new Error('Add an account first so Kai knows where to record this.');
    return { userId: this.userId, accountId: account.id };
  }

  private async runRecord(action: KaiAction, seq: number, existing?: KaiExecutedAction): Promise<KaiExecutedAction> {
    const shell: KaiExecutedAction = existing
      ? { ...existing, ...action, status: 'saving', error: undefined }
      : this.shell(action, seq, 'saving');
    this.upsertAction(shell);
    this.set({ state: 'executing' });
    try {
      const outcome = await this.deps.execute(action, await this.executionContext(action));
      const saved: KaiExecutedAction = {
        ...shell,
        entities: outcome.entities,
        refs: outcome.refs,
        balanceDelta: outcome.balanceDelta,
        status: 'saved',
        say: outcome.say,
        summary: describeAction({ kind: shell.kind, entities: outcome.entities, rawSegment: shell.rawSegment }),
      };
      this.upsertAction(saved);
      if (saved.kind === 'goal_update') this.reflectGoalUpdate(saved);
      if (outcome.say) {
        this.set({ lastSay: outcome.say });
        await this.say(outcome.say);
      }
      return saved;
    } catch (err) {
      const failed: KaiExecutedAction = {
        ...shell,
        status: 'failed',
        error: err instanceof Error ? err.message : 'Could not save this.',
      };
      this.upsertAction(failed);
      this.set({ lastSay: failed.error ?? '' });
      return failed;
    }
  }

  /** A goal update also refreshes the earlier goal card so both show the new target. */
  private reflectGoalUpdate(update: KaiExecutedAction): void {
    const name = update.entities.goalName?.toLowerCase();
    if (!name) return;
    const actions = this.snapshot.actions.map((a) => {
      if (a.kind !== 'goal' || a.status !== 'saved' || a.entities.goalName?.toLowerCase() !== name) return a;
      const entities = {
        ...a.entities,
        ...(update.entities.targetDate ? { targetDate: update.entities.targetDate } : {}),
        ...(update.entities.targetAmount ? { targetAmount: update.entities.targetAmount, amount: update.entities.targetAmount } : {}),
      };
      return { ...a, entities };
    });
    this.set({ actions });
  }

  /**
   * Apply a patch to an earlier action: finalise a pending clarification,
   * update a saved record, or retry a failed one with the corrected values.
   */
  private async applyUpdate(target: KaiExecutedAction, patch: KaiEntityPatch, say?: string): Promise<KaiExecutedAction | null> {
    // Editing a draft changes what will be written — it does not write it.
    if (target.status === 'draft') {
      const edited = applyPatch(this.toAction(target), patch);
      const next: KaiExecutedAction = {
        ...target,
        ...edited,
        status: 'draft',
        summary: describeAction(edited),
      };
      this.upsertAction(next);
      this.set({
        confirmation: {
          actionIds: this.drafts().map((d) => d.actionId),
          question: confirmationPrompt(this.drafts().map((d) => d.summary)),
        },
      });
      return next;
    }

    if (target.status === 'pending') {
      const draftPatch = target.entities.patch;
      const draftEntities = omitKeys(target.entities, ['question', 'options', 'patch']);
      const kind: KaiActionKind = patch.kind ?? draftPatch?.kind ?? 'expense';
      const draft: KaiAction = applyPatch(
        { actionId: target.actionId, kind, rawSegment: target.rawSegment, entities: draftEntities, confidence: target.confidence, requiresReview: false, say },
        { ...(draftPatch ?? {}), ...patch, kind },
      );
      if (this.snapshot.pending?.actionId === target.actionId) this.set({ pending: undefined });
      if (!isRecordKind(draft.kind)) {
        this.upsertAction({ ...target, status: 'deleted' });
        return null;
      }
      return this.runRecord(draft, target.utteranceSeq, target);
    }

    if (target.status === 'failed') {
      const retry = applyPatch(target, patch);
      return this.runRecord(retry, target.utteranceSeq, target);
    }

    if (target.status !== 'saved') return null;

    this.upsertAction({ ...target, status: 'saving' });
    this.set({ state: 'executing' });
    try {
      const outcome = await this.deps.update(target, patch, await this.executionContext(applyPatch(target, patch)));
      const next: KaiExecutedAction = {
        ...target,
        kind: patch.kind ?? target.kind,
        entities: outcome.entities,
        refs: outcome.refs,
        balanceDelta: outcome.balanceDelta,
        status: 'saved',
        error: undefined,
        summary: describeAction({ kind: patch.kind ?? target.kind, entities: outcome.entities, rawSegment: target.rawSegment }),
      };
      this.upsertAction(next);
      const line = say ?? outcome.say;
      if (line) {
        this.set({ lastSay: line });
        await this.say(line);
      }
      this.deps.onRecordsChanged?.();
      return next;
    } catch (err) {
      this.upsertAction({ ...target, status: 'saved', error: err instanceof Error ? err.message : 'Could not update this.' });
      return target;
    }
  }

  // ─── Card interactions ──────────────────────────────────────────────────────

  /** Confirm button on a draft card: write that one. */
  async confirmAction(actionId: string): Promise<void> {
    const draft = this.snapshot.actions.find((a) => a.actionId === actionId && a.status === 'draft');
    if (!draft) return;
    this.set({ confirmation: this.confirmationFor(this.drafts().filter((d) => d.actionId !== actionId)) });
    const result = await this.runRecord(this.toAction(draft), draft.utteranceSeq, draft);
    if (result.status === 'saved') {
      this.deps.rememberActions([result]);
      this.deps.onRecordsChanged?.();
      this.scheduleFollowUp();
    }
    if (this.drafts().length === 0) this.set({ draftSource: undefined });
    this.set({ state: this.listenerState() });
  }

  /** Cancel button on a draft card: drop that one, keep any others. */
  async cancelAction(actionId: string): Promise<void> {
    const draft = this.snapshot.actions.find((a) => a.actionId === actionId && a.status === 'draft');
    if (!draft) return;
    const actions = this.snapshot.actions.filter((a) => a.actionId !== actionId);
    const remaining = actions.filter((a) => a.status === 'draft');
    this.set({
      actions,
      confirmation: this.confirmationFor(remaining),
      draftSource: remaining.length > 0 ? this.snapshot.draftSource : undefined,
      state: this.listenerState(),
    });
    if (remaining.length === 0) this.scheduleFollowUp();
  }

  private confirmationFor(drafts: KaiExecutedAction[]): KaiPendingConfirmation | undefined {
    return drafts.length > 0
      ? { actionIds: drafts.map((d) => d.actionId), question: confirmationPrompt(drafts.map((d) => d.summary)) }
      : undefined;
  }

  async answerClarification(actionId: string, optionIndex: number): Promise<void> {
    const target = this.snapshot.actions.find((a) => a.actionId === actionId);
    const option = target?.entities.options?.[optionIndex];
    if (!target || !option) return;
    await this.applyUpdate(target, option.patch);
    await this.finishUtterance();
  }

  async editAction(actionId: string, patch: KaiEntityPatch): Promise<void> {
    const target = this.snapshot.actions.find((a) => a.actionId === actionId);
    if (!target) return;
    await this.applyUpdate(target, patch);
    if (this.snapshot.state === 'executing') this.set({ state: this.listenerState() });
  }

  async retryAction(actionId: string): Promise<void> {
    const target = this.snapshot.actions.find((a) => a.actionId === actionId);
    if (!target || target.status !== 'failed') return;
    await this.runRecord(target, target.utteranceSeq, target);
    this.deps.onRecordsChanged?.();
    if (this.snapshot.state === 'executing') this.set({ state: this.listenerState() });
  }

  async deleteAction(actionId: string): Promise<void> {
    const target = this.snapshot.actions.find((a) => a.actionId === actionId);
    if (!target) return;
    if (target.status === 'saved') {
      this.upsertAction({ ...target, status: 'saving' });
      try {
        await this.deps.remove(target);
      } catch (err) {
        this.upsertAction({ ...target, status: 'saved', error: err instanceof Error ? err.message : 'Could not delete this.' });
        return;
      }
      this.deps.onRecordsChanged?.();
    }
    if (this.snapshot.pending?.actionId === actionId) this.set({ pending: undefined });
    const actions = this.snapshot.actions.filter((a) => a.actionId !== actionId);
    this.set({
      actions,
      savedCount: actions.filter((a) => a.status === 'saved').length,
      confirmation: this.confirmationFor(actions.filter((a) => a.status === 'draft')),
    });
  }

  dismissAction(actionId: string): void {
    if (this.snapshot.pending?.actionId === actionId) this.set({ pending: undefined });
    const actions = this.snapshot.actions.filter((a) => a.actionId !== actionId);
    this.set({ actions, confirmation: this.confirmationFor(actions.filter((a) => a.status === 'draft')) });
  }

  // ─── Speech ─────────────────────────────────────────────────────────────────

  private async say(text: string): Promise<void> {
    if (!text || this.deps.isMuted()) return;
    const listener = this.listener;
    await listener?.pause();
    try {
      await this.deps.speak(text);
    } finally {
      await listener?.resume();
    }
  }
}

let instance: KaiSession | null = null;

export function getKaiSession(): KaiSession {
  if (!instance) instance = new KaiSession();
  return instance;
}

/**
 * What the voice session has just done, in one line each, for the chat window
 * to carry over. Without it, a question asked straight after speaking ("was
 * that too much?") arrives in chat with no idea what "that" was.
 */
export function kaiVoiceContext(limit = 5): string[] {
  const { actions } = getKaiSession().getSnapshot();
  return actions
    .filter((a) => a.status !== 'deleted' && a.kind !== 'clarify')
    .slice(-limit)
    .map((a) => {
      const amount = actionAmount(a);
      const state = a.status === 'saved' ? 'saved' : a.status === 'draft' ? 'waiting for confirmation' : a.status;
      return `${a.summary}${amount ? ` ${formatInr(amount)}` : ''} (${state})`;
    });
}

/** Test/reset hook — replaces the shared session. */
export function resetKaiSession(deps?: Partial<KaiSessionDeps>): KaiSession {
  instance = new KaiSession(deps);
  return instance;
}
