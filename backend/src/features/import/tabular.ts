/**
 * Reading spreadsheet-style exports (bank CSVs, other finance apps, Excel sheets
 * saved as CSV) into typed transaction rows.
 *
 * Everything here is pure, so it is unit tested directly. The rules, and the
 * failures that prompted each:
 *
 *   - CSV is RFC 4180: quoted fields may hold commas, newlines and "" escapes;
 *     the delimiter is detected (`,` `;` tab `|`), a UTF-8 BOM is ignored, and
 *     bank preamble lines above the real header are skipped.
 *   - Direction comes from, in order: separate debit/credit (withdrawal/deposit)
 *     columns, a type column (Dr/Cr, income/expense…), a Dr/Cr marker on the
 *     amount, then the amount's sign. Every amount used to be made positive and
 *     booked as an expense, so salary credits imported as spending.
 *   - Amounts accept ₹/Rs/INR and other currency marks, Indian grouping
 *     (1,23,456.78), European decimal commas (1.234,56), (brackets) and a
 *     trailing minus.
 *   - Dates are read day-first or month-first as the FILE says (a 13 in the
 *     first position means day-first); otherwise day-first, the Indian
 *     convention. A date that cannot be read is reported, never silently
 *     replaced by today — that used to move whole statements to the upload day.
 */

export type DateOrder = 'DMY' | 'MDY';
export type Direction = 'debit' | 'credit';

// ── CSV ─────────────────────────────────────────────────────────────────────

/** U+FEFF, which Excel and Windows tools put at the start of UTF-8 CSVs. */
const BOM = String.fromCharCode(0xfeff);
const stripBom = (text: string) => (text.startsWith(BOM) ? text.slice(1) : text);

/** Guard against a single pathological record driving an unbounded scan. */
const MAX_FIELD_LENGTH = 20_000;
const MAX_RECORDS = 20_000;

export function detectDelimiter(text: string): ',' | ';' | '\t' | '|' {
  const candidates = [',', ';', '\t', '|'] as const;
  const lines = stripBom(text).split(/\r?\n/).filter((l) => l.trim()).slice(0, 20);
  let best: (typeof candidates)[number] = ',';
  let bestScore = 0;
  for (const delimiter of candidates) {
    const counts = lines.map((line) => {
      let n = 0;
      let quoted = false;
      for (const ch of line) {
        if (ch === '"') quoted = !quoted;
        else if (ch === delimiter && !quoted) n += 1;
      }
      return n;
    }).filter((n) => n > 0);
    if (counts.length === 0) continue;
    // Prefer a delimiter that appears on many lines with a stable count.
    const mode = counts.sort((a, b) => a - b)[Math.floor(counts.length / 2)];
    const score = counts.filter((n) => n === mode).length * Math.min(mode, 12);
    if (score > bestScore) {
      best = delimiter;
      bestScore = score;
    }
  }
  return best;
}

/** RFC 4180 parse into rows of cells. */
export function parseDelimited(text: string, delimiter = detectDelimiter(text)): string[][] {
  const input = stripBom(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else if (field.length < MAX_FIELD_LENGTH) {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field.trim() === '') {
      quoted = true;
      field = '';
    } else if (ch === delimiter) {
      row.push(field.trim());
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i += 1;
      row.push(field.trim());
      field = '';
      if (row.some((cell) => cell !== '')) rows.push(row);
      row = [];
      if (rows.length >= MAX_RECORDS) return rows;
    } else if (field.length < MAX_FIELD_LENGTH) {
      field += ch;
    }
  }
  row.push(field.trim());
  if (row.some((cell) => cell !== '')) rows.push(row);
  return rows;
}

// ── Column detection ────────────────────────────────────────────────────────

export interface ColumnAliases {
  date: string[];
  description: string[];
  amount: string[];
  category: string[];
}

export interface TabularColumns {
  date?: number;
  description?: number;
  amount?: number;
  debit?: number;
  credit?: number;
  type?: number;
  category?: number;
  balance?: number;
  reference?: number;
}

