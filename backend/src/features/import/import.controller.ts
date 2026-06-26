import { Response } from 'express';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { logger } from '../../config/logger';
import { categorizeTextForUser } from '../categorization/categorization.engine';
import { getAIConfigurations } from '../../utils/aiConfig';

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

export const confirmImport = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const { sessionId, overrides } = req.body as {
      sessionId: string;
      overrides?: Record<number, { category?: string; subcategory?: string; amount?: number; description?: string }>;
    };

    const session = importSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Import session not found or expired' });
    }

    const { prisma } = await import('../../db/prisma');

    let saved = 0;
    const errors: number[] = [];

    for (const tx of session.transactions) {
      const override = overrides?.[tx.rowIndex];
      const category = override?.category ?? tx.suggestedCategory;
      const subcategory = override?.subcategory ?? tx.suggestedSubcategory;
      const amount = override?.amount ?? tx.amount;
      const description = override?.description ?? tx.description;

      if (!amount || amount <= 0) {
        errors.push(tx.rowIndex);
        continue;
      }

      try {
        await (prisma as any).transaction.create({
          data: {
            userId,
            type: 'expense',
            amount,
            description: description || 'Imported transaction',
            category,
            subcategory,
            date: new Date(tx.date),
            merchant: description?.slice(0, 100) ?? '',
            source: 'import',
          },
        });
        saved++;
      } catch (err: any) {
        logger.warn('Failed to save imported transaction', { rowIndex: tx.rowIndex, error: err.message });
        errors.push(tx.rowIndex);
      }
    }

    importSessions.delete(sessionId);

    return res.json({
      success: true,
      saved,
      failed: errors.length,
      failedRows: errors,
    });
  } catch (error: any) {
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

