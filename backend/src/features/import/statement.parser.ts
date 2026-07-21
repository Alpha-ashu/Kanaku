/**
 * Bank statement parser — server-side structured extraction.
 *
 * Pipeline:
 *   PDF  → text layer via pdf-parse v2; scanned PDFs fall back to
 *          page rasterisation + Tesseract OCR text
 *   CSV  → raw text (the LLM and the heuristic parser both handle
 *          delimited rows fine)
 *   text → LLM structured extraction (Gemini JSON-mode primary, Groq /
 *          OpenRouter fallbacks — same provider chain as the voice NLP)
 *        → heuristic line parser when no LLM provider is configured/reachable
 *
 * Output includes statement metadata (bank, account number, period,
 * opening/closing balances) plus typed rows, and a reconciliation check:
 *   opening + Σcredits − Σdebits ≈ closing  (±0.05 tolerance)
 */
import { logger } from '../../config/logger';

// ─── Types ────────────────────────────────────────────────────────────────────
// Wire-contract shapes come from @kanaku/shared (also consumed by the
// frontend); ParsedStatement is the backend's stricter internal variant.

import type { StatementMeta, StatementParserSource, StatementTransaction } from '@kanaku/shared';

export type { StatementTransaction };

export interface ParsedStatement extends StatementMeta {
  currency: string;
  transactions: StatementTransaction[];
  /** true when opening + credits − debits matches closing within tolerance */
  reconciled: boolean | null;
  parser: StatementParserSource;
  warnings: string[];
}

// ─── Text acquisition ─────────────────────────────────────────────────────────

const MIN_TEXT_LENGTH = 120;
const MAX_STATEMENT_TEXT = 60_000; // keep LLM input bounded

export const extractStatementText = async (
  buffer: Buffer,
  contentType: string,
  originalName: string,
): Promise<{ text: string; ocrUsed: boolean }> => {
  const ext = originalName.split('.').pop()?.toLowerCase() ?? '';
  const isPdf = contentType.includes('pdf') || ext === 'pdf';

  if (!isPdf) {
    // CSV / TSV / TXT exports — already text
    return { text: buffer.toString('utf-8').slice(0, MAX_STATEMENT_TEXT), ocrUsed: false };
  }

  const { extractPdfText, renderPdfPagesToPng } = await import('../../utils/pdfRender');

  const text = await extractPdfText(buffer).catch((err) => {
    logger.warn('Statement: pdf text extraction failed', { error: err.message });
    return '';
  });
  if (text.length >= MIN_TEXT_LENGTH) {
    return { text: text.slice(0, MAX_STATEMENT_TEXT), ocrUsed: false };
  }

  // Scanned statement — rasterise up to 4 pages and OCR them (PaddleOCR when
  // configured, else Tesseract). Paddle's row reconstruction keeps the debit/
  // credit/balance columns aligned, which the downstream row parser depends on.
  logger.info('Statement: no text layer, running OCR fallback');
  const { extractRawText } = await import('../../utils/paddleOcr');
  const pages = await renderPdfPagesToPng(buffer, 4);
  const chunks: string[] = [];
  let engineUsed = 'tesseract';
  for (const page of pages) {
    const { text, engine } = await extractRawText(page.png, 'image/png');
    engineUsed = engine;
    chunks.push(text);
  }
  logger.info(`Statement OCR complete (${engineUsed})`, { pages: pages.length });
  return { text: chunks.join('\n').slice(0, MAX_STATEMENT_TEXT), ocrUsed: true };
};

// ─── LLM extraction ───────────────────────────────────────────────────────────

