import { describe, expect, it } from 'vitest';
import { parseBankStatement } from './bankStatementScannerService';

describe('parseBankStatement', () => {
  it('parses debit and credit columns with running balances', async () => {
    const rawStatement = [
      'BANK STATEMENT',
      'A/C No: 9876543210',
      'From 01/01/2024 to 31/01/2024',
      'Balance Brought Forward: INR50,000.00',
      'Date Description Debit Credit Balance',
      '01/01/2024 Salary Credit 0.00 30,000.00 80,000.00',
      '02/01/2024 ATM Withdrawal 2,000.00 0.00 78,000.00',
      '03/01/2024 UPI Transfer to John 1,500.00 0.00 76,500.00',
      'Balance Carried Forward: INR76,500.00',
    ].join('\n');

    const result = await parseBankStatement(rawStatement);

    expect(result.accountNumber).toBe('9876543210');
    expect(result.statementPeriod).toBe('01/01/2024 to 31/01/2024');
    expect(result.openingBalance).toBe(50000);
    expect(result.closingBalance).toBe(76500);
    expect(result.transactions).toHaveLength(3);
    expect(result.transactions[0]).toMatchObject({
      date: '01/01/2024',
      description: 'Salary Credit',
      amount: 30000,
      type: 'credit',
      balance: 80000,
      category: 'Salary',
    });
    expect(result.transactions[1]).toMatchObject({
      amount: 2000,
      type: 'debit',
      balance: 78000,
      category: 'ATM Withdrawal',
    });
  });

  it('parses amount and running balance rows without CR/DR markers', async () => {
    const rawStatement = [
      'Bank Statement',
      'Account Number: 1234567890',
      '01/02/2024 POS Amazon Purchase 5,499.00 44,501.00',
      '02/02/2024 Interest Payout 120.50 44,621.50',
    ].join('\n');

    const result = await parseBankStatement(rawStatement);

    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0]).toMatchObject({
      description: 'POS Amazon Purchase',
      amount: 5499,
      type: 'debit',
      balance: 44501,
      category: 'Card Payment',
    });
    expect(result.transactions[1]).toMatchObject({
      description: 'Interest Payout',
      amount: 120.5,
      type: 'credit',
      balance: 44621.5,
      category: 'Interest',
    });
  });
});
