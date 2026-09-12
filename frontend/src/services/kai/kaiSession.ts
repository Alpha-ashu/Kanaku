/**
 * The Kai voice session: a small state machine around a continuous listener,
 * a strictly-ordered utterance queue, and the executed-action list the screen
 * renders as cards.
 *
 *   idle ─tap─► listening ⇄ processing → executing → completed ─► listening
 *          ◄─tap─ stopping (drains the queue, says the wrap-up)
 *
 * Utterances are processed one at a time, in order, so a correction always
 * sees the record it refers to. Corrections, clarification answers and card
 * edits all flow through `applyUpdate`, so voice and touch share one path.
 */
import type { KaiAction, KaiEntityPatch, KaiSessionContext } from '@kanaku/shared';
import { VoiceContextStore } from '@/services/voiceContextStore';
import { KaiListener, type KaiListenerCallbacks } from './kaiListener';
import { understandUtterance, type UnderstandResult } from './kaiUnderstandService';
import {
  actionOutflow,
  executeKaiAction,
  removeKaiAction,
  resolveDefaultAccount,
  updateKaiAction,
  type ExecutionContext,
} from './kaiActionExecutor';
import { isKaiMuted, speak } from './kaiSpeech';
import {
  applyPatch,
  describeAction,
  isRecordKind,
  toContextAction,
  type KaiActionKind,
  type KaiExecutedAction,
  type KaiState,
} from './kaiTypes';

export interface KaiPendingClarification {
  actionId: string;
  question: string;
  options: string[];
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
  savedCount: number;
  muted: boolean;
  wrapUp?: string;
}

export interface KaiSessionDeps {
  understand: typeof understandUtterance;
  execute: typeof executeKaiAction;
  update: typeof updateKaiAction;
  remove: typeof removeKaiAction;
  resolveAccount: (outflow?: number) => Promise<{ id?: number } | null>;
  speak: (text: string) => Promise<void>;
  isMuted: () => boolean;
  createListener: (callbacks: KaiListenerCallbacks) => Pick<KaiListener, 'begin' | 'end' | 'pause' | 'resume' | 'isActive'>;
  refreshContext: () => Promise<{ knownGoals: string[]; knownContacts: string[] }>;
  rememberActions: (actions: KaiExecutedAction[]) => void;
  onRecordsChanged?: () => void;
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  completedHoldMs?: number;
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

const defaultDeps = (): KaiSessionDeps => ({
  understand: understandUtterance,
  execute: executeKaiAction,
  update: updateKaiAction,
  remove: removeKaiAction,
  resolveAccount: resolveDefaultAccount,
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
  private userId: string | undefined;
  private known: { knownGoals: string[]; knownContacts: string[] } = { knownGoals: [], knownContacts: [] };

  constructor(deps: Partial<KaiSessionDeps> = {}) {
    this.deps = { ...defaultDeps(), ...deps };
    this.snapshot = this.restore();
  }

  // ─── Store API ──────────────────────────────────────────────────────────────

  subscribe = (fn: () => void): (() => void) => {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  };

  getSnapshot = (): KaiSessionSnapshot => this.snapshot;

  setUserId(userId?: string): void {
    this.userId = userId;
  }

  /** Called after any record is created, updated or deleted — the app refreshes its views. */
  setRecordsChangedHandler(handler?: () => void): void {
    this.deps.onRecordsChanged = handler;
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
      const stored = JSON.parse(raw) as Partial<KaiSessionSnapshot>;
      const actions = Array.isArray(stored.actions)
        ? stored.actions.map((a) => (a.status === 'saving' ? { ...a, status: 'failed' as const, error: 'Interrupted — tap retry' } : a))
        : [];
      return {
        ...base,
        sessionId: stored.sessionId || base.sessionId,
        seq: stored.seq ?? 0,
        actions,
        savedCount: actions.filter((a) => a.status === 'saved').length,
        pending: actions.find((a) => a.status === 'pending' && a.kind === 'clarify')
          ? this.pendingFrom(actions.filter((a) => a.status === 'pending' && a.kind === 'clarify').slice(-1)[0])
          : undefined,
      };
    } catch {
      return base;
    }
  }

  private persist(): void {
    try {
      this.deps.storage?.setItem(STORAGE_KEY, JSON.stringify({
        sessionId: this.snapshot.sessionId,
        seq: this.snapshot.seq,
        actions: this.snapshot.actions,
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
      onPartial: (text) => this.set({ liveTranscript: text }),
      onFinal: (text) => this.enqueue(text),
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
    this.set({ state: 'stopping', liveTranscript: '' });
    const listener = this.listener;
    this.listener = null;
    if (listener) await listener.end();
    await this.drain();
    const saved = this.snapshot.actions.filter((a) => a.status === 'saved').length;
    const wrapUp = saved > 0
      ? `Done. I've saved ${saved} update${saved === 1 ? '' : 's'}. Your records are up to date.`
      : "Okay, I've stopped listening.";
    this.set({ state: 'idle', engineListening: false, wrapUp, lastSay: wrapUp });
    await this.say(wrapUp);
    this.stopping = false;
  }

  /** Typed input takes the identical path as a spoken sentence. */
  submitText(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) return;
    this.enqueue(trimmed);
  }

  clear(): void {
    this.queue = [];
    this.set({
      sessionId: newId(),
      seq: 0,
      actions: [],
      savedCount: 0,
      pending: undefined,
      wrapUp: undefined,
      lastSay: '',
      lastTranscript: '',
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
    const seq = this.snapshot.seq + 1;
    this.set({ state: 'processing', seq, lastTranscript: text, error: undefined });

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
      const say = 'Nothing to record there — go ahead whenever you\'re ready.';
      this.set({ lastSay: say });
      await this.finishUtterance();
      return;
    }

    const touched: KaiExecutedAction[] = [];
    for (const action of understood.actions) {
      const result = await this.handleAction(action, seq);
      if (result) touched.push(result);
    }

    const saved = touched.filter((a) => a.status === 'saved');
    if (saved.length > 0) {
      this.deps.rememberActions(saved);
      this.deps.onRecordsChanged?.();
    }
    await this.finishUtterance();
  }

  private listenerState(): KaiState {
    if (this.stopping) return 'stopping';
    return this.listener?.isActive ? 'listening' : 'idle';
  }

  private async finishUtterance(): Promise<void> {
    if (this.stopping) return;
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

  private async handleAction(action: KaiAction, seq: number): Promise<KaiExecutedAction | null> {
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
      return this.runRecord(action, seq);
    }
    return null;
  }

  private async executionContext(action: Pick<KaiAction, 'kind' | 'entities'>): Promise<ExecutionContext> {
    const account = await this.deps.resolveAccount(actionOutflow(action));
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
    this.set({ actions, savedCount: actions.filter((a) => a.status === 'saved').length });
  }

  dismissAction(actionId: string): void {
    if (this.snapshot.pending?.actionId === actionId) this.set({ pending: undefined });
    const actions = this.snapshot.actions.filter((a) => a.actionId !== actionId);
    this.set({ actions });
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

/** Test/reset hook — replaces the shared session. */
export function resetKaiSession(deps?: Partial<KaiSessionDeps>): KaiSession {
  instance = new KaiSession(deps);
  return instance;
}
