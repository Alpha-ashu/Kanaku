/**
 * Phase B regression: UserSettings blob must be (1) a real object, never a
 * double-encoded JSON string, and (2) free of keys that duplicate dedicated
 * columns (theme/language/currency/timezone and their aliases).
 */
import { presentSettingsBlob, normaliseSettingsBlob } from '../../src/features/settings/settings.controller';

describe('settings blob normalisation', () => {
  it('decodes a double-encoded (stringified) blob into an object on the way out', () => {
    const stored = '{"country":"India","timezone":"Asia/Kolkata","defaultCurrency":"INR","monthlyBudget":40000}';
    const out = presentSettingsBlob(stored);
    expect(typeof out).toBe('object');
    expect(out.country).toBe('India');
    expect(out.monthlyBudget).toBe(40000);
  });

  it('strips column-owned keys from the presented blob', () => {
    const out = presentSettingsBlob({
      country: 'India',
      timezone: 'Asia/Kolkata',     // column
      currency: 'INR',              // column
      defaultCurrency: 'INR',       // alias of currency column
      language: 'en',               // column
      languageLabel: 'English',     // derivable from language column
      theme: 'dark',                // column
      monthlyBudget: 40000,
    });
    expect(out).toEqual({ country: 'India', monthlyBudget: 40000 });
  });

  it('normalises an incoming blob to an object with no column-owned keys', () => {
    const out = normaliseSettingsBlob({ country: 'India', timezone: 'Asia/Kolkata', defaultCurrency: 'INR', monthlyBudget: 50000 });
    expect(out).toEqual({ country: 'India', monthlyBudget: 50000 });
  });

  it('clamps an overflowing monthlyBudget', () => {
    const out = normaliseSettingsBlob({ monthlyBudget: 8_333_333_333 });
    expect(out?.monthlyBudget).toBeLessThanOrEqual(Math.floor(1_000_000_000 / 12));
  });

  it('returns undefined for null/undefined input (no overwrite)', () => {
    expect(normaliseSettingsBlob(undefined)).toBeUndefined();
    expect(normaliseSettingsBlob(null)).toBeUndefined();
  });

  it('tolerates malformed JSON by yielding an empty object', () => {
    expect(presentSettingsBlob('not-json')).toEqual({});
    expect(normaliseSettingsBlob('not-json')).toEqual({});
  });
});
