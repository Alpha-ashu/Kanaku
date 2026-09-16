import { describe, expect, it } from 'vitest';
import { softHyphenate } from '@/lib/utils';

const SHY = '­';

describe('softHyphenate', () => {
  it('inserts soft hyphens at syllable breaks of known long words', () => {
    expect(softHyphenate('Transportation')).toBe(`Trans${SHY}por${SHY}ta${SHY}tion`);
    expect(softHyphenate('Investments')).toBe(`In${SHY}vest${SHY}ments`);
  });

  it('keeps the original casing and is invisible once soft hyphens are removed', () => {
    const out = softHyphenate('ENTERTAINMENT');
    expect(out).toBe(`EN${SHY}TER${SHY}TAIN${SHY}MENT`);
    expect(out.replaceAll(SHY, '')).toBe('ENTERTAINMENT');
  });

  it('handles multi-word labels and leaves short or unknown words untouched', () => {
    expect(softHyphenate('Emergency Fund')).toBe(`Emer${SHY}gen${SHY}cy Fund`);
    expect(softHyphenate('Food')).toBe('Food');
    expect(softHyphenate('Photography')).toBe('Photography');
    expect(softHyphenate('')).toBe('');
  });
});
