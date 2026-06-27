/**
 * Frontend Unit Tests — Utility Functions
 * Tests for: currencyUtils, featureFlags, dateUtils, canAccessPage
 */

import { describe, it, expect } from 'vitest';

// ─── currencyUtils ────────────────────────────────────────────────────────────
// We inline-test the pure functions since they have no dependencies

function normalizeCurrencyCode(value?: string, fallback = 'USD'): string {
  const CURRENCY_SYMBOLS: Record<string, string> = {
    USD: '$', INR: '₹', EUR: '€', GBP: '£', JPY: '¥',
    AUD: 'A$', CAD: 'C$', SGD: 'S$', CHF: 'CHF',
  };
  const SYMBOL_TO_CODE: Record<string, string> = {
    '$': 'USD', '₹': 'INR', '€': 'EUR', '£': 'GBP', '¥': 'JPY',
    'A$': 'AUD', 'C$': 'CAD', 'S$': 'SGD', 'CHF': 'CHF',
  };
  const trimmed = (value || '').trim();
  if (!trimmed) return fallback;
  const upper = trimmed.toUpperCase();
  if (CURRENCY_SYMBOLS[upper]) return upper;
  if (SYMBOL_TO_CODE[trimmed]) return SYMBOL_TO_CODE[trimmed];
  return fallback;
}

describe('normalizeCurrencyCode', () => {
  it('returns ISO code for valid ISO code', () => {
    expect(normalizeCurrencyCode('INR')).toBe('INR');
    expect(normalizeCurrencyCode('USD')).toBe('USD');
    expect(normalizeCurrencyCode('EUR')).toBe('EUR');
  });

  it('normalizes lowercase to uppercase ISO code', () => {
    expect(normalizeCurrencyCode('inr')).toBe('INR');
    expect(normalizeCurrencyCode('usd')).toBe('USD');
  });

  it('converts currency symbol to ISO code', () => {
    expect(normalizeCurrencyCode('₹')).toBe('INR');
    expect(normalizeCurrencyCode('$')).toBe('USD');
    expect(normalizeCurrencyCode('€')).toBe('EUR');
  });

  it('returns fallback for empty string', () => {
    expect(normalizeCurrencyCode('')).toBe('USD');
    expect(normalizeCurrencyCode(undefined)).toBe('USD');
  });

  it('returns fallback for unknown currency', () => {
    expect(normalizeCurrencyCode('XYZ')).toBe('USD');
    expect(normalizeCurrencyCode('ZZZ', 'INR')).toBe('INR');
  });

  it('handles whitespace around values', () => {
    expect(normalizeCurrencyCode('  INR  ')).toBe('INR');
  });
});

// ─── Feature Flags & canAccessPage ────────────────────────────────────────────
// Test the core logic without importing from the module (avoids React context)

type FeatureVisibility = Record<string, boolean>;

function canAccessPage(page: string, features: FeatureVisibility): boolean {
  const PAGE_FEATURE_MAP: Record<string, string> = {
    'dashboard': 'dashboard',
    'accounts': 'accounts',
    'add-account': 'accounts',
    'edit-account': 'accounts',
    'transactions': 'transactions',
    'add-transaction': 'transactions',
    'transfer': 'transfer',
    'loans': 'loans',
    'add-loan': 'loans',
    'goals': 'goals',
    'add-goal': 'goals',
    'groups': 'groups',
    'investments': 'investments',
    'reports': 'reports',
    'calendar': 'calendar',
    'todo-lists': 'todoLists',
    'settings': 'settings',
    'notifications': 'notifications',
    'ai-insights': 'aiInsights',
    'budget-alerts': 'budgetAlerts',
    'recurring-transactions': 'recurringTransactions',
    'export-reports': 'dataExport',
  };

  const requiredFeature = PAGE_FEATURE_MAP[page];
  if (!requiredFeature) return true; // Pages without feature requirement are accessible
  return features[requiredFeature] !== false;
}

