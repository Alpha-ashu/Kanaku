/**
 * Pure tests for the AI layer's decision code — no LLM, no database:
 *
 *  - the Gemini model ladder and quota cooldowns (a free-tier key allows 20
 *    requests a day per model; without cooldowns every request paid a failing
 *    call and silently fell back to the regex parser);
 *  - the insight agents, which used to count deleted transactions, flag salary
 *    credits as fraud and score money the user lent as debt;
 *  - the offline chat/KAI parsers that answer whenever no model is available.
 */
import {
  classifyLLMError,
  geminiModelLadder,
  isGeminiModelCoolingDown,
  noteGeminiFailure,
  resetGeminiCooldowns,
  resolveGeminiModel,
} from '../../../../backend/src/features/ai/gemini.models';
import {
  analyseBudgets,
  analyseGoals,
  detectUnusualExpenses,
  predictBills,
  scoreFinancialHealth,
  type AgentData,
} from '../../../../backend/src/features/ai/agents';
import { classifyOffline } from '../../../../backend/src/features/ai/chat.controller';
import { normaliseKaiAction, offlineActions } from '../../../../backend/src/features/kai/kai.nlp';
import { parseSpokenDate } from '../../../../backend/src/features/ai/spoken-date';

const NOW = new Date('2026-09-17T06:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);

let seq = 0;
const tx = (type: string, amount: number, category: string, daysAgo: number, extra: Partial<AgentData['transactions'][number]> = {}) => ({
  id: `t${(seq += 1)}`,
  type,
  amount,
  category,
  merchant: null,
  description: null,
  date: ago(daysAgo),
  ...extra,
});

const data = (overrides: Partial<AgentData> = {}): AgentData => ({
  now: NOW,
  transactions: [],
  goals: [],
  debts: [],
  lentOutstanding: 0,
  budgets: [],
  recurring: [],
  investedValue: 0,
  baseline: { monthlyIncome: 0, incomeSource: 'none', transactionMonthlyIncome: 0, declaredMonthlyIncome: 0, totalBalance: 100000 },
  ...overrides,
});

/** Four months of an ordinary salaried user, oldest first. */
const history = () => {
  const rows = [];
  for (let m = 3; m >= 0; m -= 1) {
    rows.push(tx('income', 85000, 'Salary', m * 30 + 1, { merchant: 'Acme Corp' }));
    rows.push(tx('expense', 22000, 'Housing', m * 30 + 2, { merchant: 'Landlord' }));
    rows.push(tx('expense', 649, 'Entertainment', m * 30 + 5, { merchant: 'Netflix' }));
  }
  for (let i = 0; i < 20; i += 1) rows.push(tx('expense', 300 + (i % 5) * 90, 'Food & Dining', i * 3 + 1));
  return rows.sort((a, b) => a.date.getTime() - b.date.getTime());
};

describe('Gemini model ladder', () => {
  afterEach(() => resetGeminiCooldowns());

  it('replaces retired model names that would 404 every call', () => {
    expect(resolveGeminiModel('gemini-1.5-flash')).toBe('gemini-flash-latest');
    expect(resolveGeminiModel('models/gemini-pro')).toBe('gemini-flash-latest');
    expect(resolveGeminiModel('')).toBe('gemini-flash-latest');
    expect(resolveGeminiModel('gemini-3.5-flash')).toBe('gemini-3.5-flash');
  });

  it('tries the configured model, then the rolling alias, then the lite model', () => {
    expect(geminiModelLadder('gemini-2.5-flash')).toEqual(['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-flash-lite-latest']);
    expect(geminiModelLadder('gemini-flash-latest')).toEqual(['gemini-flash-latest', 'gemini-flash-lite-latest']);
  });

  it('puts a model with an exhausted daily quota on cooldown, but not one that is merely busy', () => {
    const dailyQuota = '[429 ] You exceeded your current quota. Quota exceeded for metric: generate_content_free_tier_requests, limit: 20, model: gemini-3.8-flash. "quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier" Please retry in 21.2s.';
    expect(classifyLLMError(dailyQuota)).toBe('quota');
    expect(noteGeminiFailure('gemini-flash-latest', dailyQuota)).toBe('quota');
    expect(isGeminiModelCoolingDown('gemini-flash-latest')).toBe(true);

    const busy = '[503 ] This model is currently experiencing high demand.';
    expect(noteGeminiFailure('gemini-flash-lite-latest', busy)).toBe('unavailable');
    expect(isGeminiModelCoolingDown('gemini-flash-lite-latest')).toBe(false);

    expect(noteGeminiFailure('gemini-2.5-flash', '[404 ] This model models/gemini-2.5-flash is no longer available.')).toBe('missing_model');
    expect(isGeminiModelCoolingDown('gemini-2.5-flash')).toBe(true);
  });
});

describe('insight agents', () => {
  it('does not flag salary credits or regular rent as unusual — only a one-off large expense', () => {
    const rows = history();
    rows.push(tx('expense', 42000, 'Shopping', 4, { merchant: 'Croma', description: 'New phone' }));
    const { flags } = detectUnusualExpenses(data({ transactions: rows }));
    expect(flags).toHaveLength(1);
    expect(flags![0]).toMatchObject({ amount: 42000, category: 'Shopping', reason: 'unusual_amount' });
    expect(flags![0].message).toContain('₹42,000');
  });

  it('needs enough history before calling anything unusual', () => {
    const rows = [tx('expense', 500, 'Food & Dining', 3), tx('expense', 50000, 'Shopping', 2)];
    expect(detectUnusualExpenses(data({ transactions: rows })).flags).toEqual([]);
  });

  it('predicts monthly bills from history and from recurring schedules', () => {
    const { predictions } = predictBills(data({
      transactions: history(),
      recurring: [{ title: 'Car EMI', amount: 9500, nextDueDate: new Date(NOW.getTime() + 5 * DAY), type: 'expense' }],
    }));
    const names = predictions!.map((p) => p.merchant);
    expect(names).toEqual(expect.arrayContaining(['Car EMI', 'Netflix', 'Landlord']));
    expect(names).not.toContain('Acme Corp'); // income is not a bill
    expect(predictions!.find((p) => p.merchant === 'Car EMI')).toMatchObject({ source: 'recurring', predictedAmount: 9500 });
  });

  it('measures a weekly budget over its week and matches "Food & Dining" to "Food"', () => {
    const rows = [
      tx('expense', 1500, 'Food', 2),
      tx('expense', 900, 'Food & Dining', 5),
      tx('expense', 5000, 'Food', 20), // outside the week
    ];
    const { recommendations } = analyseBudgets(data({
      transactions: rows,
      budgets: [{ category: 'Food & Dining', amount: 2000, period: 'weekly', threshold: 80 }],
    }));
    expect(recommendations).toEqual([expect.objectContaining({ title: 'Food & Dining Budget Exceeded' })]);
    expect(recommendations![0].message).toContain('₹2,400');
  });

  it('warns once when spending passes income, not twice', () => {
    const rows = [tx('income', 50000, 'Salary', 3), tx('expense', 60000, 'Shopping', 2)];
    const budgets = analyseBudgets(data({ transactions: rows })).recommendations!;
    const goals = analyseGoals(data({ transactions: rows })).recommendations!;
    expect(budgets.map((r) => r.title)).not.toContain('Spending Above 80% of Income');
    expect(goals.map((r) => r.title)).toContain('Spending More Than You Earn');
  });

  it('scores EMI burden rather than the number of loans, and ignores money lent', () => {
    const base = { transactions: history() };
    const noDebt = scoreFinancialHealth(data({ ...base, lentOutstanding: 20000 })).score!;
    const heavyEmi = scoreFinancialHealth(data({ ...base, debts: [{ name: 'Car loan', outstanding: 240000, emi: 40000 }] })).score!;
    const lightEmi = scoreFinancialHealth(data({ ...base, debts: [{ name: 'Phone EMI', outstanding: 12000, emi: 2000 }] })).score!;
    expect(noDebt).toBeGreaterThan(lightEmi);
    expect(lightEmi).toBeGreaterThan(heavyEmi);
  });
});

describe('offline parsers', () => {
  it('routes "should I…" questions to advice, not a data lookup', () => {
    expect(classifyOffline('should I prepay my car loan or invest in SIP?').intent).toBe('advice');
    expect(classifyOffline('how is my portfolio doing').intent).toBe('query');
  });

  it('keeps a reminder title intact and reads its day of the month', () => {
    const c = classifyOffline('remind me to pay the electricity bill on 25th');
    expect(c).toMatchObject({ intent: 'task', taskType: 'add_todo', title: 'Pay the electricity bill' });
    expect(c.date).toMatch(/^\d{4}-\d{2}-25$/);
  });

  it('names a goal said before the word "goal" and uses canonical budget categories', () => {
    expect(classifyOffline('create a bike goal of 1 lakh')).toMatchObject({ taskType: 'create_goal', title: 'Bike' });
    expect(classifyOffline('set a food budget of 8000')).toMatchObject({ taskType: 'create_budget', category: 'Food & Dining' });
  });

  it('separates the merchant from the description on a spoken expense', () => {
    expect(classifyOffline('I spent 450 on lunch at Truffles today')).toMatchObject({
      intent: 'record_expense', amount: 450, description: 'Lunch', merchant: 'Truffles', category: 'Food & Dining',
    });
  });

  it('extracts group members without the amount and loans without a fake merchant', () => {
    const [dinner] = offlineActions('I had dinner with Ravi and Priya for 2400', undefined, 0.7);
    expect(dinner).toMatchObject({ kind: 'group_expense', entities: { amount: 2400, members: ['Ravi', 'Priya'], description: 'Dinner' } });

    const [, loan] = offlineActions('spent 2000 on petrol and borrowed 3000 from Arun', undefined, 0.7);
    expect(loan).toMatchObject({ kind: 'loan_borrow', entities: { amount: 3000, person: 'Arun', description: 'Borrowed from Arun' } });
    expect(loan.entities.merchant).toBeUndefined();
  });

  it('pins a goal clarification so tapping an amount creates the goal, not an expense', () => {
    // Shape the model actually returned for "create a bike goal" on 2026-09-17.
    const action = normaliseKaiAction({
      kind: 'clarify',
      category: 'Savings',
      description: 'Bike',
      question: 'How much would you like to save for your bike goal?',
      options: [
        { label: '₹50,000', patch: { amount: 50000, targetAmount: 50000 } },
        { label: '₹1,00,000', patch: { amount: 100000 } },
      ],
    }, 'create a bike goal', undefined, 0.7)!;

    expect(action.entities.patch).toEqual({ kind: 'goal' });
    expect(action.entities.goalName).toBe('Bike');
    expect(action.entities.options!.map((o) => o.patch)).toEqual([
      { kind: 'goal', goalName: 'Bike', amount: 50000, targetAmount: 50000 },
      { kind: 'goal', goalName: 'Bike', amount: 100000, targetAmount: 100000 },
    ]);

    // Options that already say what they record are left alone.
    const shared = normaliseKaiAction({
      kind: 'clarify',
      question: 'Shared with Jijo or personal?',
      options: [{ label: 'Shared', patch: { kind: 'group_expense', members: ['Jijo'] } }],
    }, 'spent 5000 on goal posts with Jijo', undefined, 0.7)!;
    expect(shared.entities.options![0].patch.kind).toBe('group_expense');
    expect(shared.entities.patch).toBeUndefined();
  });

  it('reads a bare day of the month as its next occurrence', () => {
    const today = new Date(2026, 8, 17);
    expect(parseSpokenDate('pay rent on the 25th', today)).toBe('2026-09-25');
    expect(parseSpokenDate('pay rent on 5th', today)).toBe('2026-10-05');
  });
});
