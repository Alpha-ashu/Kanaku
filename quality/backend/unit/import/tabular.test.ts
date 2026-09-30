/**
 * Spreadsheet/CSV reading for imports. Each case is a file shape a real bank or
 * finance app exports, and each used to go wrong: incomes booked as expenses,
 * Indian dates read US-style or replaced by today, quoted commas splitting cells,
 * "Value Date" read as an amount.
 */
import {
  detectDelimiter,
  detectTabularColumns,
  directionFromWord,
  inferDateOrder,
  parseAmount,
  parseDateValue,
  parseDelimited,
  readTabular,
} from '../../../../backend/src/features/import/tabular';

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

describe('CSV parsing', () => {
  it('handles quoted commas, escaped quotes, quoted newlines and a BOM', () => {
    const text = '\uFEFFDate,Description,Amount\r\n05/01/2025,"Swiggy, Bangalore",-450\r\n06/01/2025,"He said ""hi""\nline two",1200\r\n';
    const rows = parseDelimited(text);
    expect(rows).toEqual([
      ['Date', 'Description', 'Amount'],
      ['05/01/2025', 'Swiggy, Bangalore', '-450'],
      ['06/01/2025', 'He said "hi"\nline two', '1200'],
    ]);
  });

  it('detects semicolon, tab and pipe delimiters', () => {
    expect(detectDelimiter('Date;Amount;Note\n01.02.2025;12,50;Kaffee\n02.02.2025;3,00;Brot')).toBe(';');
    expect(detectDelimiter('Date\tAmount\n2025-01-01\t10\n2025-01-02\t20')).toBe('\t');
    expect(detectDelimiter('Date|Amount\n2025-01-01|10\n2025-01-02|20')).toBe('|');
    expect(detectDelimiter('Date,Description,Amount\n2025-01-01,"a; b",10')).toBe(',');
  });
});

describe('amounts', () => {
  it.each([
    ['1,23,456.78', 123456.78],
    ['₹ 2,500.00', 2500],
    ['Rs. 99', 99],
    ['INR 1,000', 1000],
    ['-450', -450],
    ['(1,200.50)', -1200.5],
    ['300-', -300],
    ['1.234,56', 1234.56],
    ['12,5', 12.5],
    ['1,234', 1234],
    ['1.234.567', 1234567],
  ])('%s → %s', (raw, value) => {
    expect(parseAmount(raw)?.value).toBeCloseTo(value, 2);
  });

  it('reads Dr/Cr markers', () => {
    expect(parseAmount('1,234.00 Dr')).toEqual({ value: 1234, marker: 'debit' });
    expect(parseAmount('CR 500')).toEqual({ value: 500, marker: 'credit' });
  });

  it('returns nothing for blanks and text', () => {
    expect(parseAmount('')).toBeUndefined();
    expect(parseAmount('-')).toBeUndefined();
    expect(parseAmount('n/a')).toBeUndefined();
  });

  it('maps type words to a direction', () => {
    expect(directionFromWord('Income')).toBe('credit');
    expect(directionFromWord('DR')).toBe('debit');
    expect(directionFromWord('Cr')).toBe('credit');
    expect(directionFromWord('Expense')).toBe('debit');
    expect(directionFromWord('Transfer')).toBe('transfer');
    expect(directionFromWord('Groceries')).toBeUndefined();
  });
});