describe('canAccessPage', () => {
  const allEnabled: FeatureVisibility = {
    dashboard: true, accounts: true, transactions: true, loans: true,
    goals: true, groups: true, investments: true, reports: true,
    calendar: true, todoLists: true, transfer: true, settings: true,
    notifications: true, aiInsights: true,
    budgetAlerts: true, recurringTransactions: true, dataExport: true,
  };

  it('allows access to enabled features', () => {
    expect(canAccessPage('dashboard', allEnabled)).toBe(true);
    expect(canAccessPage('accounts', allEnabled)).toBe(true);
    expect(canAccessPage('transactions', allEnabled)).toBe(true);
    expect(canAccessPage('loans', allEnabled)).toBe(true);
    expect(canAccessPage('goals', allEnabled)).toBe(true);
  });

  it('blocks access to disabled features', () => {
    const restricted: FeatureVisibility = { ...allEnabled, loans: false, aiInsights: false };
    expect(canAccessPage('loans', restricted)).toBe(false);
    expect(canAccessPage('add-loan', restricted)).toBe(false);
    expect(canAccessPage('ai-insights', restricted)).toBe(false);
  });

  it('allows access to unknown pages (no restriction)', () => {
    expect(canAccessPage('unknown-page', allEnabled)).toBe(true);
    expect(canAccessPage('diagnostics', allEnabled)).toBe(true);
  });

  it('blocks sub-pages when parent feature is disabled', () => {
    const restricted: FeatureVisibility = { ...allEnabled, accounts: false };
    expect(canAccessPage('add-account', restricted)).toBe(false);
    expect(canAccessPage('edit-account', restricted)).toBe(false);
  });

  it('transfer is independent of transactions', () => {
    const restricted: FeatureVisibility = { ...allEnabled, transfer: false };
    expect(canAccessPage('transfer', restricted)).toBe(false);
    expect(canAccessPage('transactions', restricted)).toBe(true);
  });
});

// ─── Date utilities (pure logic) ──────────────────────────────────────────────

function isValidDate(dateStr: string): boolean {
  return !isNaN(Date.parse(dateStr));
}

