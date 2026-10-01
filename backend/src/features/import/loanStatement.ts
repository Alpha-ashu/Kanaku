/**
 * Lender "Statement of Account" (loan SOA) parser.
 *
 * KEEP IDENTICAL: this file exists twice — backend/src/features/import/loanStatement.ts
 * and frontend/src/lib/loanStatement.ts — so the server parser and the app's
 * offline fallback read loan statements the same way. A test fails when the two
 * copies differ. Pure: no imports, no I/O.
 *
 * Why a dedicated parser: a lender's statement is the LOAN's ledger, and a
 * bank-statement parser reads it backwards.
 *   - "Payment Received" is money the borrower PAID — money out of their bank.
 *   - The Debit column holds what the lender charged (instalment dues, fees):
 *     no money moved.
 *   - A bounced auto-debit appears as a receipt followed by its reversal: no
 *     money moved either.
 *   - Rows stop at the statement's "Total" line. The footer after it (notes,
 *     disclaimer, office addresses) is not part of the last row.
 *
 * Layout (Bajaj Finance and look-alikes), one row per dated line:
 *   Date | Particulars | Status | Debit | Credit | Bounce charges Due | Paid |
 *   Penal charges Due | Paid | Delay days | Balance
 * The eight numbers can sit on the date line (pdf.js text order) or on a later
 * line after the wrapped particulars (pdf-parse order); both are read.
 */

export interface LoanLedgerRow {
  /** YYYY-MM-DD */
  date: string;
  particulars: string;
  /** charged to the loan: instalment dues, fees, a bounced instalment */
  debit: number;
  /** received by the lender against instalments */
  credit: number;
  bounceDue: number;
  bouncePaid: number;
  penalDue: number;
  penalPaid: number;
  delayDays: number;
  balance: number;
  reference?: string;
}

export interface LoanPayment {
  /** YYYY-MM-DD */
  date: string;
  /** what left the borrower's bank: instalment + bounce + penal charges paid */
  amount: number;
  description: string;
  reference?: string;
  instalment: number;
  charges: number;
}

export interface LoanStatement {
  lender: string;
  loanAccountNumber?: string;
  /** the borrower's account the EMIs are debited from, as printed */
  repaymentBank?: { name: string; accountNumber?: string };
  /** YYYY-MM-DD — the statement's "as on" date */
  statementDate?: string;
  rows: LoanLedgerRow[];
  /** the borrower's payments, oldest first — the rows worth importing */
  payments: LoanPayment[];
  /** auto-debits that bounced: a receipt and its reversal, no money moved */
  bouncedAttempts: number;
  /** rows that only record what the lender charged (dues, fees) */
  chargeRows: number;
  /** dated rows whose amounts could not be read */
  unreadRows: number;
  /** parsed rows add up to the statement's own Total line; null when it has none */
  reconciled: boolean | null;
}

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

const toIsoDate = (token: string): string | undefined => {
  const match = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(token);
  if (!match) return undefined;
  const month = MONTHS[match[2].toLowerCase()];
  const day = Number(match[1]);
  if (!month || day < 1 || day > 31) return undefined;
  return `${match[3]}-${month}-${String(day).padStart(2, '0')}`;
};

/** 450.00, 5,664.00, 1,23,456.78, -5,626.00 */
const MONEY = /^-?(?:\d{1,3}(?:,\d{2,3})+|\d+)\.\d{2}$/;
const DAYS = /^\d{1,4}$/;
const money = (token: string): number => Number(token.replace(/,/g, ''));
const round2 = (value: number): number => Math.round(value * 100) / 100;

