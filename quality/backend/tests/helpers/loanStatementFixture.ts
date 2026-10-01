/**
 * A synthetic lender Statement of Account in the Bajaj Finance layout, with
 * made-up customer, loan and payment numbers. It reproduces what broke the
 * statement import on a real one:
 *   - instalment dues and fees (Debit column) that are not money the borrower paid;
 *   - two bounced auto-debits: a receipt followed by its reversal, net zero;
 *   - payments that also clear bounce or penal charges, and a charges-only payment;
 *   - an advance payment that takes the balance negative;
 *   - particulars wrapped over several lines, a page break that repeats the
 *     column headings, a "Total" line, and a long footer of notes, disclaimer,
 *     company registration and addresses after the table.
 *
 * `order` matches the two PDF text extractors: pdf.js (the app) puts the row's
 * numbers on its date line; pdf-parse (the server) puts them on a line after
 * the wrapped particulars.
 *
 * The borrower paid 5 times, ₹7,103 in all:
 *   07-Feb-2024 2,680 (2,280 instalment + 400 bounce charges)
 *   20-Feb-2024 2,000 (advance)        02-Apr-2024 25 (penal charges)
 *   04-Apr-2024 1,998                  15-Jan-2025 400 (bounce charges)
 */

type Row = [date: string, particulars: string[], amounts: string];

const ROWS_PAGE_1: Row[] = [
  ['10-Jan-2024', ['Credit Tracking Report', 'Due'], '30.00 0.00 0.00 0.00 0.00 0.00 0 30.00'],
  ['10-Jan-2024', ['CONVENIENCE FEES', '1ST EMI - Due'], '150.00 0.00 0.00 0.00 0.00 0.00 0 180.00'],
  ['10-Jan-2024', ['PROCESSING FEES ON', '1ST EMI - Due'], '100.00 0.00 0.00 0.00 0.00 0.00 0 280.00'],
  ['02-Feb-2024', ['Due for Installment 1'], '2,000.00 0.00 0.00 0.00 25.00 0.00 31 2,305.00'],
  ['02-Feb-2024', ['Amount Received for Bounced', 'Instalment'], '0.00 2,280.00 400.00 0.00 0.00 0.00 0 425.00'],
  ['02-Feb-2024', ['Instalment No. Bounced', '(INSUFFICIENT FUNDS)'], '2,280.00 0.00 0.00 0.00 0.00 0.00 0 2,705.00'],
  ['07-Feb-2024', ['Payment Received vide', 'ONLINE payment No:', '90000000001'], '0.00 2,280.00 0.00 400.00 0.00 0.00 0 25.00'],
  ['20-Feb-2024', ['Payment Received', 'ONLINE vide Reference', 'No: 90000000002 for', 'Advance', 'Instalment/Overdue and', 'Charges'], '0.00 2,000.00 0.00 0.00 0.00 0.00 0 -1,975.00'],
  ['02-Mar-2024', ['Due for Installment 2'], '2,000.00 0.00 0.00 0.00 0.00 0.00 0 25.00'],
  ['02-Apr-2024', ['Due for Installment 3'], '1,998.00 0.00 0.00 0.00 0.00 0.00 0 2,023.00'],
  ['02-Apr-2024', ['Amount Received for Bounced', 'Instalment'], '0.00 1,998.00 400.00 0.00 0.00 0.00 0 425.00'],
  ['02-Apr-2024', ['Instalment No. Bounced', '(INSUFFICIENT FUNDS)'], '1,998.00 0.00 0.00 0.00 0.00 0.00 0 2,423.00'],
  ['02-Apr-2024', ['Payment Received vide', 'ONLINE payment No:', '90000000003'], '0.00 0.00 0.00 0.00 0.00 25.00 0 2,398.00'],
];

const ROWS_PAGE_2: Row[] = [
  ['04-Apr-2024', ['Payment Received vide', 'ONLINE payment No:', '90000000004'], '0.00 1,998.00 0.00 0.00 0.00 0.00 0 400.00'],
  ['15-Jan-2025', ['Payment Received vide', 'ONLINE payment No:', '900000005'], '0.00 0.00 0.00 400.00 0.00 0.00 0 0.00'],
];

