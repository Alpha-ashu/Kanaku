import { readFileSync, writeFileSync } from 'fs';

const filePath = 'k:/Project/KANAKU/frontend/src/services/statementImportService.ts';
let code = readFileSync(filePath, 'utf8');

const START = '  private async extractTransactionsFromText(text: string, userId: string) {';
const END   = '  private async annotateTransactions(';

const startIdx = code.indexOf(START);
const endIdx   = code.indexOf(END);
if (startIdx === -1 || endIdx === -1) { console.error('Markers not found'); process.exit(1); }

// The NEW method — end-anchored block grouping:
// accumulate lines, close block when "X.XX  Y.YY" is seen at line end.
// Then search the whole block for the transaction date (DD-MM-YYYY).
const newMethod = `  private async extractTransactionsFromText(text: string, userId: string) {
    const lines = text.split(/\\r?\\n/).map(l => l.replace(/\\s+/g, ' ').trim()).filter(Boolean);
    const transactions: ParsedTransaction[] = [];

    // Pure header/footer lines to skip
    const SKIP_RE = /^\\s*(?:statement for|opening balance|closing balance|page\\s*\\d+|date\\s+particulars|sl\\.?\\s*no|deposits\\s+withdrawals|deposits|withdrawals|narration|\\*{3,}|-{5,}|={5,})/i;

    // A line ENDS a transaction block when it has two trailing decimals (amount + balance)
    // e.g. "35.00 4.54" or "2,000.00 2,005.54"
    const TRAILING_PAIR_RE = /[\\d,]+\\.\\d{2}\\s+[\\d,]+\\.\\d{2}\\s*$/;

    // Transaction date — prefer dash-separated (Canara Bank uses DD-MM-YYYY with dashes)
    // This avoids matching UPI-embedded dates like "04/05/2026" inside the path
    const TXN_DATE_RE = /\\b(\\d{2}-(?:\\d{2}|[A-Za-z]{3,9})-\\d{4})\\b/;

    // Chq / Ref lines belong to the previous transaction
    const CHQ_RE = /^(?:chq|ref)\\s*:\\s*\\d+/i;

    // --- PHASE 1: accumulate lines into blocks, closed by trailing pair ---
    const blocks: string[][] = [];
    let acc: string[] = [];

    for (const line of lines) {
      if (SKIP_RE.test(line)) continue;

      if (CHQ_RE.test(line)) {
        // Append cheque ref to the last closed block (for reference extraction)
        if (blocks.length > 0) blocks[blocks.length - 1].push(line);
        continue;
      }

      acc.push(line);

      if (TRAILING_PAIR_RE.test(line)) {
        blocks.push([...acc]);
        acc = [];
      }
    }
    // Flush any unclosed tail (e.g. last page with no trailing balance)
    if (acc.length > 0) blocks.push(acc);

    // --- PHASE 2: parse each block ---
    for (const block of blocks) {
      const fullText = block.join(' ');

      // Find transaction date anywhere in the block
      const dateMatch = fullText.match(TXN_DATE_RE);
      if (!dateMatch) continue;
      const date = parseDate(dateMatch[1]);
      if (!date) continue;

      // Collect all decimal amounts from the block
      const amtMatches = fullText.match(/[\\d,]+\\.\\d{2}/g) || [];
      const nums = amtMatches
        .map(v => parseAmount(v))
        .filter((v): v is number => v != null && Number.isFinite(v) && v > 0);
      if (nums.length === 0) continue;

      // Last = balance, second-last = debit/credit amount
      let txnAmt: number;
      let balance: number | undefined;
      if (nums.length >= 2) {
        balance = nums[nums.length - 1];
        txnAmt  = nums[nums.length - 2];
      } else {
        txnAmt = nums[0];
      }
      if (!txnAmt || txnAmt <= 0) continue;

      // Build description — strip date, amounts, Chq lines
      const rawDesc = fullText
        .replace(dateMatch[0], '')
        .replace(/[\\d,]+\\.\\d{2}/g, ' ')
        .replace(/\\bChq\\s*:\\s*\\S+/gi, ' ')
        .replace(/\\s+/g, ' ')
        .trim();

      // CR / DR detection
      const isCredit   = /\\bUPI\\/CR\\b|\\bCR\\b|\\bcredit\\b|\\bsalary\\b|\\brefund\\b|\\bdeposit\\b|\\bcredited\\b/i.test(fullText);
      const isTransfer = !isCredit && /\\btransfer\\b|\\bneft\\b|\\brtgs\\b|\\bimps\\b/i.test(fullText);
      const txnType: 'income' | 'expense' | 'transfer' = isTransfer ? 'transfer' : isCredit ? 'income' : 'expense';

      // Extract merchant from UPI path segment: UPI/DR/<ref>/<MERCHANT>/...
      const merchantMatch = fullText.match(/UPI\\/(?:DR|CR)\\/\\d+\\/([^/]+)\\//i);
      const merchantName: string | undefined = merchantMatch
        ? merchantMatch[1].replace(/[_-]/g, ' ').trim()
        : pickMerchantName(rawDesc);

      // UPI reference number
      const upiRef    = fullText.match(/UPI\\/(?:DR|CR)\\/(\\d+)\\//i);
      const reference = upiRef?.[1];

      const cleanedDesc = reference
        ? cleanDescription(rawDesc) + ' (Ref: ' + reference + ')'
        : cleanDescription(rawDesc);

      const cat = await documentIntelligenceService.predictCategory({
        merchantName,
        text: cleanedDesc,
        amount: txnAmt,
        userId,
      });

      transactions.push({
        transaction_date: date,
        raw_description: fullText.slice(0, 300),
        cleaned_description: cleanedDesc,
        amount: txnAmt,
        transaction_type: txnType,
        balance_after_transaction: balance,
        payment_channel: extractPaymentChannel(fullText),
        merchant_name: merchantName,
        category: cat.category,
        currency: documentIntelligenceService.detectCurrency(fullText),
        confidenceScore: cat.confidence,
      });
    }

    return transactions;
  }

  `;

code = code.slice(0, startIdx) + newMethod + code.slice(endIdx);
writeFileSync(filePath, code);
console.log('Patch applied successfully. File size:', code.length);
