import { describe, expect, it, vi } from 'vitest';
import { smartExpenseImportService } from '@/services/smartExpenseImportService';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const fixturesDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../quality/fixtures/imports',
);

const loadImportFixture = (fileName: string) =>
    fs.readFileSync(path.join(fixturesDir, fileName), 'utf-8');

// Mock the database
vi.mock('@/lib/database', () => ({
    db: {
        accounts: {
            toArray: vi.fn(async () => [
                { id: 1, name: 'ICICI Savings', type: 'bank', balance: 5000, currency: 'INR', isActive: true },
                { id: 2, name: 'Cash Wallet', type: 'cash', balance: 1000, currency: 'INR', isActive: true },
                { id: 3, name: 'HDFC Salary Account', type: 'bank', balance: 10000, currency: 'INR', isActive: true },
                { id: 4, name: 'SBI Account', type: 'bank', balance: 2000, currency: 'INR', isActive: true },
                { id: 5, name: 'Axis Bank', type: 'bank', balance: 3000, currency: 'INR', isActive: true },
            ]),
        },
        categories: {
            toArray: vi.fn(async () => []),
        },
        transactions: {
            toArray: vi.fn(async () => []),
        },
        settings: {
            get: vi.fn(async () => null),
        }
    },
}));

vi.mock('@/services/syncService', () => ({
    initializeBackendSync: vi.fn(),
}));

