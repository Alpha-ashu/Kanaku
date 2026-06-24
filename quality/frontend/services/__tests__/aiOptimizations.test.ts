import { describe, it, expect, beforeEach } from 'vitest';
import { parseVoiceExpense, parseMultipleTransactions } from '../../lib/voiceExpenseParser';
import { parseBankStatement } from '../bankStatementScannerService';

describe('AI Model Optimizations', () => {
  describe('Voice Memo Processing', () => {
    it('should parse single expense quickly', () => {
      const start = performance.now();
      const result = parseVoiceExpense('Food 500 rupees at restaurant');
      const end = performance.now();
      
      expect(end - start).toBeLessThan(50); // Should process in under 50ms
      expect(result.amount).toBe(500);
      expect(result.category).toBe('Food & Dining');
      expect(result.intent).toBe('expense');
    });

    it('should parse multiple transactions efficiently', () => {
      const start = performance.now();
      const results = parseMultipleTransactions('Food 500 and Uber 200 and Shopping 1000');
      const end = performance.now();
      
      expect(end - start).toBeLessThan(100); // Should process in under 100ms
      expect(results).toHaveLength(3);
      expect(results[0]?.amount).toBe(500);
      expect(results[1]?.amount).toBe(200);
      expect(results[2]?.amount).toBe(1000);
    });

    it('should handle different amount formats', () => {
      const testCases = [
        { input: 'INR500', expected: 500 },
        { input: '500 rupees', expected: 500 },
        { input: 'rs 500', expected: 500 },
        { input: 'INR 500', expected: 500 },
        { input: 'five hundred', expected: 500 },
      ];

      testCases.forEach(({ input, expected }) => {
        const result = parseVoiceExpense(`Food ${input}`);
        expect(result.amount).toBe(expected);
      });
    });

    it('should detect intent with early termination', () => {
      const start = performance.now();
      const result = parseVoiceExpense('Transfer 5000 to savings account');
      const end = performance.now();
      
      expect(end - start).toBeLessThan(30); // Fast path for transfers
      expect(result.intent).toBe('transfer');
      expect(result.amount).toBe(5000);
    });
  });

  describe('Bank Statement Processing', () => {
    it('should identify bank statements quickly', async () => {
      const sampleStatement = `
        BANK STATEMENT
        Account No: 1234567890
        Period: 01/01/2024 to 31/01/2024
        Opening Balance: INR50,000.00
        Closing Balance: INR45,000.00
        
        01/01/2024 Salary Credit INR30,000.00 CR
        02/01/2024 ATM Withdrawal INR2,000.00 DR
        03/01/2024 UPI Transfer to John INR1,500.00 DR
      `;

      const start = performance.now();
      const result = await parseBankStatement(sampleStatement);
      const end = performance.now();

      expect(end - start).toBeLessThan(200); // Should process in under 200ms
      expect(result.accountNumber).toBe('1234567890');
      expect(result.statementPeriod).toBe('01/01/2024 to 31/01/2024');
      expect(result.openingBalance).toBe(50000);
      expect(result.closingBalance).toBe(45000);
      expect(result.transactions).toHaveLength(3);
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('should categorize transactions correctly', async () => {
      const transactions = `
        01/01/2024 Salary Credit INR30,000.00 CR
        02/01/2024 ATM Withdrawal INR2,000.00 DR
        03/01/2024 UPI Transfer INR1,500.00 DR
        04/01/2024 Card Payment at Amazon INR5,000.00 DR
      `;

      const result = await parseBankStatement(transactions);
      
      expect(result.transactions[0]?.category).toBe('Salary');
      expect(result.transactions[1]?.category).toBe('ATM Withdrawal');
      expect(result.transactions[2]?.category).toBe('Bank Transfer');
      expect(result.transactions[3]?.category).toBe('Card Payment');
    });

    it('should handle non-bank documents gracefully', async () => {
      const receiptText = `
        RESTAURANT BILL
        Food Items: INR500
        Tax: INR50
        Total: INR550
      `;

      const start = performance.now();
      const result = await parseBankStatement(receiptText);
      const end = performance.now();

      expect(end - start).toBeLessThan(50); // Fast rejection
      expect(result.confidence).toBeLessThan(0.2);
      expect(result.transactions).toHaveLength(0);
    });
  });

  describe('Performance Benchmarks', () => {
    it('should handle large voice inputs efficiently', () => {
      const largeInput = Array(20).fill('Food 500 and Uber 200').join(' and ');
      
      const start = performance.now();
      const results = parseMultipleTransactions(largeInput);
      const end = performance.now();

      expect(end - start).toBeLessThan(500); // Should handle large inputs in under 500ms
      expect(results.length).toBeGreaterThan(20);
    });

    it('should process bank statements with many transactions', async () => {
      const manyTransactions = Array(50).fill(0).map((_, i) => 
        `${String(i + 1).padStart(2, '0')}/01/2024 Transaction ${i + 1} INR${(i + 1) * 100}.00 DR`
      ).join('\n');

      const start = performance.now();
      const result = await parseBankStatement(manyTransactions);
      const end = performance.now();

      expect(end - start).toBeLessThan(1000); // Should handle many transactions in under 1s
      expect(result.transactions.length).toBe(50);
    });
  });
});

describe('Integration Tests', () => {
  it('should handle mixed document types', async () => {
    const voiceInput = 'Salary 50000 and Food 1000 and Rent 15000';
    const bankStatement = `
      Account No: 9876543210
      Salary Credit INR50,000.00 CR
      Restaurant Payment INR1,000.00 DR
      Rent Payment INR15,000.00 DR
    `;

    const voiceStart = performance.now();
    const voiceResults = parseMultipleTransactions(voiceInput);
    const voiceEnd = performance.now();

    const bankStart = performance.now();
    const bankResults = await parseBankStatement(bankStatement);
    const bankEnd = performance.now();

    // Both should be fast
    expect(voiceEnd - voiceStart).toBeLessThan(100);
    expect(bankEnd - bankStart).toBeLessThan(300);

    // Results should be consistent
    expect(voiceResults).toHaveLength(3);
    expect(bankResults.transactions).toHaveLength(3);

    // Amounts should match
    expect(voiceResults[0]?.amount).toBe(50000);
    expect(bankResults.transactions[0]?.amount).toBe(50000);
  });
});
