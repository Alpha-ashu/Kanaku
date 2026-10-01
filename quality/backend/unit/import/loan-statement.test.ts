/**
 * Lender statements (loan SOA) read from the borrower's side.
 *
 * A real Bajaj Finance statement imported into a bank account came out as two
 * rows: one +₹450 "income" whose description was the statement's entire footer
 * (notes, disclaimer, addresses), filed under Transport, and one −₹5,662. The
 * statement actually holds five payments the borrower made. These cases pin the
 * rules: payments are money out, dues/fees and bounced auto-debits are not
 * money moved, rows end at the Total line, and both PDF text orders read alike.
 */
import fs from 'fs';
import path from 'path';
import { describeLoanStatement, parseLoanStatement } from '../../../../backend/src/features/import/loanStatement';
import { parseStatementText } from '../../../../backend/src/features/import/statement.parser';
import { EXPECTED_PAYMENTS, LENDER_EMAIL_TEXT, loanStatementText } from '../../tests/helpers/loanStatementFixture';

describe.each(['pdfjs', 'pdfparse'] as const)('loan statement, %s text order', (order) => {
  const statement = parseLoanStatement(loanStatementText(order))!;

  it('reads the statement and its metadata', () => {
    expect(statement).not.toBeNull();
    expect(statement).toMatchObject({
      lender: 'Bajaj Finance',
      loanAccountNumber: '4TESTLN000001',
      statementDate: '2025-03-31',
      repaymentBank: { name: 'HDFC BANK LTD', accountNumber: 'xxxxxxxx4321' },
      unreadRows: 0,
    });
    expect(statement.rows).toHaveLength(15);
  });

  it('turns the ledger into the payments the borrower made', () => {
    expect(statement.payments.map(({ date, amount, reference, description }) => ({ date, amount, reference, description })))
      .toEqual(EXPECTED_PAYMENTS);
    expect(statement.payments.reduce((sum, p) => sum + p.amount, 0)).toBe(7103);
  });

  it('leaves out dues, fees and bounced auto-debits', () => {
    expect(statement.bouncedAttempts).toBe(2);
    expect(statement.chargeRows).toBe(6);
  });

  it('reconciles every column against the statement\'s Total line', () => {
    expect(statement.reconciled).toBe(true);
  });

  it('keeps the footer and page headings out of every row', () => {
    for (const row of statement.rows) {
      expect(row.particulars).not.toMatch(/disclaimer|registered office|https?:|total|transaction details|balance \(|page \d/i);
      expect(row.particulars.length).toBeLessThan(120);
    }
  });

  it('reads a negative balance and a row wrapped over six lines', () => {
    const advance = statement.rows.find((r) => r.date === '2024-02-20')!;
    expect(advance.balance).toBe(-1975);
    expect(advance.particulars).toBe('Payment Received ONLINE vide Reference No: 90000000002 for Advance Instalment/Overdue and Charges');
  });
});

describe('loan statement edge cases', () => {
  it('flags a statement whose rows no longer add up to its Total line', () => {
    const missingRow = parseLoanStatement(loanStatementText('pdfjs', { dropRow: 6 }))!;
    expect(missingRow.reconciled).toBe(false);
  });

  it('is not fooled by a lender email that mentions loans and dates', () => {
    expect(parseLoanStatement(LENDER_EMAIL_TEXT)).toBeNull();
  });

  it('leaves bank statements to the bank parsers', () => {
    const bank = 'Date,Narration,Chq/Ref No,Withdrawal Amt,Deposit Amt,Closing Balance\n01/04/2026,UPI-SWIGGY,UPI1,450.00,,9550.00';
    expect(parseLoanStatement(bank)).toBeNull();
  });

  it('explains what was imported, what was left out and where it belongs', () => {
    const notes = describeLoanStatement(parseLoanStatement(loanStatementText('pdfparse'))!);
    expect(notes[0]).toBe('Loan statement from Bajaj Finance: 5 payments you made (₹7,103) can be imported as expenses. '
      + '6 instalment due and fee entries and 2 bounced auto-debits are not money you paid, so they are left out.');
    expect(notes[1]).toBe('The EMIs were paid from HDFC BANK LTD xxxxxxxx4321 — import them into that account.');
  });
});

describe('server statement parser', () => {
  it('reads loan statements itself, as money out, before any LLM', async () => {
    const parsed = await parseStatementText(loanStatementText('pdfparse'));
    expect(parsed.parser).toBe('loan-statement');
    expect(parsed.transactions).toHaveLength(5);
    expect(parsed.transactions.every((t) => t.type === 'debit')).toBe(true);
    expect(parsed).toMatchObject({
      bankName: 'Bajaj Finance',
      accountNumber: '4TESTLN000001',
      reconciled: true,
      period: { from: '2024-01-10', to: '2025-03-31' },
      repaymentAccount: { bankName: 'HDFC BANK LTD', accountNumber: 'xxxxxxxx4321' },
    });
    expect(parsed.warnings[0]).toMatch(/^Loan statement from Bajaj Finance: 5 payments/);
  });
});

describe('one parser for the server and the app', () => {
  it('keeps the frontend copy identical to the backend copy', () => {
    const root = path.resolve(__dirname, '../../../..');
    const backendCopy = fs.readFileSync(path.join(root, 'backend/src/features/import/loanStatement.ts'), 'utf8');
    const frontendCopy = fs.readFileSync(path.join(root, 'frontend/src/lib/loanStatement.ts'), 'utf8');
    expect(frontendCopy).toBe(backendCopy);
  });
});
