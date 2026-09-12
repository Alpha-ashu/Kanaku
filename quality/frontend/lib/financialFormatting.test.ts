import { describe, expect, it } from 'vitest';
import {
  formatIndianNumber,
  formatCompactINR,
} from '@/app/components/ui/FinancialAmount';
import {
  formatAmountCompact,
  formatAmountShort,
  getFinancialDisplaySize,
} from '@/lib/currencyUtils';

describe('Financial Number Formatting & Sizing', () => {
  describe('formatIndianNumber', () => {
    it('formats basic Indian number grouping (thousands, then pairs of lakhs & crores)', () => {
      expect(formatIndianNumber(1000, 0)).toBe('1,000');
      expect(formatIndianNumber(100000, 0)).toBe('1,00,000');
      expect(formatIndianNumber(1234567, 0)).toBe('12,34,567');
      expect(formatIndianNumber(12345678, 0)).toBe('1,23,45,678');
      expect(formatIndianNumber(123456789, 0)).toBe('12,34,56,789');
    });

    it('handles decimal places accurately', () => {
      expect(formatIndianNumber(56570, 2)).toBe('56,570.00');
      expect(formatIndianNumber(1234.56, 2)).toBe('1,234.56');
      expect(formatIndianNumber(0, 2)).toBe('0.00');
    });

    it('handles zero and negative amounts', () => {
      expect(formatIndianNumber(0, 0)).toBe('0');
      expect(formatIndianNumber(-5000, 0)).toBe('5,000'); // abs value formatted
    });

    it('handles huge 13-digit numbers without overflowing or misgrouping', () => {
      const hugeVal = 9999999999999;
      // 99,99,99,99,99,999
      expect(formatIndianNumber(hugeVal, 0)).toBe('99,99,99,99,99,999');
    });
  });

  describe('formatCompactINR', () => {
    it('formats amounts into Lakhs and Crores', () => {
      expect(formatCompactINR(150000)).toBe('1.50L');
      expect(formatCompactINR(1250000)).toBe('12.5L');
      expect(formatCompactINR(10000000)).toBe('1.00Cr');
      expect(formatCompactINR(125000000)).toBe('12.5Cr');
      expect(formatCompactINR(5000000000)).toBe('500Cr');
    });

    it('falls back to Indian grouped number below 1 Lakh', () => {
      expect(formatCompactINR(45000, 2)).toBe('45,000.00');
    });
  });

  describe('formatAmountCompact and formatAmountShort', () => {
    it('formats compact amounts with currency symbol in short format', () => {
      expect(formatAmountShort(125000, 'INR')).toBe('₹1.25L');
      expect(formatAmountShort(12500000, 'INR')).toBe('₹1.25Cr');
      expect(formatAmountShort(-5000, 'INR')).toBe('-₹5,000');
      expect(formatAmountShort(0, 'INR')).toBe('₹0');
    });

    it('handles 13-digit financial values gracefully', () => {
      const hugeVal = 9999999999999;
      const formatted = formatAmountShort(hugeVal, 'INR');
      expect(formatted).toContain('₹');
      expect(formatted).toContain('Cr');
    });
  });

  describe('getFinancialDisplaySize', () => {
    it('selects appropriate size tiers based on number length and container width', () => {
      expect(getFinancialDisplaySize(5000, 300)).toBe('xl');
      expect(getFinancialDisplaySize(50000000, 220)).toBe('lg');
      expect(getFinancialDisplaySize(5000000000, 180)).toBe('md');
    });
  });
});
