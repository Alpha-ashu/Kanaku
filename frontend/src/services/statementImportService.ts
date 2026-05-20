/**
 * Statement import service
 * Parses PDF, CSV, and text-based spreadsheet exports into previewable transactions.
 */

import { db, type Transaction } from '@/lib/database';
import { queueRecordUpsertSync } from '@/lib/auth-sync-integration';
import { applyAccountBalanceDeltas } from '@/lib/transactionAggregation';
import { documentIntelligenceService } from './documentIntelligenceService';
import { createWorker } from 'tesseract.js';
// @ts-ignore
import * as pdfjsLib from 'pdfjs-dist/build/pdf.mjs';
// @ts-ignore
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;
const STANDARD_FONT_DATA_URL = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/standard_fonts/`;

export interface ParsedTransaction {
  transaction_date: Date;
  raw_description: string;
  cleaned_description: string;
  amount: number;
  transaction_type: 'expense' | 'income' | 'transfer';
  balance_after_transaction?: number;
  payment_channel: string;
  merchant_name?: string;
  category?: string;
  currency?: string;
  duplicateKey?: string;
  isDuplicate?: boolean;
  duplicateReason?: string;
  sourceAccountName?: string;
  confidenceScore?: number;
}

export interface ImportResult {
  success: boolean;
  transactions: ParsedTransaction[];
  errors: string[];
  summary: {
    total: number;
    credits: number;
    debits: number;
    count: number;
    duplicates: number;
  };
  statementAccountName?: string;
  suggestedAccountId?: number;
  suggestedAccountName?: string;
  documentId?: number;
}

export interface StatementImportOptions {
  accountId: number;
  userId: string;
  accountType: string;
  documentId?: number;
}

export interface ImportApplyResult {
  importedCount: number;
  insertedTransactionIds: number[];
  importedTransactions: ParsedTransaction[];
}

type TransactionColumns = {
  date?: number;
  description?: number;
  debit?: number;
  credit?: number;
  amount?: number;
  balance?: number;
  currency?: number;
};

const PAYMENT_CHANNELS: Record<string, string> = {
  gpay: 'GPay',
  phonepe: 'PhonePe',
  paytm: 'Paytm',
  cred: 'CRED',
  upi: 'UPI',
  imps: 'Bank Transfer',
  neft: 'Bank Transfer',
  rtgs: 'Bank Transfer',
  card: 'Card',
  visa: 'Card',
  mastercard: 'Card',
  atm: 'ATM',
  netbanking: 'Net Banking',
};

const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeHeader = (value: string) => normalizeText(value).replace(/\s+/g, '');

const parseAmount = (value: string | number | undefined) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const negative = trimmed.startsWith('(') && trimmed.endsWith(')');
  const cleaned = trimmed
    .replace(/[()]/g, '')
    .replace(/[^\d.,-]/g, '')
    .replace(/,(?=\d{3}\b)/g, '');

  if (!cleaned) return null;
  const normalized = cleaned.includes('.') ? cleaned : cleaned.replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) return null;
  return negative ? -parsed : parsed;
};

const parseDate = (value: string | undefined) => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const exactPatterns: Array<RegExp> = [
    /^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/,
    /^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/,
    /^(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{2,4})$/i,
  ];

  const monthMap: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };

  for (const pattern of exactPatterns) {
    const match = trimmed.match(pattern);
    if (!match) continue;

    if (pattern.source.startsWith('^(\\d{4})')) {
      return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    }

    if (/jan|feb|mar/i.test(pattern.source)) {
      const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
      return new Date(year, monthMap[match[2].slice(0, 3).toLowerCase()], Number(match[1]));
    }

    const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
    return new Date(year, Number(match[2]) - 1, Number(match[1]));
  }

  const relaxed = new Date(trimmed);
  return Number.isNaN(relaxed.getTime()) ? null : relaxed;
};

const createDelimitedRows = (text: string, delimiter: string) => {
  const rows: string[][] = [];
  let currentCell = '';
  let currentRow: string[] = [];
  let insideQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (insideQuotes && next === '"') {
        currentCell += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (!insideQuotes && char === delimiter) {
      currentRow.push(currentCell.trim());
      currentCell = '';
      continue;
    }

    if (!insideQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') index += 1;
      currentRow.push(currentCell.trim());
      if (currentRow.some((cell) => cell !== '')) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
      continue;
    }

    currentCell += char;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((cell) => cell !== '')) {
      rows.push(currentRow);
    }
  }

  return rows;
};

const guessDelimiter = (text: string) => {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim()) ?? '';
  const candidates = [',', ';', '\t', '|'];
  return candidates.sort((left, right) => firstLine.split(right).length - firstLine.split(left).length)[0] ?? ',';
};

function detectColumns(headerRow: string[]): TransactionColumns {
  const columns: TransactionColumns = {};

  headerRow.forEach((header, index) => {
    const normalized = normalizeHeader(header);

    if (columns.date == null && (normalized.includes('date') || normalized.includes('valuedate') || normalized.includes('postingdate') || normalized.includes('transactiondate') || normalized.includes('time'))) columns.date = index;
    if (columns.description == null && (normalized.includes('description') || normalized.includes('narration') || normalized.includes('particulars') || normalized.includes('details') || normalized.includes('transactionremarks') || normalized.includes('remarks') || normalized.includes('merchant') || normalized.includes('memo'))) columns.description = index;
    if (columns.debit == null && (normalized.includes('debit') || normalized.includes('withdrawal') || normalized.includes('withdraw') || normalized.includes('dramount') || normalized === 'dr' || normalized.includes('outflow') || normalized.includes('paidout') || normalized.includes('spent') || normalized.includes('payment'))) columns.debit = index;
    if (columns.credit == null && (normalized.includes('credit') || normalized.includes('deposit') || normalized.includes('cramount') || normalized === 'cr' || normalized.includes('inflow') || normalized.includes('paidin') || normalized.includes('received') || normalized.includes('income'))) columns.credit = index;
    if (columns.amount == null && (normalized.includes('amount') || normalized.includes('txnamount') || normalized.includes('transactionamount') || normalized.includes('value') || normalized.includes('total') || normalized.includes('price'))) columns.amount = index;
    if (columns.balance == null && (normalized.includes('balance') || normalized.includes('closing') || normalized.includes('running') || normalized.includes('availablebalance'))) columns.balance = index;
    if (columns.currency == null && (normalized.includes('currency') || normalized.includes('ccy'))) columns.currency = index;
  });

  return columns;
}

function looksLikeTableRows(rows: string[][]) {
  return rows.length > 1 && rows[0].length >= 3;
}

function cleanDescription(value: string) {
  return value
    .replace(/\b(?:ref|txn|trn|utr|chq|cheque|no)\b[:\s-]*[a-z0-9/-]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractPaymentChannel(description: string) {
  const normalized = normalizeText(description);
  return Object.entries(PAYMENT_CHANNELS).find(([keyword]) => normalized.includes(keyword))?.[1] ?? 'Bank';
}

function pickMerchantName(description: string) {
  const normalizedMerchant = documentIntelligenceService.normalizeMerchantName(description);
  if (!normalizedMerchant) return undefined;
  return documentIntelligenceService.toTitleCase(normalizedMerchant);
}

function generateDuplicateKey(accountId: number, transaction: ParsedTransaction) {
  const dateKey = transaction.transaction_date.toISOString().split('T')[0];
  const descriptionKey = normalizeText(transaction.merchant_name || transaction.cleaned_description).replace(/\s+/g, '');
  return `${accountId}|${dateKey}|${Math.abs(transaction.amount).toFixed(2)}|${descriptionKey.slice(0, 60)}`;
}

function isBoilerplateText(text: string): boolean {
  const normalized = text.toLowerCase();
  
  // High confidence boilerplate phrases
  const directPhrases = [
    'unless the constituent brings',
    'does not seek any information',
    'do not click on any link',
    'always login through',
    'do not share atm',
    'banking ombudsman',
    'computer output - does not',
    'does not require signature',
    'computer generated statement',
    'beware of phishing',
    'security alert',
    'malicious code',
    'fake website',
    'change in the address of account'
  ];
  
  if (directPhrases.some(phrase => normalized.includes(phrase))) {
    return true;
  }

  // Count matches of boilerplate keywords
  const keywords = [
    'phishing',
    'ombudsman',
    'constituent',
    'discrepancy',
    'unauthorised debits',
    'pass sheet',
    'be deemed as correct',
    'rbi',
    'nrupatunga',
    'bangalore-560001',
    'merchant / trader',
    'digital payment channel',
    'computer output',
    'require signature'
  ];

  let matchCount = 0;
  for (const keyword of keywords) {
    if (normalized.includes(keyword)) {
      matchCount++;
    }
  }

  // If we have 2 or more of these distinct bank footer keywords in a single block, it is definitely a footer.
  if (matchCount >= 2) {
    return true;
  }

  return false;
}

class StatementImportService {
  async parseStatement(file: File, options: StatementImportOptions): Promise<ImportResult> {
    const errors: string[] = [];
    const documentId = options.documentId ?? await documentIntelligenceService.createDocumentRecord({
      documentType: 'statement',
      file,
      processingStatus: 'processing',
      accountId: options.accountId,
    });

    try {
      let rawText = '';
      let transactions: ParsedTransaction[] = [];

      if (file.type === 'application/pdf') {
        rawText = await this.extractPdfText(file);
        const compactTextLength = rawText.replace(/\s+/g, '').length;

        if (compactTextLength < 120) {
          const ocrText = await this.extractPdfTextWithOcr(file);
          if (ocrText.replace(/\s+/g, '').length > compactTextLength) {
            rawText = ocrText;
          }
        }

        transactions = await this.extractTransactionsFromText(rawText, options.userId);
      } else if (file.type === 'text/csv' || file.name.toLowerCase().endsWith('.csv')) {
        rawText = await file.text();
        transactions = await this.extractTransactionsFromDelimitedText(rawText, options.userId);
      } else if (file.type === 'application/json' || file.name.toLowerCase().endsWith('.json')) {
        rawText = await file.text();
        transactions = await this.extractTransactionsFromJson(rawText, options.userId, errors);
      } else {
        const spreadsheet = await this.extractTransactionsFromSpreadsheet(file, options.userId, errors);
        rawText = spreadsheet.rawText;
        transactions = spreadsheet.transactions;
      }

      const statementBankName = documentIntelligenceService.detectBankName(rawText);
      const statementAccountNumber = documentIntelligenceService.detectAccountNumber(rawText);
      const openingBalance = documentIntelligenceService.detectOpeningBalance(rawText);
      
      const suggestedAccount = await this.findSuggestedAccount(statementBankName, statementAccountNumber);
      const annotatedTransactions = await this.annotateTransactions(transactions, options);
      const summary = this.generateSummary(annotatedTransactions);

      await documentIntelligenceService.updateDocumentRecord(documentId, {
        processingStatus: 'preview',
        sourceAccountName: statementBankName,
        metadata: {
          detectedBank: statementBankName || '',
          accountNumber: statementAccountNumber || '',
          openingBalance: openingBalance?.toString() || '',
          transactionCount: String(annotatedTransactions.length),
        },
      });

      return {
        success: annotatedTransactions.length > 0,
        transactions: annotatedTransactions,
        errors,
        summary,
        statementAccountName: statementBankName,
        suggestedAccountId: suggestedAccount?.id,
        suggestedAccountName: suggestedAccount?.name,
        documentId,
      };
    } catch (error) {
      await documentIntelligenceService.updateDocumentRecord(documentId, {
        processingStatus: 'failed',
      });

      return {
        success: false,
        transactions: [],
        errors: [error instanceof Error ? error.message : 'Unknown error occurred'],
        summary: { total: 0, credits: 0, debits: 0, count: 0, duplicates: 0 },
        documentId,
      };
    }
  }

  async importTransactions(transactions: ParsedTransaction[], options: StatementImportOptions): Promise<ImportApplyResult> {
    const validTransactions = transactions.filter((transaction) =>
      !transaction.isDuplicate
      && transaction.transaction_date
      && !Number.isNaN(transaction.transaction_date.getTime()),
    );

    if (validTransactions.length === 0) {
      throw new Error('No valid transactions selected for import');
    }

    let insertedTransactionIds: number[] = [];

    await db.transaction('rw', [db.transactions, db.accounts, db.documents, db.merchantProfiles, db.userCategoryPreferences], async () => {
      const newTransactions: Transaction[] = validTransactions.map((transaction) => ({
        accountId: options.accountId,
        userId: options.userId,
        date: transaction.transaction_date,
        description: transaction.cleaned_description,
        amount: Math.abs(transaction.amount),
        type: transaction.transaction_type,
        category: transaction.category || 'Others',
        merchant: transaction.merchant_name,
        createdAt: new Date(),
        updatedAt: new Date(),
        syncStatus: 'pending',
        paymentChannel: transaction.payment_channel,
        balanceAfter: transaction.balance_after_transaction,
        rawDescription: transaction.raw_description,
      } as unknown as Transaction));

      const insertedKeys = await db.transactions.bulkAdd(newTransactions, { allKeys: true });
      insertedTransactionIds = insertedKeys
        .map((key) => Number(key))
        .filter((key) => Number.isFinite(key));

      const latestBalanceSnapshot = validTransactions
        .filter((transaction) => typeof transaction.balance_after_transaction === 'number')
        .sort((left, right) => right.transaction_date.getTime() - left.transaction_date.getTime())[0];

      if (latestBalanceSnapshot?.balance_after_transaction != null) {
        await db.accounts.update(options.accountId, {
          balance: latestBalanceSnapshot.balance_after_transaction,
          updatedAt: new Date(),
        });
      } else {
        const netChange = validTransactions.reduce((sum, transaction) => (
          sum + (transaction.transaction_type === 'income' ? transaction.amount : -Math.abs(transaction.amount))
        ), 0);
        await applyAccountBalanceDeltas(new Map([[options.accountId, netChange]]));
      }

      for (const transaction of validTransactions) {
        if (transaction.merchant_name) {
          await documentIntelligenceService.upsertMerchantProfile({
            merchantName: transaction.merchant_name,
            normalizedName: documentIntelligenceService.normalizeMerchantName(transaction.merchant_name),
            suggestedCategory: transaction.category || 'Others',
            confidenceScore: transaction.confidenceScore ?? 0.82,
            userId: options.userId,
          });
        }

        await documentIntelligenceService.upsertCategoryPreference({
          userId: options.userId,
          merchantKey: transaction.merchant_name,
          keywordKey: `${transaction.cleaned_description} ${transaction.raw_description}`,
          category: transaction.category || 'Others',
          confidenceScore: transaction.confidenceScore ?? 0.82,
        });
      }

      if (options.documentId) {
        await documentIntelligenceService.updateDocumentRecord(options.documentId, {
          processingStatus: 'completed',
          notes: `Imported ${validTransactions.length} transactions`,
        });
      }
    });

    for (const transactionId of insertedTransactionIds) {
      queueRecordUpsertSync('transactions', transactionId);
    }
    queueRecordUpsertSync('accounts', options.accountId);

    return {
      importedCount: validTransactions.length,
      insertedTransactionIds,
      importedTransactions: validTransactions,
    };
  }

  private async extractTransactionsFromSpreadsheet(file: File, userId: string, errors: string[]) {
    const text = await file.text();
    const rawText = text.replace(/\u0000/g, ' ');

    if (/^\s*PK/.test(rawText)) {
      errors.push('Binary Excel files cannot be parsed safely in the current browser build. Export the statement as CSV and upload that file.');
      return { rawText: '', transactions: [] };
    }

    if (/<(?:table|worksheet|Workbook|Row|Cell)/i.test(rawText)) {
      const parser = new DOMParser();
      const xml = parser.parseFromString(rawText, 'text/xml');
      const rows = Array.from(xml.querySelectorAll('Row, tr')).map((row) =>
        Array.from(row.querySelectorAll('Cell, Data, td, th')).map((cell) => (cell.textContent || '').trim()),
      );

      return {
        rawText,
        transactions: await this.extractTransactionsFromRows(rows, userId),
      };
    }

    if (looksLikeTableRows(createDelimitedRows(rawText, guessDelimiter(rawText)))) {
      return {
        rawText,
        transactions: await this.extractTransactionsFromDelimitedText(rawText, userId),
      };
    }

    errors.push('Spreadsheet format was detected but no transaction rows could be extracted.');
    return { rawText: '', transactions: [] };
  }

  private async extractTransactionsFromDelimitedText(text: string, userId: string) {
    const rows = createDelimitedRows(text, guessDelimiter(text));
    return this.extractTransactionsFromRows(rows, userId);
  }

  private async extractTransactionsFromRows(rows: string[][], userId: string) {
    if (!looksLikeTableRows(rows)) return [];

    const headerRow = rows[0];
    const columns = detectColumns(headerRow);
    const transactions: ParsedTransaction[] = [];

    for (const row of rows.slice(1)) {
      const date = parseDate(row[columns.date ?? -1]);
      const description = (row[columns.description ?? -1] || '').trim();
      if (!date || !description || isBoilerplateText(description)) continue;

      const debit = parseAmount(row[columns.debit ?? -1]);
      const credit = parseAmount(row[columns.credit ?? -1]);
      const fallbackAmount = parseAmount(row[columns.amount ?? -1]);
      const balance = parseAmount(row[columns.balance ?? -1]) ?? undefined;
      const debitAmount = debit != null && Math.abs(debit) > 0 ? Math.abs(debit) : null;
      const creditAmount = credit != null && Math.abs(credit) > 0 ? Math.abs(credit) : null;
      const amount = creditAmount ?? debitAmount ?? (fallbackAmount != null ? Math.abs(fallbackAmount) : null);
      if (amount == null || !Number.isFinite(amount) || amount <= 0) continue;

      let transactionType: 'income' | 'expense' | 'transfer' = 'expense';
      const normalizedDescription = normalizeText(description);
      const rowDirectionText = normalizeText(row.join(' '));
      const hasCreditSignal = /\b(cr|credit|credited|deposit|deposited|received|salary|refund|interest|cashback)\b/i.test(rowDirectionText);
      const hasDebitSignal = /\b(dr|debit|debited|withdrawal|withdrawn|paid|purchase|pos|atm|upi dr|transfer to)\b/i.test(rowDirectionText);

      if (creditAmount != null && debitAmount == null) {
        transactionType = 'income';
      } else if (debitAmount != null) {
        transactionType = 'expense';
      } else if (fallbackAmount != null) {
        if (fallbackAmount < 0 || hasDebitSignal) {
          transactionType = 'expense';
        } else if (hasCreditSignal) {
          transactionType = 'income';
        } else if (normalizedDescription.includes('transfer')) {
          transactionType = 'transfer';
        } else {
          transactionType = 'expense';
        }
      }

      const merchantName = pickMerchantName(description);
      const categoryPrediction = await documentIntelligenceService.predictCategory({
        merchantName,
        text: description,
        amount,
        userId,
      });

      transactions.push({
        transaction_date: date,
        raw_description: description,
        cleaned_description: cleanDescription(description),
        amount: Math.abs(amount),
        transaction_type: transactionType,
        balance_after_transaction: balance,
        payment_channel: extractPaymentChannel(description),
        merchant_name: merchantName,
        category: categoryPrediction.category,
        confidenceScore: categoryPrediction.confidence,
        currency: row[columns.currency ?? -1] || undefined,
      });
    }

    const chronological = transactions.length > 1 && transactions[0].transaction_date > transactions[transactions.length - 1].transaction_date
      ? [...transactions].reverse()
      : transactions;

    for (let index = 1; index < chronological.length; index += 1) {
      const previousBalance = chronological[index - 1].balance_after_transaction;
      const current = chronological[index];
      if (typeof previousBalance !== 'number' || typeof current.balance_after_transaction !== 'number') continue;

      const diff = current.balance_after_transaction - previousBalance;
      if (Math.abs(diff - current.amount) < 0.05) {
        current.transaction_type = 'income';
      } else if (Math.abs(diff + current.amount) < 0.05) {
        current.transaction_type = 'expense';
      }
    }

    return transactions;
  }

  private async extractTransactionsFromJson(text: string, userId: string, errors: string[]) {
    try {
      const data = JSON.parse(text);
      const list = Array.isArray(data) ? data : (data.transactions || data.data || []);
      
      if (!Array.isArray(list) || list.length === 0) {
        errors.push('JSON format detected but no transaction array found. Expected top-level array or "transactions" key.');
        return [];
      }

      const transactions: ParsedTransaction[] = [];
      for (const item of list) {
        const date = parseDate(item.date || item.transaction_date || item.time);
        const description = String(item.description || item.narration || item.details || item.particulars || '');
        const amount = parseAmount(item.amount || item.value || item.total);
        
        if (!date || !amount) continue;

        const type = (item.type || item.transaction_type || (amount > 0 ? 'income' : 'expense')).toLowerCase();
        const merchantName = item.merchant || item.merchant_name || pickMerchantName(description);
        
        const cat = await documentIntelligenceService.predictCategory({
          merchantName,
          text: description,
          amount: Math.abs(amount),
          userId,
        });

        transactions.push({
          transaction_date: date,
          raw_description: description,
          cleaned_description: cleanDescription(description),
          amount: Math.abs(amount),
          transaction_type: type.includes('inc') || type.includes('cr') ? 'income' : (type.includes('tr') ? 'transfer' : 'expense'),
          balance_after_transaction: parseAmount(item.balance) ?? undefined,
          payment_channel: item.payment_channel || extractPaymentChannel(description),
          merchant_name: merchantName,
          category: cat.category,
          confidenceScore: cat.confidence,
          currency: item.currency || item.ccy || 'INR',
        });
      }
      return transactions;
    } catch (e) {
      errors.push(`Failed to parse JSON: ${e instanceof Error ? e.message : 'Invalid format'}`);
      return [];
    }
  }

  private async extractPdfText(file: File) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ 
      data: arrayBuffer, 
      disableFontFace: true,
      standardFontDataUrl: STANDARD_FONT_DATA_URL
    }).promise;

    let fullText = '';

    for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
      const page = await pdf.getPage(pageIndex);
      const textContent = await page.getTextContent({
        disableCombineTextItems: false,
        includeMarkedContent: false,
      });

      const rows = new Map<number, Array<{ x: number; text: string }>>();

      for (const item of textContent.items as Array<{ str: string; transform: number[] }>) {
        const y = Math.round(item.transform[5]);
        const x = item.transform[4];
        const current = rows.get(y) ?? [];
        current.push({ x, text: item.str });
        rows.set(y, current);
      }

      const pageLines = Array.from(rows.entries())
        .sort((left, right) => right[0] - left[0])
        .map(([, entries]) => entries.sort((left, right) => left.x - right.x).map((entry) => entry.text).join(' '))
        .map((line) => line.replace(/\s+/g, ' ').trim())
        .filter(Boolean);

      fullText += `${pageLines.join('\n')}\n`;
    }

    return fullText;
  }

  private async extractPdfTextWithOcr(file: File) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ 
      data: arrayBuffer, 
      disableFontFace: true,
      standardFontDataUrl: STANDARD_FONT_DATA_URL
    }).promise;

    const maxPages = Math.min(pdf.numPages, 4);
    const pageTexts: string[] = [];

    const worker = await createWorker('eng', 1);

    try {
      for (let pageIndex = 1; pageIndex <= maxPages; pageIndex += 1) {
        const page = await pdf.getPage(pageIndex);
        const viewport = page.getViewport({ scale: 2.25 });

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));

        const context = canvas.getContext('2d');
        if (!context) continue;

        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: context, viewport }).promise;

        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const { data } = imageData;
        for (let i = 0; i < data.length; i += 4) {
          const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
          const bw = lum > 170 ? 255 : 0;
          data[i] = bw;
          data[i + 1] = bw;
          data[i + 2] = bw;
          data[i + 3] = 255;
        }
        context.putImageData(imageData, 0, 0);

        const blob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob((value) => resolve(value), 'image/png', 0.95);
        });
        if (!blob) continue;

        const result = await worker.recognize(blob);
        const pageText = result.data.text?.trim();
        if (pageText) {
          pageTexts.push(pageText);
        }
      }
    } finally {
      await worker.terminate();
    }

    return pageTexts.join('\n');
  }

  private async extractTransactionsFromText(text: string, userId: string) {
    const rawLines = text.split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim());

    //  STEP 1: Find the table header row 
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

    const transactions: ParsedTransaction[] = [];

    const DATE_START_RE = /^\s*(?:\d+\s+)?(\d{1,2}[\s\/\-\.](?:\d{1,2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*)[\s\/\-\.]\d{2,4})(?=\D|$)/i;
    const DATE_INLINE_RE = /(?:^|[^\d])\d{2}-\d{2}-\d{4}(?=\D|$)/;
    let isDateFirst = false;
    for (const line of lines.slice(0, 15)) {
      if (SKIP_RE.test(line)) continue;
      if (DATE_START_RE.test(line)) { isDateFirst = true; break; }
      if (DATE_INLINE_RE.test(line)) { isDateFirst = false; break; }
    }

    const blocks: string[][] = [];
    let acc: string[] = [];

    if (isDateFirst) {
      for (const line of lines) {
        if (SKIP_RE.test(line)) continue;
        if (DATE_START_RE.test(line) && acc.length > 0) { blocks.push([...acc]); acc = []; }
        acc.push(line);
      }
    } else {
      const TRAILING_AMT_RE = /[\d,]+\.\d{2}(?:\s+[\d,]+\.\d{2})?\s*$/;
      const NEW_TXN_RE = /^\s*(?:\d+\s+)?(?:UPI\/|NEFT|RTGS|IMPS|POS\/|CASH|ATM|ACH\/|INB\/|BIL\/|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{2,4})/i;
      let hasAmt = false;
      for (const line of lines) {
        if (SKIP_RE.test(line)) continue;
        if (hasAmt && NEW_TXN_RE.test(line)) { blocks.push([...acc]); acc = []; hasAmt = false; }
        acc.push(line);
        if (TRAILING_AMT_RE.test(line)) hasAmt = true;
      }
    }
    if (acc.length > 0) blocks.push(acc);

    const ANY_DATE_RE = /(?:^|[^\d])(\d{1,2}[\s\/\-\.](?:\d{1,2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*)[\s\/\-\.]\d{2,4})(?=\D|$)/i;

    for (const block of blocks) {
      const fullText = block.join(' ');
      if (isBoilerplateText(fullText)) continue;

      const dateMatch = fullText.match(ANY_DATE_RE);
      if (!dateMatch) continue;
      const date = parseDate(dateMatch[1]);
      if (!date || isNaN(date.getTime())) continue;

      const allNums = [...fullText.matchAll(/(?:INR\s*)?(\d[\d,]*\.\d{2})/g)]
        .map(m => parseAmount(m[1]))
        .filter((v): v is number => v != null && Number.isFinite(v) && v > 0);
      if (allNums.length === 0) continue;

      const balance = allNums.length > 1 ? allNums[1] : undefined;
      const txnAmt  = allNums[0];
      if (!txnAmt || txnAmt <= 0) continue;

      const isUpiCr   = /\bUPI\/CR\b/i.test(fullText);
      const isUpiDr   = /\bUPI\/DR\b/i.test(fullText);
      const hasDebitDash = /(?:INR\s*)?[\d,]+\.\d{2}\s+-\s+(?:INR\s*)?[\d,]+\.\d{2}/i.test(fullText);
      const hasCreditDash = /-\s*(?:INR\s*)?[\d,]+\.\d{2}\s+(?:INR\s*)?[\d,]+\.\d{2}/i.test(fullText);
      const hasCrKw   = /\b(transfer from|salary|refund|reversal|cashback|credited|received|deposit|credit interest)\b/i.test(fullText);
      const hasTrKw   = /\b(neft|rtgs|imps|transfer)\b/i.test(fullText);
      
      let txnType: 'income' | 'expense' | 'transfer';
      if (isUpiCr || hasCreditDash || (!isUpiDr && !hasDebitDash && hasCrKw)) {
        txnType = 'income';
      } else if (isUpiDr || hasDebitDash) {
        txnType = 'expense';
      } else {
        txnType = hasTrKw ? 'transfer' : 'expense';
      }

      const cleanedRaw = fullText
        .replace(dateMatch[0], '')
        .replace(/(?:INR\s*)?[\d,]+\.\d{2}/g, '')
        .replace(/\bINR\b/gi, '')
        .replace(/\b[0-9a-f]{10,}\b/gi, '')
        .replace(/\bBRANCH\s*:\s*[\w\s]+/gi, '')
        .replace(/\bChq\s*:\s*\d+/gi, '')
        .replace(/\b\d{2}:\d{2}:\d{2}\b/g, '')
        .replace(/\bpage\s*\d+\b/gi, '')
        .replace(/\s{2,}/g, ' ').trim();

      let merchantName: string | undefined;
      const upiM = fullText.match(/UPI\/(?:DR|CR)\/\d+\/([^\/\s][^\/]{1,40}?)\//i);
      if (upiM) {
        merchantName = upiM[1].replace(/[_\-]/g, ' ').trim();
      } else {
        const ifscM = fullText.match(/[A-Z]{4}\d[A-Z0-9]{6}\/([A-Z][^\/\d][^\/]{2,30}?)\//i);
        merchantName = ifscM
          ? ifscM[1].replace(/XXXXX\w*/g, '').replace(/[_\-]/g, ' ').trim()
          : pickMerchantName(cleanedRaw);
      }
      if (merchantName) {
        merchantName = merchantName.replace(/\s+/g, ' ').replace(/[^a-z0-9\s&'.,\-]/gi, '').trim();
        if (merchantName.length < 2) merchantName = undefined;
      }

      const upiRef = fullText.match(/UPI\/(?:DR|CR)\/(\d{10,})\//i) ?? fullText.match(/\/UPI\/(\d{10,})\//i);
      const ref = upiRef?.[1];
      const cleanedDesc = cleanDescription(cleanedRaw) + (ref ? ` (Ref: ${ref})` : '');

      const cat = await documentIntelligenceService.predictCategory({ merchantName, text: cleanedDesc, amount: txnAmt, userId });

      transactions.push({
        transaction_date: date,
        raw_description: fullText.slice(0, 400),
        cleaned_description: cleanedDesc,
        amount: txnAmt,
        transaction_type: txnType,
        balance_after_transaction: balance,
        payment_channel: extractPaymentChannel(fullText),
        merchant_name: merchantName,
        category: cat.category,
        currency: documentIntelligenceService.detectCurrency(fullText) ?? 'INR',
        confidenceScore: cat.confidence,
      });
    }

    if (transactions.length === 0) {
      // Step 3: Resilient Line-by-Line Fallback Parsing Loop
      const FLEXIBLE_DATE_RE = /(\d{1,2}[\s\/\-\.]+(?:\d{1,2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*)[\s\/\-\.]+\d{2,4})/i;
      const DECIMAL_AMT_RE = /\b\d[\d,]*\.\d{2}\b/g;

      for (const line of lines) {
        if (SKIP_RE.test(line) || isBoilerplateText(line)) continue;
        const dateMatch = line.match(FLEXIBLE_DATE_RE);
        if (!dateMatch) continue;

        const date = parseDate(dateMatch[1]);
        if (!date || isNaN(date.getTime())) continue;

        const amounts = [...line.matchAll(DECIMAL_AMT_RE)]
          .map(m => parseAmount(m[0]))
          .filter((v): v is number => v != null && Number.isFinite(v) && v > 0);

        if (amounts.length === 0) continue;

        const txnAmt = amounts[0];
        const balance = amounts.length > 1 ? amounts[1] : undefined;

        // Clean and prepare description
        const rawDesc = line
          .replace(dateMatch[0], '')
          .replace(/\b\d[\d,]*\.\d{2}\b/g, '')
          .replace(/\s+/g, ' ')
          .trim();

        if (rawDesc.length < 2) continue;

        const isIncome = /\b(cr|credit|credited|deposit|received|salary|refund|interest)\b/i.test(line) && !/\b(dr|debit|debited)\b/i.test(line);
        const txnType = isIncome ? 'income' : 'expense';
        const merchantName = pickMerchantName(rawDesc);
        const cat = await documentIntelligenceService.predictCategory({ merchantName, text: rawDesc, amount: txnAmt, userId });

        transactions.push({
          transaction_date: date,
          raw_description: line.slice(0, 400),
          cleaned_description: cleanDescription(rawDesc),
          amount: txnAmt,
          transaction_type: txnType,
          balance_after_transaction: balance,
          payment_channel: extractPaymentChannel(line),
          merchant_name: merchantName,
          category: cat.category,
          currency: 'INR',
          confidenceScore: cat.confidence,
        });
      }
    }

    if (transactions.length > 0) {
      const obMatch = text.match(/(?:opening balance|balance\s+b\/f|brought forward)[^\d]*([\d,]+\.\d{2})/i);
      const openingBalance = obMatch ? parseAmount(obMatch[1]) : undefined;

      const firstDate = transactions[0].transaction_date.getTime();
      const lastDate = transactions[transactions.length - 1].transaction_date.getTime();
      const isNewestFirst = firstDate > lastDate;

      const chronological = isNewestFirst ? [...transactions].reverse() : transactions;

      for (let i = 0; i < chronological.length; i++) {
        const curr = chronological[i];
        const prevBalance = i === 0 ? openingBalance : chronological[i - 1].balance_after_transaction;

        if (typeof prevBalance === 'number' && typeof curr.balance_after_transaction === 'number') {
          const diff = curr.balance_after_transaction - prevBalance;
          if (Math.abs(diff - curr.amount) < 0.05) {
            curr.transaction_type = 'income';
          } else if (Math.abs(diff + curr.amount) < 0.05) {
            curr.transaction_type = 'expense';
          }
        }
      }
    }

    return transactions;
  }

  private async annotateTransactions(transactions: ParsedTransaction[], options: StatementImportOptions) {
    const existingTransactions = await db.transactions.where('accountId').equals(options.accountId).toArray();
    const existingKeys = new Set(existingTransactions.map((transaction) => this.generateExistingDuplicateKey(options.accountId, transaction)));

    return transactions.map((transaction) => {
      const duplicateKey = generateDuplicateKey(options.accountId, transaction);
      const isDuplicate = existingKeys.has(duplicateKey);

      return {
        ...transaction,
        duplicateKey,
        isDuplicate,
        duplicateReason: isDuplicate ? 'Already in database' : undefined,
      };
    });
  }

  private generateExistingDuplicateKey(accountId: number, transaction: Transaction) {
    const date = transaction.date instanceof Date ? transaction.date : new Date(transaction.date);
    const existingTransaction: ParsedTransaction = {
      transaction_date: date,
      raw_description: String((transaction as any).rawDescription || transaction.description || ''),
      cleaned_description: String(transaction.description || ''),
      amount: Math.abs(transaction.amount),
      transaction_type: transaction.type,
      payment_channel: String((transaction as any).paymentChannel || 'Bank'),
      merchant_name: transaction.merchant,
    };

    return generateDuplicateKey(accountId, existingTransaction);
  }

  private async findSuggestedAccount(bankName?: string, accountNumber?: string) {
    const accounts = await db.accounts.toArray();
    
    if (accountNumber) {
      const targetSuffix = accountNumber.slice(-4);
      const match = accounts.find(a => {
        const accNum = (a as any).accountNumber || '';
        return accNum.toString().endsWith(targetSuffix);
      });
      if (match) return match;
    }

    if (bankName) {
      const normalizedBank = normalizeText(bankName);
      const match = accounts.find(a => 
        normalizeText(a.name).includes(normalizedBank) || 
        normalizeText((a as any).bankName || '').includes(normalizedBank)
      );
      if (match) return match;
    }

    return null;
  }

  private generateSummary(transactions: ParsedTransaction[]) {
    return transactions.reduce(
      (summary, transaction) => {
        summary.count += 1;
        summary.total += transaction.amount;

        if (transaction.transaction_type === 'income') {
          summary.credits += transaction.amount;
        } else {
          summary.debits += Math.abs(transaction.amount);
        }

        if (transaction.isDuplicate) {
          summary.duplicates += 1;
        }

        return summary;
      },
      { total: 0, credits: 0, debits: 0, count: 0, duplicates: 0 },
    );
  }
}

export const statementImportService = new StatementImportService();
