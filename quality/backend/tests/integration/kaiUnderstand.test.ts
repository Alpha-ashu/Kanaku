/**
 * Unit tests for the Kai understanding layer — the pure pieces that do not
 * need an LLM or a database: Indian amount parsing, spoken dates, action
 * normalisation (incl. clarify fallbacks and context resolution), query
 * parameter mapping and the prompt's context block.
 */
import { extractIndianAmounts, parseIndianAmount, stripIndianAmounts } from '../../../../backend/src/features/ai/indian-number';
import { normaliseDateInput, toQueryParams } from '../../../../backend/src/features/ai/financial-query-engine';
import { makeActionId, matchClarificationOption, normaliseKaiAction, offlineActions, parseActions, parseSpokenDate } from '../../../../backend/src/features/kai/kai.nlp';
import { isTransientLLMError } from '../../../../backend/src/features/ai/chat.llm';
import { buildKaiPrompt } from '../../../../backend/src/features/kai/kai.prompt';
import type { KaiSessionContext } from '../../../../packages/shared';

const THRESHOLD = 0.7;

const isoPlusDays = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const context: KaiSessionContext = {
  recentActions: [
    { actionId: 'kai:s1:3:0', kind: 'expense', summary: 'Spent with Jijo', amount: 5000, person: 'Jijo', status: 'saved' },
    { actionId: 'kai:s1:2:0', kind: 'goal', summary: 'Bike goal', amount: 150000, goalName: 'Bike', status: 'saved' },
    { actionId: 'kai:s1:1:0', kind: 'expense', summary: 'Petrol', amount: 2000, status: 'saved' },
  ],
  knownGoals: ['Bike', 'Emergency fund'],
  knownContacts: ['Arun', 'Jijo', 'Prijith'],
};

describe('Indian amount parsing', () => {
  it.each([
    ['I spent 2,000 rupees on petrol', 2000],
    ['spent two thousand rupees', 2000],
    ['one lakh fifty thousand', 150000],
    ['1.5 lakh for the bike', 150000],
    ['one lakh fifty', 150000],
    ['create a goal for 2k', 2000],
    ['5 hazaar petrol', 5000],
    ['two thousand five hundred', 2500],
    ['dedh sau chai', 150],
    ['2 crore house', 20000000],
    ['three thousand', 3000],
  ])('%s → %d', (text, expected) => {
    expect(parseIndianAmount(text)).toBe(expected);
  });

  it('returns every amount in order', () => {
    expect(extractIndianAmounts('spent 500 on petrol and 3499 for dinner').map((a) => a.value)).toEqual([500, 3499]);
  });

  it('returns undefined when there is no amount', () => {
    expect(parseIndianAmount('remind me to pay bike insurance tomorrow')).toBeUndefined();
    // English words that double as Hindi numerals must not become amounts.
    expect(parseIndianAmount('How much do I owe Arun?')).toBeUndefined();
    expect(parseIndianAmount('a teen char das')).toBeUndefined();
  });

  it('strips amount phrases for title extraction', () => {
    expect(stripIndianAmounts('spent 2000 rupees on petrol')).toBe('spent on petrol');
  });
});

describe('Spoken dates', () => {
  it('parses month-day-year in both orders', () => {
    expect(parseSpokenDate('set the target date to December 31st 2026')).toBe('2026-12-31');
    expect(parseSpokenDate('by 31 December 2026')).toBe('2026-12-31');
  });

  it('parses relative days', () => {
    expect(parseSpokenDate('pay bike insurance tomorrow')).toBe(isoPlusDays(1));
    expect(parseSpokenDate('I bought it yesterday')).toBe(isoPlusDays(-1));
  });

  it('normalises "tomorrow" as a date input', () => {
    expect(normaliseDateInput('tomorrow')).toBe(isoPlusDays(1));
    expect(normaliseDateInput('2026-12-31')).toBe('2026-12-31');
    expect(normaliseDateInput('someday')).toBeUndefined();
  });
});