describe('SmartExpenseImportService Integration Test', () => {
    it('correctly parses the 250+ records third-party JSON', async () => {
        const jsonContent = loadImportFixture('expense_test_250_records.json');

        const file = new File([jsonContent], 'expense_test_250_records.json', { type: 'application/json' });

        // @ts-ignore
        const preview = await smartExpenseImportService.analyzeFile(file, { defaultAccountId: 1 });

        expect(preview.kind).toBe('third-party');
        if (preview.kind === 'third-party') {
            expect(preview.rows.length).toBe(250);

            const firstRow = preview.rows[0];
            expect(firstRow.amount).toBe(118.6);
            expect(firstRow.category).toBe('Education');
            expect(firstRow.merchant).toBe('Shell Petrol');
            expect(firstRow.accountId).toBe(1);
            expect(firstRow.transactionType).toBe('expense');
        }
    });

    it('correctly handles different.json with alternative keys', async () => {
        const jsonContent = loadImportFixture('different.json');

        const file = new File([jsonContent], 'different.json', { type: 'application/json' });

        // @ts-ignore
        const preview = await smartExpenseImportService.analyzeFile(file, { defaultAccountId: 1 });

        expect(preview.kind).toBe('third-party');
        if (preview.kind === 'third-party') {
            expect(preview.rows.length).toBe(3);

            const salaryRow = preview.rows[0];
            expect(salaryRow.amount).toBe(60000);
            expect(salaryRow.transactionType).toBe('income');
            expect(salaryRow.category).toBe('Salary');
            expect(salaryRow.description).toBe('Salary - Monthly salary');
        }
    });

    it('normalizes locale-formatted amounts, spreadsheet dates, and in-file duplicates', async () => {
        const payload = JSON.stringify([
            {
                date: 45292,
                amount: '1.234,56',
                description: 'Flight to Delhi',
                merchant: 'Air India',
                category: 'Travel',
                account: 'ICICI Savings'
            },
            {
                date: 45292,
                amount: '1.234,56',
                description: 'Flight to Delhi',
                merchant: 'Air India',
                category: 'Travel',
                account: 'ICICI Savings'
            }
        ]);

        const file = new File([payload], 'localized-import.json', { type: 'application/json' });

        // @ts-ignore
        const preview = await smartExpenseImportService.analyzeFile(file, { defaultAccountId: 1 });

        expect(preview.kind).toBe('third-party');
        if (preview.kind === 'third-party') {
            expect(preview.rows).toHaveLength(2);
            expect(preview.rows[0]?.amount).toBe(1234.56);
            expect(preview.rows[0]?.date).toBeInstanceOf(Date);
            expect(preview.rows[0]?.duplicate).toBe(false);
            expect(preview.rows[1]?.duplicate).toBe(true);
        }
    });

    it('parses structured ledger JSON like expense.json into import preview rows', async () => {
        const payload = JSON.stringify({
            user: {
                user_id: 'U1001',
                name: 'Ashraf',
                currency: 'INR',
            },
            accounts: [
                { account_id: 'A1', account_name: 'HDFC Salary Account', type: 'bank', balance: 85000 },
                { account_id: 'A2', account_name: 'ICICI Credit Card', type: 'credit_card', balance: -12000 },
                { account_id: 'A3', account_name: 'Cash Wallet', type: 'cash', balance: 3500 },
                { account_id: 'A4', account_name: 'Paytm Wallet', type: 'digital_wallet', balance: 2400 },
            ],
            transactions: [
                {
                    transaction_id: 'T1',
                    account_id: 'A1',
                    type: 'credit',
                    amount: 50000,
                    category: 'Salary',
                    description: 'Monthly salary credited',
                    date: '2026-03-01',
                },
                {
                    transaction_id: 'T2',
                    account_id: 'A1',
                    type: 'debit',
                    amount: 2500,
                    category: 'Food',
                    description: 'Dinner at restaurant',
                    date: '2026-03-03',
                },
                {
                    transaction_id: 'T3',
                    account_id: 'A2',
                    type: 'debit',
                    amount: 5000,
                    category: 'Shopping',
                    description: 'Amazon purchase',
                    date: '2026-03-05',
                },
                {
                    transaction_id: 'T4',
                    account_id: 'A4',
                    type: 'debit',
                    amount: 600,
                    category: 'Transport',
                    description: 'Uber ride payment',
                    date: '2026-03-06',
                },
            ],
        });

        const file = new File([payload], 'expense.json', { type: 'application/json' });

        // @ts-ignore
        const preview = await smartExpenseImportService.analyzeFile(file, { defaultAccountId: 1 });

        expect(preview.kind).toBe('third-party');
        if (preview.kind === 'third-party') {
            expect(preview.rows).toHaveLength(4);
            expect(preview.rows[0]?.transactionType).toBe('income');
            expect(preview.rows[0]?.category).toBe('Salary');
            expect(preview.rows[0]?.resolvedAccountName).toBe('HDFC Salary Account');
            expect(preview.rows[2]?.resolvedAccountName).toBe('ICICI Credit Card');
            expect(preview.rows[3]?.resolvedAccountName).toBe('Paytm Wallet');
        }
    });

    it('flags duplicate transaction ids and duplicate content like expense1.json', async () => {
        const payload = JSON.stringify({
            accounts: [
                { account_id: 'A1', account_name: 'HDFC Salary Account', type: 'bank', balance: 90000 },
                { account_id: 'A5', account_name: 'Google Pay Wallet', type: 'digital_wallet', balance: 1800 },
            ],
            transactions: [
                {
                    transaction_id: 'T1',
                    account_id: 'A1',
                    type: 'credit',
                    amount: 50000,
                    category: 'Salary',
                    description: 'Monthly salary credited',
                    date: '2026-03-01',
                },
                {
                    transaction_id: 'T1',
                    account_id: 'A1',
                    type: 'credit',
                    amount: 50000,
                    category: 'Salary',
                    description: 'Monthly salary credited',
                    date: '2026-03-01',
                },
                {
                    transaction_id: 'T6',
                    account_id: 'A5',
                    type: 'debit',
                    amount: 450,
                    category: 'Food',
                    description: 'Lunch order via Swiggy',
                    date: '2026-03-11',
                },
            ],
        });

        const file = new File([payload], 'expense1.json', { type: 'application/json' });

        // @ts-ignore
        const preview = await smartExpenseImportService.analyzeFile(file, { defaultAccountId: 1 });

        expect(preview.kind).toBe('third-party');
        if (preview.kind === 'third-party') {
            expect(preview.rows).toHaveLength(3);
            expect(preview.rows[0]?.duplicate).toBe(false);
            expect(preview.rows[1]?.duplicate).toBe(true);
            expect(preview.rows[1]?.externalId).toBe('T1');
            expect(preview.rows[2]?.resolvedAccountName).toBe('Google Pay Wallet');
        }
    });

    // A transfer moves money between two of the user's OWN accounts. Recording
    // it as income or expense double-counts it — the source account correctly
    // falls, but the same rupee also gets counted as spent or earned, corrupting
    // both the period's totals and net worth. This is the failure mode the
    // 'transfer' transactionType and TRANSFER_TO_KEYS detection exist to prevent.
    describe('transfers', () => {
        it('classifies a row with an explicit "transfer" type and applies both legs', async () => {
            const payload = JSON.stringify([
                {
                    date: '2026-03-10',
                    amount: 2000,
                    type: 'transfer',
                    account: 'ICICI Savings',
                    toAccount: 'Cash Wallet',
                    description: 'Move to wallet',
                },
            ]);
            const file = new File([payload], 'transfer.json', { type: 'application/json' });

            // @ts-ignore
            const preview = await smartExpenseImportService.analyzeFile(file, { defaultAccountId: 1 });

            expect(preview.kind).toBe('third-party');
            if (preview.kind !== 'third-party') return;
            expect(preview.rows).toHaveLength(1);
            const row = preview.rows[0];
            expect(row.transactionType).toBe('transfer');
            expect(row.resolvedAccountName).toBe('ICICI Savings');
            expect(row.transferToAccountName).toBe('Cash Wallet');
            expect(row.transferToAccountId).toBe(2); // Cash Wallet, from the mocked accounts
            // A transfer is not a spending/earning category — it must not land in
            // the expense or income taxonomy.
            expect(row.category).not.toBe('');
        });

        it('infers a transfer from a destination-account column even with no type field', async () => {
            const payload = JSON.stringify([
                {
                    date: '2026-03-11',
                    amount: 500,
                    account: 'ICICI Savings',
                    toAccount: 'Cash Wallet',
                    description: 'Weekly cash top-up',
                },
            ]);
            const file = new File([payload], 'transfer-inferred.json', { type: 'application/json' });

            // @ts-ignore
            const preview = await smartExpenseImportService.analyzeFile(file, { defaultAccountId: 1 });

            expect(preview.kind).toBe('third-party');
            if (preview.kind !== 'third-party') return;
            expect(preview.rows[0]?.transactionType).toBe('transfer');
        });

        it('does not let income-sounding narrative override an explicit transfer', async () => {
            // "credited" is a hard income signal elsewhere in this service — a
            // transfer description routinely uses exactly this wording ("credited
            // to savings"), so the transfer classification must win.
            const payload = JSON.stringify([
                {
                    date: '2026-03-12',
                    amount: 1000,
                    type: 'transfer',
                    account: 'ICICI Savings',
                    toAccount: 'Cash Wallet',
                    description: 'Amount credited to savings account',
                },
            ]);
            const file = new File([payload], 'transfer-narrative.json', { type: 'application/json' });

            // @ts-ignore
            const preview = await smartExpenseImportService.analyzeFile(file, { defaultAccountId: 1 });

            expect(preview.kind).toBe('third-party');
            if (preview.kind !== 'third-party') return;
            expect(preview.rows[0]?.transactionType).toBe('transfer');
        });
    });

    // Manual column mapping is the fallback for a file auto-detection cannot
    // read at all — a genuinely unseen third-party app, or ambiguous headers.
    describe('manual column mapping', () => {
        it('reports unmappedRequiredFields when neither date nor amount can be found', async () => {
            const payload = JSON.stringify([
                { txn_when: '2026-03-01', money: 100, note: 'Coffee' },
            ]);
            const file = new File([payload], 'unrecognised.json', { type: 'application/json' });

            // @ts-ignore
            const preview = await smartExpenseImportService.analyzeFile(file, { defaultAccountId: 1 });

            expect(preview.kind).toBe('third-party');
            if (preview.kind !== 'third-party') return;
            expect(preview.unmappedRequiredFields).toEqual(expect.arrayContaining(['date', 'amount']));
            expect(preview.sourceHeaders).toEqual(expect.arrayContaining(['txn_when', 'money', 'note']));
        });

        it('recovers a row once the user maps date/amount to the real columns', async () => {
            const payload = JSON.stringify([
                { txn_when: '2026-03-01', money: 100, note: 'Coffee' },
            ]);
            const file = new File([payload], 'unrecognised.json', { type: 'application/json' });

            // @ts-ignore
            const preview = await smartExpenseImportService.analyzeFile(file, {
                defaultAccountId: 1,
                columnMapping: { date: 'txn_when', amount: 'money' },
            });

            expect(preview.kind).toBe('third-party');
            if (preview.kind !== 'third-party') return;
            expect(preview.unmappedRequiredFields).toHaveLength(0);
            expect(preview.rows[0]?.errors).toHaveLength(0);
            expect(preview.rows[0]?.amount).toBe(100);
            expect(preview.rows[0]?.date).toBeInstanceOf(Date);
        });

        it('a manual mapping overrides a column auto-detection would otherwise pick', async () => {
            // Two candidate amount-like columns; auto-detection would take
            // `amount`, but the user knows `total` is the real figure here.
            const payload = JSON.stringify([
                { date: '2026-03-01', amount: 1, total: 999, note: 'Adjustment row' },
            ]);
            const file = new File([payload], 'ambiguous.json', { type: 'application/json' });

            // @ts-ignore
            const preview = await smartExpenseImportService.analyzeFile(file, {
                defaultAccountId: 1,
                columnMapping: { amount: 'total' },
            });

            expect(preview.kind).toBe('third-party');
            if (preview.kind !== 'third-party') return;
            expect(preview.rows[0]?.amount).toBe(999);
        });
    });
});
