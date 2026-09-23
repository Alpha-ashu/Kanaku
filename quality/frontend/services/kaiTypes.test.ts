import { describe, expect, it } from 'vitest';
import type { KaiActionKind } from '@kanaku/shared';
import {
  actionAmount,
  applyPatch,
  confirmationLine,
  confirmationPrompt,
  describeAction,
  deterministicUuid,
  groupPerHead,
  isMoneyKind,
  isRecordKind,
  toContextAction,
  type KaiExecutedAction,
} from '@/services/kai/kaiTypes';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('deterministicUuid', () => {
  it('is stable for the same seed and UUID-shaped', () => {
    const a = deterministicUuid('kai:s1:4:0:tx');
    expect(a).toMatch(UUID_RE);
    expect(deterministicUuid('kai:s1:4:0:tx')).toBe(a);
  });

  it('differs across seeds that differ by one character', () => {
    expect(deterministicUuid('kai:s1:4:0:tx')).not.toBe(deterministicUuid('kai:s1:4:1:tx'));
    expect(deterministicUuid('kai:s1:4:0:tx')).not.toBe(deterministicUuid('kai:s1:4:0:loan'));
  });
});

describe('describeAction / actionAmount', () => {
  it('labels each kind for the card', () => {
    expect(describeAction({ kind: 'expense', entities: { description: 'Petrol' }, rawSegment: '' })).toBe('Petrol');
    expect(describeAction({ kind: 'group_expense', entities: { description: 'Dinner', members: ['Arun', 'Jijo', 'Preeti'] }, rawSegment: '' })).toBe('Dinner with Arun, Jijo and Preeti');
    expect(describeAction({ kind: 'loan_borrow', entities: { person: 'Arun' }, rawSegment: '' })).toBe('Borrowed from Arun');
    expect(describeAction({ kind: 'loan_lend', entities: { person: 'Prijith' }, rawSegment: '' })).toBe('Lent to Prijith');
    expect(describeAction({ kind: 'goal', entities: { goalName: 'Bike' }, rawSegment: '' })).toBe('Bike goal');
    expect(describeAction({ kind: 'todo', entities: { title: 'Pay bike insurance' }, rawSegment: '' })).toBe('Pay bike insurance');
    expect(describeAction({ kind: 'budget', entities: { category: 'Food & Dining', amount: 3000 }, rawSegment: '' })).toBe('Food & Dining budget');
    expect(describeAction({ kind: 'query', entities: {}, rawSegment: 'what is my food budget' })).toBe('what is my food budget');
  });

  it('shows the target for goals and the amount otherwise', () => {
    expect(actionAmount({ kind: 'goal', entities: { targetAmount: 150000 } })).toBe(150000);
    expect(actionAmount({ kind: 'expense', entities: { amount: 2000 } })).toBe(2000);
    expect(actionAmount({ kind: 'todo', entities: {} })).toBeUndefined();
  });
});

describe('kind predicates', () => {
  it('separates money, record and non-record kinds', () => {
    expect(isMoneyKind('expense')).toBe(true);
    expect(isMoneyKind('goal')).toBe(false);
    expect(isRecordKind('goal')).toBe(true);
    expect(isRecordKind('todo')).toBe(true);
    expect(isMoneyKind('budget')).toBe(false);
    expect(isRecordKind('budget')).toBe(true);
    expect(isRecordKind('query')).toBe(false);
    expect(isRecordKind('clarify')).toBe(false);
    expect(isRecordKind('update_previous')).toBe(false);
  });
});

describe('applyPatch', () => {
  it('changes fields and can retarget the kind', () => {
    const base = { actionId: 'a', kind: 'expense' as const, rawSegment: '', entities: { amount: 5000, description: 'With Jijo' }, confidence: 1, requiresReview: true };
    const shared = applyPatch(base, { kind: 'group_expense', members: ['Jijo'] });
    expect(shared.kind).toBe('group_expense');
    expect(shared.entities).toMatchObject({ amount: 5000, members: ['Jijo'] });

    const corrected = applyPatch(base, { amount: 4500 });
    expect(corrected.kind).toBe('expense');
    expect(corrected.entities.amount).toBe(4500);
  });
});

describe('toContextAction', () => {
  it('summarises a saved action for the next request', () => {
    const action: KaiExecutedAction = {
      actionId: 'kai:s1:1:0',
      kind: 'loan_borrow',
      rawSegment: 'borrowed 3000 from Arun',
      entities: { amount: 3000, person: 'Arun' },
      confidence: 0.95,
      requiresReview: false,
      status: 'saved',
      refs: [],
      balanceDelta: {},
      summary: 'Borrowed from Arun',
      utteranceSeq: 1,
      createdAt: new Date().toISOString(),
    };
    expect(toContextAction(action)).toEqual({
      actionId: 'kai:s1:1:0',
      kind: 'loan_borrow',
      summary: 'Borrowed from Arun',
      amount: 3000,
      person: 'Arun',
      goalName: undefined,
      date: undefined,
      status: 'saved',
    });
  });
});

describe('confirmation read-back', () => {
  const draft = (kind: KaiActionKind, entities: Record<string, unknown>, confidence = 0.95) => ({
    kind,
    rawSegment: 'spoken',
    entities: entities as never,
    confidence,
    requiresReview: false,
  });

  it('leads with the amount and, for a split, what each head owes', () => {
    expect(confirmationLine(draft('group_expense', { amount: 4396, description: 'Dinner', members: ['Arun', 'Amala', 'Preeti'] })))
      .toBe('₹4,396 for Dinner with Arun, Amala and Preeti — ₹1,099 each');
    // The speaker counts as a head, and an uneven share keeps its paise.
    expect(confirmationLine(draft('group_expense', { amount: 1099, description: 'Lunch', members: ['Arun'] })))
      .toBe('₹1,099 for Lunch with Arun — ₹549.50 each');
    expect(confirmationLine(draft('expense', { amount: 200, description: 'Coffee' })))
      .toBe('₹200 for Coffee');
  });

  it('matches the split the executor writes: amount ÷ (members + 1)', () => {
    expect(groupPerHead(draft('group_expense', { amount: 4396, members: ['A', 'B', 'C'] }))).toBe(1099);
    expect(groupPerHead(draft('group_expense', { amount: 300, members: [] }))).toBeUndefined();
    expect(groupPerHead(draft('expense', { amount: 300 }))).toBeUndefined();
  });

  it('asks about one entry or about all of them', () => {
    expect(confirmationPrompt(['₹200 for Coffee'])).toBe('I understood this as ₹200 for Coffee. Shall I save it?');
    expect(confirmationPrompt(['₹2,000 for Dinner', '₹500 for Coffee']))
      .toBe('I understood 2 entries: ₹2,000 for Dinner and ₹500 for Coffee. Shall I save them?');
  });
});
