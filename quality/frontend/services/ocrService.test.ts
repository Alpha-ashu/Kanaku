import { describe, expect, it, vi } from 'vitest';

const terminateMock = vi.fn(async () => {});
const recognizeMock = vi.fn(async () => ({
  data: {
    text: 'TOTAL 103.00',
    confidence: 80,
  },
}));

vi.mock('tesseract.js', () => ({
  createWorker: vi.fn(async () => ({
    recognize: recognizeMock,
    terminate: terminateMock,
  })),
}));

vi.mock('@/services/receiptScannerService', () => ({
  preprocessReceiptFileVariants: vi.fn(async () => ([
    { label: 'clean', blob: new Blob(['ok'], { type: 'image/png' }) },
    { label: 'enhanced', blob: new Blob(['ok-2'], { type: 'image/png' }) },
  ])),
  parseReceiptText: vi.fn(async () => ({
    merchantName: 'AI A TEA',
    amount: 103,
    confidence: 0.4,
  })),
}));

vi.mock('@/services/receiptParserService', () => ({
  receiptParserService: {
    parseReceipt: vi.fn(async () => ({
      merchantName: 'AI A TEA',
      amount: 103,
      confidence: 0.4,
    })),
  },
}));

import { TesseractOCRService } from './ocrService';

describe('TesseractOCRService', () => {
  it('blends OCR and parser confidence instead of forcing low/zero confidence', async () => {
    const service = new TesseractOCRService();
    const file = new File(['x'], 'receipt.png', { type: 'image/png' });

    const result = await service.scanReceipt(file, 'user-1');

    expect(result.amount).toBe(103);
    // Combined confidence = (ocrConfidence 0.8 * 0.65) + (parserConfidence 0.4 * 0.35) = 0.52 + 0.14 = 0.66
    expect(result.confidence).toBeCloseTo(0.66, 2);
    expect(terminateMock).toHaveBeenCalled();
  });
});
