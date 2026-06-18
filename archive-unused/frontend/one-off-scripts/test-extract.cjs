const parseAmount = (value) => {
  if (!value) return undefined;
  const num = parseFloat(value.replace(/,/g, ''));
  return Number.isNaN(num) ? undefined : num;
};

const parseDate = (value) => {
  if (!value) return null;
  const trimmed = value.trim();
  const relaxed = new Date(trimmed);
  return Number.isNaN(relaxed.getTime()) ? null : relaxed;
};

async function extractTransactionsFromText(text) {
  const rawLines = text.split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim());

  const HEADER_RE = /\b(?:date\b.{0,60}\b(?:particulars|description|transaction\s*details?|narration|details)\b|\b(?:particulars|description|transaction\s*details?|narration)\b.{0,60}\bdate\b)/i;

  let headerIdx = -1;
  for (let i = 0; i < rawLines.length; i++) {
    if (HEADER_RE.test(rawLines[i])) {
      headerIdx = i;
      break;
    }
  }

  const lines = (headerIdx >= 0 ? rawLines.slice(headerIdx + 1) : rawLines)
    .map(l => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const SKIP_RE = /^\s*(?:date\b|opening balance|closing balance|page\s*\d+|account activity|account statement|total\b|subtotal\b|\*{3,}|-{5,}|={5,})/i;

  const DATE_START_RE = /^(\d{1,2}[\s\/\-\.](?:\d{1,2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*)[\s\/\-\.]\d{2,4})\s/i;
  const DATE_INLINE_RE = /\b\d{2}-\d{2}-\d{4}\b/;
  let isDateFirst = false;
  for (const line of lines.slice(0, 15)) {
    if (SKIP_RE.test(line)) continue;
    if (DATE_START_RE.test(line)) { isDateFirst = true; break; }
    if (DATE_INLINE_RE.test(line)) { isDateFirst = false; break; }
  }

  const blocks = [];
  let acc = [];

  if (isDateFirst) {
    for (const line of lines) {
      if (SKIP_RE.test(line)) continue;
      if (DATE_START_RE.test(line) && acc.length > 0) { blocks.push([...acc]); acc = []; }
      acc.push(line);
    }
  }
  if (acc.length > 0) blocks.push(acc);

  const transactions = [];
  const ANY_DATE_RE = /\b(\d{1,2}[\s\/\-\.](?:\d{1,2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*)[\s\/\-\.]\d{2,4})\b/i;

  for (const block of blocks) {
    const fullText = block.join(' ');
    const dateMatch = fullText.match(ANY_DATE_RE);
    if (!dateMatch) { console.log("NO DATE", fullText); continue; }
    const date = parseDate(dateMatch[1]);
    if (!date || isNaN(date.getTime())) { console.log("INVALID DATE", dateMatch[1]); continue; }

    const allNums = [...fullText.matchAll(/(?:INR\s*)?(\d[\d,]*\.\d{2})/g)]
      .map(m => parseAmount(m[1]))
      .filter((v) => v != null && Number.isFinite(v) && v > 0);
    
    if (allNums.length === 0) { console.log("NO NUMS", fullText); continue; }

    const balance = allNums.length > 1 ? allNums[1] : undefined;
    const txnAmt  = allNums[0];
    if (!txnAmt || txnAmt <= 0) { console.log("INVALID TXN AMT", txnAmt); continue; }

    transactions.push({
      transaction_date: date,
      amount: txnAmt,
      balance: balance
    });
  }

  return transactions;
}

const mockText = `
STATEMENT
Date Narration Chq./Ref.No. Value Dt Withdrawal Amt. Deposit Amt. Closing Balance
01/05/24 UPI-123 01/05/24 500.00 1000.00
02/05/24 UPI-456 02/05/24 1500.00 2500.00
`;
extractTransactionsFromText(mockText).then(console.log);
