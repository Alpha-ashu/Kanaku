import { Response } from 'express';
import { createHash } from 'crypto';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { logger } from '../../config/logger';
import { categorizeTextForUser } from '../categorization/categorization.engine';
import { getAIConfigurations } from '../../utils/aiConfig';
import { audit } from '../../utils/auditLogger';
import { extractStatementText, parseStatementText, type ParsedStatement } from './statement.parser';

type JsonRow = Record<string, string>;

function fuzzyMatch(col: string, aliases: string[]): boolean {
  const lower = col.toLowerCase().trim();
  return aliases.some(alias => lower.includes(alias.toLowerCase()) || alias.toLowerCase().includes(lower));
}

interface ColumnMap {
  amount?: string;
  description?: string;
  date?: string;
  category?: string;
}

function detectColumns(headers: string[], aliases: { amount: string[]; description: string[]; date: string[]; category: string[] }): ColumnMap {
  const map: ColumnMap = {};
  for (const header of headers) {
    if (!map.amount && fuzzyMatch(header, aliases.amount)) map.amount = header;
    if (!map.description && fuzzyMatch(header, aliases.description)) map.description = header;
    if (!map.date && fuzzyMatch(header, aliases.date)) map.date = header;
    if (!map.category && fuzzyMatch(header, aliases.category)) map.category = header;
  }
  return map;
}

//  CSV parsing (no external dependency) 

// Bound the per-row scan so a maliciously huge single line (a CSV upload is
// user-controlled) cannot drive an effectively unbounded loop (CWE-834 DoS).
// Legitimate CSV rows are far below this cap, so real data is never truncated.
const MAX_CSV_LINE_LENGTH = 100_000;

function parseCSV(text: string): JsonRow[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    const len = Math.min(line.length, MAX_CSV_LINE_LENGTH);
    for (let i = 0; i < len; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseRow(lines[0]);
  return lines.slice(1).map(line => {
    const values = parseRow(line);
    const row: JsonRow = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ''; });
    return row;
  }).filter(row => Object.values(row).some(v => v));
}

//  Amount normalization 

function normalizeAmount(raw: string): number | undefined {
  if (!raw) return undefined;
  const cleaned = raw.replace(/[$,\s]/g, '').replace(/[()]/g, '');
  const val = parseFloat(cleaned);
  return isNaN(val) ? undefined : Math.abs(val);
}

//  Date normalization 

