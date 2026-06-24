import { describe, expect, it } from 'vitest';
import { parseTranscriptLocally } from '@/services/voiceFinancialService';

describe('voiceFinancialService', () => {
  it('keeps every command in a multi-intent input and extracts loan people', () => {
    const result = parseTranscriptLocally('I spent ₹5000 on petrol and lent ₹2500 to Jeejo.');

    expect(result.actions).toHaveLength(2);
    expect(result.actions[0]).toMatchObject({
      type: 'expense',
      entities: {
        amount: 5000,
        category: 'Transport',
      },
    });
    expect(result.actions[1]).toMatchObject({
      type: 'loan_lend',
      entities: {
        amount: 2500,
        person: 'Jeejo',
      },
    });
  });

  it('parses mixed lending and borrowing as independent actions', () => {
    const result = parseTranscriptLocally('I lent 5000 to Ravi and borrowed 300 from Arun');

    expect(result.actions).toHaveLength(2);
    expect(result.actions[0]).toMatchObject({
      type: 'loan_lend',
      entities: { amount: 5000, person: 'Ravi' },
    });
    expect(result.actions[1]).toMatchObject({
      type: 'loan_borrow',
      entities: { amount: 300, person: 'Arun' },
    });
  });
});
