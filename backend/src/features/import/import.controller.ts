import { Response } from 'express';
import { randomUUID } from 'crypto';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { logger } from '../../config/logger';
import { categorizeTextForUser } from '../categorization/categorization.engine';
import { getAIConfigurations } from '../../utils/aiConfig';
import { audit } from '../../utils/auditLogger';
import { extractStatementText, parseStatementText, type ParsedStatement } from './statement.parser';
import { parseDelimited, readTabular, type TabularColumns } from './tabular';
import { importLedgerRows, ImportOverdrawError, MAX_IMPORT_ROWS, type LedgerImportRow } from './importLedger.service';

type JsonRow = Record<string, string>;

//  Interface

export interface ImportedTransaction {
  rowIndex: number;
  description: string;
  amount?: number;
  /** YYYY-MM-DD, or '' when the date could not be read (see dateError). */
  date: string;
  /** The date cell as written in the file, when it could not be read. */
  dateError?: string;
  /** debit = money out (expense), credit = money in (income). */
  type?: 'debit' | 'credit';
  reference?: string;
  rawCategory?: string;
  suggestedCategory: string;
  suggestedSubcategory: string;
  confidence: number;
  requiresReview: boolean;
  rawRow: JsonRow;
}

export interface ImportPreview {
  sessionId: string;
  totalRows: number;
  columnMap: Record<string, string | undefined>;
  dateOrder?: 'DMY' | 'MDY';
  transactions: ImportedTransaction[];
  highConfidence: number;
  lowConfidence: number;
  /** Present when the session came from POST /import/statement */
  statement?: Omit<ParsedStatement, 'transactions'>;
}

//  Sessions
//
// A preview holds someone's bank statement, so it belongs to the user who
// uploaded it: reads and confirms by anyone else answer 404. Ids are random
// UUIDs (they were `import_<timestamp>_<6 chars>`), expiry is checked lazily on
// access (no per-session timer), and each user keeps at most a few so repeated
// uploads cannot grow memory without bound. In-process, like the rest of the
// single-instance API state; an expired or restarted session just asks for a
// re-upload.

const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_SESSIONS_PER_USER = 5;
const importSessions = new Map<string, { userId: string; expiresAt: number; preview: ImportPreview }>();

const pruneExpired = (now = Date.now()) => {
  for (const [id, entry] of importSessions) {
    if (entry.expiresAt <= now) importSessions.delete(id);
  }
};

function storeSession(userId: string, build: (sessionId: string) => ImportPreview): ImportPreview {
  pruneExpired();
  const mine = [...importSessions.entries()].filter(([, e]) => e.userId === userId).sort((a, b) => a[1].expiresAt - b[1].expiresAt);
  while (mine.length >= MAX_SESSIONS_PER_USER) {
    const [oldest] = mine.shift() as [string, unknown];
    importSessions.delete(oldest);
  }
  const preview = build(randomUUID());
  importSessions.set(preview.sessionId, { userId, expiresAt: Date.now() + SESSION_TTL_MS, preview });
  return preview;
}

function sessionFor(userId: string, sessionId: string): ImportPreview | null {
  const entry = importSessions.get(sessionId);
  if (!entry || entry.userId !== userId) return null;
  if (entry.expiresAt <= Date.now()) {
    importSessions.delete(sessionId);
    return null;
  }
  return entry.preview;
}

/** Test hook: sessions are process-wide. */
export const __clearImportSessionsForTests = () => importSessions.clear();

//  Categorisation — bounded concurrency
//
// Each call reads the user's learned rules; firing up to 2,000 at once queued
// the whole connection pool behind one upload.

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

const categorize = async (userId: string, description: string, fallback: string) => {
  if (!description) return { category: fallback, subcategory: 'General', confidence: 0.3 };
  try {
    const result = await categorizeTextForUser(userId, description);
    return { category: result.category, subcategory: result.subcategory, confidence: result.confidence };
  } catch {
    return { category: fallback, subcategory: 'General', confidence: 0.3 };
  }
};

const columnNames = (headers: string[], columns: TabularColumns) =>
  Object.fromEntries(Object.entries(columns).map(([key, index]) => [key, index === undefined ? undefined : headers[index]]));

//  Controllers

