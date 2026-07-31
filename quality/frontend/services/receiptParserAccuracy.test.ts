import { describe, expect, it, vi } from 'vitest';
import { RECEIPT_OCR_SAMPLES } from './__fixtures__/receiptOcrSamples';

vi.mock('pdfjs-dist/build/pdf', () => ({ GlobalWorkerOptions: { workerSrc: '' } }));
vi.mock('@/services/documentIntelligenceService', () => ({
  documentIntelligenceService: {
    normalizeMerchantName: (value: string) => value.toLowerCase(),
    toTitleCase: (value: string) => value.split(/\s+/).filter(Boolean)
      .map((t) => t.charAt(0).toUpperCase() + t.slice(1)).join(' '),
    detectCurrency: () => 'INR',
    predictCategory: vi.fn(async () => ({ category: 'Food', confidence: 0.86, source: 'test' })),
  },
}));

import { parseReceiptText } from '@/services/receiptScannerService';

/**
 * Receipt parser accuracy scorecard.
 *
 * This is deliberately NOT the same job as receiptScannerService.test.ts. That file
 * asserts individual behaviours and fails loudly when one breaks. This one measures
 * the *rate* across the whole corpus and enforces a floor, which catches the kind of
 * regression that moves overall accuracy without tripping any single assertion —
 * a parser change that fixes two receipts and quietly breaks three.
 *
 * It also replaces an unverifiable claim. A QA report cited "96.8% field parsing
 * accuracy" with no harness in the repo that computed it; that number could be
 * neither reproduced nor defended on the next commit. This one is computed from
 * source on every run and printed as a per-field breakdown.
 *
 * Ground truth below is the same set of values the behaviour tests assert, so the
 * two files cannot disagree about what "correct" means.
 *
 * The image corpus in `quality/smaple_files/` is intentionally out of scope: OCRing
 * 18 images takes minutes and drags real Tesseract/Paddle behaviour into a unit
 * test. This scores the *parser* against fixed OCR text, so a failure always means
 * the parser changed, never that the OCR engine had a bad day.
 */

type Expected = {
  amount?: number;
  subtotal?: number;
  taxAmount?: number;
  merchantName?: string;
  invoiceNumber?: string;
  time?: string;
  /** Expressed as [day, monthIndex, year]; `null` asserts no date was extracted. */
  date?: [number, number, number] | null;
};

const GROUND_TRUTH: Record<string, Expected> = {
  labeledTotalWithTax: { amount: 103, subtotal: 100, taxAmount: 3 },
  deriveTaxFromSubtotalAndTotal: { amount: 472.5, subtotal: 450, taxAmount: 22.5 },
  deriveSubtotalFromTaxAndTotal: { amount: 700, subtotal: 658, taxAmount: 42 },
  metadataNoiseWithRealTotal: { amount: 219 },
  noisyItemLines: { amount: 196 },
  invalidFutureDate: { amount: 155, date: null },
  caravanMenuRestaurant: {
    amount: 10949.4, subtotal: 10428, taxAmount: 521.4,
    merchantName: 'Caravan Menu', invoiceNumber: '12827', time: '09:18 PM',
  },
  dotSeparatorDate: { amount: 1814, taxAmount: 86, date: [15, 2, 2026] },
  garbledSeparatorDate: { date: [15, 2, 2026] },
  plainGstTaxLine: { amount: 525, subtotal: 500, taxAmount: 25 },
  sriKrishnaPartialAmountWithGst: {
    amount: 70.31, subtotal: 65, taxAmount: 5.31, merchantName: 'Sri Krishna',
  },
  spacedDate: { amount: 680, date: [10, 2, 2026] },
  hiraSweetsDetailed: {
    amount: 89, subtotal: 75, taxAmount: 12.73, merchantName: 'Hira Sweets & Restaurant',
  },
  pariwaarRestaurantDetailed: { amount: 799, subtotal: 663, taxAmount: 135.93 },
  nairMessDetailed: { amount: 1119, subtotal: 1097, taxAmount: 21.94 },
};