function normalizeDate(raw: string): string {
  if (!raw) return new Date().toISOString().slice(0, 10);

  const formats = [
    /^(\d{4})-(\d{2})-(\d{2})/, // ISO
    /^(\d{2})\/(\d{2})\/(\d{4})/, // MM/DD/YYYY
    /^(\d{2})-(\d{2})-(\d{4})/, // DD-MM-YYYY
    /^(\d{2})\.(\d{2})\.(\d{4})/, // DD.MM.YYYY
  ];

  for (const fmt of formats) {
    const m = raw.match(fmt);
    if (m) {
      // Try to parse as-is
      const d = new Date(raw);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
  }

  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

//  Interface 

export interface ImportedTransaction {
  rowIndex: number;
  description: string;
  amount?: number;
  date: string;
  /** debit = money out (expense), credit = money in (income). Absent for legacy CSV imports (treated as debit). */
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
  columnMap: ColumnMap;
  transactions: ImportedTransaction[];
  highConfidence: number;
  lowConfidence: number;
  /** Present when the session came from POST /import/statement */
  statement?: Omit<ParsedStatement, 'transactions'>;
}

// In-memory import sessions (replace with Redis/DB for production)
const importSessions = new Map<string, ImportPreview>();

//  Controllers 

export const uploadImport = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const config = await getAIConfigurations();

    if (!config.import.enabled) {
      return res.status(400).json({ error: 'Spreadsheet import is currently disabled by administrator.' });
    }

    const file = req.file; if (!file) {
      return res.status(400).json({ error: 'File is required' });
    }

    const ext = file.originalname.split('.').pop()?.toLowerCase() || '';
    const isSupported = config.import.formats.some(f => ext === f.toLowerCase());
    if (!isSupported) {
      return res.status(400).json({ error: `File format .${ext} is not allowed. Allowed formats: ${config.import.formats.join(', ')}` });
    }

    const contentType = file.mimetype || '';
    let rows: JsonRow[] = [];

    if (contentType.includes('csv') || ext === 'csv') {
      const text = file.buffer.toString('utf-8');
      rows = parseCSV(text);
    } else if (contentType.includes('excel') || contentType.includes('spreadsheet') || ext === 'xlsx') {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const ExcelJS = require('exceljs') as typeof import('exceljs');
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(file.buffer as any);
        const worksheet = workbook.worksheets[0];
        if (!worksheet) throw new Error('No worksheet found');
        const headers: string[] = [];
        worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
          headers[colNumber] = String(cell.value ?? '');
        });
        rows = [];
        worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
          if (rowNumber === 1) return;
          const obj: JsonRow = {};
          row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            const header = headers[colNumber];
            if (header) {
              const val = cell.value;
              if (val === null || val === undefined) {
                obj[header] = '';
              } else if (val instanceof Date) {
                obj[header] = val.toISOString();
              } else if (typeof val === 'object' && 'result' in val) {
                obj[header] = String((val as { result?: unknown }).result ?? '');
              } else {
                obj[header] = String(val);
              }
            }
          });
          rows.push(obj);
        });
      } catch {
        return res.status(400).json({ error: 'Excel parsing failed. Please export as CSV or XLSX.' });
      }
    } else if (ext === 'xls') {
      return res.status(400).json({ error: 'Legacy .xls format is not supported. Please export as .xlsx or .csv.' });
    } else {
      return res.status(400).json({ error: 'Unsupported file type. Upload CSV or Excel.' });
    }

    if (rows.length === 0) {
      return res.status(400).json({ error: 'No data rows found in file' });
    }

    const headers = Object.keys(rows[0]);
    const columnMap = detectColumns(headers, config.import.columnAliases);

    // Categorize all transactions
    const transactions: ImportedTransaction[] = await Promise.all(
      rows.slice(0, 2000).map(async (row, idx) => {
        const description = (columnMap.description ? row[columnMap.description] : '') || '';
        const rawAmount = columnMap.amount ? row[columnMap.amount] : undefined;
        const amount = rawAmount ? normalizeAmount(rawAmount) : undefined;
        const date = columnMap.date ? normalizeDate(row[columnMap.date]) : new Date().toISOString().slice(0, 10);
        const rawCategory = columnMap.category ? row[columnMap.category] : undefined;

        let suggestedCategory = 'Others';
        let suggestedSubcategory = 'General';
        let confidence = 0.3;

        if (description) {
          try {
            const result = await categorizeTextForUser(userId, description);
            suggestedCategory = result.category;
            suggestedSubcategory = result.subcategory;
            confidence = result.confidence;
          } catch { /* use defaults */ }
        }

        return {
          rowIndex: idx,
          description,
          amount,
          date,
          rawCategory,
          suggestedCategory,
          suggestedSubcategory,
          confidence,
          requiresReview: confidence < 0.7 || !amount,
          rawRow: row,
        };
      })
    );

    const sessionId = `import_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const preview: ImportPreview = {
      sessionId,
      totalRows: rows.length,
      columnMap,
      transactions,
      highConfidence: transactions.filter(t => t.confidence >= 0.7).length,
      lowConfidence: transactions.filter(t => t.confidence < 0.7).length,
    };

    importSessions.set(sessionId, preview);
    // Auto-expire after 30 minutes
    setTimeout(() => importSessions.delete(sessionId), 30 * 60 * 1000);

    return res.json(preview);
  } catch (error: any) {
    logger.error('Import upload failed', { error: error.message });
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

    // Categorise each row with the user's categorization engine
    const transactions: ImportedTransaction[] = await Promise.all(
      parsed.transactions.slice(0, 2000).map(async (row, idx) => {
        let suggestedCategory = row.type === 'credit' ? 'Other Income' : 'Others';
        let suggestedSubcategory = 'General';
        let confidence = 0.4;
        try {
          const result = await categorizeTextForUser(userId, row.description);
          suggestedCategory = result.category;
          suggestedSubcategory = result.subcategory;
          confidence = result.confidence;
        } catch { /* use defaults */ }

        return {
          rowIndex: idx,
          description: row.description,
          amount: row.amount,
          date: row.date,
          type: row.type,
          reference: row.reference,
          suggestedCategory,
          suggestedSubcategory,
          confidence,
          requiresReview: confidence < 0.7,
          rawRow: {} as JsonRow,
        };
      }),
    );

    const { transactions: _rows, ...statementMeta } = parsed;
    const sessionId = `stmt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const preview: ImportPreview = {
      sessionId,
      totalRows: transactions.length,
      columnMap: {},
      transactions,
      highConfidence: transactions.filter((t) => t.confidence >= 0.7).length,
      lowConfidence: transactions.filter((t) => t.confidence < 0.7).length,
      statement: statementMeta,
    };

    importSessions.set(sessionId, preview);
    setTimeout(() => importSessions.delete(sessionId), 30 * 60 * 1000);

    return res.json(preview);
  } catch (error: any) {
    logger.error('Statement upload failed', { error: error.message, stack: error.stack });
    return res.status(500).json({ error: 'Failed to parse statement. Please try again.' });
  }
};