const BUILTIN = {
  date: ['date', 'txn date', 'transaction date', 'value date', 'posting date', 'booking date', 'tran date'],
  description: ['description', 'narration', 'particulars', 'details', 'transaction details', 'remarks', 'merchant', 'payee', 'memo', 'note', 'notes', 'title', 'name'],
  amount: ['amount', 'transaction amount', 'amt', 'value', 'sum'],
  debit: ['debit', 'withdrawal', 'withdrawals', 'withdrawal amt', 'withdrawal amount', 'debit amount', 'money out', 'paid out', 'dr amount', 'dr'],
  credit: ['credit', 'deposit', 'deposits', 'deposit amt', 'deposit amount', 'credit amount', 'money in', 'paid in', 'cr amount', 'cr'],
  type: ['type', 'transaction type', 'txn type', 'dr cr', 'cr dr', 'debit credit', 'direction', 'income expense', 'kind'],
  category: ['category', 'categories', 'tag', 'label'],
  balance: ['balance', 'closing balance', 'running balance', 'available balance', 'balance amt'],
  reference: ['reference', 'ref', 'ref no', 'reference no', 'cheque no', 'chq no', 'utr', 'transaction id', 'txn id', 'id'],
};

const normHeader = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Exact, or whole-word containment — never a substring ("cr" must not match "description"). */
const headerMatches = (header: string, alias: string) => {
  const h = normHeader(header);
  const a = normHeader(alias);
  if (!h || !a) return false;
  if (h === a) return true;
  return ` ${h} `.includes(` ${a} `);
};

export function detectTabularColumns(headers: string[], aliases?: Partial<ColumnAliases>): TabularColumns {
  const used = new Set<number>();
  const find = (names: string[], skip: (header: string) => boolean = () => false) => {
    // Exact header matches win over word matches ("Amount" before "Debit Amount").
    for (const exact of [true, false]) {
      for (const name of names) {
        const index = headers.findIndex((h, i) => !used.has(i) && !skip(h)
          && (exact ? normHeader(h) === normHeader(name) : headerMatches(h, name)));
        if (index >= 0) {
          used.add(index);
          return index;
        }
      }
    }
    return undefined;
  };
  const merge = (configured: string[] | undefined, builtin: string[]) => [...(configured ?? []), ...builtin];

  const columns: TabularColumns = {};
  columns.date = find(merge(aliases?.date, BUILTIN.date));
  columns.debit = find(BUILTIN.debit);
  columns.credit = find(BUILTIN.credit);
  columns.balance = find(BUILTIN.balance);
  // "Value Date" must never be read as money.
  const isDateHeader = (h: string) => normHeader(h).split(' ').includes('date');
  columns.amount = find(merge(aliases?.amount, BUILTIN.amount), isDateHeader);
  columns.type = find(BUILTIN.type);
  columns.description = find(merge(aliases?.description, BUILTIN.description));
  columns.category = find(merge(aliases?.category, BUILTIN.category));
  columns.reference = find(BUILTIN.reference);
  // Separate money-out / money-in columns say everything; a generic amount
  // column next to them is a total or a duplicate, never the source of truth.
  if (columns.debit !== undefined && columns.credit !== undefined) columns.amount = undefined;
  // A lone "Debit" or "Credit" column is just a signed amount column.
  if (columns.amount === undefined && (columns.debit === undefined) !== (columns.credit === undefined)) {
    columns.amount = columns.debit ?? columns.credit;
    columns.debit = undefined;
    columns.credit = undefined;
  }
  return columns;
}

/**
 * The header row: the first of the leading rows that names a date column and
 * something to read an amount from. Banks put account details above it.
 */
export function findHeaderRow(rows: string[][], aliases?: Partial<ColumnAliases>): number {
  const limit = Math.min(rows.length, 40);
  for (let i = 0; i < limit; i += 1) {
    const cols = detectTabularColumns(rows[i], aliases);
    if (cols.date !== undefined && (cols.amount !== undefined || cols.debit !== undefined || cols.credit !== undefined)) return i;
  }
  return 0;
}

// ── Amounts ─────────────────────────────────────────────────────────────────

export interface ParsedAmount {
  /** Signed: negative means money out. */
  value: number;
  /** An explicit Dr/Cr marker on the value itself. */
  marker?: Direction;
}