export const uploadImport = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const config = await getAIConfigurations();

    if (!config.import.enabled) {
      return res.status(400).json({ error: 'Spreadsheet import is currently disabled by administrator.' });
    }

    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'File is required' });
    }

    const ext = file.originalname.split('.').pop()?.toLowerCase() || '';
    const isSupported = config.import.formats.some(f => ext === f.toLowerCase());
    if (!isSupported) {
      return res.status(400).json({ error: `File format .${ext} is not allowed. Allowed formats: ${config.import.formats.join(', ')}` });
    }

    const contentType = file.mimetype || '';
    let grid: string[][] = [];

    if (contentType.includes('csv') || ext === 'csv' || ext === 'txt' || ext === 'tsv') {
      grid = parseDelimited(file.buffer.toString('utf-8'));
    } else if (contentType.includes('excel') || contentType.includes('spreadsheet') || ext === 'xlsx') {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const ExcelJS = require('exceljs') as typeof import('exceljs');
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(file.buffer as unknown as ArrayBuffer);
        const worksheet = workbook.worksheets[0];
        if (!worksheet) throw new Error('No worksheet found');
        worksheet.eachRow({ includeEmpty: false }, (row) => {
          const cells: string[] = [];
          row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            const val = cell.value;
            let text = '';
            if (val instanceof Date) text = val.toISOString().slice(0, 10);
            else if (val && typeof val === 'object' && 'result' in val) text = String((val as { result?: unknown }).result ?? '');
            else if (val && typeof val === 'object' && 'text' in val) text = String((val as { text?: unknown }).text ?? '');
            else if (val !== null && val !== undefined) text = String(val);
            cells[colNumber - 1] = text.trim();
          });
          grid.push(Array.from(cells, (c) => c ?? ''));
        });
      } catch {
        return res.status(400).json({ error: 'Excel parsing failed. Please export as CSV or XLSX.' });
      }
    } else if (ext === 'xls') {
      return res.status(400).json({ error: 'Legacy .xls format is not supported. Please export as .xlsx or .csv.' });
    } else {
      return res.status(400).json({ error: 'Unsupported file type. Upload CSV or Excel.' });
    }

    const table = readTabular(grid, config.import.columnAliases);
    if (table.transactions.length === 0) {
      return res.status(400).json({ error: 'No data rows found in file' });
    }
    if (table.columns.date === undefined || (table.columns.amount === undefined && table.columns.debit === undefined && table.columns.credit === undefined)) {
      return res.status(422).json({
        error: 'Could not find a date and an amount column. Make sure the first row of the sheet holds the column names.',
        code: 'IMPORT_COLUMNS_NOT_FOUND',
        headers: table.headers,
      });
    }

    const transactions: ImportedTransaction[] = await mapWithConcurrency(table.transactions, 8, async (row) => {
      const fallback = row.direction === 'credit' ? 'Other Income' : 'Others';
      const suggestion = await categorize(userId, row.description, fallback);
      return {
        rowIndex: row.rowIndex,
        description: row.description,
        amount: row.amount,
        date: row.date ? row.date.toISOString().slice(0, 10) : '',
        ...(row.date ? {} : { dateError: row.rawDate || '(empty)' }),
        type: row.direction,
        reference: row.reference,
        rawCategory: row.rawCategory,
        suggestedCategory: suggestion.category,
        suggestedSubcategory: suggestion.subcategory,
        confidence: suggestion.confidence,
        requiresReview: suggestion.confidence < 0.7 || !row.amount || !row.date || row.transferHint,
        rawRow: row.record,
      };
    });

    const preview = storeSession(userId, (sessionId) => ({
      sessionId,
      totalRows: table.totalRows,
      columnMap: columnNames(table.headers, table.columns),
      dateOrder: table.dateOrder,
      transactions,
      highConfidence: transactions.filter(t => t.confidence >= 0.7).length,
      lowConfidence: transactions.filter(t => t.confidence < 0.7).length,
    }));

    return res.json(preview);
  } catch (error) {
    logger.error('Import upload failed', { error });
    return res.status(500).json({ error: 'Failed to process import file' });
  }
};

/**
 * POST /import/statement — parse a bank statement (PDF or CSV/TXT export)
 * into statement metadata + typed transaction rows, ready for review.
 *
 * PDF text layers are read directly; scanned PDFs go through page
 * rasterisation + Tesseract. Structured extraction is LLM-first (Gemini →
 * Groq → OpenRouter) with a deterministic heuristic parser as offline
 * fallback. The result is stored as an import session so the same
 * /import/confirm endpoint bulk-saves the reviewed selection.
 */