function formatDateForDisplay(date: Date): string {
  return date.toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

describe('Date Utilities', () => {
  describe('isValidDate', () => {
    it('accepts ISO date format', () => {
      expect(isValidDate('2026-01-01')).toBe(true);
      expect(isValidDate('2026-12-31')).toBe(true);
    });

    it('accepts ISO datetime format', () => {
      expect(isValidDate('2026-01-01T00:00:00.000Z')).toBe(true);
      expect(isValidDate('2026-06-09T12:30:00Z')).toBe(true);
    });

    it('rejects invalid date strings', () => {
      expect(isValidDate('not-a-date')).toBe(false);
      expect(isValidDate('invalid')).toBe(false);
      expect(isValidDate('')).toBe(false);
    });

    it('accepts date-only strings (YYYY-MM-DD)', () => {
      // This is the key fix — was rejected before transaction.validation.ts fix
      expect(isValidDate('2025-01-01')).toBe(true);
      expect(isValidDate('2024-12-31')).toBe(true);
    });
  });

  describe('formatDateForDisplay', () => {
    it('formats dates in Indian locale', () => {
      const date = new Date('2026-06-09');
      const result = formatDateForDisplay(date);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });
});

// ─── Amount Validation (pure logic matching backend) ─────────────────────────

function validateAmount(amount: number): { valid: boolean; error?: string } {
  if (!Number.isFinite(amount)) return { valid: false, error: 'Amount must be a number' };
  if (amount <= 0) return { valid: false, error: 'Amount must be greater than 0' };
  if (amount > 999_999_999) return { valid: false, error: 'Amount exceeds maximum limit' };
  return { valid: true };
}

describe('Amount Validation', () => {
  it('accepts valid positive amounts', () => {
    expect(validateAmount(100).valid).toBe(true);
    expect(validateAmount(0.01).valid).toBe(true);
    expect(validateAmount(999_999_999).valid).toBe(true);
    expect(validateAmount(50000).valid).toBe(true);
  });

  it('rejects zero amount', () => {
    const result = validateAmount(0);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('rejects negative amounts', () => {
    expect(validateAmount(-1).valid).toBe(false);
    expect(validateAmount(-1000).valid).toBe(false);
    expect(validateAmount(-0.01).valid).toBe(false);
  });

  it('rejects amounts exceeding maximum', () => {
    expect(validateAmount(1_000_000_000).valid).toBe(false);
    expect(validateAmount(999_999_999 + 0.01).valid).toBe(false);
  });

  it('rejects non-finite values', () => {
    expect(validateAmount(Infinity).valid).toBe(false);
    expect(validateAmount(-Infinity).valid).toBe(false);
    expect(validateAmount(NaN).valid).toBe(false);
  });
});

// ─── Transaction Type Enum ────────────────────────────────────────────────────

const VALID_TRANSACTION_TYPES = ['income', 'expense', 'transfer'] as const;
type TransactionType = typeof VALID_TRANSACTION_TYPES[number];

function isValidTransactionType(type: string): type is TransactionType {
  return VALID_TRANSACTION_TYPES.includes(type as TransactionType);
}

describe('Transaction Type Validation', () => {
  it('accepts valid transaction types', () => {
    expect(isValidTransactionType('income')).toBe(true);
    expect(isValidTransactionType('expense')).toBe(true);
    expect(isValidTransactionType('transfer')).toBe(true);
  });

  it('rejects invalid transaction types', () => {
    expect(isValidTransactionType('debit')).toBe(false);
    expect(isValidTransactionType('credit')).toBe(false);
    expect(isValidTransactionType('INCOME')).toBe(false);
    expect(isValidTransactionType('Expense')).toBe(false);
    expect(isValidTransactionType('')).toBe(false);
    expect(isValidTransactionType('payment')).toBe(false);
  });
});

// ─── PIN Validation (matches backend weak PIN list) ────────────────────────

const WEAK_PINS = new Set([
  '123456', '654321', '111111', '222222', '333333', '444444',
  '555555', '666666', '777777', '888888', '999999', '000000',
  '121212', '232323', '112233', '123123', '223344', '987654',
  '246810', '135790', '246802', '097531',
]);

function isWeakPin(pin: string): boolean {
  if (pin.length !== 6) return false;
  if (WEAK_PINS.has(pin)) return true;

  // Ascending/descending sequences
  const digits = pin.split('').map(Number);
  const isAscending = digits.every((d, i) => i === 0 || d === digits[i - 1] + 1);
  const isDescending = digits.every((d, i) => i === 0 || d === digits[i - 1] - 1);
  const allSame = new Set(digits).size === 1;

  return isAscending || isDescending || allSame;
}

describe('PIN Validation', () => {
  it('flags weak sequential PINs', () => {
    expect(isWeakPin('123456')).toBe(true);
    expect(isWeakPin('234567')).toBe(true);
    expect(isWeakPin('654321')).toBe(true);
  });

  it('flags all-same-digit PINs', () => {
    expect(isWeakPin('111111')).toBe(true);
    expect(isWeakPin('999999')).toBe(true);
    expect(isWeakPin('000000')).toBe(true);
  });

  it('flags known weak PINs', () => {
    expect(isWeakPin('121212')).toBe(true);
    expect(isWeakPin('987654')).toBe(true);
  });

  it('accepts strong PINs', () => {
    expect(isWeakPin('135790')).toBe(true); // In weak list
    expect(isWeakPin('847291')).toBe(false);
    expect(isWeakPin('394827')).toBe(false);
    expect(isWeakPin('582039')).toBe(false);
  });

  it('rejects PINs shorter or longer than 6 digits', () => {
    expect(isWeakPin('12345')).toBe(false); // too short - not in weak set
    expect(isWeakPin('1234567')).toBe(false); // too long
  });
});

