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
vi.mock('@/services/voiceContextStore', () => ({ VoiceContextStore: { refresh: async () => ({ knownGoals: [], knownContacts: [] }), addRecentActions: () => undefined } }));

const scripted = new Map<string, KaiAction[]>();
const action = (id: string, partial: Partial<KaiAction> & Pick<KaiAction, 'kind'>): KaiAction => ({
  actionId: id,
  rawSegment: '',
  entities: {},
  confidence: 0.95,
  requiresReview: false,
  ...partial,
});

let listenerCallbacks: KaiListenerCallbacks | null = null;
const listener = {
  active: false,
  begin: vi.fn(async () => { listener.active = true; }),
  end: vi.fn(async () => { listener.active = false; }),
  pause: vi.fn(async () => undefined),
  resume: vi.fn(async () => undefined),
  get isActive() { return listener.active; },
};

const deps = (): Partial<KaiSessionDeps> & { execute: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn>; understand: ReturnType<typeof vi.fn> } => ({
  understand: vi.fn(async (req: KaiUnderstandRequest) => ({
    actions: (scripted.get(req.transcript) ?? []).map((a, i) => ({ ...a, actionId: a.actionId || `kai:${req.sessionId}:${req.utteranceSeq}:${i}` })),
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
  isMuted: () => true,
  createListener: (cb: KaiListenerCallbacks) => { listenerCallbacks = cb; return listener; },
  refreshContext: async () => ({ knownGoals: ['Bike'], knownContacts: ['Arun'] }),
  rememberActions: vi.fn(),
  storage: null,
  completedHoldMs: 0,
});

const settled = (session: KaiSession) =>
  vi.waitFor(() => {
    const s = session.getSnapshot();
    expect(s.queueLength).toBe(0);
    expect(['idle', 'listening']).toContain(s.state);
  });

describe('KaiSession', () => {
  let d: ReturnType<typeof deps>;
  let session: KaiSession;

  beforeEach(() => {
    scripted.clear();
    listener.active = false;
    listenerCallbacks = null;
    d = deps();
    session = new KaiSession(d);
  });

  it('records a spoken expense and returns to idle', async () => {
    scripted.set('spent 2000 on petrol', [action('', { kind: 'expense', entities: { amount: 2000, description: 'Petrol' }, say: 'Done — ₹2,000 for petrol.' })]);
    session.submitText('spent 2000 on petrol');
    await settled(session);

    const s = session.getSnapshot();
    expect(d.understand).toHaveBeenCalledTimes(1);
    expect(d.understand.mock.calls[0][0]).toMatchObject({ utteranceSeq: 1, context: { knownGoals: [], recentActions: [] } });
    expect(s.actions).toHaveLength(1);
    expect(s.actions[0]).toMatchObject({ kind: 'expense', status: 'saved', summary: 'Petrol', actionId: `kai:${s.sessionId}:1:0` });
    expect(s.savedCount).toBe(1);
    expect(d.rememberActions).toHaveBeenCalledTimes(1);
  });

  it('processes utterances strictly in order and passes earlier actions as context', async () => {
    scripted.set('one', [action('', { kind: 'expense', entities: { amount: 100, description: 'One' } })]);
    scripted.set('two', [action('', { kind: 'loan_borrow', entities: { amount: 3000, person: 'Arun' } })]);
    session.submitText('one');
    session.submitText('two');
    await settled(session);

    expect(d.execute.mock.calls.map((c) => c[0].kind)).toEqual(['expense', 'loan_borrow']);
    const secondContext = d.understand.mock.calls[1][0].context;
    expect(secondContext.recentActions[0]).toMatchObject({ summary: 'One', amount: 100, status: 'saved' });
  });

  it('holds a clarification as pending and finalises it from a tapped option', async () => {
    scripted.set('spent 5000 with Jijo', [action('', {
      kind: 'clarify',
      entities: {
        amount: 5000,
        description: 'With Jijo',
        question: 'Shared or personal?',
        options: [
          { label: 'Shared with Jijo', patch: { kind: 'group_expense', members: ['Jijo'] } },
          { label: 'My personal expense', patch: { kind: 'expense', expenseMode: 'individual' } },
        ],
      },
    })]);
    session.submitText('spent 5000 with Jijo');
    await settled(session);

    let s = session.getSnapshot();
    expect(s.pending).toMatchObject({ question: 'Shared or personal?', options: ['Shared with Jijo', 'My personal expense'] });
    expect(d.execute).not.toHaveBeenCalled();

    await session.answerClarification(s.pending!.actionId, 0);
    await settled(session);
    s = session.getSnapshot();
    expect(s.pending).toBeUndefined();
    expect(d.execute).toHaveBeenCalledTimes(1);
    expect(d.execute.mock.calls[0][0]).toMatchObject({ kind: 'group_expense', actionId: s.actions[0].actionId, entities: { amount: 5000, members: ['Jijo'] } });
    expect(s.actions[0].status).toBe('saved');
  });

  it('answers a pending clarification from speech via update_previous', async () => {
    scripted.set('spent 5000 with Jijo', [action('', {
      kind: 'clarify',
      entities: { amount: 5000, question: 'Shared or personal?', options: [{ label: 'Shared with Jijo', patch: { kind: 'group_expense', members: ['Jijo'] } }] },
    })]);
    session.submitText('spent 5000 with Jijo');
    await settled(session);
    const pendingId = session.getSnapshot().pending!.actionId;

    scripted.set('shared', [action('', { kind: 'update_previous', entities: { targetActionId: pendingId, patch: { kind: 'group_expense', members: ['Jijo'] } } })]);
    session.submitText('shared');
    await settled(session);

    expect(d.understand.mock.calls[1][0].context.pendingClarification).toMatchObject({ actionId: pendingId });
    expect(d.execute).toHaveBeenCalledTimes(1);
    expect(d.execute.mock.calls[0][0].kind).toBe('group_expense');
    expect(session.getSnapshot().pending).toBeUndefined();
  });

  it('resolves a spoken answer that only echoes an option label (no chosenOption from the model)', async () => {
    scripted.set('spent 5000 with Jijo', [action('', {
      kind: 'clarify',
      entities: {
        amount: 5000,
        question: 'Shared or personal?',
        options: [
          { label: 'Shared with Jijo', patch: { kind: 'group_expense', members: ['Jijo'] } },
          { label: 'My personal expense', patch: { kind: 'expense', expenseMode: 'individual' } },
        ],
      },
    })]);
    session.submitText('spent 5000 with Jijo');
    await settled(session);
    const pendingId = session.getSnapshot().pending!.actionId;

    // The model echoed the label into description instead of picking the option.
    scripted.set('shared with jijo please', [action('', { kind: 'update_previous', rawSegment: 'shared with jijo please', entities: { targetActionId: pendingId, patch: { description: 'Shared with Jijo' } } })]);
    session.submitText('shared with jijo please');
    await settled(session);

    expect(d.execute).toHaveBeenCalledTimes(1);
    expect(d.execute.mock.calls[0][0]).toMatchObject({ kind: 'group_expense', entities: { amount: 5000, members: ['Jijo'] } });
    expect(d.execute.mock.calls[0][0].entities.description).toBeUndefined();
  });

  it('expands chosenOption into that option\'s patch', async () => {
    scripted.set('spent 5000 with Jijo', [action('', {
      kind: 'clarify',
      entities: { amount: 5000, question: 'Shared or personal?', options: [{ label: 'Shared with Jijo', patch: { kind: 'group_expense', members: ['Jijo'] } }, { label: 'My personal expense', patch: { kind: 'expense', expenseMode: 'individual' } }] },
    })]);
    session.submitText('spent 5000 with Jijo');
    await settled(session);
    const pendingId = session.getSnapshot().pending!.actionId;

    scripted.set('the second one', [action('', { kind: 'update_previous', rawSegment: 'the second one', entities: { targetActionId: pendingId, patch: { chosenOption: 2 } } })]);
    session.submitText('the second one');
    await settled(session);

    expect(d.execute.mock.calls[0][0]).toMatchObject({ kind: 'expense', entities: { amount: 5000, expenseMode: 'individual' } });
  });

  it('refreshes the earlier goal card after a goal update', async () => {
    scripted.set('create a bike goal for 150000', [action('', { kind: 'goal', entities: { goalName: 'Bike', targetAmount: 150000, amount: 150000 } })]);
    scripted.set('set the target date to december 31st 2026', [action('', { kind: 'goal_update', entities: { goalName: 'Bike', targetDate: '2026-12-31' } })]);
    session.submitText('create a bike goal for 150000');
    session.submitText('set the target date to december 31st 2026');
    await settled(session);
    const [goal, update] = session.getSnapshot().actions;
    expect(update).toMatchObject({ kind: 'goal_update', status: 'saved' });
    expect(goal.entities.targetDate).toBe('2026-12-31');
  });

  it('applies a spoken correction to the previous saved record', async () => {
    scripted.set('spent 5000 with Jijo personally', [action('', { kind: 'expense', entities: { amount: 5000, description: 'With Jijo' } })]);
    session.submitText('spent 5000 with Jijo personally');
    await settled(session);
    const savedId = session.getSnapshot().actions[0].actionId;

    scripted.set('actually make it 4500', [action('', { kind: 'update_previous', entities: { targetActionId: savedId, patch: { amount: 4500 } } })]);
    session.submitText('actually make it 4500');
    await settled(session);

    expect(d.update).toHaveBeenCalledTimes(1);
    expect(d.update.mock.calls[0][1]).toEqual({ amount: 4500 });
    expect(session.getSnapshot().actions[0].entities.amount).toBe(4500);
  });

  it('shows query answers inline without executing anything', async () => {
    scripted.set('what is my food budget', [action('', { kind: 'query', entities: { queryType: 'BUDGET_STATUS' }, answer: { summary: 'Food: ₹2,000 of ₹8,000' } })]);
    session.submitText('what is my food budget');
    await settled(session);
    const s = session.getSnapshot();
    expect(s.actions[0]).toMatchObject({ status: 'answered', answer: { summary: 'Food: ₹2,000 of ₹8,000' } });
    expect(d.execute).not.toHaveBeenCalled();
  });

  it('marks a failed save and lets it be retried', async () => {
    scripted.set('spent 200 on tea', [action('', { kind: 'expense', entities: { amount: 200, description: 'Tea' } })]);
    d.execute.mockRejectedValueOnce(new Error('Add an account first'));
    session.submitText('spent 200 on tea');
    await settled(session);
    let s = session.getSnapshot();
    expect(s.actions[0]).toMatchObject({ status: 'failed', error: 'Add an account first' });

    await session.retryAction(s.actions[0].actionId);
    s = session.getSnapshot();
    expect(s.actions[0].status).toBe('saved');
    expect(d.execute).toHaveBeenCalledTimes(2);
  });

  it('deletes a saved record through the executor and drops the card', async () => {
    scripted.set('spent 200 on tea', [action('', { kind: 'expense', entities: { amount: 200, description: 'Tea' } })]);
    session.submitText('spent 200 on tea');
    await settled(session);
    const id = session.getSnapshot().actions[0].actionId;
    await session.deleteAction(id);
    expect(d.remove).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot().actions).toHaveLength(0);
  });

  it('runs a full tap-to-talk session and wraps up on the second tap', async () => {
    scripted.set('spent 2000 on petrol', [action('', { kind: 'expense', entities: { amount: 2000, description: 'Petrol' } })]);
    await session.toggleListening();
    expect(listener.begin).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot().state).toBe('listening');

    listenerCallbacks!.onPartial('spent 2000');
    expect(session.getSnapshot().liveTranscript).toBe('spent 2000');
    listenerCallbacks!.onFinal('spent 2000 on petrol');
    await settled(session);
    expect(session.getSnapshot().actions[0].status).toBe('saved');
    expect(session.getSnapshot().state).toBe('listening');

    await session.toggleListening();
    expect(listener.end).toHaveBeenCalledTimes(1);
    const s = session.getSnapshot();
    expect(s.state).toBe('idle');
    expect(s.wrapUp).toContain('saved 1 update');
  });

  it("never restores or shows another account's cards", async () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    };
    scripted.set('spent 2000 on petrol', [action('', { kind: 'expense', entities: { amount: 2000, description: 'Petrol' } })]);

    const first = new KaiSession({ ...deps(), storage });
    first.setUserId('user-a');
    first.submitText('spent 2000 on petrol');
    await settled(first);
    expect(first.getSnapshot().actions).toHaveLength(1);

    // Same tab, same account after a reload: the cards come back.
    const reloaded = new KaiSession({ ...deps(), storage });
    reloaded.setUserId('user-a');
    expect(reloaded.getSnapshot().actions).toHaveLength(1);

    // A different account signs in on that tab: nothing of user-a's survives.
    const other = new KaiSession({ ...deps(), storage });
    other.setUserId('user-b');
    expect(other.getSnapshot().actions).toHaveLength(0);
    expect(JSON.parse(store.get('KANAKU_kai_session')!)).toMatchObject({ ownerId: 'user-b', actions: [] });
  });
});