/** Money is compared to 2dp; derived tax/subtotal legitimately carry rounding. */
const moneyMatches = (actual?: number, expected?: number) =>
  actual !== undefined && expected !== undefined && Math.abs(actual - expected) < 0.015;

const dateMatches = (actual: Date | undefined, expected: [number, number, number] | null) => {
  if (expected === null) return actual === undefined;
  if (!(actual instanceof Date)) return false;
  return actual.getDate() === expected[0]
    && actual.getMonth() === expected[1]
    && actual.getFullYear() === expected[2];
};

interface FieldTally { correct: number; total: number }

describe('receipt parser accuracy', () => {
  it('meets the field-extraction accuracy floor across the sample corpus', async () => {
    const tallies: Record<string, FieldTally> = {};
    const failures: string[] = [];

    const record = (field: string, ok: boolean, sample: string, detail: string) => {
      tallies[field] ??= { correct: 0, total: 0 };
      tallies[field].total += 1;
      if (ok) tallies[field].correct += 1;
      else failures.push(`${sample}.${field}: ${detail}`);
    };

    for (const [sample, expected] of Object.entries(GROUND_TRUTH)) {
      const raw = RECEIPT_OCR_SAMPLES[sample as keyof typeof RECEIPT_OCR_SAMPLES];
      expect(raw, `fixture "${sample}" is missing`).toBeTruthy();

      const result = await parseReceiptText(raw, `accuracy-${sample}`);

      if (expected.amount !== undefined) {
        record('amount', moneyMatches(result.amount, expected.amount), sample,
          `expected ${expected.amount}, got ${result.amount}`);
      }
      if (expected.subtotal !== undefined) {
        record('subtotal', moneyMatches(result.subtotal, expected.subtotal), sample,
          `expected ${expected.subtotal}, got ${result.subtotal}`);
      }
      if (expected.taxAmount !== undefined) {
        record('taxAmount', moneyMatches(result.taxAmount, expected.taxAmount), sample,
          `expected ${expected.taxAmount}, got ${result.taxAmount}`);
      }
      if (expected.merchantName !== undefined) {
        record('merchantName', result.merchantName === expected.merchantName, sample,
          `expected "${expected.merchantName}", got "${result.merchantName}"`);
      }
      if (expected.invoiceNumber !== undefined) {
        record('invoiceNumber', result.invoiceNumber === expected.invoiceNumber, sample,
          `expected "${expected.invoiceNumber}", got "${result.invoiceNumber}"`);
      }
      if (expected.time !== undefined) {
        record('time', result.time === expected.time, sample,
          `expected "${expected.time}", got "${result.time}"`);
      }
      if (expected.date !== undefined) {
        record('date', dateMatches(result.date, expected.date), sample,
          `expected ${JSON.stringify(expected.date)}, got ${result.date?.toISOString()}`);
      }
    }

    const totals = Object.values(tallies).reduce(
      (acc, t) => ({ correct: acc.correct + t.correct, total: acc.total + t.total }),
      { correct: 0, total: 0 },
    );
    const overall = (totals.correct / totals.total) * 100;

    const scorecard = Object.entries(tallies)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([field, t]) => `  ${field.padEnd(14)} ${t.correct}/${t.total}  ${((t.correct / t.total) * 100).toFixed(1)}%`)
      .join('\n');

    console.log(
      `\nReceipt parser accuracy — ${Object.keys(GROUND_TRUTH).length} receipts, ${totals.total} fields\n`
      + `${scorecard}\n`
      + `  ${'OVERALL'.padEnd(14)} ${totals.correct}/${totals.total}  ${overall.toFixed(1)}%\n`
      + (failures.length ? `\nMisses:\n${failures.map((f) => `  - ${f}`).join('\n')}\n` : ''),
    );

    // The corpus currently parses cleanly. The floor is set at 100% deliberately:
    // every sample here has known-correct values, so any drop is a real regression,
    // not noise. If a future receipt is added that the parser genuinely cannot
    // handle yet, lower this to the measured rate in the same commit and say why —
    // do not delete the sample.
    expect(overall, `parser accuracy dropped:\n${failures.join('\n')}`).toBe(100);
  });
});
