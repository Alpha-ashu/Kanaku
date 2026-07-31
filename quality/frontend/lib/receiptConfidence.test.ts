import { describe, expect, it } from 'vitest';
import {
  CONFIDENCE_TITLES,
  HIGH_CONFIDENCE_THRESHOLD,
  LOW_CONFIDENCE_THRESHOLD,
  describeConfidence,
  resolveConfidenceTier,
} from '@/lib/receiptConfidence';

/**
 * The receipt scanner used to split confidence in two at 0.8, so a 79% scan and a
 * 25% scan looked identical to the user. These pin the three-tier behaviour: the
 * low tier is what stops someone saving a scan the parser barely understood.
 */
describe('receipt confidence tiers', () => {
  it('classifies each band', () => {
    expect(resolveConfidenceTier(0.95)).toBe('high');
    expect(resolveConfidenceTier(0.8)).toBe('high');
    expect(resolveConfidenceTier(0.79)).toBe('medium');
    expect(resolveConfidenceTier(0.6)).toBe('medium');
    expect(resolveConfidenceTier(0.59)).toBe('low');
    expect(resolveConfidenceTier(0.25)).toBe('low');
    expect(resolveConfidenceTier(0)).toBe('low');
  });

  it('treats an unknown score as low, never high', () => {
    // An absent reading is not a good one — defaulting to optimism would hide
    // exactly the scans that most need checking.
    expect(resolveConfidenceTier(undefined)).toBe('low');
    expect(resolveConfidenceTier(Number.NaN)).toBe('low');
    expect(resolveConfidenceTier(Number.POSITIVE_INFINITY)).toBe('low');
  });

  it('keeps the thresholds ordered and in range', () => {
    expect(LOW_CONFIDENCE_THRESHOLD).toBeGreaterThan(0);
    expect(LOW_CONFIDENCE_THRESHOLD).toBeLessThan(HIGH_CONFIDENCE_THRESHOLD);
    expect(HIGH_CONFIDENCE_THRESHOLD).toBeLessThanOrEqual(1);
  });

  it('tells a low-confidence user to check every field', () => {
    const message = describeConfidence('low', 0.3);
    expect(message).toContain('30%');
    expect(message).toMatch(/unreliable/i);
    expect(CONFIDENCE_TITLES.low).toBe('Manual verification needed');
  });

  it('stays calm for medium and high scans', () => {
    expect(describeConfidence('medium', 0.7)).toContain('70%');
    expect(describeConfidence('medium', 0.7)).not.toMatch(/unreliable/i);
    expect(describeConfidence('high', 0.9)).toContain('90%');
  });

  it('does not print NaN% when the score is missing', () => {
    expect(describeConfidence('low', undefined)).toContain('unknown');
    expect(describeConfidence('low', undefined)).not.toContain('NaN');
  });
});
