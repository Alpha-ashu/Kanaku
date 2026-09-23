/**
 * Kai voice flow — one spoken request becomes one entry.
 *
 * Covers the acceptance criteria for the conversational fix: speech chunks are
 * combined before anything is understood, a group split is shown for
 * confirmation instead of being written, more names or a correction reshape the
 * draft rather than adding entries, and conversation moves to the chat window.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { KaiAction, KaiUnderstandRequest } from '@kanaku/shared';
import { KaiSession, type KaiSessionDeps } from '@/services/kai/kaiSession';
import type { KaiListenerCallbacks } from '@/services/kai/kaiListener';

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' } }));
vi.mock('@capacitor-community/speech-recognition', () => ({ SpeechRecognition: {} }));
vi.mock('@/lib/database', () => ({ db: {} }));
vi.mock('@/lib/api', () => ({ apiClient: {} }));
vi.mock('@/lib/backend-api', () => ({ backendService: {} }));
vi.mock('@/lib/auth-sync-integration', () => ({}));
vi.mock('@/lib/transactionAggregation', () => ({}));
vi.mock('@/services/aiTaskExecutor', () => ({}));
vi.mock('@/services/voiceFinancialService', () => ({ parseTranscriptLocally: () => ({ actions: [] }) }));
vi.mock('@/services/voiceContextStore', () => ({
  VoiceContextStore: { refresh: async () => ({ knownGoals: [], knownContacts: [] }), addRecentActions: () => undefined },
}));

const DINNER = 'We spent 4,396 rupees on dinner';
const NAMES = ['G Joe', 'Arun', 'Amala', 'Preeti', 'Prijit', 'Rajesh', 'and Sandeep'];
const FULL_REQUEST = `${DINNER}, G Joe, Arun, Amala, Preeti, Prijit, Rajesh and Sandeep`;

const action = (partial: Partial<KaiAction> & Pick<KaiAction, 'kind'>): KaiAction => ({
  actionId: '',
  rawSegment: '',
  entities: {},
  confidence: 0.95,
  requiresReview: false,
  ...partial,
});

const groupDinner = (members: string[], amount = 4396) => action({
  kind: 'group_expense',
  entities: { amount, description: 'Dinner', category: 'Food & Dining', members },
  say: `Got it — ₹${amount} dinner split with ${members.length} people.`,
});

/** understand() answers by transcript; anything unscripted is treated as conversation. */
const scripted = new Map<string, KaiAction[]>();

let listenerCallbacks: KaiListenerCallbacks | null = null;
const listener = {
  active: false,
  begin: vi.fn(async () => { listener.active = true; }),
  end: vi.fn(async () => { listener.active = false; }),
  pause: vi.fn(async () => undefined),
  resume: vi.fn(async () => undefined),
  get isActive() { return listener.active; },
};

type Deps = Partial<KaiSessionDeps> & {
  understand: ReturnType<typeof vi.fn>;
  execute: ReturnType<typeof vi.fn>;
  onConversation: ReturnType<typeof vi.fn>;
};

const AGGREGATOR = { pauseMs: 20, continuationMs: 60, maxHoldMs: 400 };

let d: Deps;

const deps = (): Deps => ({
  understand: vi.fn(async (req: KaiUnderstandRequest) => ({
    actions: (scripted.get(req.transcript) ?? []).map((a, i) => ({
      ...a,
      actionId: a.actionId || `kai:${req.sessionId}:${req.utteranceSeq}:${i}`,
      rawSegment: a.rawSegment || req.transcript,
    })),
    parser: 'gemini' as const,
    offline: false,
  })),
  execute: vi.fn(async (a: KaiAction) => ({
    refs: [{ table: 'transactions' as const, localId: 1 }],
    balanceDelta: { '1': -(a.entities.amount ?? 0) },
    entities: a.entities,
    say: `saved ${a.kind}`,
  })),
  update: vi.fn(async (target, patch) => ({
    refs: target.refs,
    balanceDelta: target.balanceDelta,
    entities: { ...target.entities, ...patch },
    say: 'updated',
  })),
  remove: vi.fn(async () => undefined),
  resolveAccount: async () => ({ id: 1 }),
  speak: vi.fn(async () => undefined),
  isMuted: () => false,
  createListener: (cb: KaiListenerCallbacks) => { listenerCallbacks = cb; return listener; },
  refreshContext: async () => ({ knownGoals: [], knownContacts: ['Arun', 'Amala', 'Preeti'] }),
  rememberActions: vi.fn(),
  onConversation: vi.fn((_transcript: string, _say?: string) => undefined),
  storage: null,
  completedHoldMs: 0,
  aggregator: AGGREGATOR,
  followUpMs: 30,
  followUpAnswerMs: 120,
});