export const uploadStatement = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const config = await getAIConfigurations();

    if (!config.import.enabled) {
      return res.status(400).json({ error: 'Statement import is currently disabled by administrator.' });
    }

    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'Statement file is required (PDF, CSV, or TXT)' });
    }

    const ext = file.originalname.split('.').pop()?.toLowerCase() || '';
    if (!['pdf', 'csv', 'txt', 'tsv'].includes(ext)) {
      return res.status(400).json({ error: `Unsupported statement format .${ext}. Upload PDF, CSV, or TXT.` });
    }

    const { text, ocrUsed } = await extractStatementText(file.buffer, file.mimetype || '', file.originalname);
    if (text.trim().length < 20) {
      return res.status(422).json({ error: 'Could not read any text from this statement. If it is a scanned image, try a clearer copy.' });
    }

    const parsed = await parseStatementText(text);
    if (parsed.transactions.length === 0) {
      return res.status(422).json({
        error: 'No transactions could be detected in this statement.',
        statement: { ...parsed, transactions: undefined },
      });
    }

    audit({
      event: 'ai.statement_parse',
      userId,
      meta: { parser: parsed.parser, rows: parsed.transactions.length, reconciled: parsed.reconciled, ocrUsed },
    });

    const transactions: ImportedTransaction[] = await mapWithConcurrency(parsed.transactions.slice(0, 2000), 8, async (row, idx) => {
      // A loan statement's rows are, by construction, payments on that loan —
      // no keyword guess needed (the categoriser filed them under "Others").
      const suggestion = parsed.parser === 'loan-statement'
        ? { category: 'Loan / Debt Payments', subcategory: 'EMI Payment', confidence: 0.95 }
        : await categorize(userId, row.description, row.type === 'credit' ? 'Other Income' : 'Others');
      return {
        rowIndex: idx,
        description: row.description,
        amount: row.amount,
        date: row.date,
        type: row.type,
        reference: row.reference,
        suggestedCategory: suggestion.category,
        suggestedSubcategory: suggestion.subcategory,
        confidence: suggestion.confidence,
        requiresReview: suggestion.confidence < 0.7,
        rawRow: {} as JsonRow,
      };
    });

    const { transactions: _rows, ...statementMeta } = parsed;
    const preview = storeSession(userId, (sessionId) => ({
      sessionId,
      totalRows: transactions.length,
      columnMap: {},
      transactions,
      highConfidence: transactions.filter((t) => t.confidence >= 0.7).length,
      lowConfidence: transactions.filter((t) => t.confidence < 0.7).length,
      statement: statementMeta,
    }));

    return res.json(preview);
  } catch (error) {
    logger.error('Statement upload failed', { error });
    return res.status(500).json({ error: 'Failed to parse statement. Please try again.' });
  }
};

type Override = { category?: string; subcategory?: string; amount?: number; description?: string; type?: 'debit' | 'credit'; date?: string };

/**
 * POST /import/confirm — bulk-save the reviewed selection into the ledger.
 *
 * One database transaction for the whole selection (importLedgerRows): rows
 * already imported are skipped, the account moves once by the net amount, and
 * the created rows come back so the app can show them without a full re-sync.
 * The target account must not go below zero (the same rule as manual entry).
 */