describe('normaliseKaiAction', () => {
  it('keeps a confident expense with its amount', () => {
    const a = normaliseKaiAction({ kind: 'expense', amount: 2000, category: 'Transport', description: 'Petrol', confidence: 0.97 }, 'spent 2000 on petrol', undefined, THRESHOLD);
    expect(a).toMatchObject({ kind: 'expense', requiresReview: false, entities: { amount: 2000, category: 'Transport', description: 'Petrol' } });
  });

  it('turns a money action without an amount into a clarify, never an expense', () => {
    const a = normaliseKaiAction({ kind: 'expense', description: 'petrol' }, 'spent on petrol', undefined, THRESHOLD);
    expect(a?.kind).toBe('clarify');
    expect(a?.entities.question).toMatch(/how much/i);
  });

  it('turns a low-confidence money action into a clarify with a confirm option', () => {
    const a = normaliseKaiAction({ kind: 'expense', amount: 500, confidence: 0.4 }, 'five hundred something', undefined, THRESHOLD);
    expect(a?.kind).toBe('clarify');
    expect(a?.entities.options?.[0].patch.kind).toBe('expense');
  });

  it('asks who for loans without a person and group expenses without members', () => {
    expect(normaliseKaiAction({ kind: 'loan_borrow', amount: 3000 }, 'borrowed 3000', undefined, THRESHOLD)?.entities.question).toMatch(/borrow it from/i);
    expect(normaliseKaiAction({ kind: 'group_expense', amount: 4000 }, 'dinner 4000', undefined, THRESHOLD)?.entities.question).toMatch(/shared with/i);
  });

  it('accepts a todo without any amount', () => {
    const a = normaliseKaiAction({ kind: 'todo', title: 'pay bike insurance', dueDate: 'tomorrow' }, 'remind me…', undefined, THRESHOLD);
    expect(a).toMatchObject({ kind: 'todo', entities: { title: 'Pay bike insurance', dueDate: isoPlusDays(1), priority: 'medium' } });
  });

  it('resolves goal_update against the most recent goal in context', () => {
    const a = normaliseKaiAction({ kind: 'goal_update', targetDate: '2026-12-31' }, 'set the target date', context, THRESHOLD);
    expect(a).toMatchObject({ kind: 'goal_update', entities: { goalName: 'Bike', targetDate: '2026-12-31' } });
  });

  it('matches a goal_update name against known goals case-insensitively', () => {
    const a = normaliseKaiAction({ kind: 'goal_update', goalName: 'emergency fund', targetAmount: 200000 }, '…', context, THRESHOLD);
    expect(a?.entities.goalName).toBe('Emergency fund');
  });

  it('resolves update_previous "last" to the newest action and validates ids', () => {
    const last = normaliseKaiAction({ kind: 'update_previous', targetActionId: 'last', patch: { amount: 4500 } }, 'make it 4500', context, THRESHOLD);
    expect(last).toMatchObject({ kind: 'update_previous', entities: { targetActionId: 'kai:s1:3:0', patch: { amount: 4500 } } });

    const unknown = normaliseKaiAction({ kind: 'update_previous', targetActionId: 'kai:nope', patch: { amount: 1 } }, '…', context, THRESHOLD);
    expect(unknown?.kind).toBe('clarify');
  });

  it('prefers the pending clarification as the target when one is open', () => {
    const withPending: KaiSessionContext = {
      ...context,
      pendingClarification: { actionId: 'kai:s1:4:0', question: 'Shared or personal?', options: ['Shared with Jijo', 'My personal expense'] },
    };
    const a = normaliseKaiAction({ kind: 'update_previous', targetActionId: 'last', patch: { kind: 'group_expense', members: ['Jijo'] } }, 'shared', withPending, THRESHOLD);
    expect(a?.entities.targetActionId).toBe('kai:s1:4:0');
    expect(a?.entities.patch).toEqual({ kind: 'group_expense', members: ['Jijo'] });
  });

  it('keeps a budget as a limit with a monthly default period', () => {
    const a = normaliseKaiAction({ kind: 'budget', category: 'Food & Dining', amount: 3000, confidence: 0.95 }, 'set a food budget of 3000', undefined, THRESHOLD);
    expect(a).toMatchObject({ kind: 'budget', requiresReview: false, entities: { category: 'Food & Dining', amount: 3000, period: 'monthly' } });
  });

  it('asks for a missing budget limit or category and keeps the answer a budget', () => {
    const noLimit = normaliseKaiAction({ kind: 'budget', category: 'Shopping', period: 'weekly' }, 'shopping budget', undefined, THRESHOLD);
    expect(noLimit).toMatchObject({ kind: 'clarify', entities: { category: 'Shopping', period: 'weekly', patch: { kind: 'budget' } } });
    expect(noLimit?.entities.question).toMatch(/weekly limit/i);

    const noCategory = normaliseKaiAction({ kind: 'budget', amount: 5000 }, 'set a budget of 5000', undefined, THRESHOLD);
    expect(noCategory).toMatchObject({ kind: 'clarify', entities: { amount: 5000, patch: { kind: 'budget' } } });
  });

  it('keeps a goal clarification a goal once the target amount is answered', () => {
    const a = normaliseKaiAction({ kind: 'goal', goalName: 'bike' }, 'create a bike goal', undefined, THRESHOLD);
    expect(a).toMatchObject({ kind: 'clarify', entities: { goalName: 'bike', patch: { kind: 'goal' } } });
  });

  it('passes queries through with an upper-cased type', () => {
    const a = normaliseKaiAction({ kind: 'query', queryType: 'budget_status', category: 'Food & Dining' }, 'food budget', undefined, THRESHOLD);
    expect(a).toMatchObject({ kind: 'query', entities: { queryType: 'BUDGET_STATUS', category: 'Food & Dining' } });
  });

  it('carries clarify questions and options through', () => {
    const a = normaliseKaiAction({
      kind: 'clarify',
      amount: 5000,
      question: 'Shared with Jijo or personal?',
      options: [{ label: 'Shared with Jijo', patch: { kind: 'group_expense', members: ['Jijo'] } }, { label: 'My personal expense', patch: { kind: 'expense', expenseMode: 'individual' } }],
    }, 'spent 5000 with Jijo', undefined, THRESHOLD);
    expect(a?.kind).toBe('clarify');
    expect(a?.entities.amount).toBe(5000);
    expect(a?.entities.options).toHaveLength(2);
    expect(a?.entities.options?.[1].patch.expenseMode).toBe('individual');
  });

  it('drops unknown kinds into a clarify instead of guessing an expense', () => {
    expect(normaliseKaiAction({ kind: 'teleport', amount: 100 }, '…', undefined, THRESHOLD)?.kind).toBe('clarify');
  });
});