const buildStatementPrompt = (text: string): string => `You are a precise financial-document parser. Extract the bank statement below into JSON.

Return ONLY a JSON object with this exact shape (no markdown fences, no commentary):
{
  "bankName": <string or null>,
  "accountNumber": <string exactly as printed, keep masking like "XXXX1234", or null>,
  "accountHolder": <string or null>,
  "currency": <ISO code, default "INR" for Indian banks>,
  "period": { "from": <"YYYY-MM-DD" or null>, "to": <"YYYY-MM-DD" or null> },
  "openingBalance": <number or null>,
  "closingBalance": <number or null>,
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "description": <cleaned narration, strip reference codes into "reference">,
      "amount": <positive number>,
      "type": "debit" | "credit",
      "balance": <running balance after this row, or null>,
      "reference": <cheque/UTR/UPI ref or null>
    }
  ]
}

RULES:
- Extract EVERY transaction row. Do not summarise, sample, or drop rows.
- "debit" = money OUT (withdrawal/DR column). "credit" = money IN (deposit/CR column).
- Statements print dates as DD/MM/YYYY or DD-MM-YY in India — convert to YYYY-MM-DD.
- Amounts may contain commas (1,23,456.78 Indian grouping) — parse numerically.
- If a row spans multiple lines, merge the narration.
- openingBalance = balance BEFORE the first transaction (often printed as "Opening Balance" or "B/F").
- closingBalance = balance AFTER the last transaction ("Closing Balance" / "C/F").

STATEMENT TEXT:
"""
${text}
"""`;

interface LLMStatementRaw {
  bankName?: string | null;
  accountNumber?: string | null;
  accountHolder?: string | null;
  currency?: string | null;
  period?: { from?: string | null; to?: string | null } | null;
  openingBalance?: number | null;
  closingBalance?: number | null;
  transactions?: Array<Partial<StatementTransaction> & { amount?: number | string }>;
}

const parseJsonObject = (rawText: string): LLMStatementRaw | null => {
  const cleaned = rawText.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '');
  try {
    const parsed = JSON.parse(cleaned);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    logger.warn('Statement LLM: JSON parse failed', { preview: cleaned.slice(0, 150) });
    return null;
  }
};

const extractWithGemini = async (text: string): Promise<LLMStatementRaw | null> => {
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
  const model = genAI.getGenerativeModel({
    model: process.env.STATEMENT_LLM_MODEL || 'gemini-flash-latest',
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0,
      maxOutputTokens: 8192,
    },
  });
  const result = await model.generateContent(buildStatementPrompt(text));
  return parseJsonObject(result.response.text());
};

