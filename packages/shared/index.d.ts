/**
 * @kanaku/shared — API contract types shared by backend and frontend.
 *
 * DECLARATION-ONLY package: there is no runtime output, so consumers MUST use
 * `import type { ... } from '@kanaku/shared'` (erased at compile time). This
 * keeps the package usable with `npm ci --ignore-scripts` (CI) and inside the
 * Vite bundle without any build orchestration. If runtime code ever needs to
 * live here, add a tsc build + main field and wire it into the turbo pipeline
 * (see packages/shared/README.md).
 *
 * These types describe the WIRE CONTRACT. The backend may use stricter
 * variants internally (required fields), the frontend may extend them with
 * client-only members — both should `extends` these shapes so drift between
 * the two sides becomes a compile error.
 */

// ─── Voice NLP (POST /api/v1/voice/process, /voice/process-audio) ─────────────

/** Action types the backend voice NLP emits. */
export type VoiceActionType =
  | 'expense'
  | 'income'
  | 'transfer'
  | 'loan_borrow'
  | 'loan_lend'
  | 'goal'
  | 'investment'
  | 'unknown';

/** Entities extracted from one spoken financial action. */
export interface VoiceActionEntities {
  amount?: number;
  currency?: string;
  category?: string;
  subcategory?: string;
  person?: string;
  merchant?: string;
  description?: string;
  /** YYYY-MM-DD */
  date?: string;
  paymentMethod?: string;
  goalTarget?: number;
  goalDuration?: string;
  goalMonthly?: number;
}

/**
 * One extracted financial action.
 * Generic parameters let the frontend widen the type union / entity set for
 * client-only actions while staying assignable from backend responses.
 */
export interface VoiceFinancialAction<
  TType extends string = VoiceActionType,
  TEntities extends VoiceActionEntities = VoiceActionEntities,
> {
  type: TType;
  rawSegment: string;
  entities: TEntities;
  confidence: number;
  requiresReview: boolean;
}

/** Response envelope of POST /voice/process and /voice/process-audio. */
export interface VoiceProcessResponse {
  success: boolean;
  transcript: string;
  /** BCP-47-ish language hint (script-detected or STT-reported) */
  language?: string;
  sttProvider?: 'gemini' | 'whisper';
  actions: VoiceFinancialAction[];
  totalActions: number;
  requiresReview: boolean;
}

// ─── Bank statement import (POST /api/v1/import/statement, /import/confirm) ───

export type StatementTransactionType = 'debit' | 'credit';

/** Which engine produced the parsed rows. */
export type StatementParserSource = 'gemini' | 'groq' | 'openrouter' | 'heuristic';

/** One typed row extracted from a bank statement. */
export interface StatementTransaction {
  /** YYYY-MM-DD */
  date: string;
  description: string;
  /** always positive; direction comes from `type` */
  amount: number;
  type: StatementTransactionType;
  /** running balance after this row, when the statement prints one */
  balance?: number;
  /** cheque/UTR/UPI reference */
  reference?: string;
}

/** Statement-level metadata returned alongside the rows. */
export interface StatementMeta {
  bankName?: string;
  /** masked as printed, e.g. "XXXX1234" */
  accountNumber?: string;
  accountHolder?: string;
  /** ISO currency code */
  currency?: string;
  period?: { from?: string; to?: string };
  openingBalance?: number;
  closingBalance?: number;
  /** opening + credits − debits ≈ closing; null when balances weren't printed */
  reconciled?: boolean | null;
  reconciliationDelta?: number;
  parser?: StatementParserSource | string;
  warnings?: string[];
}

/** One row of the /import/statement (and /import/upload) review preview. */
export interface ImportPreviewRow {
  rowIndex: number;
  description: string;
  amount?: number;
  /** YYYY-MM-DD */
  date: string;
  /** absent for legacy spreadsheet imports (treated as debit) */
  type?: StatementTransactionType;
  reference?: string;
  rawCategory?: string;
  suggestedCategory: string;
  suggestedSubcategory: string;
  confidence: number;
  requiresReview: boolean;
}

/** Response envelope of POST /import/statement and /import/upload. */
export interface ImportPreviewResponse {
  sessionId: string;
  totalRows: number;
  transactions: ImportPreviewRow[];
  highConfidence: number;
  lowConfidence: number;
  /** present when the session came from /import/statement */
  statement?: StatementMeta;
}

/** Response envelope of POST /import/confirm. */
export interface ImportConfirmResponse {
  success: boolean;
  saved: number;
  duplicates: number;
  failed: number;
  failedRows: number[];
  netBalanceChange: number;
}