export function parseAmount(raw: unknown): ParsedAmount | undefined {
  if (typeof raw === 'number') return Number.isFinite(raw) ? { value: raw } : undefined;
  let text = String(raw ?? '').trim();
  if (!text) return undefined;

  let marker: Direction | undefined;
  const drcr = text.match(/\b(dr|cr)\.?$/i) || text.match(/^(dr|cr)\.?\b/i);
  if (drcr) {
    marker = drcr[1].toLowerCase() === 'dr' ? 'debit' : 'credit';
    text = text.replace(/\b(dr|cr)\.?$/i, '').replace(/^(dr|cr)\.?\b/i, '').trim();
  }

  // A leading currency label — "Rs. 99" must not read as ".99".
  text = text.replace(/^[A-Za-z₹$€£¥\s]+\.?\s*/, '');

  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  if (/-\s*$/.test(text)) {
    negative = true;
    text = text.replace(/-\s*$/, '');
  }
  if (/^\s*[-−–]/.test(text) || /^[^\d-]*[-−–]\s*\d/.test(text)) negative = true;

  // Keep digits and separators only (drops ₹, Rs., INR, $, spaces…).
  let digits = text.replace(/[^\d.,]/g, '');
  if (!/\d/.test(digits)) return undefined;

  const lastDot = digits.lastIndexOf('.');
  const lastComma = digits.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    // Both present: whichever comes last is the decimal separator.
    digits = lastComma > lastDot ? digits.replace(/\./g, '').replace(',', '.') : digits.replace(/,/g, '');
  } else if (lastComma >= 0) {
    const tail = digits.length - lastComma - 1;
    const commaCount = (digits.match(/,/g) || []).length;
    // "12,5" / "12,50" is a decimal comma; "1,234" / "1,23,456" is grouping.
    digits = commaCount === 1 && tail > 0 && tail <= 2 ? digits.replace(',', '.') : digits.replace(/,/g, '');
  } else if ((digits.match(/\./g) || []).length > 1) {
    // "1.234.567" — dots as grouping.
    digits = digits.replace(/\./g, '');
  }

  const value = Number.parseFloat(digits);
  if (!Number.isFinite(value)) return undefined;
  const signed = negative ? -Math.abs(value) : Math.abs(value);
  return marker ? { value: signed, marker } : { value: signed };
}

const INCOME_WORDS = new Set(['income', 'credit', 'cr', 'deposit', 'in', 'received', 'receipt', 'inflow', 'refund', 'salary', 'c']);
const EXPENSE_WORDS = new Set(['expense', 'debit', 'dr', 'withdrawal', 'out', 'payment', 'spent', 'outflow', 'spend', 'purchase', 'd']);

export function directionFromWord(raw: unknown): Direction | 'transfer' | undefined {
  const word = String(raw ?? '').toLowerCase().replace(/[^a-z ]/g, ' ').trim();
  if (!word) return undefined;
  if (/\btransfer\b/.test(word)) return 'transfer';
  const first = word.split(/\s+/)[0];
  if (INCOME_WORDS.has(word) || INCOME_WORDS.has(first)) return 'credit';
  if (EXPENSE_WORDS.has(word) || EXPENSE_WORDS.has(first)) return 'debit';
  return undefined;
}

// ── Dates ───────────────────────────────────────────────────────────────────

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

/** "Sept" / "September" / "sep" → 9; anything else → undefined. */
const monthOf = (name: string): number | undefined => {
  const lower = name.toLowerCase();
  return MONTHS[lower.slice(0, 4)] ?? MONTHS[lower.slice(0, 3)];
};

