import { describe, expect, it } from 'vitest';
import { getCurrencySymbol, normalizeCurrencyCode } from '@/lib/currencyUtils';
import { DEFAULT_APP_CURRENCY } from '@/lib/userPreferences';

/**
 * Kanaku is India-first: INR is the app default everywhere. `getCurrencySymbol`
 * used to fall back to USD while its sibling `normalizeCurrencyCode` fell back to
 * INR, so any caller with a missing currency rendered `$`. That is what showed
 * dollar signs on investments — holdings stored before `assetCurrency` existed,
 * and the Wealth Vault's first paint before preferences load.
 */
describe('currency defaults', () => {
  it('defaults to the rupee symbol when no currency is supplied', () => {
    expect(getCurrencySymbol()).toBe('₹');
    expect(getCurrencySymbol(undefined)).toBe('₹');
    expect(getCurrencySymbol('')).toBe('₹');
    expect(getCurrencySymbol('   ')).toBe('₹');
  });

  it('falls back to the rupee for unrecognised currency values', () => {
    expect(getCurrencySymbol('NOT_A_CURRENCY')).toBe('₹');
  });

  it('agrees with normalizeCurrencyCode and the app-wide default', () => {
    expect(normalizeCurrencyCode()).toBe(DEFAULT_APP_CURRENCY);
    expect(DEFAULT_APP_CURRENCY).toBe('INR');
    expect(getCurrencySymbol(normalizeCurrencyCode())).toBe('₹');
  });

  it('still resolves explicit non-INR currencies', () => {
    expect(getCurrencySymbol('USD')).toBe('$');
    expect(getCurrencySymbol('EUR')).toBe('€');
    expect(getCurrencySymbol('GBP')).toBe('£');
    expect(getCurrencySymbol('$')).toBe('$');
  });

  it('honours an explicit fallback when one is passed', () => {
    expect(getCurrencySymbol(undefined, 'USD')).toBe('$');
  });
});