const DATED_LINE = /^(\d{1,2}-[A-Za-z]{3}-\d{4})(?:\s+(.*))?$/;
const TABLE_END = /^-?\s*total\b|end of statement/i;
/** Column headings and page furniture repeated on every page of the table. */
const PAGE_FURNITURE: RegExp[] = [
  /^loan transaction details\b/i,
  /^transaction details\b/i,
  /^debit\s*\(/i,
  /^balance\s*\(/i,
  /^bounce charges\b/i,
  /^penal charges\b/i,
  /^delay\b/i,
  /^days$/i,
  /^date\s+particulars\b/i,
  /^due\s*\(/i,
  /^page\s+\d+\s+of\s+\d+/i,
];

const lenderName = (text: string): string => {
  if (/bajaj\s*fin(?:ance|serv)/i.test(text)) return 'Bajaj Finance';
  const named = /\b([A-Z][A-Za-z&.]+(?:\s+[A-Z][A-Za-z&.]+){0,3}\s+(?:Finance|Financial Services|Fincorp|Capital))(?:\s+(?:Limited|Ltd\.?))?\b/.exec(text);
  return named ? named[1] : 'Lender';
};

interface Block {
  date: string;
  parts: string[];
}

const readBlock = (block: Block): LoanLedgerRow | null => {
  const tokens = block.parts.join(' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  // The eight amounts: six money columns, the delay in days, then the balance.
  for (let i = 0; i + 8 <= tokens.length; i += 1) {
    const window = tokens.slice(i, i + 8);
    if (!window.slice(0, 6).every((t) => MONEY.test(t)) || !DAYS.test(window[6]) || !MONEY.test(window[7])) continue;
    const [debit, credit, bounceDue, bouncePaid, penalDue, penalPaid] = window.slice(0, 6).map(money);
    const particulars = [...tokens.slice(0, i), ...tokens.slice(i + 8)]
      .filter((t) => t !== '-')
      .join(' ')
      .trim();
    const reference = /\b(?:payment|reference)\s+no\.?\s*:?\s*(\d{6,})\b/i.exec(particulars)?.[1];
    return {
      date: block.date,
      particulars,
      debit,
      credit,
      bounceDue,
      bouncePaid,
      penalDue,
      penalPaid,
      delayDays: Number(window[6]),
      balance: money(window[7]),
      reference,
    };
  }
  return null;
};

const isBouncedReceipt = (row: LoanLedgerRow) => /amount received for/i.test(row.particulars) && /bounced/i.test(row.particulars);
const isBounceReversal = (row: LoanLedgerRow) => /\bbounced\b/i.test(row.particulars) && !isBouncedReceipt(row) && !/payment received/i.test(row.particulars);

const describePayment = (lender: string, row: LoanLedgerRow, instalment: number, bounce: number, penal: number): string => {
  const charges = [bounce > 0 ? 'bounce' : '', penal > 0 ? 'penal' : ''].filter(Boolean).join(' + ');
  if (instalment > 0) {
    const base = /advance/i.test(row.particulars) ? 'advance EMI payment' : 'EMI payment';
    return charges ? `${lender} ${base} (incl. ${charges} charges)` : `${lender} ${base}`;
  }
  return `${lender} EMI ${charges} charges`;
};

/**
 * Parses a lender's loan statement. Returns null when the text is not one —
 * callers then fall back to their bank-statement parsers.
 */
export const parseLoanStatement = (text: string): LoanStatement | null => {
  const isLoanStatement = /loan transaction details/i.test(text)
    || (/statement of account/i.test(text) && /\bloan\b/i.test(text) && /date\s+particulars/i.test(text));
  if (!isLoanStatement) return null;

  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  let start = lines.findIndex((line) => /^loan transaction details\b/i.test(line));
  if (start < 0) start = lines.findIndex((line) => /^date\s+particulars\b/i.test(line));
  if (start < 0) return null;

  const blocks: Block[] = [];
  let totalLine: string | undefined;
  for (const line of lines.slice(start)) {
    if (TABLE_END.test(line)) {
      if (/total\b/i.test(line)) totalLine = line;
      break;
    }
    if (PAGE_FURNITURE.some((pattern) => pattern.test(line))) continue;
    const dated = DATED_LINE.exec(line);
    const date = dated ? toIsoDate(dated[1]) : undefined;
    if (dated && date) {
      blocks.push({ date, parts: dated[2] ? [dated[2]] : [] });
    } else if (blocks.length > 0) {
      blocks[blocks.length - 1].parts.push(line);
    }
  }

  const rows: LoanLedgerRow[] = [];
  let unreadRows = 0;
  for (const block of blocks) {
    const row = readBlock(block);
    if (row) rows.push(row);
    else unreadRows += 1;
  }
  if (rows.length === 0) return null;

  const lender = lenderName(text);
  const payments: LoanPayment[] = [];
  let bouncedAttempts = 0;
  let chargeRows = 0;
  for (const row of rows) {
    if (isBouncedReceipt(row)) { bouncedAttempts += 1; continue; }
    if (isBounceReversal(row)) continue;
    const amount = round2(row.credit + row.bouncePaid + row.penalPaid);
    if (amount > 0) {
      payments.push({
        date: row.date,
        amount,
        description: describePayment(lender, row, row.credit, row.bouncePaid, row.penalPaid),
        reference: row.reference,
        instalment: row.credit,
        charges: round2(row.bouncePaid + row.penalPaid),
      });
    } else if (row.debit > 0 || row.bounceDue > 0 || row.penalDue > 0) {
      chargeRows += 1;
    }
  }

  let reconciled: boolean | null = null;
  if (totalLine) {
    const totals = totalLine.split(/\s+/).filter((t) => MONEY.test(t)).map(money);
    if (totals.length >= 6) {
      const sums = [
        rows.reduce((s, r) => s + r.debit, 0),
        rows.reduce((s, r) => s + r.credit, 0),
        rows.reduce((s, r) => s + r.bounceDue, 0),
        rows.reduce((s, r) => s + r.bouncePaid, 0),
        rows.reduce((s, r) => s + r.penalDue, 0),
        rows.reduce((s, r) => s + r.penalPaid, 0),
      ];
      reconciled = sums.every((sum, i) => Math.abs(round2(sum) - totals[i]) < 0.01);
    }
  }

  const repayment = /Repayment Bank A\/c Details\s+(.+?)\s+([Xx*]{2,}\d{2,6})\b/.exec(text);
  const asOn = /\bas on\s+(\d{1,2}-[A-Za-z]{3}-\d{4})/i.exec(text);

  return {
    lender,
    loanAccountNumber: /statement of account for\s+([A-Z0-9]{6,})/i.exec(text)?.[1],
    repaymentBank: repayment ? { name: repayment[1].trim(), accountNumber: repayment[2] } : undefined,
    statementDate: asOn ? toIsoDate(asOn[1]) : undefined,
    rows,
    payments: payments.sort((a, b) => a.date.localeCompare(b.date)),
    bouncedAttempts,
    chargeRows,
    unreadRows,
    reconciled,
  };
};

/** Plain-language notes for the import preview. */
export const describeLoanStatement = (statement: LoanStatement): string[] => {
  const total = round2(statement.payments.reduce((s, p) => s + p.amount, 0));
  const skipped: string[] = [];
  if (statement.chargeRows > 0) skipped.push(`${statement.chargeRows} instalment due and fee ${statement.chargeRows === 1 ? 'entry' : 'entries'}`);
  if (statement.bouncedAttempts > 0) skipped.push(`${statement.bouncedAttempts} bounced auto-debit${statement.bouncedAttempts === 1 ? '' : 's'}`);
  const found = statement.payments.length === 0
    ? `Loan statement from ${statement.lender}: it lists no payments from you, so there is nothing to import.`
    : `Loan statement from ${statement.lender}: ${statement.payments.length} payment${statement.payments.length === 1 ? '' : 's'} you made (₹${total.toLocaleString('en-IN')}) can be imported as expenses.`;
  const notes = [found + (skipped.length ? ` ${skipped.join(' and ')} are not money you paid, so they are left out.` : '')];
  if (statement.repaymentBank) {
    notes.push(`The EMIs were paid from ${statement.repaymentBank.name}${statement.repaymentBank.accountNumber ? ` ${statement.repaymentBank.accountNumber}` : ''} — import them into that account.`);
  }
  if (statement.unreadRows > 0) {
    notes.push(`${statement.unreadRows} row${statement.unreadRows === 1 ? '' : 's'} could not be read — check the statement before importing.`);
  }
  return notes;
};