const utcDate = (y: number, m: number, d: number): Date | null => {
  if (y < 100) y += 2000;
  const maxYear = new Date().getUTCFullYear() + 1;
  if (y < 1970 || y > maxYear || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  // Reject 31/02 and friends instead of letting Date roll them over.
  return date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : null;
};

const NUMERIC_DATE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\b/;

/** Day-first unless some value can only be month-first (or vice versa). */
export function inferDateOrder(values: unknown[]): DateOrder {
  let dayFirst = false;
  let monthFirst = false;
  for (const value of values) {
    const m = String(value ?? '').trim().match(NUMERIC_DATE);
    if (!m) continue;
    if (Number(m[1]) > 12) dayFirst = true;
    if (Number(m[2]) > 12) monthFirst = true;
  }
  if (monthFirst && !dayFirst) return 'MDY';
  return 'DMY';
}

export function parseDateValue(raw: unknown, order: DateOrder = 'DMY'): Date | null {
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : utcDate(raw.getUTCFullYear(), raw.getUTCMonth() + 1, raw.getUTCDate());
  const text = String(raw ?? '').trim();
  if (!text) return null;

  let m = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return utcDate(Number(m[1]), Number(m[2]), Number(m[3]));

  m = text.match(NUMERIC_DATE);
  if (m) {
    const [a, b, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return order === 'MDY' ? utcDate(y, a, b) : utcDate(y, b, a);
  }

  // 05 Jan 2025, 05-Jan-25, 5 January 2025
  m = text.match(/^(\d{1,2})[\s\-/.]+([A-Za-z]{3,9})[\s\-/.,]+(\d{2}|\d{4})\b/);
  if (m) {
    const month = monthOf(m[2]);
    if (month) return utcDate(Number(m[3]), month, Number(m[1]));
  }
  // Jan 05, 2025 / January 5 2025
  m = text.match(/^([A-Za-z]{3,9})[\s\-/.]+(\d{1,2})(?:st|nd|rd|th)?[\s,\-/.]+(\d{2}|\d{4})\b/);
  if (m) {
    const month = monthOf(m[1]);
    if (month) return utcDate(Number(m[3]), month, Number(m[2]));
  }

  // Excel serial day number (1900 date system), e.g. 45667.
  if (/^\d{5}(\.\d+)?$/.test(text)) {
    const serial = Math.floor(Number(text));
    if (serial > 20_000 && serial < 80_000) {
      const date = new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000);
      return utcDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
    }
  }
  return null;
}

// ── Rows ────────────────────────────────────────────────────────────────────

export interface TabularTransaction {
  rowIndex: number;
  date: Date | null;
  /** The cell as written, for the review screen. */
  rawDate: string;
  description: string;
  amount?: number;
  direction?: Direction;
  /** The file called it a transfer; single-account imports book it by sign and ask for review. */
  transferHint: boolean;
  rawCategory?: string;
  reference?: string;
  balance?: number;
  record: Record<string, string>;
}

/**
 * Header detection + per-row typing for a whole file. Direction falls back to
 * the amount's sign only when the file actually uses signs (some negative
 * values); an all-positive, untyped file stays "debit", as before.
 */
export function readTabular(rows: string[][], aliases?: Partial<ColumnAliases>, maxRows = 2000) {
  const headerIndex = findHeaderRow(rows, aliases);
  const headers = (rows[headerIndex] ?? []).map((h, i) => h || `Column ${i + 1}`);
  const columns = detectTabularColumns(headers, aliases);
  const body = rows.slice(headerIndex + 1).filter((r) => r.some((c) => c !== '')).slice(0, maxRows);

  const cell = (r: string[], index: number | undefined) => (index === undefined ? '' : (r[index] ?? '').trim());
  const order = inferDateOrder(body.map((r) => cell(r, columns.date)));
  const signed = columns.amount !== undefined && body.some((r) => (parseAmount(cell(r, columns.amount))?.value ?? 0) < 0);

  const transactions: TabularTransaction[] = body.map((r, rowIndex) => {
    const record: Record<string, string> = {};
    headers.forEach((h, i) => { record[h] = r[i] ?? ''; });

    let amount: number | undefined;
    let direction: Direction | undefined;
    let transferHint = false;

    const debit = parseAmount(cell(r, columns.debit));
    const credit = parseAmount(cell(r, columns.credit));
    if (debit && Math.abs(debit.value) > 0) {
      amount = Math.abs(debit.value);
      direction = 'debit';
    } else if (credit && Math.abs(credit.value) > 0) {
      amount = Math.abs(credit.value);
      direction = 'credit';
    } else {
      const parsed = parseAmount(cell(r, columns.amount));
      if (parsed && parsed.value !== 0) {
        amount = Math.abs(parsed.value);
        const typed = directionFromWord(cell(r, columns.type));
        if (typed === 'transfer') transferHint = true;
        if (typed && typed !== 'transfer') direction = typed;
        else if (parsed.marker) direction = parsed.marker;
        else if (signed) direction = parsed.value < 0 ? 'debit' : 'credit';
        else direction = 'debit';
      }
    }

    const description = cell(r, columns.description);
    const balance = parseAmount(cell(r, columns.balance));
    return {
      rowIndex,
      date: parseDateValue(cell(r, columns.date), order),
      rawDate: cell(r, columns.date),
      description,
      amount,
      direction,
      transferHint,
      rawCategory: cell(r, columns.category) || undefined,
      reference: cell(r, columns.reference) || undefined,
      balance: balance?.value,
      record,
    };
  });

  return { headers, columns, dateOrder: order, transactions, totalRows: rows.length - headerIndex - 1 };
}