const extractWithOpenAICompatible = async (
  text: string,
  opts: { baseUrl: string; apiKey: string; model: string; label: string },
): Promise<LLMStatementRaw | null> => {
  const res = await fetch(`${opts.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opts.apiKey}` },
    body: JSON.stringify({
      model: opts.model,
      messages: [{ role: 'user', content: buildStatementPrompt(text) }],
      temperature: 0,
      max_tokens: 8192,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${opts.label} API error ${res.status}: ${body.slice(0, 200)}`);
  }
  const data: any = await res.json();
  return parseJsonObject(data?.choices?.[0]?.message?.content ?? '');
};

// ─── Heuristic fallback parser ────────────────────────────────────────────────
// Deterministic, offline. Handles the two dominant layouts:
//   (a) delimited CSV exports with debit/credit or amount+type columns
//   (b) fixed-width / text PDF rows: DATE  NARRATION  [REF]  DEBIT  CREDIT  BALANCE

const parseAmountToken = (raw: string): number | undefined => {
  const cleaned = raw.replace(/[₹$,\s]/g, '').replace(/[()]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return undefined;
  const val = parseFloat(cleaned);
  return Number.isFinite(val) && val >= 0 ? val : undefined;
};

const DATE_TOKEN = /^(\d{1,2})[\/-](\d{1,2}|[A-Za-z]{3})[\/-](\d{2,4})$|^(\d{4})-(\d{2})-(\d{2})$/;

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const normaliseDateToken = (raw: string): string | undefined => {
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return raw;
  const m = raw.match(/^(\d{1,2})[\/-](\d{1,2}|[A-Za-z]{3})[\/-](\d{2,4})$/);
  if (!m) return undefined;
  const day = Number(m[1]);
  const monthRaw = m[2];
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  const month = /^\d+$/.test(monthRaw) ? Number(monthRaw) : MONTHS[monthRaw.toLowerCase()] ?? 0;
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const CREDIT_HINTS = /\b(cr|credit|deposit|salary|neft.*cr|received|refund|interest)\b/i;
const DEBIT_HINTS = /\b(dr|debit|withdrawal|atm|purchase|paid|emi|charge)\b/i;

export const heuristicParseStatement = (text: string): ParsedStatement => {
  const warnings: string[] = [];
  const transactions: StatementTransaction[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  let bankName: string | undefined;
  let accountNumber: string | undefined;
  let openingBalance: number | undefined;
  let closingBalance: number | undefined;
  let periodFrom: string | undefined;
  let periodTo: string | undefined;

  const BANK_RE = /\b([A-Z][A-Za-z&\s]{2,30}Bank(?:\s+of\s+[A-Za-z]+)?|SBI|HDFC|ICICI|Axis|Kotak|PNB|Canara|IDFC|Yes Bank)\b/;
  const ACC_RE = /(?:a\/?c|account)\s*(?:no\.?|number|#)?\s*[:\-]?\s*([Xx*\d]{6,20})/i;

  for (const line of lines.slice(0, 25)) {
    if (!bankName) { const m = line.match(BANK_RE); if (m) bankName = m[1].trim(); }
    if (!accountNumber) { const m = line.match(ACC_RE); if (m) accountNumber = m[1]; }
    if (openingBalance === undefined && /opening\s*balance|b\/f/i.test(line)) {
      const nums = line.match(/[\d,]+\.?\d*/g);
      if (nums?.length) openingBalance = parseAmountToken(nums[nums.length - 1]);
    }
    const periodMatch = line.match(/(?:from|period)\s*:?\s*(\S+)\s*(?:to|-)\s*(\S+)/i);
    if (periodMatch && !periodFrom) {
      periodFrom = normaliseDateToken(periodMatch[1]);
      periodTo = normaliseDateToken(periodMatch[2]);
    }
  }
  for (const line of lines.slice(-15)) {
    if (/closing\s*balance|c\/f/i.test(line)) {
      const nums = line.match(/[\d,]+\.?\d*/g);
      if (nums?.length) closingBalance = parseAmountToken(nums[nums.length - 1]);
    }
  }

  // Delimited rows first (CSV export). Statements often carry preamble text
  // (bank name, period, opening balance) before the table, so locate the
  // header row — a delimited line mentioning "date" — within the first lines
  // rather than assuming the file starts with it.
  let delimiter: string | null = null;
  let headerIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const candidate = lines[i].includes('\t') ? '\t' : lines[i].split(',').length > 3 ? ',' : null;
    if (candidate && /date/i.test(lines[i])) {
      delimiter = candidate;
      headerIdx = i;
      break;
    }
  }
  if (delimiter === null && (lines[0]?.includes('\t') || lines[0]?.split(',').length > 3)) {
    delimiter = lines[0].includes('\t') ? '\t' : ',';
    headerIdx = 0;
  }
  if (delimiter && headerIdx >= 0) {
    const headers = lines[headerIdx].split(delimiter).map((h) => h.trim().toLowerCase());
    const col = (aliases: string[]) => headers.findIndex((h) => aliases.some((a) => h.includes(a)));
    const dateCol = col(['date']);
    const descCol = col(['narration', 'description', 'particulars', 'details', 'remarks']);
    const debitCol = col(['debit', 'withdrawal', 'dr amount', 'dr']);
    const creditCol = col(['credit', 'deposit', 'cr amount', 'cr']);
    const amountCol = col(['amount']);
    const typeCol = col(['type', 'dr/cr', 'cr/dr']);
    const balanceCol = col(['balance']);
    const refCol = col(['ref', 'cheque', 'utr']);

    if (dateCol >= 0 && (debitCol >= 0 || creditCol >= 0 || amountCol >= 0)) {
      for (const line of lines.slice(headerIdx + 1)) {
        const cells = line.split(delimiter).map((c) => c.trim().replace(/^"|"$/g, ''));
        const date = normaliseDateToken(cells[dateCol] ?? '');
        if (!date) continue;

        const debit = debitCol >= 0 ? parseAmountToken(cells[debitCol] ?? '') : undefined;
        const credit = creditCol >= 0 ? parseAmountToken(cells[creditCol] ?? '') : undefined;
        let amount = debit ?? credit;
        let type: 'debit' | 'credit' | undefined = debit !== undefined && debit > 0 ? 'debit'
          : credit !== undefined && credit > 0 ? 'credit' : undefined;

        if (amount === undefined && amountCol >= 0) {
          amount = parseAmountToken(cells[amountCol] ?? '');
          const typeCell = typeCol >= 0 ? (cells[typeCol] ?? '') : '';
          type = /cr/i.test(typeCell) ? 'credit' : /dr/i.test(typeCell) ? 'debit'
            : CREDIT_HINTS.test(line) ? 'credit' : 'debit';
        }

        if (!amount || amount <= 0 || !type) continue;
        transactions.push({
          date,
          description: (descCol >= 0 ? cells[descCol] : '') || 'Statement transaction',
          amount,
          type,
          balance: balanceCol >= 0 ? parseAmountToken(cells[balanceCol] ?? '') : undefined,
          reference: refCol >= 0 ? cells[refCol] || undefined : undefined,
        });
      }
    }
  }

  // Text-PDF rows: leading date token, trailing numeric columns
  if (transactions.length === 0) {
    for (const line of lines) {
      const tokens = line.split(/\s{2,}|\t/).map((t) => t.trim()).filter(Boolean);
      if (tokens.length < 3) continue;
      const date = normaliseDateToken(tokens[0]);
      if (!date) continue;

      // trailing numeric tokens: [... debit? credit?] balance?
      const numericTail: number[] = [];
      let i = tokens.length - 1;
      while (i > 0 && numericTail.length < 3) {
        const val = parseAmountToken(tokens[i]);
        if (val === undefined) break;
        numericTail.unshift(val);
        i--;
      }
      if (numericTail.length === 0) continue;

      const description = tokens.slice(1, i + 1).join(' ') || 'Statement transaction';
      let amount: number; let balance: number | undefined;
      if (numericTail.length >= 2) {
        amount = numericTail[numericTail.length - 2];
        balance = numericTail[numericTail.length - 1];
      } else {
        amount = numericTail[0];
      }
      if (!amount || amount <= 0) continue;

      const type: 'debit' | 'credit' = CREDIT_HINTS.test(line) && !DEBIT_HINTS.test(line) ? 'credit' : 'debit';
      transactions.push({ date, description, amount, type, balance });
    }
    if (transactions.length > 0) {
      warnings.push('Debit/credit direction inferred from keywords for text rows — review before importing.');
    }
  }

  // Running-balance direction correction: when the statement prints balances,
  // the delta sign is authoritative over keyword guessing.
  for (let idx = 1; idx < transactions.length; idx++) {
    const prev = transactions[idx - 1];
    const cur = transactions[idx];
    if (prev.balance !== undefined && cur.balance !== undefined) {
      const delta = Number((cur.balance - prev.balance).toFixed(2));
      if (Math.abs(Math.abs(delta) - cur.amount) < 0.05) {
        cur.type = delta >= 0 ? 'credit' : 'debit';
      }
    }
  }

  return finaliseStatement({
    bankName, accountNumber, currency: 'INR',
    period: { from: periodFrom, to: periodTo },
    openingBalance, closingBalance, transactions,
  }, 'heuristic', warnings);
};

// ─── Normalisation + reconciliation ──────────────────────────────────────────

const finaliseStatement = (
  raw: LLMStatementRaw & { transactions: StatementTransaction[] },
  parser: ParsedStatement['parser'],
  warnings: string[] = [],
): ParsedStatement => {
  const transactions = (raw.transactions ?? [])
    .map((t): StatementTransaction | null => {
      const amount = typeof t.amount === 'string' ? parseAmountToken(t.amount) : t.amount;
      const date = t.date ? normaliseDateToken(String(t.date)) ?? (String(t.date).match(/^\d{4}-\d{2}-\d{2}/) ? String(t.date).slice(0, 10) : undefined) : undefined;
      if (!amount || amount <= 0 || !date) return null;
      const type = t.type === 'credit' ? 'credit' : 'debit';
      return {
        date,
        description: (t.description || 'Statement transaction').toString().slice(0, 300),
        amount: Number(amount.toFixed(2)),
        type,
        balance: typeof t.balance === 'number' ? t.balance : undefined,
        reference: t.reference ? String(t.reference).slice(0, 60) : undefined,
      };
    })
    .filter((t): t is StatementTransaction => t !== null);

  const opening = raw.openingBalance ?? undefined;
  const closing = raw.closingBalance ?? undefined;

  let reconciled: boolean | null = null;
  let reconciliationDelta: number | undefined;
  if (opening !== undefined && closing !== undefined && transactions.length > 0) {
    const credits = transactions.filter((t) => t.type === 'credit').reduce((s, t) => s + t.amount, 0);
    const debits = transactions.filter((t) => t.type === 'debit').reduce((s, t) => s + t.amount, 0);
    const expectedClosing = Number((opening + credits - debits).toFixed(2));
    reconciliationDelta = Number((expectedClosing - closing).toFixed(2));
    reconciled = Math.abs(reconciliationDelta) <= 0.05;
    if (!reconciled) {
      warnings.push(`Statement does not reconcile: opening + credits − debits = ${expectedClosing}, but closing balance is ${closing} (Δ ${reconciliationDelta}). Some rows may be missing or mistyped.`);
    }
  }

  return {
    bankName: raw.bankName ?? undefined,
    accountNumber: raw.accountNumber ?? undefined,
    accountHolder: raw.accountHolder ?? undefined,
    currency: (raw.currency || 'INR').toUpperCase().slice(0, 3),
    period: raw.period ? { from: raw.period.from ?? undefined, to: raw.period.to ?? undefined } : undefined,
    openingBalance: opening,
    closingBalance: closing,
    transactions,
    reconciled,
    reconciliationDelta,
    parser,
    warnings,
  };
};

// ─── Main entry ───────────────────────────────────────────────────────────────

export const parseStatementText = async (text: string): Promise<ParsedStatement> => {
  const providers: Array<{ label: ParsedStatement['parser']; run: () => Promise<LLMStatementRaw | null> }> = [];
  if (process.env.GOOGLE_API_KEY) {
    providers.push({ label: 'gemini', run: () => extractWithGemini(text) });
  }
  if (process.env.GROQ_API_KEY) {
    providers.push({
      label: 'groq',
      run: () => extractWithOpenAICompatible(text, {
        baseUrl: 'https://api.groq.com/openai/v1', apiKey: process.env.GROQ_API_KEY!,
        model: 'llama-3.3-70b-versatile', label: 'Groq',
      }),
    });
  }
  if (process.env.OPENROUTER_API_KEY) {
    providers.push({
      label: 'openrouter',
      run: () => extractWithOpenAICompatible(text, {
        baseUrl: 'https://openrouter.ai/api/v1', apiKey: process.env.OPENROUTER_API_KEY!,
        model: 'meta-llama/llama-3.3-70b-instruct', label: 'OpenRouter',
      }),
    });
  }

  for (const provider of providers) {
    try {
      const raw = await provider.run();
      if (raw && Array.isArray(raw.transactions) && raw.transactions.length > 0) {
        const parsed = finaliseStatement(raw as any, provider.label);
        if (parsed.transactions.length > 0) {
          logger.info(`Statement: ${provider.label} extracted rows`, {
            rows: parsed.transactions.length, reconciled: parsed.reconciled,
          });
          return parsed;
        }
      }
      logger.warn(`Statement: ${provider.label} returned no usable rows, trying next`);
    } catch (err: any) {
      logger.warn(`Statement: ${provider.label} extraction failed, trying next`, { error: err.message });
    }
  }

  const fallback = heuristicParseStatement(text);
  logger.info('Statement: heuristic parser extracted rows', { rows: fallback.transactions.length });
  return fallback;
};