/** Speak chunks the way an engine finalises them, with a gap shorter than the pause window. */
const speakChunks = async (chunks: string[]) => {
  for (const chunk of chunks) {
    listenerCallbacks?.onFinal(chunk);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

/**
 * Let the aggregator's window elapse, then wait for the session to come to
 * rest. The sleep matters: "listening with an empty queue" is also the state
 * before any speech has been released.
 */
const rest = async (session: KaiSession) => {
  await new Promise((resolve) => setTimeout(resolve, AGGREGATOR.continuationMs + 40));
  await vi.waitFor(() => {
    const s = session.getSnapshot();
    expect(s.queueLength).toBe(0);
    expect(['idle', 'listening', 'awaiting_confirmation', 'completed']).toContain(s.state);
  }, { timeout: 2000 });
};

describe('Kai voice flow', () => {
  let session: KaiSession;

  beforeEach(async () => {
    scripted.clear();
    listener.active = false;
    listenerCallbacks = null;
    d = deps();
    session = new KaiSession(d);
    await session.startListening();
  });

  it('Tests 1, 2 & 9 — a sentence and the names after it are understood once, as one request', async () => {
    scripted.set(FULL_REQUEST, [groupDinner(['G Joe', 'Arun', 'Amala', 'Preeti', 'Prijit', 'Rajesh', 'Sandeep'])]);

    await speakChunks([DINNER, ...NAMES]);
    await rest(session);

    expect(d.understand).toHaveBeenCalledTimes(1);
    expect(d.understand.mock.calls[0][0].transcript).toBe(FULL_REQUEST);
    // One entry, and nothing written before the user has seen it.
    const s = session.getSnapshot();
    expect(s.actions).toHaveLength(1);
    expect(s.actions[0]).toMatchObject({ kind: 'group_expense', status: 'draft' });
    expect(d.execute).not.toHaveBeenCalled();
  });

  it('Test 5 — a group split is confirmed before it is written, and only then', async () => {
    scripted.set(FULL_REQUEST, [groupDinner(['G Joe', 'Arun', 'Amala', 'Preeti', 'Prijit', 'Rajesh', 'Sandeep'])]);
    await speakChunks([DINNER, ...NAMES]);
    await rest(session);

    const s = session.getSnapshot();
    expect(s.state).toBe('awaiting_confirmation');
    expect(s.confirmation?.actionIds).toEqual([s.actions[0].actionId]);
    // Read back the numbers a person checks: the total and each head's share
    // (₹4,396 across the speaker + 7 named people).
    expect(s.confirmation?.question).toBe(
      'I understood this as ₹4,396 for Dinner with G Joe, Arun, Amala, Preeti, Prijit, Rajesh and Sandeep — ₹549.50 each. Shall I save it?',
    );
    expect(s.lastSay).toBe(s.confirmation?.question);

    await session.confirmDrafts();

    expect(d.execute).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot().actions[0]).toMatchObject({ kind: 'group_expense', status: 'saved' });
    expect(session.getSnapshot().confirmation).toBeUndefined();
    expect(session.getSnapshot().savedCount).toBe(1);
  });

  it('Test 5 — "yes" confirms by voice and "no" drops the draft without writing it', async () => {
    scripted.set(FULL_REQUEST, [groupDinner(['Arun'])]);
    await speakChunks([DINNER, ...NAMES]);
    await rest(session);

    await speakChunks(['yes']);
    await rest(session);
    expect(d.execute).toHaveBeenCalledTimes(1);

    // A second group request, refused this time.
    d.execute.mockClear();
    scripted.set('We spent 900 on lunch', [groupDinner(['Arun'], 900)]);
    await speakChunks(['We spent 900 on lunch']);
    await rest(session);
    expect(session.getSnapshot().actions.filter((a) => a.status === 'draft')).toHaveLength(1);

    await speakChunks(['no']);
    await rest(session);
    expect(d.execute).not.toHaveBeenCalled();
    expect(session.getSnapshot().actions.filter((a) => a.status === 'draft')).toHaveLength(0);
    expect(session.getSnapshot().actions.some((a) => a.entities.amount === 900)).toBe(false);
  });

  it('Test 6 — "add Preeti also" reshapes the draft instead of adding an entry', async () => {
    scripted.set(DINNER, [groupDinner(['Arun', 'Amala'])]);
    scripted.set(`${DINNER} add Preeti also`, [groupDinner(['Arun', 'Amala', 'Preeti'])]);

    await speakChunks([DINNER]);
    await rest(session);
    const draftId = session.getSnapshot().actions[0].actionId;

    await speakChunks(['add Preeti also']);
    await rest(session);

    const s = session.getSnapshot();
    expect(d.understand.mock.calls[1][0].transcript).toBe(`${DINNER} add Preeti also`);
    expect(s.actions).toHaveLength(1);
    // Same card, same id — the idempotency key the executor derives cannot drift.
    expect(s.actions[0].actionId).toBe(draftId);
    expect(s.actions[0].entities.members).toEqual(['Arun', 'Amala', 'Preeti']);
    expect(s.actions[0].status).toBe('draft');
    expect(d.execute).not.toHaveBeenCalled();
  });

  it('Test 3 — two spoken transactions become two entries, confirmed together', async () => {
    const sentence = 'I spent 2,000 on dinner and 500 on coffee';
    scripted.set(sentence, [
      action({ kind: 'expense', entities: { amount: 2000, description: 'Dinner', category: 'Food & Dining' } }),
      action({ kind: 'expense', entities: { amount: 500, description: 'Coffee', category: 'Food & Dining' } }),
    ]);

    await speakChunks([sentence]);
    await rest(session);
    expect(session.getSnapshot().actions.map((a) => a.status)).toEqual(['draft', 'draft']);

    await session.confirmDrafts();
    expect(d.execute).toHaveBeenCalledTimes(2);
    expect(d.execute.mock.calls.map((c) => c[0].entities.amount)).toEqual([2000, 500]);
  });

  it('keeps writing a plain, confident expense straight away', async () => {
    scripted.set('spent 200 on coffee', [action({
      kind: 'expense',
      entities: { amount: 200, description: 'Coffee', category: 'Food & Dining' },
      say: 'Done — ₹200 for coffee.',
    })]);

    await speakChunks(['spent 200 on coffee']);
    await rest(session);

    expect(d.execute).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot().actions[0].status).toBe('saved');
    expect(session.getSnapshot().confirmation).toBeUndefined();
  });

  it('Test 9 — confirming twice writes the entry once', async () => {
    scripted.set(DINNER, [groupDinner(['Arun'])]);
    await speakChunks([DINNER]);
    await rest(session);
    const id = session.getSnapshot().actions[0].actionId;

    await Promise.all([session.confirmAction(id), session.confirmAction(id)]);
    await session.confirmDrafts();

    expect(d.execute).toHaveBeenCalledTimes(1);
  });

  it('Test 7 — conversation moves to the chat window instead of being recorded', async () => {
    scripted.set('how can I save more next month', []);

    await speakChunks(['how can I save more next month']);
    await rest(session);

    expect(d.onConversation).toHaveBeenCalledWith('how can I save more next month');
    expect(d.execute).not.toHaveBeenCalled();
    expect(session.getSnapshot().actions).toHaveLength(0);
  });

  it('a greeting is not a reason to leave the voice screen', async () => {
    scripted.set('hello', []);

    await speakChunks(['hello']);
    await rest(session);

    expect(d.onConversation).not.toHaveBeenCalled();
    expect(session.getSnapshot().actions).toHaveLength(0);
  });

  it('a fresh request while a draft waits is not swallowed by it', async () => {
    scripted.set(DINNER, [groupDinner(['Arun'])]);
    scripted.set('I spent 300 on petrol', [action({ kind: 'expense', entities: { amount: 300, description: 'Petrol', category: 'Transport' } })]);

    await speakChunks([DINNER]);
    await rest(session);
    await speakChunks(['I spent 300 on petrol']);
    await rest(session);

    const s = session.getSnapshot();
    expect(s.actions.map((a) => [a.kind, a.status])).toEqual([
      ['group_expense', 'draft'],
      ['expense', 'saved'],
    ]);
    expect(d.understand.mock.calls[1][0].transcript).toBe('I spent 300 on petrol');
  });

  it('Test 8 — after a save Kai asks once whether there is anything else', async () => {
    scripted.set('spent 200 on coffee', [action({ kind: 'expense', entities: { amount: 200, description: 'Coffee' } })]);
    await speakChunks(['spent 200 on coffee']);
    await rest(session);

    await vi.waitFor(() => expect(session.getSnapshot().awaitingFollowUp).toBe(true));
    expect(session.getSnapshot().lastSay).toBe('Anything else?');
  });

  it('Test 8 — "no" to that question ends the session, "yes" keeps listening', async () => {
    scripted.set('spent 200 on coffee', [action({ kind: 'expense', entities: { amount: 200, description: 'Coffee' } })]);
    await speakChunks(['spent 200 on coffee']);
    await vi.waitFor(() => expect(session.getSnapshot().awaitingFollowUp).toBe(true));

    await speakChunks(['yes']);
    await rest(session);
    expect(listener.end).not.toHaveBeenCalled();
    expect(session.getSnapshot().awaitingFollowUp).toBe(false);

    // Kai asks again after the next save, and "no" finishes the session.
    scripted.set('spent 50 on tea', [action({ kind: 'expense', entities: { amount: 50, description: 'Tea' } })]);
    await speakChunks(['spent 50 on tea']);
    await vi.waitFor(() => expect(session.getSnapshot().awaitingFollowUp).toBe(true));
    await speakChunks(['no']);
    await rest(session);

    expect(listener.end).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot().state).toBe('idle');
    expect(session.getSnapshot().wrapUp).toContain('saved 2 updates');
  });

  it('does not ask "anything else?" while a draft is still waiting', async () => {
    scripted.set(DINNER, [groupDinner(['Arun'])]);
    await speakChunks([DINNER]);
    await rest(session);
    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(session.getSnapshot().awaitingFollowUp).toBeFalsy();
    expect(session.getSnapshot().state).toBe('awaiting_confirmation');
  });

  it('refusing a draft asks again, so the next "no" ends the session', async () => {
    scripted.set(DINNER, [groupDinner(['Arun'])]);
    await speakChunks([DINNER]);
    await rest(session);

    await speakChunks(['no']);
    await rest(session);
    // The entry was refused, not written, and the session is still going.
    expect(d.execute).not.toHaveBeenCalled();
    expect(listener.end).not.toHaveBeenCalled();

    await vi.waitFor(() => expect(session.getSnapshot().awaitingFollowUp).toBe(true));
    await speakChunks(['no']);
    await rest(session);
    expect(listener.end).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot().state).toBe('idle');
  });

  it('does not ask "anything else?" over someone who is still talking', async () => {
    // Windows chosen so the question falls due while words are still buffered.
    const talker = new KaiSession({
      ...d,
      aggregator: { pauseMs: 5000, continuationMs: 5000, maxHoldMs: 9000 },
      followUpMs: 300,
    });
    await talker.startListening();
    scripted.set('spent 200 on coffee', [action({ kind: 'expense', entities: { amount: 200, description: 'Coffee' } })]);
    talker.submitText('spent 200 on coffee');
    await vi.waitFor(() => expect(talker.getSnapshot().actions[0]?.status).toBe('saved'));

    listenerCallbacks?.onFinal('and I spent 4,396 rupees');
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(talker.getSnapshot().awaitingFollowUp).toBeFalsy();
    expect(talker.getSnapshot().liveTranscript).toContain('4,396');
  });

  it('a "no" long after the question is a fresh utterance, not an answer to it', async () => {
    scripted.set('spent 200 on coffee', [action({ kind: 'expense', entities: { amount: 200, description: 'Coffee' } })]);
    scripted.set('no', []);
    await speakChunks(['spent 200 on coffee']);
    await vi.waitFor(() => expect(session.getSnapshot().awaitingFollowUp).toBe(true));

    // The window for answering that question passes.
    await vi.waitFor(() => expect(session.getSnapshot().awaitingFollowUp).toBe(false), { timeout: 2000 });

    await speakChunks(['no']);
    await rest(session);
    expect(listener.end).not.toHaveBeenCalled();
    expect(session.getSnapshot().state).not.toBe('idle');
  });

  it('tapping stop processes speech that was still buffered', async () => {
    scripted.set('I spent 4,396 rupees', [action({ kind: 'expense', entities: { amount: 4396 } })]);
    listenerCallbacks?.onFinal('I spent 4,396 rupees');
    expect(d.understand).not.toHaveBeenCalled();

    await session.stop();

    expect(d.understand).toHaveBeenCalledTimes(1);
    expect(d.understand.mock.calls[0][0].transcript).toBe('I spent 4,396 rupees');
  });
});
