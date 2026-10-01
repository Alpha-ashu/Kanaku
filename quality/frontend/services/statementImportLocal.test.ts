/**
 * The app's own statement parser — what runs when the server can't (offline,
 * or a role without the server-side import permission).
 *
 *   - A lender's loan statement becomes the borrower's payments: expenses,
 *     Loan / Debt Payments, a clean description with the reference, and the
 *     account the EMIs were paid from suggested as the target.
 *   - A bank statement's last row no longer swallows the totals line and the
 *     footer (notes, disclaimer, addresses) as its description.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loanStatementText } from '../../backend/tests/helpers/loanStatementFixture';

const accounts = vi.hoisted(() => ({ list: [] as Array<{ id: number; name: string }> }));

vi.mock('pdfjs-dist/build/pdf.mjs', () => ({ GlobalWorkerOptions: {}, getDocument: vi.fn() }));
vi.mock('tesseract.js', () => ({ createWorker: vi.fn() }));
vi.mock('@/lib/database', () => ({
  db: {
    transactions: { where: () => ({ equals: () => ({ toArray: async () => [] }) }) },
    accounts: { toArray: async () => accounts.list },
  },
}));
vi.mock('@/lib/auth-sync-integration', () => ({
  queueRecordUpsertSync: vi.fn(), processPendingSyncQueue: vi.fn(), runWithCloudSyncSuppressed: vi.fn(),
}));
vi.mock('@/services/importSync', () => ({ pushImportedTransactions: vi.fn() }));
vi.mock('@/lib/pinUnlockCoordinator', () => ({ getPinUnlockToken: vi.fn(), setPinUnlockToken: vi.fn() }));
vi.mock('@/lib/offlineUploadQueue', () => ({ enqueueFileUpload: vi.fn(async () => undefined) }));
vi.mock('@/lib/transactionAggregation', () => ({ rebuildAccountBalances: vi.fn(), setAccountTargetBalance: vi.fn() }));
vi.mock('@/services/documentIntelligenceService', () => ({
  documentIntelligenceService: {
    createDocumentRecord: vi.fn(async () => 1),
    updateDocumentRecord: vi.fn(async () => undefined),
    detectBankName: vi.fn(() => undefined),
    detectAccountNumber: vi.fn(() => undefined),
    detectOpeningBalance: vi.fn(() => undefined),
    detectCurrency: vi.fn(() => 'INR'),
    predictCategory: vi.fn(async () => ({ category: 'Others', confidence: 0.5 })),
    normalizeMerchantName: vi.fn((value: string) => value),
    toTitleCase: vi.fn((value: string) => value),
    upsertCategoryPreference: vi.fn(async () => undefined),
    upsertMerchantProfile: vi.fn(async () => undefined),
  },
}));

const { statementImportService } = await import('@/services/statementImportService');

type Service = {
  parseStatementLocally: (file: File, options: unknown) => Promise<import('@/services/statementImportService').ImportResult>;
  extractPdfText: (file: File) => Promise<string>;
  extractTransactionsFromText: (text: string, userId: string) => Promise<import('@/services/statementImportService').ParsedTransaction[]>;
};
const service = statementImportService as unknown as Service;
const options = { accountId: 3, userId: 'u1', accountType: 'bank' };
const pdf = () => new File(['%PDF'], 'statement.pdf', { type: 'application/pdf' });
/** The row's calendar date as stored (local midnight), not shifted to UTC. */
const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

describe('on-device statement parsing', () => {
  beforeEach(() => {
    accounts.list = [{ id: 3, name: 'Indian Overseas Bank' }, { id: 7, name: 'HDFC Savings' }];
  });

  it('reads a loan statement as the EMI payments the borrower made', async () => {
    vi.spyOn(service, 'extractPdfText').mockResolvedValue(loanStatementText('pdfjs'));
    const result = await service.parseStatementLocally(pdf(), options);

    expect(result.success).toBe(true);
    expect(result.transactions.map((t) => [day(t.transaction_date), t.amount, t.transaction_type])).toEqual([
      ['2024-02-07', 2680, 'expense'],
      ['2024-02-20', 2000, 'expense'],
      ['2024-04-02', 25, 'expense'],
      ['2024-04-04', 1998, 'expense'],
      ['2025-01-15', 400, 'expense'],
    ]);
    expect(result.transactions[0]).toMatchObject({
      cleaned_description: 'Bajaj Finance EMI payment (incl. bounce charges) (Ref: 90000000001)',
      category: 'Loan / Debt Payments',
      merchant_name: 'Bajaj Finance',
    });
    expect(result.statementMeta).toMatchObject({ parser: 'loan-statement', bankName: 'Bajaj Finance', reconciled: true });
    expect(result.statementMeta?.warnings?.[0]).toMatch(/^Loan statement from Bajaj Finance: 5 payments/);
    // "HDFC BANK LTD xxxx4321" on the statement → the user's "HDFC Savings".
    expect(result.suggestedAccountId).toBe(7);
  });

  it('ends a bank statement row at the totals line instead of swallowing the footer', async () => {
    const text = [
      'Date Particulars Withdrawals Deposits Balance',
      '01-03-2026 UPI/DR/123456/SWIGGY/okaxis 450.00 9,550.00',
      'Food order',
      '05-03-2026 NEFT CR ACME CORP SALARY 50,000.00 59,550.00',
      'Total 450.00 50,000.00',
      // Short enough to pass for a wrapped narration — only the Total line above says it isn't one.
      'Thank you for banking with us',
      '*** END OF STATEMENT ***',
      'Note: This is a computer generated statement and does not require a signature. Please write to us at care@examplebank.com within 30 days.',
      'Registered Office: 1 Example Road, Mumbai 400001 www.examplebank.com',
    ].join('\n');
    const rows = await service.extractTransactionsFromText(text, 'u1');

    expect(rows).toHaveLength(2);
    expect(rows[1].amount).toBe(50000);
    expect(rows[1].cleaned_description).not.toMatch(/total|thank you|note|registered|computer generated|www\./i);
    expect(rows[0].cleaned_description).toContain('Food order');
  });

  it('keeps a transaction whose narration names a website', async () => {
    // Amount-first layout: the date sits inside the line, after the narration.
    const text = [
      'Transaction Details Date Withdrawals Deposits Balance',
      'UPI/DR/412345678901/SWIGGY/okaxis 01-03-2026 450.00 9,550.00',
      'POS/512345XXXXXX1234/WWW.NETFLIX.COM 02-03-2026 649.00 8,901.00',
      'NEFT CR ACME CORP SALARY 05-03-2026 50,000.00 58,901.00',
      'Total 1,099.00 50,000.00',
      'Visit www.examplebank.com',
    ].join('\n');
    const rows = await service.extractTransactionsFromText(text, 'u1');

    expect(rows.map((r) => [day(r.transaction_date), r.amount])).toEqual([
      ['2026-03-01', 450],
      ['2026-03-02', 649],
      ['2026-03-05', 50000],
    ]);
    expect(rows[1].cleaned_description).toMatch(/netflix/i);
  });
});
