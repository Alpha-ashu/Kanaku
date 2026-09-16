import { describe, expect, it } from 'vitest';
import {
  computePaymentAllocation,
  computeSettlement,
  computeSplit,
  distributeByWeights,
  distributeEvenly,
  getGroupExpenseSettlement,
  resolveSettledAfterEdit,
  type SplitMemberInput,
} from '@/lib/groupSplit';

const member = (key: string, value: number | null = null, included = true): SplitMemberInput => ({ key, value, included });
const sum = (values: number[]) => Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100;

describe('distribution helpers', () => {
  it('spreads leftover paise over the first members', () => {
    expect(distributeEvenly(500000, 3)).toEqual([166667, 166667, 166666]);
  });

  it('apportions by weight and always sums to the total', () => {
    const parts = distributeByWeights(100, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100);
    expect(parts).toEqual([34, 33, 33]);
  });
});

describe('computeSplit', () => {
  const ten = Array.from({ length: 10 }, (_, i) => `m${i + 1}`);

  it('equal split of ₹5,000 across 10 members is ₹500 each', () => {
    const result = computeSplit(5000, 'equal', ten.map((k) => member(k)));
    expect(result.status).toBe('balanced');
    expect(Object.values(result.shares)).toEqual(Array(10).fill(500));
  });

  it('equal split never loses a paisa', () => {
    const result = computeSplit(100, 'equal', ['a', 'b', 'c'].map((k) => member(k)));
    expect(result.shares).toEqual({ a: 33.34, b: 33.33, c: 33.33 });
    expect(sum(Object.values(result.shares))).toBe(100);
  });

  it('excluded members get nothing and are not counted', () => {
    const result = computeSplit(4000, 'equal', [member('a'), member('b'), member('c', null, false), member('d')]);
    expect(result.shares).toEqual({ a: 1333.34, b: 1333.33, c: 0, d: 1333.33 });
  });

  it('custom amounts that match the bill are fully allocated', () => {
    const amounts = [800, 700, 500, 500, 400, 350, 300, 250, 600, 600];
    const result = computeSplit(5000, 'custom', ten.map((k, i) => member(k, amounts[i])));
    expect(result.status).toBe('balanced');
    expect(result.allocated).toBe(5000);
    expect(result.remaining).toBe(0);
  });

  it('reports what is left when custom amounts fall short', () => {
    const result = computeSplit(5000, 'custom', ten.map((k, i) => member(k, i === 0 ? 0 : 500)));
    expect(result.status).toBe('under');
    expect(result.allocated).toBe(4500);
    expect(result.remaining).toBe(500);
  });

  it('reports the excess when custom amounts overshoot', () => {
    const result = computeSplit(5000, 'custom', ten.map((k, i) => member(k, i === 0 ? 1000 : 500)));
    expect(result.status).toBe('over');
    expect(result.allocated).toBe(5500);
    expect(result.remaining).toBe(-500);
  });

  it('allows a ₹0 share', () => {
    const result = computeSplit(1500, 'custom', [member('arun', 500), member('jijo', 500), member('bridget', 0), member('preeti', 500)]);
    expect(result.status).toBe('balanced');
    expect(result.shares.bridget).toBe(0);
  });

  it('mixed: fixed amounts for some, the rest shared equally by the others', () => {
    const result = computeSplit(5000, 'custom', ten.map((k, i) => member(k, i < 2 ? 500 : null)));
    expect(result.status).toBe('balanced');
    expect(Object.values(result.shares)).toEqual(Array(10).fill(500));
    expect(result.autoKeys).toHaveLength(8);
  });

  it('mixed split is over-allocated when fixed amounts already exceed the bill', () => {
    const result = computeSplit(1000, 'custom', [member('a', 800), member('b', 300), member('c')]);
    expect(result.status).toBe('over');
    expect(result.shares.c).toBe(0);
  });

  it('handles decimal custom amounts exactly', () => {
    const result = computeSplit(100.1, 'custom', [member('a', 33.37), member('b', 33.37), member('c', 33.36)]);
    expect(result.status).toBe('balanced');
  });

  it('percentage split must reach 100%', () => {
    const under = computeSplit(1000, 'percentage', [member('a', 50), member('b', 30)]);
    expect(under.status).toBe('under');
    expect(under.percentAllocated).toBe(80);
    expect(under.remaining).toBe(200);

    const ok = computeSplit(1000, 'percentage', [member('a', 50), member('b', 30), member('c', 20)]);
    expect(ok.status).toBe('balanced');
    expect(ok.shares).toEqual({ a: 500, b: 300, c: 200 });
  });

  it('percentage auto members share the remaining percent', () => {
    const result = computeSplit(999.99, 'percentage', [member('a', 40), member('b'), member('c')]);
    expect(result.status).toBe('balanced');
    expect(sum(Object.values(result.shares))).toBe(999.99);
    expect(Math.abs(result.shares.b - result.shares.c)).toBeLessThanOrEqual(0.01);
  });

  it('shares split is proportional and exact', () => {
    const result = computeSplit(1000, 'shares', [member('a', 2), member('b', 1), member('c', 1)]);
    expect(result.shares).toEqual({ a: 500, b: 250, c: 250 });
    expect(computeSplit(100, 'shares', [member('a', 1), member('b', 1), member('c', 1)]).status).toBe('balanced');
  });

  it('rejects impossible inputs', () => {
    expect(computeSplit(0, 'equal', [member('a')]).status).toBe('invalid');
    expect(computeSplit(100, 'equal', [member('a', null, false)]).status).toBe('invalid');
    expect(computeSplit(100, 'custom', [member('a', -5)]).status).toBe('invalid');
    expect(computeSplit(100, 'shares', [member('a', 0), member('b', 0)]).status).toBe('invalid');
  });

  it('keeps large bills exact', () => {
    const result = computeSplit(9_999_999_999.99, 'equal', [member('a'), member('b'), member('c')]);
    expect(result.status).toBe('balanced');
    expect(Object.values(result.shares).reduce((a, b) => a + Math.round(b * 100), 0)).toBe(999_999_999_999);
  });
});

