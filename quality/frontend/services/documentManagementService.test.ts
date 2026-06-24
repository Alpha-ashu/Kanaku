import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const state = {
    documentRows: [] as Array<Record<string, any>>,
    transactionRows: [] as Array<Record<string, any>>,
  };

  return {
    state,
    updateDocumentRecord: vi.fn(async () => undefined),
    updateTransaction: vi.fn(async () => undefined),
  };
});

vi.mock('./documentIntelligenceService', () => ({
  documentIntelligenceService: {
    createDocumentRecord: vi.fn(),
    updateDocumentRecord: mocks.updateDocumentRecord,
  },
}));

vi.mock('@/lib/database', () => ({
  db: {
    documents: {
      get: vi.fn(async (id: number) => mocks.state.documentRows.find((row) => row.id === id)),
      filter: vi.fn((predicate: (row: Record<string, any>) => boolean) => ({
        first: vi.fn(async () => mocks.state.documentRows.find((row) => predicate(row))),
      })),
    },
    transactions: {
      get: vi.fn(async (id: number) => mocks.state.transactionRows.find((row) => row.id === id)),
      update: mocks.updateTransaction,
    },
    transaction: vi.fn(async (
      _mode: string,
      _documents: unknown,
      _transactions: unknown,
      work: () => Promise<void>,
    ) => work()),
  },
}));

import { DocumentManagementService } from './documentManagementService';

describe('DocumentManagementService', () => {
  beforeEach(() => {
    mocks.state.documentRows = [
      {
        id: 9,
        documentType: 'receipt',
        metadata: { merchantName: 'Hira Sweets' },
        linkedTransactionId: undefined,
      },
      {
        id: 11,
        documentType: 'statement',
        linkedTransactionId: 3,
      },
    ];
    mocks.state.transactionRows = [
      {
        id: 3,
        description: 'Dinner',
        importMetadata: { 'Tax Amount': '12.73' },
      },
    ];
    mocks.updateDocumentRecord.mockClear();
    mocks.updateTransaction.mockClear();
  });

  it('links a receipt to a transaction and stores an attachment pointer', async () => {
    const service = new DocumentManagementService();

    await service.linkTransaction(9, 3);

    expect(mocks.updateDocumentRecord).toHaveBeenCalledWith(9, {
      processingStatus: 'completed',
      linkedTransactionId: 3,
      metadata: {
        merchantName: 'Hira Sweets',
        'Document Id': '9',
      },
    });

    expect(mocks.updateTransaction).toHaveBeenCalledWith(3, expect.objectContaining({
      attachment: 'document:9',
      importMetadata: {
        'Tax Amount': '12.73',
        'Document Id': '9',
      },
    }));
  });

  it('returns the linked receipt for a transaction', async () => {
    mocks.state.documentRows.push({
      id: 12,
      documentType: 'receipt',
      linkedTransactionId: 3,
      fileName: 'bill.png',
    });

    const service = new DocumentManagementService();
    const result = await service.getLinkedReceipt(3);

    expect(result?.id).toBe(12);
    expect(result?.documentType).toBe('receipt');
  });
});
