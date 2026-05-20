import {
  db,
  type AppCategory,
  type Transaction,
} from '@/lib/database';
import {
  detectExpenseCategoryFromText,
  getCategoryDetails,
  normalizeCategorySelection,
} from '@/lib/expenseCategories';
import { documentIntelligenceService } from '@/services/documentIntelligenceService';
import {
  parseReceiptText,
  SUPPORTED_RECEIPT_MIME_TYPES,
  type ReceiptScannerResult,
} from '@/services/receiptScannerService';
import { receiptParserService } from '@/services/receiptParserService';
import {
  statementImportService,
  type ImportApplyResult,
  type ImportResult,
  type StatementImportOptions,
} from '@/services/statementImportService';
import {
  smartExpenseImportService,
  type SmartImportPreview,
  type ThirdPartyImportResult,
} from '@/services/smartExpenseImportService';

export type DuplicateDecision = 'ignore' | 'merge' | 'notify';
export type AiTaskKind =
  | 'receipt-ai-parse'
  | 'statement-ai-parse'
  | 'sms-ai-parse'
  | 'categorize';

export interface FinancialCaptureTask {
  id: string;
  kind: AiTaskKind;
  payload: Record<string, unknown>;
  queuedAt: string;
  attempts: number;
  status: 'queued' | 'processing' | 'failed';
  lastError?: string;
}

export interface TransactionDraft {
  type: 'expense' | 'income';
  amount: number;
  accountId: number;
  category: string;
  subcategory?: string;
  description: string;
  merchant?: string;
  date: Date;
  importSource?: string;
  importMetadata?: Record<string, string>;
}

export interface DuplicateCheckResult {
  duplicate: boolean;
  duplicateTransactionId?: number;
  reason?: string;
}

export interface SaveDraftResult {
  saved: boolean;
  duplicate: boolean;
  duplicateTransactionId?: number;
  transactionId?: number;
  message: string;
}

export interface AiQueueRunTelemetry {
  lastRunAt: string;
  processed: number;
  failed: number;
  remaining: number;
  trigger: 'auto' | 'manual' | 'online';
}

export interface AiQueueRunHistoryEntry extends AiQueueRunTelemetry {
  id: string;
}

const AI_QUEUE_SETTINGS_KEY = 'financial_capture_ai_queue';
const AI_QUEUE_TELEMETRY_SETTINGS_KEY = 'financial_capture_ai_last_run';
const AI_QUEUE_TELEMETRY_HISTORY_SETTINGS_KEY = 'financial_capture_ai_run_history';
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_HISTORY_LIMIT = 24;

