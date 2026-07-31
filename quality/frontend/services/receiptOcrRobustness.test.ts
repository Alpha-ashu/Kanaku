import { describe, expect, it, vi } from 'vitest';

vi.mock('pdfjs-dist/build/pdf', () => ({ GlobalWorkerOptions: { workerSrc: '' } }));
vi.mock('@/services/documentIntelligenceService', () => ({
  documentIntelligenceService: {
    normalizeMerchantName: (value: string) => value.toLowerCase(),
    toTitleCase: (value: string) => value.split(/\s+/).filter(Boolean)
      .map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join(' '),
    detectCurrency: () => 'INR',
    predictCategory: vi.fn(async () => ({ category: 'Food', confidence: 0.8, source: 'test' })),
  },
}));

import { parseReceiptText } from '@/services/receiptScannerService';

/**
 * Money-reading regressions found by probing the parser with realistic OCR output.
 *
 * Each case previously produced a wrong number rather than no number, which is the
 * dangerous failure mode for an expense tracker — a silently mis-scanned receipt is
 * accepted and only noticed when the balance drifts.
 */
describe('receipt amount extraction — OCR robustness', () => {
  it('reads a total whose digits OCR misread as letters', async () => {
    // Thermal print: 0→O and 1→l are the classic confusions. Previously the total
    // line yielded no number at all and the scan came back with no amount.
    const result = await parseReceiptText([
      'CAFE COFFEE DAY',
      'TOTAL: 1O5O.OO',
    ].join('\n'), 'ocr-letters');

    expect(result.amount).toBe(1050);
  });

  it('treats a comma as a decimal separator in European format', async () => {
    // "EUR 12,50" previously parsed as 1250 — every comma was stripped as a
    // thousands separator, a 100x over-read on the amount.
    const result = await parseReceiptText([
      'SUPERMARKT BERLIN',
      'SUMME  EUR 12,50',
    ].join('\n'), 'decimal-comma');

    expect(result.amount).toBe(12.5);
  });

  it('rejoins a decimal point that OCR spaced apart', async () => {
    // "1,050 . 00" previously tokenised as two numbers and the fragment "00"/"50"
    // could win the total — measured as 50, a 21x under-read.
    const result = await parseReceiptText([
      'RELIANCE FRESH',
      'TOTAL  1,050 . 00',
    ].join('\n'), 'spaced-decimal');

    expect(result.amount).toBe(1050);
  });

  it('still reads a plain thousands comma as grouping', async () => {
    // Guard for the fix above: "2,499.00" must stay 2499, not become 2.499.
    const result = await parseReceiptText([
      'BIG BAZAAR',
      'GRAND TOTAL',
      '2,499.00',
    ].join('\n'), 'thousands');

    expect(result.amount).toBe(2499);
  });

  it('reads rupee-symbol amounts', async () => {
    const result = await parseReceiptText([
      'CHAI POINT',
      'Masala Chai       ₹120',
      'TOTAL   ₹1234',
    ].join('\n'), 'rupee');

    expect(result.amount).toBe(1234);
  });

  it('does not invent numbers from words made of confusable letters', async () => {
    // The OCR repair maps O→0, S→5, B→8. It must never fire on a word: "SOS" and
    // "B2B" would otherwise become 505 and 828 and be offered as the total.
    const result = await parseReceiptText([
      'SOS EMERGENCY B2B SERVICES',
      'TOTAL 500.00',
    ].join('\n'), 'no-false-digits');

    expect(result.amount).toBe(500);
  });
});
