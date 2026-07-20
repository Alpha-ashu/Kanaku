/**
 * Regression tests from the Hanoi TADKA-2 receipt incident: a VND bill parsed
 * as ₹872,000 (triggering INSUFFICIENT_BALANCE) with table-layout OCR noise
 * bleeding into the merchant/subcategory fields.
 */
import { describe, expect, it, vi } from 'vitest';

// pdfjs (pulled in transitively via receiptScannerService) needs DOM canvas
// APIs that jsdom lacks — mock it out exactly like receiptScannerService.test.ts.
vi.mock('pdfjs-dist/build/pdf.mjs', () => ({ GlobalWorkerOptions: { workerSrc: '' } }));
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: '' }));

import { documentIntelligenceService } from '@/services/documentIntelligenceService';
import { EnhancedReceiptScannerService } from '@/services/enhancedReceiptScannerService';
import type { ReceiptScanResult } from '@/services/receiptScannerService';

const { detectCurrency } = documentIntelligenceService;

describe('detectCurrency — locale evidence', () => {
  it('detects VND for a Vietnamese receipt even when it mentions "INDIAN"', () => {
    const text = `TADKA 2 TEMPORARY INVOICE Bill number: 210129
      Jeera Rice 75,000  Tawa Roti 115,000  Garlic Naan 45,000
      Total Amount: 872,000
      TADKA INDIAN RESTAURANT 2, Hoan Kiem, Ha Noi, Viet Nam`;
    expect(detectCurrency(text)).toBe('VND');
  });

  it('detects VND from the currency code alone', () => {
    expect(detectCurrency('Grand total 250,000 VND')).toBe('VND');
  });

  it('still detects INR for Indian receipts', () => {
    expect(detectCurrency('Sub Total Rs. 650 CGST @9% SGST @9% GSTIN 07AACCF1234A1Z5 New Delhi India')).toBe('INR');
  });
});

describe('EnhancedReceiptScannerService.validateAndCorrect — OCR noise fields', () => {
  const service = new EnhancedReceiptScannerService();
  const base: ReceiptScanResult = {
    merchantName: 'Tadka 2',
    amount: 872000,
    currency: 'VND',
    date: new Date('2025-06-08'),
    category: 'Food & Dining',
    confidence: 0.9,
    rawText: 'TADKA 2 TEMPORARY INVOICE',
  } as ReceiptScanResult;

  it('blanks a merged table-layout merchant name', async () => {
    const result = await service.validateAndCorrect({
      ...base,
      merchantName: 'y + oR Code: #VCNKA CS: Tacka? | 7 Garlic Naan',
    });
    expect(result.merchantName).toBeUndefined();
  });

  it('blanks a metadata-bleed subcategory', async () => {
    const result = await service.validateAndCorrect({
      ...base,
      subcategory: 'Code: #VCNKA | Table: 11-FLOOR',
    } as ReceiptScanResult);
    expect(result.subcategory).toBeUndefined();
  });

  it('keeps clean fields untouched', async () => {
    const result = await service.validateAndCorrect({ ...base, subcategory: 'Dinner' } as ReceiptScanResult);
    expect(result.merchantName).toBe('Tadka 2');
    expect(result.subcategory).toBe('Dinner');
  });
});