const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const createTaskId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `task-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const toDateKey = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const normalizeDate = (value: Date | string) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const parseAmountFromText = (value: string) => {
  const normalized = value.replace(/,/g, '');
  const direct = normalized.match(/(?:rs\.?|inr|usd|eur|gbp|aed|cad|aud|sgd)?\s*(-?\d+(?:\.\d{1,2})?)/i);
  if (!direct) return null;
  const amount = Number.parseFloat(direct[1]);
  return Number.isFinite(amount) ? Math.abs(amount) : null;
};

const parseDateFromText = (value: string) => {
  const datePatterns = [
    /\b(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})\b/,
    /\b(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})\b/,
  ];

  for (const pattern of datePatterns) {
    const match = value.match(pattern);
    if (!match) continue;

    let year = 0;
    let month = 0;
    let day = 0;

    if (pattern === datePatterns[0]) {
      year = Number.parseInt(match[1], 10);
      month = Number.parseInt(match[2], 10);
      day = Number.parseInt(match[3], 10);
    } else {
      day = Number.parseInt(match[1], 10);
      month = Number.parseInt(match[2], 10);
      year = Number.parseInt(match[3], 10);
      if (year < 100) year += 2000;
    }

    const candidate = new Date(year, month - 1, day);
    if (!Number.isNaN(candidate.getTime())) {
      return candidate;
    }
  }

  return null;
};

const sanitizeReceiptDescription = (result: ReceiptScannerResult) => {
  const base = result.notes || result.merchantName || 'Receipt import';
  return base.replace(/\s+/g, ' ').trim().slice(0, 160);
};

const serializeReceiptField = (value: unknown) => {
  if (value == null) return '';

  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
};

const mapReceiptToDraft = (result: ReceiptScannerResult, accountId: number): TransactionDraft | null => {
  if (!result.amount || !result.date) return null;

  const type: 'expense' | 'income' = (result.amount || 0) >= 0 ? 'expense' : 'income';
  const normalizedCategory = normalizeCategorySelection(
    result.category || (type === 'expense' ? 'Miscellaneous' : 'Other Income'),
    type,
  );

  return {
    type,
    amount: Math.abs(result.amount),
    accountId,
    category: normalizedCategory,
    subcategory: result.subcategory || undefined,
    description: sanitizeReceiptDescription(result),
    merchant: result.merchantName,
    date: result.date,
    importSource: 'receipt-scanner',
    importMetadata: {
      Currency: result.currency || 'INR',
      'Payment Method': result.paymentMethod || '',
      'Invoice Number': result.invoiceNumber || '',
      'Tax Amount': result.taxAmount != null ? String(result.taxAmount) : '',
      'Tax Breakdown': serializeReceiptField(result.taxBreakdown),
      'Detected Items': serializeReceiptField(result.items),
      'Receipt Summary': serializeReceiptField({
        merchantName: result.merchantName || '',
        subtotal: result.subtotal ?? '',
        amount: result.amount ?? '',
        paymentMethod: result.paymentMethod || '',
        location: result.location || '',
      }),
      'Validation Result': serializeReceiptField(result.validationResult),
      'OCR Confidence': result.confidence != null ? String(result.confidence) : '',
    },
  };
};

async function readAiQueue(): Promise<FinancialCaptureTask[]> {
  const record = await db.settings.get(AI_QUEUE_SETTINGS_KEY);
  const raw = record?.value;
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((item): item is FinancialCaptureTask => !!item && typeof item === 'object')
    .map((item) => ({
      id: item.id,
      kind: item.kind,
      payload: item.payload,
      queuedAt: item.queuedAt,
      attempts: Number(item.attempts || 0),
      status: item.status,
      lastError: item.lastError,
    }));
}

async function writeAiQueue(tasks: FinancialCaptureTask[]) {
  await db.settings.put({
    key: AI_QUEUE_SETTINGS_KEY,
    value: tasks,
    timestamp: new Date(),
  });
}

async function writeAiQueueTelemetry(telemetry: AiQueueRunTelemetry) {
  await db.settings.put({
    key: AI_QUEUE_TELEMETRY_SETTINGS_KEY,
    value: telemetry,
    timestamp: new Date(),
  });
}

async function readAiQueueTelemetry(): Promise<AiQueueRunTelemetry | null> {
  const record = await db.settings.get(AI_QUEUE_TELEMETRY_SETTINGS_KEY);
  const raw = record?.value;
  if (!raw || typeof raw !== 'object') return null;

  const value = raw as Partial<AiQueueRunTelemetry>;
  if (!value.lastRunAt) return null;

  return {
    lastRunAt: String(value.lastRunAt),
    processed: Number(value.processed || 0),
    failed: Number(value.failed || 0),
    remaining: Number(value.remaining || 0),
    trigger: value.trigger === 'manual' || value.trigger === 'online' ? value.trigger : 'auto',
  };
}

async function readAiQueueTelemetryHistory(): Promise<AiQueueRunHistoryEntry[]> {
  const record = await db.settings.get(AI_QUEUE_TELEMETRY_HISTORY_SETTINGS_KEY);
  const raw = record?.value;
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((item): item is AiQueueRunHistoryEntry => !!item && typeof item === 'object')
    .map((item) => ({
      id: String(item.id || createTaskId()),
      lastRunAt: String(item.lastRunAt || new Date().toISOString()),
      processed: Number(item.processed || 0),
      failed: Number(item.failed || 0),
      remaining: Number(item.remaining || 0),
      trigger: item.trigger === 'manual' || item.trigger === 'online' ? item.trigger : 'auto',
    }));
}

async function appendAiQueueTelemetryHistory(entry: AiQueueRunTelemetry) {
  const history = await readAiQueueTelemetryHistory();
  const next: AiQueueRunHistoryEntry[] = [
    {
      id: createTaskId(),
      ...entry,
    },
    ...history,
  ].slice(0, DEFAULT_HISTORY_LIMIT);

  await db.settings.put({
    key: AI_QUEUE_TELEMETRY_HISTORY_SETTINGS_KEY,
    value: next,
    timestamp: new Date(),
  });
}

async function ensureCategoryExists(name: string, type: 'expense' | 'income', userId?: string) {
  const normalizedTarget = normalizeText(name);
  if (!normalizedTarget) return;

  const existing = await db.categories
    .filter((category) =>
      category.type === type
      && !category.deletedAt
      && normalizeText(category.name) === normalizedTarget,
    )
    .first();

  if (existing) return;

  const details = getCategoryDetails(name, type);
  const category: AppCategory = {
    id: `${type}-${normalizedTarget.replace(/\s+/g, '-')}`,
    name,
    type,
    icon: details?.icon ?? (type === 'expense' ? '' : ''),
    color: details?.color ?? (type === 'expense' ? '#64748B' : '#10B981'),
    createdAt: new Date(),
    updatedAt: new Date(),
    userId,
    createdFromImport: true,
  };

  await db.categories.put(category);
}

async function applyAccountBalanceImpact(accountId: number, amount: number, type: 'expense' | 'income') {
  const account = await db.accounts.get(accountId);
  if (!account?.id) return;

  const signedDelta = type === 'expense' ? -Math.abs(amount) : Math.abs(amount);
  await db.accounts.update(account.id, {
    balance: Number(account.balance) + signedDelta,
    updatedAt: new Date(),
  });
}

async function classifyCategory(input: {
  type: 'expense' | 'income';
  merchant?: string;
  text?: string;
  amount?: number;
  userId?: string;
  fallback?: string;
}) {
  const fallback = normalizeCategorySelection(
    input.fallback || (input.type === 'expense' ? 'Miscellaneous' : 'Other Income'),
    input.type,
  );

  const prediction = await documentIntelligenceService.predictCategory({
    merchantName: input.merchant,
    text: input.text,
    amount: input.amount,
    userId: input.userId,
  });

  const keywordCategory = input.type === 'expense'
    ? detectExpenseCategoryFromText([input.merchant, input.text].filter(Boolean).join(' '))?.category
    : undefined;

  return normalizeCategorySelection(
    prediction?.category || keywordCategory || fallback,
    input.type,
  );
}

async function pickAccountId(preferredAccountId?: number) {
  if (preferredAccountId) {
    const preferred = await db.accounts.get(preferredAccountId);
    if (preferred?.id && preferred.isActive) return preferred.id;
  }

  const fallback = await db.accounts
    .filter((account) => account.isActive)
    .first();

  return fallback?.id;
}

async function findDuplicateTransaction(draft: TransactionDraft): Promise<DuplicateCheckResult> {
  const targetDateKey = toDateKey(draft.date);
  const targetMerchant = normalizeText(draft.merchant || draft.description || '');

  const candidates = await db.transactions
    .filter((transaction) => {
      if (transaction.deletedAt) return false;
      if (transaction.type !== draft.type) return false;
      if (transaction.accountId !== draft.accountId) return false;
      if (Math.abs(Number(transaction.amount) - Number(draft.amount)) > 0.009) return false;
      const parsedDate = normalizeDate(transaction.date);
      if (!parsedDate || toDateKey(parsedDate) !== targetDateKey) return false;
      return true;
    })
    .toArray();

  const matched = candidates.find((candidate) => {
    const candidateMerchant = normalizeText(candidate.merchant || candidate.description || '');
    if (!targetMerchant || !candidateMerchant) return true;
    return candidateMerchant.includes(targetMerchant) || targetMerchant.includes(candidateMerchant);
  });

  if (!matched?.id) {
    return { duplicate: false };
  }

  return {
    duplicate: true,
    duplicateTransactionId: matched.id,
    reason: 'Potential duplicate by amount + date + merchant + account',
  };
}

const processReceiptOcrPayload = async (payload: Record<string, unknown>) => {
  const rawText = String(payload.rawText || '').trim();
  const userId = payload.userId ? String(payload.userId) : undefined;
  const accountId = Number(payload.accountId || 0);

  if (!rawText || !accountId) {
    throw new Error('Missing receipt OCR payload fields');
  }

  const parsed = await (async () => {
    try {
      return await receiptParserService.parseReceipt(rawText, { userId });
    } catch {
      return parseReceiptText(rawText, userId);
    }
  })();
  const draft = mapReceiptToDraft(parsed, accountId);
  if (!draft) {
    throw new Error('Unable to derive receipt draft from OCR text');
  }

  return draft;
};

const processStatementAiPayload = async (payload: Record<string, unknown>) => {
  const transactionId = Number(payload.transactionId || 0);
  if (!transactionId) {
    throw new Error('Missing transaction identifier for statement AI task');
  }

  const existing = await db.transactions.get(transactionId);
  if (!existing) {
    throw new Error('Transaction not found for statement AI task');
  }

  const rawText = String(payload.rawText || payload.text || '').trim();
  const userId = payload.userId ? String(payload.userId) : undefined;

  if (!rawText) {
    throw new Error('Missing statement text payload');
  }

  const amount = Number(payload.amount || parseAmountFromText(rawText));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Could not derive amount from statement payload');
  }

  const transactionType = payload.type === 'income' ? 'income' : 'expense';
  const category = await classifyCategory({
    type: transactionType,
    merchant: payload.merchant ? String(payload.merchant) : undefined,
    text: rawText,
    amount,
    userId,
    fallback: payload.category ? String(payload.category) : undefined,
  });

  await ensureCategoryExists(category, transactionType, userId);
  await db.transactions.update(transactionId, {
    category,
    subcategory: payload.subcategory ? String(payload.subcategory) : existing.subcategory,
    updatedAt: new Date(),
  });

  return { transactionId, category };
};

const processSmsAiPayload = async (payload: Record<string, unknown>) => {
  const smsTransactionId = Number(payload.smsTransactionId || 0);
  if (!smsTransactionId) {
    throw new Error('Missing SMS transaction identifier');
  }

  const smsRecord = await db.smsTransactions.get(smsTransactionId);
  if (!smsRecord) {
    throw new Error('SMS transaction not found');
  }

  if (smsRecord.status === 'imported') {
    return {
      saved: false,
      duplicate: true,
      duplicateTransactionId: smsRecord.linkedTransactionId,
      message: 'SMS transaction already resolved',
    };
  }

  const userId = payload.userId ? String(payload.userId) : smsRecord.userId;
  const amount = Math.abs(Number(payload.amount || smsRecord.amount || 0));
  if (!amount) {
    throw new Error('SMS amount is missing');
  }

  const draftType: 'expense' | 'income' =
    payload.type === 'income' || smsRecord.transactionType === 'income' ? 'income' : 'expense';
  const category = await classifyCategory({
    type: draftType,
    merchant: String(payload.merchant || smsRecord.merchant || ''),
    text: String(payload.text || smsRecord.messagePreview || ''),
    amount,
    userId,
    fallback: String(payload.category || smsRecord.suggestedCategory || ''),
  });

  await ensureCategoryExists(category, draftType, userId);
  await db.smsTransactions.update(smsTransactionId, {
    suggestedCategory: category,
    suggestedSubcategory: payload.subcategory
      ? String(payload.subcategory)
      : smsRecord.suggestedSubcategory,
    confidenceScore: Math.max(Number(smsRecord.confidenceScore || 0), 0.88),
    updatedAt: new Date(),
  });

  return {
    updated: true,
    smsTransactionId,
    category,
  };
};

const processCategorizePayload = async (payload: Record<string, unknown>) => {
  const transactionId = Number(payload.transactionId || 0);
  const type: 'expense' | 'income' = payload.type === 'income' ? 'income' : 'expense';

  if (!transactionId) {
    throw new Error('Missing transaction identifier for categorization');
  }

  const transaction = await db.transactions.get(transactionId);
  if (!transaction) {
    throw new Error('Transaction not found for categorization');
  }

  const nextCategory = await classifyCategory({
    type,
    merchant: transaction.merchant,
    text: `${transaction.description || ''} ${payload.text || ''}`,
    amount: Number(transaction.amount),
    userId: payload.userId ? String(payload.userId) : undefined,
    fallback: transaction.category,
  });

  await ensureCategoryExists(nextCategory, type, payload.userId ? String(payload.userId) : undefined);
  await db.transactions.update(transactionId, {
    category: nextCategory,
    updatedAt: new Date(),
  });

  return { transactionId, category: nextCategory };
};

const defaultTaskProcessor: Record<AiTaskKind, (payload: Record<string, unknown>) => Promise<unknown>> = {
  'receipt-ai-parse': processReceiptOcrPayload,
  'statement-ai-parse': processStatementAiPayload,
  'sms-ai-parse': processSmsAiPayload,
  categorize: processCategorizePayload,
};

let onlineListenerBound = false;
let foregroundQueueRun: Promise<{ processed: number; failed: number; remaining: number }> | null = null;

export const financialDataCaptureService = {
  supportedReceiptMimeTypes: SUPPORTED_RECEIPT_MIME_TYPES,

  bindOnlineQueueProcessor() {
    if (onlineListenerBound || typeof window === 'undefined') return;
    onlineListenerBound = true;

    window.addEventListener('online', () => {
      void financialDataCaptureService.processQueuedAiTasksInForeground({ trigger: 'online' });
    });
  },

  async enqueueAiTask(
    kind: AiTaskKind,
    payload: Record<string, unknown>,
    options?: { processNow?: boolean },
  ) {
    const queue = await readAiQueue();
    queue.push({
      id: createTaskId(),
      kind,
      payload,
      queuedAt: new Date().toISOString(),
      attempts: 0,
      status: 'queued',
    });
    await writeAiQueue(queue);

    if (options?.processNow) {
      await financialDataCaptureService.processQueuedAiTasksInForeground({ trigger: 'auto' });
    }
  },

  async enqueueAiTasks(
    tasks: Array<{ kind: AiTaskKind; payload: Record<string, unknown> }>,
    options?: { processNow?: boolean },
  ) {
    if (tasks.length === 0) return;

    const queue = await readAiQueue();
    const nowIso = new Date().toISOString();
    for (const task of tasks) {
      queue.push({
        id: createTaskId(),
        kind: task.kind,
        payload: task.payload,
        queuedAt: nowIso,
        attempts: 0,
        status: 'queued',
      });
    }
    await writeAiQueue(queue);

    if (options?.processNow) {
      await financialDataCaptureService.processQueuedAiTasksInForeground({ trigger: 'auto' });
    }
  },

  async getQueuedAiTasks() {
    return readAiQueue();
  },

  async getAiQueueStats() {
    const queue = await readAiQueue();
    return {
      total: queue.length,
      queued: queue.filter((task) => task.status === 'queued').length,
      failed: queue.filter((task) => task.status === 'failed').length,
      processing: queue.filter((task) => task.status === 'processing').length,
    };
  },

  async getLastAiQueueTelemetry() {
    return readAiQueueTelemetry();
  },

  async getAiQueueRunHistory(limit = 12) {
    const history = await readAiQueueTelemetryHistory();
    return history.slice(0, Math.max(1, limit));
  },

  async processQueuedAiTasks(
    processors = defaultTaskProcessor,
    options?: { includeFailed?: boolean; trigger?: 'auto' | 'manual' | 'online' },
  ) {
    const queue = await readAiQueue();
    if (queue.length === 0) {
      const idleResult = { processed: 0, failed: 0, remaining: 0 };
      const telemetry = {
        ...idleResult,
        lastRunAt: new Date().toISOString(),
        trigger: options?.trigger || 'manual',
      };
      await writeAiQueueTelemetry(telemetry);
      await appendAiQueueTelemetryHistory(telemetry);
      return idleResult;
    }

    let processed = 0;
    let failed = 0;

    const remaining: FinancialCaptureTask[] = [];
    const includeFailed = Boolean(options?.includeFailed);

    for (const task of queue) {
      if (task.status === 'failed' && !includeFailed) {
        remaining.push(task);
        continue;
      }

      const processor = processors[task.kind];
      if (!processor) {
        remaining.push(task);
        continue;
      }

      try {
        await processor(task.payload);
        processed += 1;
      } catch (error) {
        failed += 1;
        const attempts = task.attempts + 1;
        remaining.push({
          ...task,
          attempts,
          status: 'failed',
          lastError:
            attempts >= DEFAULT_MAX_ATTEMPTS
              ? `Max retries reached: ${error instanceof Error ? error.message : 'Task processing failed'}`
              : error instanceof Error
                ? error.message
                : 'Task processing failed',
        });
      }
    }

    await writeAiQueue(remaining);

    const result = {
      processed,
      failed,
      remaining: remaining.length,
    };

    const telemetry = {
      ...result,
      lastRunAt: new Date().toISOString(),
      trigger: options?.trigger || 'manual',
    };

    await writeAiQueueTelemetry(telemetry);
    await appendAiQueueTelemetryHistory(telemetry);

    return result;
  },

  async processQueuedAiTasksInForeground(options?: { includeFailed?: boolean; trigger?: 'auto' | 'manual' | 'online' }) {
    if (foregroundQueueRun) {
      return foregroundQueueRun;
    }

    foregroundQueueRun = financialDataCaptureService
      .processQueuedAiTasks(defaultTaskProcessor, options)
      .finally(() => {
        foregroundQueueRun = null;
      });

    return foregroundQueueRun;
  },

  async retryFailedAiTasks() {
    const queue = await readAiQueue();
    const updated = queue.map((task) => {
      if (task.status !== 'failed') return task;
      return {
        ...task,
        status: 'queued' as const,
        lastError: undefined,
      };
    });
    await writeAiQueue(updated);
    return {
      retried: queue.filter((task) => task.status === 'failed').length,
      total: updated.length,
    };
  },

  async clearAiQueue() {
    await writeAiQueue([]);
  },

  async extractReceiptDraftFromOcr(options: {
    rawText: string;
    accountId: number;
    userId?: string;
  }) {
    const parsed = await (async () => {
      try {
        return await receiptParserService.parseReceipt(options.rawText, { userId: options.userId });
      } catch {
        return parseReceiptText(options.rawText, options.userId);
      }
    })();
    const draft = mapReceiptToDraft(parsed, options.accountId);

    if (!draft) {
      return { parsed, draft: null, errors: ['Could not extract required amount/date fields'] };
    }

    return { parsed, draft, errors: [] as string[] };
  },

  async saveTransactionDraft(
    draft: TransactionDraft,
    options?: {
      duplicateDecision?: DuplicateDecision;
      userId?: string;
      onDuplicateNotify?: (duplicate: DuplicateCheckResult) => void;
    },
  ): Promise<SaveDraftResult> {
    const duplicateDecision = options?.duplicateDecision || 'notify';

    const duplicate = await findDuplicateTransaction(draft);
    if (duplicate.duplicate) {
      if (duplicateDecision === 'notify') {
        options?.onDuplicateNotify?.(duplicate);
      }

      if (duplicateDecision === 'merge' && duplicate.duplicateTransactionId) {
        const existing = await db.transactions.get(duplicate.duplicateTransactionId);
        if (existing) {
          const metadata = {
            ...(existing.importMetadata || {}),
            'Merged Duplicate At': new Date().toISOString(),
          };
          await db.transactions.update(existing.id!, {
            importMetadata: metadata,
            updatedAt: new Date(),
          });
        }

        return {
          saved: false,
          duplicate: true,
          duplicateTransactionId: duplicate.duplicateTransactionId,
          message: 'Duplicate merged with existing transaction',
        };
      }
    }

    await ensureCategoryExists(draft.category, draft.type, options?.userId);

    const record: Transaction = {
      type: draft.type,
      amount: draft.amount,
      accountId: draft.accountId,
      category: draft.category,
      subcategory: draft.subcategory,
      description: draft.description,
      merchant: draft.merchant,
      date: draft.date,
      importSource: draft.importSource,
      importMetadata: draft.importMetadata,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const id = await db.transactions.add(record);

    return {
      saved: true,
      duplicate: duplicate.duplicate,
      duplicateTransactionId: duplicate.duplicateTransactionId,
      transactionId: id,
      message: duplicate.duplicate ? 'Transaction saved (potential duplicate)' : 'Transaction saved',
    };
  },

  async importBankStatement(file: File, options: StatementImportOptions): Promise<ImportResult> {
    return statementImportService.parseStatement(file, options);
  },

  async applyParsedStatementTransactions(
    transactions: Parameters<typeof statementImportService.importTransactions>[0],
    options: StatementImportOptions,
  ): Promise<ImportApplyResult> {
    return statementImportService.importTransactions(transactions, options);
  },

  async analyzeThirdPartyFile(file: File, defaultAccountId: number): Promise<SmartImportPreview> {
    return smartExpenseImportService.analyzeFile(file, { defaultAccountId });
  },

  async applyThirdPartyImport(options: {
    rows: Parameters<typeof smartExpenseImportService.applyPreviewImport>[0]['rows'];
    fileName: string;
    fileType: 'csv' | 'json';
    userId?: string;
    skipDuplicates: boolean;
  }): Promise<ThirdPartyImportResult> {
    return smartExpenseImportService.applyPreviewImport(options);
  },

  async classifyTransaction(input: {
    merchantName?: string;
    text?: string;
    amount?: number;
    userId?: string;
  }) {
    return documentIntelligenceService.predictCategory(input);
  },
};
