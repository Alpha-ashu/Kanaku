import { describe, expect, it, vi } from 'vitest';

vi.mock('pdfjs-dist/build/pdf', () => ({
  GlobalWorkerOptions: {
    workerSrc: '',
  },
}));

import { ReceiptParserService, type ParsingStrategy } from './receiptParserService';

describe('ReceiptParserService', () => {
  it('selects and merges highest-confidence strategy results', async () => {
    const service = new ReceiptParserService();

    const primary: ParsingStrategy = {
      name: 'Primary',
      confidence: () => 0.9,
      parse: async () => ({
        merchantName: 'Tea House',
        amount: 196,
        confidence: 0.9,
      }),
    };

    const secondary: ParsingStrategy = {
      name: 'Secondary',
      confidence: () => 0.75,
      parse: async () => ({
        amount: 196,
        taxAmount: 16,
        subtotal: 180,
        paymentMethod: 'UPI',
      }),
    };

    const custom = new ReceiptParserService();
    (custom as unknown as { strategies: ParsingStrategy[] }).strategies = [];
    custom.registerStrategy(primary);
    custom.registerStrategy(secondary);

    const result = await custom.parseReceipt('sample text');

    expect(result.merchantName).toBe('Tea House');
    expect(result.amount).toBe(196);
    expect(result.taxAmount).toBe(16);
    expect(result.subtotal).toBe(180);
    expect(result.paymentMethod).toBe('UPI');
    // confidence = (avg strategy confidence 0.825  0.6) + (completeness 0.5  0.4) = 0.695
    expect(result.confidence).toBeCloseTo(0.695, 3);

    void service;
  });

  it('throws when no strategy can parse content', async () => {
    const custom = new ReceiptParserService();
    (custom as unknown as { strategies: ParsingStrategy[] }).strategies = [];
    custom.registerStrategy({
      name: 'NoMatch',
      confidence: () => 0.1,
      parse: async () => null,
    });

    await expect(custom.parseReceipt('completely unknown format')).rejects.toThrow('Could not parse receipt');
  });
});