/**
 * POST /import/confirm — bulk-save the reviewed selection into the ledger.
 *
 * The entire import commits in ONE database transaction: every selected row
 * plus a single net balance adjustment on the target account, with the same
 * no-overdraw invariant as the live transaction path. Rows already imported
 * (same dedup hash) are skipped, so re-confirming a statement never
 * double-books. Credit rows post as income, debit rows as expense.
 */
export const confirmImport = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const { sessionId, accountId, selectedRows, overrides } = req.body as {
      sessionId: string;
      accountId: string;
      selectedRows?: number[];
      overrides?: Record<number, { category?: string; subcategory?: string; amount?: number; description?: string; type?: 'debit' | 'credit' }>;
    };

    const session = importSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Import session not found or expired' });
    }

    const { prisma } = await import('../../db/prisma');
    const { Prisma } = await import('../../db/prisma-client');
    const { isOverdraw } = await import('../../utils/money');

    // Ownership check — the target account must belong to the caller
    const account = await prisma.account.findFirst({
      where: { id: accountId, userId, deletedAt: null, isActive: true },
      select: { id: true, type: true, name: true },
    });
    if (!account) {
      return res.status(404).json({ error: 'Target account not found. Select one of your active accounts.' });
    }

    const selection = selectedRows && selectedRows.length > 0
      ? session.transactions.filter((t) => selectedRows.includes(t.rowIndex))
      : session.transactions;

    if (selection.length === 0) {
      return res.status(400).json({ error: 'No rows selected for import' });
    }
    const MAX_BULK_ROWS = 1000;
    if (selection.length > MAX_BULK_ROWS) {
      return res.status(400).json({ error: `Too many rows selected (max ${MAX_BULK_ROWS} per import)` });
    }

    const dedupHashFor = (amount: number, date: Date, description: string) =>
      createHash('sha256')
        .update(`${userId}:${amount}:${date.toISOString().slice(0, 10)}:${description}`)
        .digest('hex');

    // Build the validated row set up-front so the DB transaction stays fast
    const invalidRows: number[] = [];
    const rows = selection.flatMap((tx) => {
      const override = overrides?.[tx.rowIndex];
      const amount = override?.amount ?? tx.amount;
      const description = (override?.description ?? tx.description) || 'Imported transaction';
      if (!amount || amount <= 0 || Number.isNaN(new Date(tx.date).getTime())) {
        invalidRows.push(tx.rowIndex);
        return [];
      }
      const rowType = override?.type ?? tx.type ?? 'debit';
      const date = new Date(tx.date);
      return [{
        rowIndex: tx.rowIndex,
        amount: Number(amount.toFixed(2)),
        description: description.slice(0, 300),
        category: override?.category ?? tx.suggestedCategory,
        subcategory: override?.subcategory ?? tx.suggestedSubcategory,
        type: rowType === 'credit' ? 'income' : 'expense',
        date,
        dedupHash: dedupHashFor(Number(amount.toFixed(2)), date, description),
      }];
    });

    if (rows.length === 0) {
      return res.status(400).json({ error: 'All selected rows are invalid (missing amount or date)', failedRows: invalidRows });
    }

    const result = await prisma.$transaction(async (tx) => {
      // Skip rows already imported (idempotent re-confirm)
      const existing = await tx.transaction.findMany({
        where: { dedupHash: { in: rows.map((r) => r.dedupHash) } },
        select: { dedupHash: true },
      });
      const existingHashes = new Set(existing.map((e) => e.dedupHash));
      const toInsert = rows.filter((r) => !existingHashes.has(r.dedupHash));
      const duplicates = rows.length - toInsert.length;

      let netDelta = new Prisma.Decimal(0);
      for (const row of toInsert) {
        await tx.transaction.create({
          data: {
            userId,
            accountId: account.id,
            type: row.type,
            amount: new Prisma.Decimal(row.amount),
            category: row.category,
            subcategory: row.subcategory,
            description: row.description,
            merchant: row.description.slice(0, 100),
            date: row.date,
            dedupHash: row.dedupHash,
            synced: true,
            syncStatus: 'synced',
          },
        });
        netDelta = row.type === 'income' ? netDelta.plus(row.amount) : netDelta.minus(row.amount);
      }

      // One net balance adjustment; the row lock serialises concurrent imports
      if (!netDelta.isZero()) {
        const updated = await tx.account.update({
          where: { id: account.id },
          data: { balance: { increment: netDelta } },
          select: { balance: true },
        });
        if (isOverdraw(updated.balance, netDelta, account.type)) {
          throw Object.assign(
            new Error(`Import would overdraw '${account.name}' (balance would fall below zero). Deselect some debit rows or choose another account.`),
            { code: 'IMPORT_OVERDRAW' },
          );
        }
      }

      return { saved: toInsert.length, duplicates, netDelta: netDelta.toNumber() };
    }, { timeout: 60_000 });

    importSessions.delete(sessionId);

    // Imported rows change balances/lists — evict this user's response caches
    try {
      const { cacheDeleteByUserId } = await import('../../cache/redis');
      await cacheDeleteByUserId(userId);
    } catch { /* cache eviction is best-effort */ }

    audit({
      event: 'data.create',
      userId,
      action: 'import.confirm',
      meta: { sessionId, accountId: account.id, saved: result.saved, duplicates: result.duplicates, invalid: invalidRows.length },
    });

    return res.json({
      success: true,
      saved: result.saved,
      duplicates: result.duplicates,
      failed: invalidRows.length,
      failedRows: invalidRows,
      netBalanceChange: result.netDelta,
    });
  } catch (error: any) {
    if (error?.code === 'IMPORT_OVERDRAW') {
      return res.status(400).json({ error: error.message, code: 'IMPORT_OVERDRAW' });
    }
    logger.error('Import confirm failed', { error: error.message });
    return res.status(500).json({ error: 'Failed to save imported transactions' });
  }
};

export const getImportSession = async (req: AuthRequest, res: Response) => {
  try {
    getUserId(req);
    const { sessionId } = req.params;
    const session = importSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found or expired' });
    }
    return res.json(session);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to get import session' });
  }
};

