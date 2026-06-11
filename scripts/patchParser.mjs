import { readFileSync, writeFileSync } from 'fs';

const filePath = 'k:/Project/KANAKU/frontend/src/services/statementImportService.ts';
let code = readFileSync(filePath, 'utf8');

// Find the method boundaries
const START_MARKER = '  private async extractTransactionsFromText(text: string, userId: string) {';
const END_MARKER = '  private async annotateTransactions(';

const startIdx = code.indexOf(START_MARKER);
const endIdx = code.indexOf(END_MARKER);

if (startIdx === -1 || endIdx === -1) {
  console.error('Could not find method boundaries');
  process.exit(1);
}

const newMethod = `  private async extractTransactionsFromText(text: string, userId: string) {
    const lines = text.split(/\\r?\\n/).map(l => l.replace(/\\s+/g, ' ').trim()).filter(Boolean);
    const transactions: ParsedTransaction[] = [];

    // Skip header/footer lines
    const SKIP_RE = /^\\s*(?:statement|opening\\s+balance|closing\\s+balance|page\\s+\\d+|date\\s+particulars|sl\\.?\\s*no|transaction\\s+date|value\\s+date|narration|description|debit|credit|balance|dr\\s*cr|type|chq|ref|sr\\s*no|account|branch|ifsc|period|from\\s+date|to\\s+date|\\*+|-{3,}|={3,})/i;

    // A line starting a block must begin with a date token
    const DATE_START_RE = /^(\\d{1,2}[\\/-\\.](\\d{1,2}|[a-zA-Z]{3,9})[\\/-\\.]\\d{2,4})(?:\\s|$)/;

    // Ending line has two trailing decimal amounts (debit/credit + balance)
    const TRAILING_PAIR_RE = /[\\d,]+\\.\\d{2}\\s+[\\d,]+\\.\\d{2}\\s*$/;

    // --- PHASE 1: group raw lines into per-transaction blocks ---
    const blocks: Array<{ dateStr: string; lines: string[] }> = [];
    let cur: { dateStr: string; lines: string[] } | null = null;

    for (const line of lines) {
      if (SKIP_RE.test(line)) continue;

      const dm = line.match(DATE_START_RE);
      if (dm) {
        if (cur) blocks.push(cur);
        cur = { dateStr: dm[1], lines: [line] };
      } else if (cur) {
        cur.lines.push(line);
        if (TRAILING_PAIR_RE.test(line)) {
          blocks.push(cur);
          cur = null;
        }
      }
    }
    if (cur) blocks.push(cur);

    // --- PHASE 2: parse each block ---
    for (const block of blocks) {
      const date = parseDate(block.dateStr);
      if (!date) continue;

      const fullText = block.lines.join(' ');

      const amtMatches = fullText.match(/[\\d,]+\\.\\d{2}/g) || [];
      const nums = amtMatches
        .map(v => parseAmount(v))
        .filter((v): v is number => v != null && Number.isFinite(v) && v > 0);

      if (nums.length === 0) continue;

      let txnAmt: number;
      let balance: number | undefined;
      if (nums.length >= 2) {
        balance = nums[nums.length - 1];
        txnAmt = nums[nums.length - 2];
      } else {
        txnAmt = nums[0];
      }
      if (!txnAmt || txnAmt <= 0) continue;

      // Build description: strip date + all amounts
      const rawDesc = fullText
        .replace(block.dateStr, '')
        .replace(/[\\d,]+\\.\\d{2}/g, ' ')
        .replace(/\\s+/g, ' ')
        .trim();

      // Detect CR/DR
      const isCredit = /\\bUPI\\/CR\\b|\\bCR\\b|\\bcredit\\b|\\bsalary\\b|\\brefund\\b|\\bdeposit\\b|\\bcredited\\b/i.test(fullText);
      const isTransfer = !isCredit && /\\btransfer\\b|\\bneft\\b|\\brtgs\\b|\\bimps\\b/i.test(fullText);
      const txnType: 'income' | 'expense' | 'transfer' = isTransfer ? 'transfer' : isCredit ? 'income' : 'expense';

      // Extract UPI reference number & merchant
      const upiRef = fullText.match(/UPI\\/(DR|CR)\\/(\\d+)\\//i);
      const reference = upiRef?.[2];
      const merchantMatch = fullText.match(/UPI\\/(DR|CR)\\/\\d+\\/([^/]+)\\//i);
      let merchantName: string | undefined = merchantMatch
        ? merchantMatch[2].replace(/[_-]/g, ' ').trim()
        : pickMerchantName(rawDesc);

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
console.log('Patch applied. Blocks parsed. File length:', code.length);