describe('offline heuristics', () => {
  it('asks before recording a single-companion spend', () => {
    const [a] = offlineActions('I spent 5,000 with Jijo', undefined, THRESHOLD);
    expect(a.kind).toBe('clarify');
    expect(a.entities.amount).toBe(5000);
    expect(a.entities.options?.map((o) => o.patch.kind)).toEqual(['group_expense', 'expense']);
    expect(a.entities.options?.[0].patch.members).toEqual(['Jijo']);
  });

  it('keeps an explicit split as a group expense', () => {
    const [a] = offlineActions('split 3000 with Arun', undefined, THRESHOLD);
    expect(a.kind).toBe('group_expense');
  });

  it('answers questions as queries', () => {
    expect(offlineActions('How much do I owe Arun?', undefined, THRESHOLD)[0]).toMatchObject({ kind: 'query', entities: { queryType: 'PERSON_BALANCE', person: 'Arun' } });
    expect(offlineActions('What is my total expense this month?', undefined, THRESHOLD)[0]).toMatchObject({ kind: 'query', entities: { queryType: 'SUM_EXPENSES' } });
  });

  it('reads a spoken budget as a budget, not an expense', () => {
    expect(offlineActions('Set a food budget of 8000', undefined, THRESHOLD)[0]).toMatchObject({ kind: 'budget', entities: { amount: 8000, period: 'monthly' } });
    expect(offlineActions('create a weekly shopping budget of 2k', undefined, THRESHOLD)[0]).toMatchObject({ kind: 'budget', entities: { amount: 2000, period: 'weekly' } });
  });

  it('resolves a spoken answer to a pending question', () => {
    const withPending: KaiSessionContext = {
      ...context,
      pendingClarification: { actionId: 'kai:s1:4:0', question: 'Shared or personal?', options: ['Shared with Jijo', 'My personal expense'] },
    };
    expect(offlineActions('shared', withPending, THRESHOLD)[0]).toMatchObject({ kind: 'update_previous', entities: { targetActionId: 'kai:s1:4:0', patch: { chosenOption: 1 } } });
    expect(offlineActions('the second one', withPending, THRESHOLD)[0].entities.patch).toEqual({ chosenOption: 2 });
    expect(matchClarificationOption('personal please', ['Shared with Jijo', 'My personal expense'])).toBe(1);
    expect(matchClarificationOption('spent 200 on tea', ['Shared with Jijo', 'My personal expense'])).toBe(-1);
  });
});