describe('dates', () => {
  it('reads Indian day-first dates by default', () => {
    expect(day(parseDateValue('05/01/2025'))).toBe('2025-01-05');
    expect(day(parseDateValue('13-04-2026'))).toBe('2026-04-13');
    expect(day(parseDateValue('01.02.25'))).toBe('2025-02-01');
  });

  it('infers month-first only when the file proves it', () => {
    expect(inferDateOrder(['01/05/2025', '01/13/2025'])).toBe('MDY');
    expect(inferDateOrder(['13/01/2025', '01/05/2025'])).toBe('DMY');
    expect(inferDateOrder(['01/05/2025', '02/06/2025'])).toBe('DMY');
    expect(day(parseDateValue('01/13/2025', 'MDY'))).toBe('2025-01-13');
  });

  it('reads ISO, month names and Excel serials', () => {
    expect(day(parseDateValue('2025-03-09T10:00:00Z'))).toBe('2025-03-09');
    expect(day(parseDateValue('05 Jan 2025'))).toBe('2025-01-05');
    expect(day(parseDateValue('5-Sept-25'))).toBe('2025-09-05');
    expect(day(parseDateValue('January 5, 2025'))).toBe('2025-01-05');
    expect(day(parseDateValue('45667'))).toBe('2025-01-10');
  });

  it('refuses impossible or unreadable dates instead of inventing one', () => {
    expect(parseDateValue('31/02/2025')).toBeNull();
    expect(parseDateValue('yesterday')).toBeNull();
    expect(parseDateValue('')).toBeNull();
    expect(parseDateValue('01/01/1901')).toBeNull();
  });
});

describe('columns and rows', () => {
  it('never reads "Value Date" as money, and does not match "cr" inside "Description"', () => {
    const cols = detectTabularColumns(['Date', 'Description', 'Value Date', 'Withdrawal Amt', 'Deposit Amt', 'Closing Balance']);
    expect(cols).toMatchObject({ date: 0, description: 1, debit: 3, credit: 4, balance: 5 });
    expect(cols.amount).toBeUndefined();
  });

  it('types an HDFC-style debit/credit export and skips the bank preamble', () => {
    const grid = parseDelimited([
      'HDFC BANK LTD',
      'Account No: XXXX1234',
      '',
      'Date,Narration,Chq/Ref No,Value Dt,Withdrawal Amt,Deposit Amt,Closing Balance',
      '01/04/26,UPI-SWIGGY,UPI123,01/04/26,450.00,,9550.00',
      '03/04/26,NEFT SALARY ACME,NEFT789,03/04/26,,"50,000.00","59,550.00"',
    ].join('\n'));
    const table = readTabular(grid);
    expect(table.transactions).toHaveLength(2);
    expect(table.transactions[0]).toMatchObject({ amount: 450, direction: 'debit', description: 'UPI-SWIGGY' });
    expect(table.transactions[1]).toMatchObject({ amount: 50000, direction: 'credit', balance: 59550 });
    expect(day(table.transactions[1].date)).toBe('2026-04-03');
  });

  it('types a signed-amount export (negative = money out)', () => {
    const table = readTabular(parseDelimited('Date,Description,Amount\n2025-01-05,Salary,50000\n2025-01-06,Rent,-15000'));
    expect(table.transactions.map((t) => t.direction)).toEqual(['credit', 'debit']);
    expect(table.transactions.map((t) => t.amount)).toEqual([50000, 15000]);
  });

  it('types a finance-app export with a Type column and flags transfers for review', () => {
    const table = readTabular(parseDelimited('Date,Type,Category,Amount,Note\n05-01-2025,Income,Salary,50000,Jan pay\n06-01-2025,Expense,Food,250,Lunch\n07-01-2025,Transfer,,1000,To savings'));
    expect(table.transactions.map((t) => t.direction)).toEqual(['credit', 'debit', 'debit']);
    expect(table.transactions[2].transferHint).toBe(true);
    expect(table.transactions[0].rawCategory).toBe('Salary');
  });

  it('keeps an unsigned, untyped file as expenses (the previous behaviour)', () => {
    const table = readTabular(parseDelimited('Date,Description,Amount\n05/01/2025,Tea,20\n05/01/2025,Tea,20'));
    expect(table.transactions.map((t) => t.direction)).toEqual(['debit', 'debit']);
  });

  it('reports an unreadable date instead of using today', () => {
    const table = readTabular(parseDelimited('Date,Description,Amount\nsoon,Mystery,10'));
    expect(table.transactions[0].date).toBeNull();
    expect(table.transactions[0].rawDate).toBe('soon');
  });
});