const HEADER = [
  'STATEMENT OF ACCOUNT FOR 4TESTLN000001',
  'AS ON 31-Mar-2025',
  'CUSTOMER DETAILS LOAN ACCOUNT DETAILS',
  'Customer ID 100000001 Loan Amount ( ₹ ) 7,280.00',
  'Name Test Customer Current Rate of Interest Per Annum 0%',
  'Repayment Bank A/c Details HDFC BANK LTD xxxxxxxx4321',
  'Product Type E-COMMERCE',
  'Loan Creation Date 10-Jan-2024',
  'LOAN FINANCIAL SUMMARY AS ON 31-Mar-2025',
  'Particulars',
  'Due ( ₹ ) Received ( ₹ ) Overdue Balance ( ₹ )',
  '10,556.00 10,556.00 0.00',
  'Instalment Amount ( ₹ )',
];

const TABLE_HEADINGS = {
  pdfjs: [
    'LOAN TRANSACTION DETAILS AS ON 31-Mar-2025',
    'Transaction Details Bounce Charges Penal Charges',
    'Balance ( ₹ )',
    'Delay',
    'Debit ( ₹ ) Credit ( ₹ )',
    'Days',
    'Date Particulars Status',
    'Due ( ₹ ) Paid ( ₹ ) Due ( ₹ ) Paid ( ₹ )',
  ],
  pdfparse: [
    'LOAN TRANSACTION DETAILS AS ON 31-Mar-2025',
    'Transaction Details',
    'Debit (₹) Credit (₹)',
    'Bounce Charges Penal Charges Delay Balance (₹)',
    'Date Particulars Status Due (₹) Paid (₹) Due (₹) Paid (₹) Days',
  ],
};

const FOOTER = [
  '- Total - 10,556.00 10,556.00 800.00 800.00 25.00 25.00 - -',
  '********* END OF STATEMENT *********',
  'Note:',
  "1. All values are as per Bajaj Finance Limited's records on the date of generating the Statement of Account (SOA).",
  '2. All the charges levied are Inclusive of applicable taxes.',
  'DISCLAIMER:',
  "This is a system generated 'Statement Of Account' hence, needs no signature. In case any discrepancy is noticed by the Borrower in this 'Statement Of Account' , it",
  "should be brought to the notice at the nearest Branch Office, or the Borrower can visit our website's contact page.",
  'CIN: PAN: PHONE NO.: EMAIL:',
  'L00000XX0000PLC000000 AAAAA0000A +91 00000 00000 support@example.com',
  'REGISTERED OFFICE: AKURDI, PUNE - 411035',
  'CORPORATE OFFICE: 4th FLOOR, OFF PUNE-AHMEDNAGAR ROAD, VIMAN NAGAR, PUNE -',
  'WEBSITE: https://www.example.com/corporate',
  'Explore Our Services',
  'Login to Follow us on Download our app',
];

const rowLines = (order: 'pdfjs' | 'pdfparse', [date, particulars, amounts]: Row): string[] =>
  order === 'pdfjs'
    ? [`${date} ${particulars[0]} - ${amounts}`, ...particulars.slice(1)]
    : [`${date} ${particulars[0]}`, ...particulars.slice(1), `- ${amounts}`];

export const loanStatementText = (order: 'pdfjs' | 'pdfparse', options: { dropRow?: number } = {}): string => {
  const page1 = ROWS_PAGE_1.filter((_, i) => i !== options.dropRow);
  return [
    ...HEADER,
    ...TABLE_HEADINGS[order],
    ...page1.flatMap((row) => rowLines(order, row)),
    'Page 2 of 3',
    ...TABLE_HEADINGS[order],
    ...ROWS_PAGE_2.flatMap((row) => rowLines(order, row)),
    ...FOOTER,
  ].join('\n');
};

export const EXPECTED_PAYMENTS = [
  { date: '2024-02-07', amount: 2680, reference: '90000000001', description: 'Bajaj Finance EMI payment (incl. bounce charges)' },
  { date: '2024-02-20', amount: 2000, reference: '90000000002', description: 'Bajaj Finance advance EMI payment' },
  { date: '2024-04-02', amount: 25, reference: '90000000003', description: 'Bajaj Finance EMI penal charges' },
  { date: '2024-04-04', amount: 1998, reference: '90000000004', description: 'Bajaj Finance EMI payment' },
  { date: '2025-01-15', amount: 400, reference: '900000005', description: 'Bajaj Finance EMI bounce charges' },
];

/** A lender's email about the same loan: dates and amounts, but no statement table. */
export const LENDER_EMAIL_TEXT = [
  'This is in reference to your query regarding ECS charges for loan account number XXXXXXXX0001',
  'Mon, Aug 17, 2026 at 12:07 PM',
  'Basis our records, the EMI for the months July and September 2022 was Bounce due to INSUFFICIENT FUNDS.',
  'ECS/NACH return charges of Rs.590/- might have been imposed by your respective bank.',
  'Please find attached statement of account wherein there are no such charges reflecting.',
].join('\n');
