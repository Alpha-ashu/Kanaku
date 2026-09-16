/**
 * Group expense allocation checks — pure unit test, no DB.
 *
 * The server refuses an allocation-aware payload whose member shares or payments
 * don't add up to the bill, and leaves older payloads (no payment data) alone so
 * the sync queue never drops them as a permanent 400.
 */
import {
  findAllocationError,
  isAllocationAware,
  owedAmount,
} from '../../../../backend/src/features/groups/group.allocation';

const you = (share: number, contribution: number) => ({ name: 'You', isCurrentUser: true, share, contribution });
const friend = (name: string, share: number, contribution = 0) => ({ name, share, contribution });

describe('isAllocationAware', () => {
  it('is false for legacy equal-split payloads', () => {
    expect(isAllocationAware({ members: [{ name: 'You', share: 50 }, { name: 'A', share: 50 }] })).toBe(false);
    expect(isAllocationAware({ members: ['A', 'B'] })).toBe(false);
  });

  it('is true once the payload says who paid', () => {
    expect(isAllocationAware({ yourPaidAmount: 100, members: [] })).toBe(true);
    expect(isAllocationAware({ members: [friend('A', 50, 0)] })).toBe(true);
  });
});

describe('findAllocationError', () => {
  it('accepts a custom split where shares and payments both match the bill', () => {
    expect(findAllocationError({
      totalAmount: 5000,
      yourShare: 800,
      yourPaidAmount: 5000,
      members: [you(800, 5000), friend('Jijo', 700), friend('Bridget', 0), friend('Preeti', 3500)],
    })).toBeNull();
  });

  it('rejects under-allocated shares', () => {
    expect(findAllocationError({
      totalAmount: 5000,
      yourShare: 500,
      yourPaidAmount: 5000,
      members: [you(500, 5000), friend('Jijo', 4000)],
    })).toBe('₹500.00 of the expense is not allocated to anyone');
  });

  it('rejects over-allocated shares', () => {
    expect(findAllocationError({
      totalAmount: 5000,
      yourShare: 1000,
      yourPaidAmount: 5000,
      members: [you(1000, 5000), friend('Jijo', 4500)],
    })).toBe('Shares are ₹500.00 over the expense amount');
  });

  it('rejects payments that do not cover the bill', () => {
    expect(findAllocationError({
      totalAmount: 1000,
      yourShare: 500,
      yourPaidAmount: 300,
      members: [you(500, 300), friend('Arun', 500, 600)],
    })).toBe('Payments add up to ₹900.00 but the expense is ₹1000.00');
  });

  it('accepts multiple payers and decimal shares', () => {
    expect(findAllocationError({
      totalAmount: 100,
      yourShare: 33.34,
      yourPaidAmount: 60,
      members: [you(33.34, 60), friend('A', 33.33, 40), friend('B', 33.33)],
    })).toBeNull();
  });

  it('falls back to the creator entry when top-level fields are absent', () => {
    expect(findAllocationError({
      totalAmount: 200,
      members: [you(100, 200), friend('A', 100)],
    })).toBeNull();
  });

  it('rejects negative values', () => {
    expect(findAllocationError({
      totalAmount: 100,
      yourShare: 150,
      yourPaidAmount: 100,
      members: [you(150, 100), friend('A', -50)],
    })).toBe('Shares and payments cannot be negative');
  });
});

describe('owedAmount', () => {
  it('is share minus contribution, floored at zero', () => {
    expect(owedAmount(700, 0)).toBe(700);
    expect(owedAmount(500, 5000)).toBe(0);
    expect(owedAmount('333.33', '100.00')).toBe(233.33);
  });
});
