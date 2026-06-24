import { describe, expect, it, vi } from 'vitest';
import { RECEIPT_OCR_SAMPLES } from './__fixtures__/receiptOcrSamples';

vi.mock('pdfjs-dist/build/pdf', () => ({
  GlobalWorkerOptions: {
    workerSrc: '',
  },
}));

vi.mock('./documentIntelligenceService', () => ({
  documentIntelligenceService: {
    normalizeMerchantName: (value: string) => value.toLowerCase(),
    toTitleCase: (value: string) => value
      .split(/\s+/)
      .filter(Boolean)
      .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
      .join(' '),
    detectCurrency: () => 'INR',
    predictCategory: vi.fn(async () => ({
      category: 'Food',
      confidence: 0.86,
      source: 'test',
    })),
  },
}));

import { parseReceiptText } from './receiptScannerService';

describe('parseReceiptText', () => {
  it('extracts labeled total and avoids gstin-like numeric noise for tax', async () => {
    const raw = RECEIPT_OCR_SAMPLES.labeledTotalWithTax;

    const result = await parseReceiptText(raw, 'user-1');

    expect(result.amount).toBe(103);
    expect(result.subtotal).toBe(100);
    expect(result.taxAmount).toBe(3);
    expect(result.paymentMethod).toBe('UPI');
  });

  it('drops unrealistic far-future OCR dates', async () => {
    const raw = RECEIPT_OCR_SAMPLES.invalidFutureDate;

    const result = await parseReceiptText(raw, 'user-2');

    expect(result.amount).toBe(155);
    expect(result.date).toBeUndefined();
  });

  it('derives tax when subtotal and total are present', async () => {
    const result = await parseReceiptText(RECEIPT_OCR_SAMPLES.deriveTaxFromSubtotalAndTotal, 'user-3');

    expect(result.amount).toBe(472.5);
    expect(result.subtotal).toBe(450);
    expect(result.taxAmount).toBe(22.5);
    expect(result.paymentMethod).toBe('Visa');
  });

  it('derives subtotal when tax and total are present', async () => {
    const result = await parseReceiptText(RECEIPT_OCR_SAMPLES.deriveSubtotalFromTaxAndTotal, 'user-4');

    expect(result.amount).toBe(700);
    expect(result.taxAmount).toBe(42);
    expect(result.subtotal).toBe(658);
  });

  it('prefers labeled total over long metadata numbers', async () => {
    const result = await parseReceiptText(RECEIPT_OCR_SAMPLES.metadataNoiseWithRealTotal, 'user-5');

    expect(result.amount).toBe(219);
    expect(result.taxAmount).toBeUndefined();
  });

  it('keeps meaningful item names and filters OCR garbage item rows', async () => {
    const result = await parseReceiptText(RECEIPT_OCR_SAMPLES.noisyItemLines, 'user-6');

    expect(result.amount).toBe(196);
    expect(result.items?.length).toBe(1);
    expect(result.items?.[0]?.name).toBe('Masala Dosa');
    expect(result.items?.[0]?.amount).toBe(120);
  });

  it('parses indian restaurant bills without treating VAT TIN or footer ids as money', async () => {
    const result = await parseReceiptText(RECEIPT_OCR_SAMPLES.caravanMenuRestaurant, 'user-7');

    expect(result.merchantName).toBe('Caravan Menu');
    expect(result.amount).toBe(10949.4);
    expect(result.subtotal).toBe(10428);
    expect(result.taxAmount).toBe(521.4);
    expect(result.invoiceNumber).toBe('12827');
    expect(result.category).toBe('Food & Dining');
    expect(result.time).toBe('09:18 PM');
  });

  it('extracts tabular item rows that include quantity and rate columns', async () => {
    const result = await parseReceiptText(RECEIPT_OCR_SAMPLES.caravanMenuRestaurant, 'user-7b');

    expect(result.items?.length).toBeGreaterThan(0);
    expect(result.items?.[0]?.name).toBe('SPICY MANGOLA');
    expect(result.items?.[0]?.amount).toBe(438);
  });

  it('extracts date with dot separators', async () => {
    const result = await parseReceiptText(RECEIPT_OCR_SAMPLES.dotSeparatorDate, 'user-8');

    expect(result.date).toBeInstanceOf(Date);
    expect(result.date?.getDate()).toBe(15);
    expect(result.date?.getMonth()).toBe(2); // March = 2
    expect(result.date?.getFullYear()).toBe(2026);
    expect(result.taxAmount).toBe(86);
    expect(result.amount).toBe(1814);
  });

  it('extracts date with OCR-garbled pipe separators', async () => {
    const result = await parseReceiptText(RECEIPT_OCR_SAMPLES.garbledSeparatorDate, 'user-9');

    expect(result.date).toBeInstanceOf(Date);
    expect(result.date?.getDate()).toBe(15);
    expect(result.date?.getMonth()).toBe(2);
    expect(result.date?.getFullYear()).toBe(2026);
  });

  it('extracts tax from standalone GST line', async () => {
    const result = await parseReceiptText(RECEIPT_OCR_SAMPLES.plainGstTaxLine, 'user-10');

    expect(result.amount).toBe(525);
    expect(result.subtotal).toBe(500);
    expect(result.taxAmount).toBe(25);
  });

  it('uses subtotal plus GST when a printed paid amount is partial', async () => {
    const result = await parseReceiptText(RECEIPT_OCR_SAMPLES.sriKrishnaPartialAmountWithGst, 'user-10b');

    expect(result.merchantName).toBe('Sri Krishna');
    expect(result.amount).toBe(70.31);
    expect(result.subtotal).toBe(65);
    expect(result.taxAmount).toBe(5.31);
    expect(result.validationResult).toMatchObject({
      isValid: false,
      calculated: 70.31,
      detected: 59,
    });
  });

  it('extracts date with spaced separators', async () => {
    const result = await parseReceiptText(RECEIPT_OCR_SAMPLES.spacedDate, 'user-11');

    expect(result.date).toBeInstanceOf(Date);
    expect(result.date?.getDate()).toBe(10);
    expect(result.date?.getMonth()).toBe(2);
    expect(result.date?.getFullYear()).toBe(2026);
    expect(result.amount).toBe(680);
  });

  it('extracts service tax and VAT components from detailed restaurant bills', async () => {
    const result = await parseReceiptText(RECEIPT_OCR_SAMPLES.hiraSweetsDetailed, 'user-12');

    expect(result.merchantName).toBe('Hira Sweets & Restaurant');
    expect(result.amount).toBe(89);
    expect(result.subtotal).toBe(75);
    expect(result.taxAmount).toBeCloseTo(12.73, 2);
    expect(result.taxBreakdown).toEqual([
      { name: 'Service Tax', rate: 4.8, amount: 3.35 },
      { name: 'VAT', rate: 12.5, amount: 9.38 },
    ]);
    expect(result.items?.[0]).toEqual({
      name: 'CHOLE BHATURE',
      quantity: 1,
      rate: 75,
      amount: 75,
    });
  });

  it('extracts VAT and STX breakdown with a valid computed total', async () => {
    const result = await parseReceiptText(RECEIPT_OCR_SAMPLES.pariwaarRestaurantDetailed, 'user-13');

    expect(result.amount).toBe(799);
    expect(result.subtotal).toBe(663);
    expect(result.taxAmount).toBeCloseTo(135.93, 2);
    expect(result.taxBreakdown).toEqual([
      { name: 'VAT', rate: 14.5, amount: 96.15 },
      { name: 'STX', rate: 6, amount: 39.78 },
    ]);
    expect(result.validationResult?.isValid).toBe(true);
    expect(result.items?.[0]).toEqual({
      name: 'Chicken Corn Soup',
      quantity: 1,
      rate: 94,
      amount: 94,
    });
  });

  it('extracts itemized VAT receipts with quantity and rate columns', async () => {
    const result = await parseReceiptText(RECEIPT_OCR_SAMPLES.nairMessDetailed, 'user-14');

    expect(result.amount).toBe(1119);
    expect(result.subtotal).toBe(1097);
    expect(result.taxAmount).toBeCloseTo(21.94, 2);
    expect(result.taxBreakdown).toEqual([
      { name: 'VAT', amount: 21.94 },
    ]);
    expect(result.items?.[1]).toEqual({
      name: 'MUTTON FRY',
      quantity: 2,
      rate: 77,
      amount: 154,
    });
  });
});