describe('toQueryParams', () => {
  it('maps a known query and its dates', () => {
    const p = toQueryParams({ queryType: 'EXPENSE_REPORT', startDate: '2026-08-01', endDate: '2026-08-31' });
    expect(p.intent).toBe('EXPENSE_REPORT');
    expect(p.startDate?.toISOString().slice(0, 10)).toBe('2026-08-01');
    expect(p.endDate?.getHours()).toBe(23);
  });

  it('falls back to SUM_EXPENSES for unknown types', () => {
    expect(toQueryParams({ queryType: 'WHATEVER' }).intent).toBe('SUM_EXPENSES');
  });
});

describe('buildKaiPrompt', () => {
  it('embeds the session context and pending question', () => {
    const prompt = buildKaiPrompt('make it 4500', {
      ...context,
      pendingClarification: { actionId: 'kai:s1:4:0', question: 'Shared or personal?', options: ['Shared', 'Personal'] },
    }, '', '2026-09-12');
    expect(prompt).toContain('kai:s1:3:0');
    expect(prompt).toContain('PENDING QUESTION');
    expect(prompt).toContain('Known people: Arun, Jijo, Prijith');
    expect(prompt).toContain('TODAY: 2026-09-12');
  });

  it('says so when there is no context', () => {
    expect(buildKaiPrompt('hi', undefined, '', '2026-09-12')).toContain('SESSION CONTEXT: (none');
  });
});

describe('LLM output handling', () => {
  it('parses fenced, wrapped, bare-array and prose-wrapped JSON', () => {
    expect(parseActions('```json\n{"actions":[{"kind":"expense","amount":1}]}\n```')).toHaveLength(1);
    expect(parseActions('[{"kind":"todo","title":"x"}]')).toHaveLength(1);
    expect(parseActions('Sure! {"actions":[{"kind":"query","queryType":"SUM_EXPENSES"}]} Let me know.')).toHaveLength(1);
    expect(parseActions('{"actions":[{"kind":"expense","amount":1,},]}')).toHaveLength(1);
    expect(parseActions('not json at all')).toEqual([]);
  });

  it('recognises transient provider errors worth one retry', () => {
    expect(isTransientLLMError('[503 ] This model is currently experiencing high demand.')).toBe(true);
    expect(isTransientLLMError('Groq API error 429: rate limit')).toBe(true);
    expect(isTransientLLMError('API key not valid')).toBe(false);
  });
});

describe('makeActionId', () => {
  it('is deterministic per session, utterance and index', () => {
    expect(makeActionId('abc', 4, 1)).toBe('kai:abc:4:1');
  });
});