export const confirmImport = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const { sessionId, accountId, selectedRows, overrides } = req.body as {
      sessionId: string;
      accountId: string;
      selectedRows?: number[];
      overrides?: Record<string, Override>;
    };

    const session = sessionFor(userId, sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Import session not found or expired', code: 'IMPORT_SESSION_EXPIRED' });
    }

    const selection = selectedRows && selectedRows.length > 0
      ? session.transactions.filter((t) => selectedRows.includes(t.rowIndex))
      : session.transactions;

    if (selection.length === 0) {
      return res.status(400).json({ error: 'No rows selected for import' });
    }
    if (selection.length > MAX_IMPORT_ROWS) {
      return res.status(400).json({ error: `Too many rows selected (max ${MAX_IMPORT_ROWS} per import)` });
    }

    const invalidRows: number[] = [];
    const rows: LedgerImportRow[] = selection.flatMap((tx) => {
      const override = overrides?.[String(tx.rowIndex)];
      const amount = override?.amount ?? tx.amount;
      const dateText = override?.date ?? tx.date;
      const date = dateText ? new Date(`${dateText.slice(0, 10)}T00:00:00.000Z`) : new Date(NaN);
      if (!amount || amount <= 0 || Number.isNaN(date.getTime())) {
        invalidRows.push(tx.rowIndex);
        return [];
      }
      const direction = override?.type ?? tx.type ?? 'debit';
      const description = ((override?.description ?? tx.description) || 'Imported transaction').slice(0, 300);
      return [{
        key: String(tx.rowIndex),
        accountId,
        type: direction === 'credit' ? 'income' : 'expense',
        amount,
        date,
        category: override?.category ?? tx.suggestedCategory,
        subcategory: override?.subcategory ?? tx.suggestedSubcategory,
        description,
        merchant: description.slice(0, 100),
        // Content-hashed (not keyed on the bank reference, which repeats and
        // would not match statements imported before), so re-confirming the
        // same statement — or an overlapping one — skips what is already there.
      } satisfies LedgerImportRow];
    });

    if (rows.length === 0) {
      return res.status(400).json({ error: 'All selected rows are invalid (missing amount or date)', failedRows: invalidRows });
    }

    const result = await importLedgerRows(userId, rows, {
      source: session.statement ? 'statement' : 'spreadsheet',
      enforceBalance: true,
    });

    if (result.failed.some((f) => f.code === 'ACCOUNT_UNAVAILABLE') && result.created.length === 0 && result.duplicates.length === 0) {
      return res.status(404).json({ error: 'Target account not found. Select one of your active accounts.', code: 'ACCOUNT_UNAVAILABLE' });
    }

    importSessions.delete(sessionId);

    audit({
      event: 'data.create',
      userId,
      action: 'import.confirm',
      meta: { accountId, saved: result.created.length, duplicates: result.duplicates.length, invalid: invalidRows.length + result.failed.length },
    });

    const account = result.accounts.find((a) => a.id === accountId);
    return res.json({
      success: true,
      saved: result.created.length,
      duplicates: result.duplicates.length,
      failed: invalidRows.length + result.failed.length,
      failedRows: [...invalidRows, ...result.failed.map((f) => Number(f.key))],
      netBalanceChange: result.created.reduce((sum, c) => sum + (c.transaction.type === 'income' ? 1 : -1) * Number(c.transaction.amount), 0),
      accountBalance: account?.balance,
      transactions: result.created.map((c) => c.transaction),
    });
  } catch (error) {
    if (error instanceof ImportOverdrawError) {
      return res.status(400).json({ error: error.message, code: 'IMPORT_OVERDRAW' });
    }
    logger.error('Import confirm failed', { error });
    return res.status(500).json({ error: 'Failed to save imported transactions' });
  }
};

/**
 * POST /import/transactions — rows the APP parsed and the user reviewed
 * (third-party exports, KANAKU backups, statements read offline).
 *
 * Every row names its own server account (and destination for transfers), so a
 * multi-account file imports in one request. Rows are idempotent (see
 * importLedgerRows), so a retry, a double tap or re-importing the same file adds
 * nothing. Imports record history, so balances are not overdraw-checked.
 */
export const importTransactions = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const { source, rows } = req.body as {
      source: string;
      rows: Array<{
        clientRowId: string;
        accountId: string;
        type: 'income' | 'expense' | 'transfer';
        amount: number;
        date: string;
        category: string;
        subcategory?: string | null;
        description?: string | null;
        merchant?: string | null;
        transferToAccountId?: string | null;
        externalId?: string | null;
        currency?: string | null;
        metadata?: Record<string, unknown> | null;
      }>;
    };

    const result = await importLedgerRows(userId, rows.map((row) => ({
      key: row.clientRowId,
      accountId: row.accountId,
      type: row.type,
      amount: row.amount,
      date: new Date(row.date.length === 10 ? `${row.date}T00:00:00.000Z` : row.date),
      category: row.category,
      subcategory: row.subcategory,
      description: row.description,
      merchant: row.merchant,
      transferToAccountId: row.transferToAccountId,
      externalId: row.externalId,
      currency: row.currency,
      importMetadata: row.metadata,
    })), { source, enforceBalance: false });

    audit({
      event: 'data.create',
      userId,
      action: 'import.transactions',
      meta: { source: source.slice(0, 80), created: result.created.length, duplicates: result.duplicates.length, failed: result.failed.length },
    });

    return res.json({
      success: true,
      created: result.created,
      duplicates: result.duplicates,
      failed: result.failed,
      accounts: result.accounts,
    });
  } catch (error) {
    logger.error('Client import failed', { error });
    return res.status(500).json({ error: 'Failed to save imported transactions. Nothing was saved.' });
  }
};

export const getImportSession = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const session = sessionFor(userId, String(req.params.sessionId));
    if (!session) {
      return res.status(404).json({ error: 'Session not found or expired' });
    }
    return res.json(session);
  } catch {
    return res.status(500).json({ error: 'Failed to get import session' });
  }
};