describe('computePaymentAllocation', () => {
  it('requires payments to add up to the bill', () => {
    expect(computePaymentAllocation(5000, [5000, 0]).status).toBe('balanced');
    expect(computePaymentAllocation(5000, [3000, 1000]).status).toBe('under');
    expect(computePaymentAllocation(5000, [3000, 3000]).status).toBe('over');
  });
});

describe('computeSettlement', () => {
  it('single payer: everyone else pays the payer their share', () => {
    const result = computeSettlement([
      { key: 'arun', share: 500, paid: 5000, settled: false },
      { key: 'jijo', share: 700, paid: 0, settled: false },
      { key: 'bridget', share: 500, paid: 0, settled: false },
      { key: 'preeti', share: 3300, paid: 0, settled: false },
    ]);
    const arun = result.balances[0];
    expect(arun.balance).toBe(4500);
    expect(arun.outstanding).toBe(4500);
    expect(result.balances[1].balance).toBe(-700);
    expect(result.transfers).toEqual(expect.arrayContaining([
      { from: 'jijo', to: 'arun', amount: 700, settled: false },
      { from: 'bridget', to: 'arun', amount: 500, settled: false },
      { from: 'preeti', to: 'arun', amount: 3300, settled: false },
    ]));
    expect(result.isSettled).toBe(false);
  });

  it('a settled debtor reduces what the creditor is still owed', () => {
    const result = computeSettlement([
      { key: 'you', share: 500, paid: 1500, settled: true },
      { key: 'a', share: 500, paid: 0, settled: true },
      { key: 'b', share: 500, paid: 0, settled: false },
    ]);
    expect(result.balances[0].outstanding).toBe(500);
    expect(result.balances[1].outstanding).toBe(0);
    expect(result.isSettled).toBe(false);
  });

  it('multiple payers net out correctly', () => {
    const result = computeSettlement([
      { key: 'you', share: 1000, paid: 2000, settled: false },
      { key: 'a', share: 1000, paid: 1000, settled: false },
      { key: 'b', share: 1000, paid: 0, settled: false },
    ]);
    expect(result.transfers).toEqual([{ from: 'b', to: 'you', amount: 1000, settled: false }]);
    expect(result.balances[1].outstanding).toBe(0);
    expect(result.balances[1].settled).toBe(true);
  });
});

describe('stored group expenses', () => {
  it('legacy records without payments assume the creator paid everything', () => {
    const result = getGroupExpenseSettlement({
      totalAmount: 900,
      members: [
        { name: 'You', share: 300, paid: true, isCurrentUser: true },
        { name: 'A', share: 300, paid: false },
        { name: 'B', share: 300, paid: true },
      ],
    });
    expect(result.balances[0].outstanding).toBe(300);
    expect(result.balances[1].outstanding).toBe(300);
    expect(result.balances[2].outstanding).toBe(0);
  });

  it('uses recorded contributions when present', () => {
    const result = getGroupExpenseSettlement({
      totalAmount: 1000,
      members: [
        { name: 'You', share: 500, paid: false, isCurrentUser: true, contribution: 0 },
        { name: 'Arun', share: 500, paid: true, contribution: 1000 },
      ],
    });
    expect(result.balances[0].owes).toBe(500);
    expect(result.balances[1].outstanding).toBe(500);
  });
});

describe('resolveSettledAfterEdit', () => {
  it('owing nothing is settled; a changed debt reopens', () => {
    expect(resolveSettledAfterEdit(0)).toBe(true);
    expect(resolveSettledAfterEdit(500)).toBe(false);
    expect(resolveSettledAfterEdit(500, { owes: 500, settled: true })).toBe(true);
    expect(resolveSettledAfterEdit(600, { owes: 500, settled: true })).toBe(false);
  });
});
