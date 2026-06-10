import {
  db,
  type Account,
  type AppCategory,
  type Friend,
  type Goal,
  type GroupExpense,
  type ImportHistory,
  type Investment,
  type Loan,
  type Transaction,
} from '@/lib/database';
import { initializeBackendSync } from '@/lib/auth-sync-integration';
import {
  INCOME_CATEGORIES,
  detectExpenseCategoryFromText,
  getCategoryDetails,
  getCategoryForExpenseSubcategory,
  getExpenseCategoryNames,
  normalizeCategorySelection,
} from '@/lib/expenseCategories';
import { normalizeCurrencyCode } from '@/lib/currencyUtils';
import { importDataFromJSON } from '@/lib/importExport';

type ImportFileType = 'csv' | 'json';
type ImportTransactionType = 'expense' | 'income';
type CategoryResolution = 'exact' | 'mapped' | 'detected' | 'created' | 'fallback' | 'manual';
type AccountResolution = 'existing' | 'created' | 'payment-method' | 'fallback' | 'manual';

export interface ImportPreviewRow {
  id: string;
  rowNumber: number;
  transactionType: ImportTransactionType;
  accountId: number;
  sourceAccountName: string;
  sourcePaymentMethod: string;
  resolvedAccountName: string;
  accountResolution: AccountResolution;
  date: Date | null;
  amount: number;
  description: string;
  merchant: string;
  rawCategory: string;
  rawSubcategory: string;
  category: string;
  subcategory: string;
  categoryResolution: CategoryResolution;
  duplicateKey: string;
  duplicate: boolean;
  errors: string[];
  metadata: Record<string, string>;
  originalData: Record<string, unknown>;
  externalId?: string;
  expenseMode?: 'individual' | 'group';
}

export interface ThirdPartyImportPreview {
  kind: 'third-party';
  fileName: string;
  fileType: ImportFileType;
  rows: ImportPreviewRow[];
  errors: string[];
  summary: {
    totalRecords: number;
    readyRecords: number;
    duplicateRecords: number;
    invalidRecords: number;
    exactMatches: number;
    mappedMatches: number;
    detectedMatches: number;
    createdAccounts: string[];
    createdCategories: string[];
  };
}

export interface BackupImportPreview {
  kind: 'backup';
  fileName: string;
  fileType: 'json';
  exportedAt?: string;
  version?: string;
  counts: Array<{ label: string; count: number }>;
}

export interface ThirdPartyImportResult {
  importedCount: number;
  skippedCount: number;
  duplicateCount: number;
  failedCount: number;
  createdAccounts: string[];
  createdCategories: string[];
  createdGroupExpenses: number;
  createdGoals: string[];
  updatedGoals: string[];
  createdFriends: number;
  createdLoans: number;
  updatedLoans: number;
  createdInvestments: number;
  updatedInvestments: number;
}

export type SmartImportPreview = ThirdPartyImportPreview | BackupImportPreview;

interface AnalyzeOptions {
  defaultAccountId: number;
}

interface ApplyPreviewOptions {
  rows: ImportPreviewRow[];
  fileName: string;
  fileType: ImportFileType;
  userId?: string;
  skipDuplicates: boolean;
}

interface RestoreBackupOptions {
  fileName: string;
  jsonText: string;
  userId?: string;
}

interface ExistingCategoryCatalog {
  expenseNames: Set<string>;
  incomeNames: Set<string>;
  rawCategories: AppCategory[];
}

interface ResolvedAccountTarget {
  accountId: number;
  resolvedAccountName: string;
  accountResolution: AccountResolution;
}

interface EnsuredAccountResult {
  accountsByRowId: Map<string, Account>;
  createdAccounts: string[];
  createdAccountIds: Set<number>;
}

interface ExtractedGoalData {
  goalName: string;
  targetAmount?: number;
  targetDate?: Date;
}

interface GoalRegistryEntry {
  goal: Goal;
  created: boolean;
}

interface ExtractedGroupData {
  name: string;
  members: Array<{ name: string; share?: number }>;
  splitType: 'equal' | 'custom';
}

const IMPORTABLE_ARRAY_KEYS = ['transactions', 'expenses', 'entries', 'records', 'items', 'data', 'results', 'payload'];
const DATE_KEYS = ['date', 'transactiondate', 'transaction_date', 'transactiondatetime', 'transaction_datetime', 'spentat', 'createdat', 'created_at', 'timestamp', 'txndate', 'txn_date'];
const AMOUNT_KEYS = ['amount', 'total', 'value', 'price', 'expense', 'debit', 'debitamount', 'debit_amount', 'transactionamount', 'transaction_amount', 'spentamount', 'spent_amount', 'expenseamount', 'expense_amount', 'paidamount', 'paid_amount'];
const CREDIT_KEYS = ['credit', 'creditamount', 'credit_amount', 'income', 'receivedamount', 'received_amount', 'creditedamount', 'credited_amount', 'depositamount', 'deposit_amount'];
const CATEGORY_KEYS = ['category', 'categoryname', 'expensecategory', 'expense_type', 'categorytype', 'category_type', 'transactioncategory', 'transaction_category', 'tag', 'label'];
const SUBCATEGORY_KEYS = ['subcategory', 'sub_category', 'subcategoryname'];
const DESCRIPTION_KEYS = ['description', 'details', 'detail', 'note', 'notes', 'memo', 'title', 'narration', 'remark', 'remarks', 'particulars', 'name', 'text', 'message', 'subject'];
const MERCHANT_KEYS = ['merchant', 'merchantname', 'merchant_name', 'payee', 'vendor', 'store'];
const ACCOUNT_KEYS = [
  'account',
  'accountname',
  'account_name',
  'wallet',
  'walletname',
  'wallet_name',
  'bank',
  'bankname',
  'bank_name',
  'card',
  'cardname',
  'card_name',
  'sourceaccount',
  'source_account',
  'fromaccount',
  'from_account',
  'walletref',
  'wallet_ref',
  'accountref',
  'account_ref',
];
const PAYMENT_KEYS = ['paymentmethod', 'payment_method', 'paymentmode', 'payment_mode', 'paymentchannel', 'payment_channel', 'mode', 'method'];
const CURRENCY_KEYS = ['currency', 'currencycode', 'currency_code'];
const TYPE_KEYS = ['type', 'transactiontype', 'transaction_type', 'entrytype', 'entry_type', 'nature', 'transactionnature', 'transaction_nature', 'drcr', 'debitcredit', 'debit_credit', 'flow', 'kind'];
const FX_RATE_KEYS = ['fxrate', 'fx_rate', 'exchangerate', 'exchange_rate', 'rate'];
const ACCOUNT_BALANCE_KEYS = [
  'balance',
  'accountbalance',
  'account_balance',
  'availablebalance',
  'available_balance',
  'currentbalance',
  'current_balance',
  'closingbalance',
  'closing_balance',
  'ledgerbalance',
  'ledger_balance',
  'runningbalance',
  'running_balance',
  'balanceafter',
  'balance_after',
  'balanceaftertransaction',
  'balance_after_transaction',
  'postbalance',
  'post_balance',
];
const GROUP_NAME_KEYS = ['group', 'groupname', 'group_name', 'groupexpense', 'group_expense', 'sharedexpense', 'shared_expense'];
const GROUP_MEMBER_KEYS = ['participants', 'members', 'sharedwith', 'shared_with', 'splitwith', 'split_with'];
const GOAL_NAME_KEYS = ['goal', 'goalname', 'goal_name', 'savingsgoal', 'savings_goal', 'savinggoal', 'saving_goal', 'fund', 'bucket'];
const GOAL_TARGET_KEYS = ['targetamount', 'target_amount', 'goalamount', 'goal_amount'];
const GOAL_DATE_KEYS = ['goaldate', 'goal_date', 'deadline', 'targetdate', 'target_date'];
const EXTERNAL_ID_KEYS = ['expenseid', 'expense_id', 'transactionid', 'txnid', 'txid', 'externalid', 'referenceid', 'refid', 'uid', 'uuid', 'recordid', 'record_id'];
const EXPENSE_MODE_KEYS = ['type', 'expensetype', 'expense_type', 'mode', 'expensemode'];
const KNOWN_FIELD_GROUPS = [
  ...DATE_KEYS,
  ...AMOUNT_KEYS,
  ...CREDIT_KEYS,
  ...CATEGORY_KEYS,
  ...SUBCATEGORY_KEYS,
  ...DESCRIPTION_KEYS,
  ...MERCHANT_KEYS,
  ...ACCOUNT_KEYS,
  ...PAYMENT_KEYS,
  ...CURRENCY_KEYS,
  ...TYPE_KEYS,
  ...FX_RATE_KEYS,
  ...ACCOUNT_BALANCE_KEYS,
  ...GROUP_NAME_KEYS,
  ...GROUP_MEMBER_KEYS,
  ...GOAL_NAME_KEYS,
  ...GOAL_TARGET_KEYS,
  ...GOAL_DATE_KEYS,
  ...EXTERNAL_ID_KEYS,
  'id',
  'exportedat',
  'exported_at',
  'app',
  'tags',
  'location',
  'receipturl',
  'receipt_url',
  'device',
];

const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const normalizeExternalId = (value: string) => normalizeText(value).replace(/\s+/g, '');

const normalizeKey = (value: string) => normalizeText(value).replace(/\s+/g, '');

const slugify = (value: string) => normalizeText(value).replace(/\s+/g, '-');

const titleCase = (value: string) =>
  value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
    .join(' ');

const toDateKey = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toDisplayValue = (value: unknown): string => {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => toDisplayValue(item)).filter(Boolean).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value).trim();
};

const collectStringLeaves = (value: unknown, bucket: string[] = [], depth = 0): string[] => {
  if (depth > 4) return bucket;
  if (value == null) return bucket;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) bucket.push(trimmed);
    return bucket;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectStringLeaves(item, bucket, depth + 1));
    return bucket;
  }

  if (typeof value === 'object') {
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
      const normalizedKey = normalizeText(key);
      if (normalizedKey && !['id', 'uuid', 'uid'].includes(normalizedKey)) {
        bucket.push(normalizedKey);
      }
      collectStringLeaves(item, bucket, depth + 1);
    });
  }

  return bucket;
};

const BOILERPLATE_DESCRIPTION_PATTERNS = [
  /^imported?\s+(test\s+)?expense\s+from/i,
  /^imported?\s+transaction/i,
  /^sample\s+(expense|transaction)/i,
  /^test\s+(expense|transaction)/i,
  /^(auto|system)[- ]?(generated|created)/i,
  /^expense\s+entry/i,
];

export const isBoilerplateDescription = (text: string): boolean => {
  if (!text || !text.trim()) return true;
  return BOILERPLATE_DESCRIPTION_PATTERNS.some((pattern) => pattern.test(text.trim()));
};

const buildDuplicateKey = (date: Date | null, amount: number, description: string, accountReference = '', merchant = '') => {
  if (!date || !Number.isFinite(amount)) return '';
  const normalizedDescription = normalizeText(description).replace(/\s+/g, '').slice(0, 80);
  const normalizedAccount = normalizeText(accountReference).replace(/\s+/g, '').slice(0, 60);
  const normalizedMerchant = normalizeText(merchant).replace(/\s+/g, '').slice(0, 60);
  return `${toDateKey(date)}|${amount.toFixed(2)}|${normalizedAccount}|${normalizedDescription}|${normalizedMerchant}`;
};

const createRowId = (index: number) =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `import-row-${Date.now()}-${index}`;

const getFieldValue = (lookup: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    if (lookup[key] != null && String(lookup[key]).trim() !== '') {
      return lookup[key];
    }
  }
  return undefined;
};

const isFilledValue = (value: unknown) => {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  return true;
};

const getFieldValueByFuzzyKey = (
  lookup: Record<string, unknown>,
  exactKeys: string[],
  includeTokens: string[],
  excludeTokens: string[] = [],
) => {
  const direct = getFieldValue(lookup, exactKeys);
  if (isFilledValue(direct)) return direct;

  let best: { value: unknown; score: number } | null = null;
  for (const [lookupKey, value] of Object.entries(lookup)) {
    if (!isFilledValue(value)) continue;

    let score = 0;
    if (exactKeys.includes(lookupKey)) score += 120;
    if (exactKeys.some((key) => lookupKey.includes(key))) score += 70;
    if (includeTokens.some((token) => lookupKey.includes(token))) score += 40;
    if (excludeTokens.some((token) => lookupKey.includes(token))) score -= 120;

    if (score <= 0) continue;
    if (!best || score > best.score) {
      best = { value, score };
    }
  }

  return best?.value;
};

const normalizeLocaleNumberString = (value: string) => {
  let cleaned = value.replace(/[^\d.,()\-]/g, '').replace(/\s+/g, '');
  if (!cleaned) return '';

  cleaned = cleaned.replace(/[()]/g, '');

  if (cleaned.includes('.') && cleaned.includes(',')) {
    if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (cleaned.includes(',')) {
    const parts = cleaned.split(',');
    const lastPart = parts[parts.length - 1] ?? '';
    cleaned = (parts.length > 1 && lastPart.length === 3)
      ? cleaned.replace(/,/g, '')
      : cleaned.replace(',', '.');
  } else if (cleaned.includes('.')) {
    const parts = cleaned.split('.');
    const lastPart = parts[parts.length - 1] ?? '';
    if (parts.length > 1 && lastPart.length === 3) {
      cleaned = cleaned.replace(/\./g, '');
    } else if (parts.length > 2) {
      const decimalPart = parts.pop() ?? '';
      cleaned = `${parts.join('')}.${decimalPart}`;
    }
  }

  return cleaned.replace(/(?!^)-/g, '');
};

const buildValidDate = (year: number, month: number, day: number) => {
  const candidate = new Date(year, month - 1, day);
  if (
    Number.isNaN(candidate.getTime())
    || candidate.getFullYear() !== year
    || candidate.getMonth() !== month - 1
    || candidate.getDate() !== day
  ) {
    return null;
  }
  return candidate;
};

const parseExcelSerialDate = (value: number) => {
  if (!Number.isFinite(value) || value < 20000 || value > 80000) return null;

  const excelEpoch = Date.UTC(1899, 11, 30);
  const candidate = new Date(excelEpoch + (value * 24 * 60 * 60 * 1000));
  if (Number.isNaN(candidate.getTime())) return null;

  return new Date(
    candidate.getUTCFullYear(),
    candidate.getUTCMonth(),
    candidate.getUTCDate(),
  );
};

const parseAmountValue = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const negative = (trimmed.startsWith('(') && trimmed.endsWith(')')) || /^-/.test(trimmed);
  const normalized = normalizeLocaleNumberString(trimmed);
  if (!normalized) return null;

  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) return null;
  return negative ? -parsed : parsed;
};

const parseDateValue = (value: unknown): Date | null => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const excelDate = parseExcelSerialDate(value);
    if (excelDate) return excelDate;

    const candidate = new Date(value > 1e12 ? value : value > 1e9 ? value * 1000 : value);
    return Number.isNaN(candidate.getTime()) ? null : candidate;
  }

  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^\d{5}(?:\.\d+)?$/.test(trimmed)) {
    const excelDate = parseExcelSerialDate(Number(trimmed));
    if (excelDate) return excelDate;
  }

  if (/^\d{4}[/-]\d{1,2}[/-]\d{1,2}/.test(trimmed)) {
    const [year, month, day] = trimmed.split(/[T\s]/)[0].split(/[/-]/).map((part) => Number(part));
    return buildValidDate(year, month, day);
  }

  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(trimmed)) {
    const [first, second, third] = trimmed.split(/[/-]/).map((part) => Number(part));
    const year = third < 100 ? 2000 + third : third;
    const dayFirst = first > 12 || (first <= 12 && second <= 12);
    const day = dayFirst ? first : second;
    const month = dayFirst ? second : first;
    return buildValidDate(year, month, day);
  }

  const candidate = new Date(trimmed);
  return Number.isNaN(candidate.getTime()) ? null : candidate;
};

const parseTypeValue = (value: unknown): ImportTransactionType | null => {
  const normalized = normalizeText(toDisplayValue(value));
  if (!normalized) return null;
  if (['cr', 'credit', 'credited', 'deposit', 'received', 'inflow'].some((item) => normalized === item || normalized.includes(item))) {
    return 'income';
  }
  if (['dr', 'debit', 'debited', 'withdrawal', 'outflow'].some((item) => normalized === item || normalized.includes(item))) {
    return 'expense';
  }
  if (['income', 'credit', 'credit entry', 'salary', 'refund'].some((item) => normalized.includes(item))) {
    return 'income';
  }
  if (['expense', 'debit', 'purchase', 'payment', 'spend'].some((item) => normalized.includes(item))) {
    return 'expense';
  }
  return null;
};

const inferTransactionTypeFromContext = (input: {
  rawCategory: string;
  rawSubcategory: string;
  description: string;
  merchant: string;
  rawText: string;
}) => {
  const context = normalizeText(
    [input.rawCategory, input.rawSubcategory, input.description, input.merchant, input.rawText].filter(Boolean).join(' '),
  );
  if (!context) return null;

  const incomeHints = [
    'salary',
    'payroll',
    'stipend',
    'refund',
    'reimbursement',
    'cashback',
    'interest',
    'dividend',
    'credited',
    'deposit',
    'received',
    'income',
    'payout',
  ];

  const expenseHints = [
    'expense',
    'purchase',
    'bill',
    'rent',
    'groceries',
    'food',
    'fuel',
    'debit',
    'paid',
    'spend',
  ];

  const incomeScore = incomeHints.reduce((score, hint) => score + (context.includes(hint) ? 1 : 0), 0);
  const expenseScore = expenseHints.reduce((score, hint) => score + (context.includes(hint) ? 1 : 0), 0);

  const veryStrongIncomeHints = ['salary', 'payroll', 'stipend', 'credited', 'credit alert', 'refund', 'cashback'];
  if (veryStrongIncomeHints.some((hint) => context.includes(hint))) {
    return 'income';
  }

  if (incomeScore === 0 && expenseScore === 0) return null;
  return incomeScore >= expenseScore ? 'income' : 'expense';
};

const inferTransactionTypeFromNarrative = (text: string): ImportTransactionType | null => {
  const normalized = normalizeText(text);
  if (!normalized) return null;

  const strongIncomePattern = /\b(salary|payroll|stipend|refund|reimbursement|cashback|interest|dividend|bonus|credited|credit alert|received|payout)\b/;
  if (strongIncomePattern.test(normalized)) {
    return 'income';
  }

  const strongExpensePattern = /\b(grocer|supermarket|dinner|lunch|food|bill|rent|fuel|petrol|diesel|purchase|spent|debit|paid)\b/;
  if (strongExpensePattern.test(normalized)) {
    return 'expense';
  }

  return null;
};

const guessDelimiter = (text: string) => {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim()) ?? '';
  const delimiterScores = [
    { delimiter: ',', score: firstLine.split(',').length },
    { delimiter: ';', score: firstLine.split(';').length },
    { delimiter: '\t', score: firstLine.split('\t').length },
  ];

  return delimiterScores.sort((a, b) => b.score - a.score)[0]?.delimiter ?? ',';
};

const parseCsvRecords = (text: string): Array<Record<string, unknown>> => {
  const delimiter = guessDelimiter(text);
  const rows: string[][] = [];
  let currentCell = '';
  let currentRow: string[] = [];
  let insideQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentCell += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (!insideQuotes && char === delimiter) {
      currentRow.push(currentCell);
      currentCell = '';
      continue;
    }

    if (!insideQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && nextChar === '\n') index += 1;
      currentRow.push(currentCell);
      if (currentRow.some((cell) => cell.trim() !== '')) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
      continue;
    }

    currentCell += char;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    if (currentRow.some((cell) => cell.trim() !== '')) {
      rows.push(currentRow);
    }
  }

  if (rows.length < 2) return [];
  const headers = rows[0].map((cell, index) => cell.trim() || `column_${index + 1}`);

  return rows.slice(1).map((row) => {
    const record: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      record[header] = row[index]?.trim() ?? '';
    });
    return record;
  });
};

const isKANAKUBackupPayload = (payload: unknown): payload is Record<string, unknown> => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  const record = payload as Record<string, unknown>;
  return Array.isArray(record.accounts) && Array.isArray(record.transactions) && typeof record.version === 'string';
};

const isRecordObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const isStructuredLedgerPayload = (payload: unknown): payload is Record<string, unknown> => {
  if (!isRecordObject(payload)) return false;
  const hasClassicLedger = Array.isArray(payload.transactions) && Array.isArray(payload.accounts);
  const hasAltLedger = Array.isArray(payload.records) && Array.isArray(payload.wallets);
  return hasClassicLedger || hasAltLedger;
};

const extractStructuredLedgerRecords = (payload: unknown): Array<Record<string, unknown>> => {
  if (!isStructuredLedgerPayload(payload)) return extractJsonRecords(payload);

  const accountRows = Array.isArray(payload.accounts)
    ? payload.accounts.filter(isRecordObject)
    : Array.isArray(payload.wallets)
      ? payload.wallets.filter(isRecordObject)
      : [];

  const accounts = accountRows;
  const accountById = new Map<string, Record<string, unknown>>();
  accounts.forEach((account) => {
    const id = toDisplayValue(account.account_id ?? account.accountId ?? account.id ?? account.wallet_id ?? account.walletId);
    if (id) accountById.set(normalizeText(id), account);
  });

  const userCurrency = isRecordObject(payload.user)
    ? toDisplayValue(payload.user.currency)
    : (isRecordObject(payload.profile)
      ? toDisplayValue(payload.profile.currency ?? payload.profile.currency_code ?? payload.profile.currencyCode)
      : '');

  const transactionRows = Array.isArray(payload.transactions)
    ? payload.transactions.filter(isRecordObject)
    : Array.isArray(payload.records)
      ? payload.records.filter(isRecordObject)
      : [];

  const transactions = transactionRows;
  return transactions.map((transaction) => {
    const accountRef = toDisplayValue(
      transaction.account_id
      ?? transaction.accountId
      ?? transaction.account
      ?? transaction.wallet_id
      ?? transaction.walletId
      ?? transaction.wallet_ref
      ?? transaction.walletRef,
    );
    const account = accountRef ? accountById.get(normalizeText(accountRef)) : undefined;

    const enriched: Record<string, unknown> = { ...transaction };

    if (account) {
      const accountName = toDisplayValue(account.account_name ?? account.accountName ?? account.name ?? account.title);
      const accountType = toDisplayValue(account.type ?? account.account_type ?? account.accountType ?? account.category);
      const accountBalance = account.balance ?? account.current_balance ?? account.currentBalance;
      const accountCurrency = toDisplayValue(account.currency ?? account.currency_code ?? account.currencyCode);

      if (!toDisplayValue(enriched.account_name) && accountName) enriched.account_name = accountName;
      if (!toDisplayValue(enriched.payment_method) && accountType) enriched.payment_method = accountType;
      if (!toDisplayValue(enriched.wallet_name) && accountName) enriched.wallet_name = accountName;
      if (enriched.account_balance == null && accountBalance != null) enriched.account_balance = accountBalance;
      if (!toDisplayValue(enriched.currency) && (accountCurrency || userCurrency)) {
        enriched.currency = accountCurrency || userCurrency;
      }
    } else if (!toDisplayValue(enriched.currency) && userCurrency) {
      enriched.currency = userCurrency;
    }

    if (!toDisplayValue(enriched.expense_id)) {
      const txId = toDisplayValue(enriched.transaction_id ?? enriched.transactionId ?? enriched.id ?? enriched.record_id ?? enriched.recordId);
      if (txId) enriched.expense_id = txId;
    }

    if (!toDisplayValue(enriched.type) && toDisplayValue(enriched.kind)) {
      enriched.type = enriched.kind;
    }

    if (!toDisplayValue(enriched.category) && toDisplayValue(enriched.tag)) {
      enriched.category = enriched.tag;
    }

    if (!toDisplayValue(enriched.description) && toDisplayValue(enriched.note)) {
      enriched.description = enriched.note;
    }

    return enriched;
  });
};

const buildLookup = (record: Record<string, unknown>) => {
  const lookup: Record<string, unknown> = {};

  const visit = (value: unknown, path: string[] = []) => {
    if (Array.isArray(value)) {
      const leafKey = path[path.length - 1];
      if (leafKey) lookup[normalizeKey(leafKey)] = value;
      return;
    }

    if (value && typeof value === 'object') {
      Object.entries(value as Record<string, unknown>).forEach(([childKey, childValue]) => {
        const nextPath = [...path, childKey];
        lookup[normalizeKey(childKey)] = childValue;
        lookup[normalizeKey(nextPath.join('_'))] = childValue;
        visit(childValue, nextPath);
      });
      return;
    }

    const leafKey = path[path.length - 1];
    if (leafKey) {
      lookup[normalizeKey(leafKey)] = value;
      lookup[normalizeKey(path.join('_'))] = value;
    }
  };

  Object.entries(record).forEach(([key, value]) => {
    lookup[normalizeKey(key)] = value;
    visit(value, [key]);
  });

  return lookup;
};

const extractJsonRecords = (payload: unknown): Array<Record<string, unknown>> => {
  const queue: unknown[] = [payload];
  const seen = new Set<unknown>();
  let bestCandidate: Array<Record<string, unknown>> = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (current == null || seen.has(current)) continue;
    seen.add(current);

    if (Array.isArray(current)) {
      const objectRows = current.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item));
      if (objectRows.length > 0) {
        if (objectRows.length === current.length) return objectRows;
        if (objectRows.length > bestCandidate.length) bestCandidate = objectRows;
      }

      current.forEach((item) => {
        if (item && typeof item === 'object') queue.push(item);
      });
      continue;
    }

    if (current && typeof current === 'object') {
      const record = current as Record<string, unknown>;

      for (const key of IMPORTABLE_ARRAY_KEYS) {
        if (Array.isArray(record[key])) {
          const prioritized = record[key].filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item));
          if (prioritized.length > 0) return prioritized;
        }
      }

      Object.values(record).forEach((value) => {
        if (value && typeof value === 'object') queue.push(value);
      });

      const lookup = buildLookup(record);
      if ((getFieldValue(lookup, DATE_KEYS) != null || getFieldValue(lookup, AMOUNT_KEYS) != null) && bestCandidate.length === 0) {
        bestCandidate = [record];
      }
    }
  }

  return bestCandidate;
};

const buildDescription = (baseDescription: string, merchant: string, category: string) => {
  const primary = baseDescription.trim() || merchant.trim() || category.trim() || 'Imported expense';
  return primary.replace(/\s+/g, ' ').slice(0, 160);
};

const buildPreviewDescription = (input: {
  baseDescription: string;
  rawCategory: string;
  transactionType: ImportTransactionType;
}) => {
  const normalizedDescription = input.baseDescription.trim().replace(/\s+/g, ' ');
  const normalizedCategory = input.rawCategory.trim();

  if (
    input.transactionType === 'income'
    && normalizedDescription
    && normalizedCategory
    && !normalizeText(normalizedDescription).startsWith(normalizeText(normalizedCategory))
  ) {
    return `${titleCase(normalizedCategory)} - ${normalizedDescription}`.slice(0, 160);
  }

  return normalizedDescription.slice(0, 160);
};

const resolveImportedAmount = (
  amount: number,
  metadata: Record<string, string>,
  targetCurrency?: string,
) => {
  const sourceCurrency = metadata.Currency?.toUpperCase();
  const normalizedTargetCurrency = targetCurrency?.toUpperCase();
  const fxRate = parseAmountValue(metadata['FX Rate']);

  if (
    sourceCurrency &&
    normalizedTargetCurrency &&
    sourceCurrency !== normalizedTargetCurrency &&
    fxRate != null &&
    Number.isFinite(fxRate) &&
    fxRate > 0
  ) {
    return Number((amount * fxRate).toFixed(2));
  }

  return amount;
};

const getIncomeCategoryNames = () => Object.values(INCOME_CATEGORIES).map((category) => category.name);

const GENERIC_PAYMENT_METHOD_NAMES = new Set(['cash', 'upi', 'wallet', 'credit card', 'debit card', 'card', 'net banking', 'bank transfer']);

const toFriendlyAccountName = (accountName: string, paymentMethod: string) => {
  if (accountName) return accountName.trim();

  const normalizedPayment = normalizeText(paymentMethod);
  if (!normalizedPayment) return 'Imported Account';
  if (normalizedPayment.includes('cash')) return 'Cash Wallet';
  if (normalizedPayment.includes('upi')) return 'UPI Wallet';
  if (normalizedPayment.includes('wallet')) return 'Digital Wallet';
  if (normalizedPayment.includes('credit') || normalizedPayment.includes('debit') || normalizedPayment.includes('card')) return 'Imported Card';
  if (normalizedPayment.includes('net banking') || normalizedPayment.includes('bank')) return 'Imported Bank Account';
  return titleCase(paymentMethod);
};

const inferAccountType = (accountName: string, paymentMethod: string): Account['type'] => {
  const normalized = normalizeText(`${accountName} ${paymentMethod}`);
  if (normalized.includes('cash')) return 'cash';
  if (
    normalized.includes('wallet') ||
    normalized.includes('upi') ||
    normalized.includes('paytm') ||
    normalized.includes('phonepe') ||
    normalized.includes('gpay') ||
    normalized.includes('google pay') ||
    normalized.includes('paypal') ||
    normalized.includes('cred')
  ) {
    return 'wallet';
  }
  if (
    normalized.includes('card') ||
    normalized.includes('credit') ||
    normalized.includes('debit') ||
    normalized.includes('visa') ||
    normalized.includes('mastercard') ||
    normalized.includes('amex') ||
    normalized.includes('rupay')
  ) {
    return 'card';
  }
  return 'bank';
};

const findMatchingAccount = (accounts: Account[], accountName: string, paymentMethod: string) => {
  const normalizedTarget = normalizeText(accountName);
  if (normalizedTarget) {
    const exact = accounts.find((account) => normalizeText(account.name) === normalizedTarget);
    if (exact) return exact;

    const fuzzy = accounts.find((account) => {
      const normalizedAccount = normalizeText(account.name);
      return normalizedAccount.includes(normalizedTarget) || normalizedTarget.includes(normalizedAccount);
    });
    if (fuzzy) return fuzzy;
  }

  const normalizedPayment = normalizeText(paymentMethod);
  if (GENERIC_PAYMENT_METHOD_NAMES.has(normalizedPayment)) {
    const inferredType = inferAccountType(accountName, paymentMethod);
    return accounts.find((account) => account.type === inferredType && account.isActive !== false && !account.deletedAt);
  }

  return undefined;
};

const resolveAccountTarget = (
  accounts: Account[],
  fallbackAccountId: number,
  sourceAccountName: string,
  sourcePaymentMethod: string,
): ResolvedAccountTarget => {
  const friendlyName = toFriendlyAccountName(sourceAccountName, sourcePaymentMethod);
  const matched = findMatchingAccount(accounts, sourceAccountName || friendlyName, sourcePaymentMethod);
  if (matched?.id != null) {
    return {
      accountId: matched.id,
      resolvedAccountName: matched.name,
      accountResolution: 'existing',
    };
  }

  if (sourceAccountName) {
    return {
      accountId: fallbackAccountId,
      resolvedAccountName: sourceAccountName.trim(),
      accountResolution: 'created',
    };
  }

  if (sourcePaymentMethod) {
    return {
      accountId: fallbackAccountId,
      resolvedAccountName: friendlyName,
      accountResolution: 'payment-method',
    };
  }

  const fallbackAccount = accounts.find((account) => account.id === fallbackAccountId) ?? accounts[0];
  if (fallbackAccount?.id != null) {
    return {
      accountId: fallbackAccount.id,
      resolvedAccountName: fallbackAccount.name,
      accountResolution: 'fallback',
    };
  }

  return {
    accountId: 0,
    resolvedAccountName: 'Imported Account',
    accountResolution: 'created',
  };
};

const buildImportMetadata = (
  record: Record<string, unknown>,
  lookup: Record<string, unknown>,
  fileName: string,
) => {
  const metadata: Record<string, string> = {};

  Object.entries(record).forEach(([key, value]) => {
    if (KNOWN_FIELD_GROUPS.includes(normalizeKey(key))) return;
    const displayValue = toDisplayValue(value);
    if (displayValue) {
      metadata[titleCase(key.replace(/[_-]+/g, ' '))] = displayValue;
    }
  });

  const sourceAccount = toDisplayValue(getFieldValue(lookup, ACCOUNT_KEYS));
  const paymentMethod = toDisplayValue(getFieldValue(lookup, PAYMENT_KEYS));
  const currency = toDisplayValue(getFieldValue(lookup, CURRENCY_KEYS));
  const fxRate = toDisplayValue(getFieldValue(lookup, FX_RATE_KEYS));
  const accountBalance = toDisplayValue(getFieldValue(lookup, ACCOUNT_BALANCE_KEYS));
  const location = toDisplayValue(lookup.location);
  const tags = toDisplayValue(lookup.tags);

  if (sourceAccount) metadata['Source Account'] = sourceAccount;
  if (paymentMethod) metadata['Payment Method'] = paymentMethod;
  if (currency) metadata.Currency = currency;
  if (fxRate) metadata['FX Rate'] = fxRate;
  if (accountBalance) metadata['Account Balance'] = accountBalance;
  if (location) metadata.Location = location;
  if (tags) metadata.Tags = tags;
  metadata['Source File'] = fileName;

  return metadata;
};

const findClosestCategory = (category: string, candidates: string[]) => {
  const normalizedTarget = normalizeText(category);
  if (!normalizedTarget) return null;

  let bestMatch: { name: string; score: number } | null = null;

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeText(candidate);
    let score = 0;

    if (normalizedCandidate === normalizedTarget) score = 300;
    else if (normalizedCandidate.startsWith(normalizedTarget) || normalizedTarget.startsWith(normalizedCandidate)) score = 220;
    else if (normalizedCandidate.includes(normalizedTarget) || normalizedTarget.includes(normalizedCandidate)) score = 180;
    else {
      const targetTokens = new Set(normalizedTarget.split(' ').filter(Boolean));
      const candidateTokens = new Set(normalizedCandidate.split(' ').filter(Boolean));
      let overlap = 0;
      targetTokens.forEach((token) => {
        if (candidateTokens.has(token)) overlap += 1;
      });
      if (overlap > 0) score = overlap * 40;
    }

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { name: candidate, score };
    }
  }

  return bestMatch && bestMatch.score >= 120 ? bestMatch.name : null;
};

const resolveExpenseCategory = (
  rawCategory: string,
  rawSubcategory: string,
  contextText: string,
  existingNames: Set<string>,
) => {
  // First: check exact (case-insensitive) match against all known categories,
  // including any custom categories the user created from prior imports.
  if (rawCategory) {
    const rawNorm = normalizeText(rawCategory);
    const exactMatch = Array.from(existingNames).find((name) => normalizeText(name) === rawNorm);
    if (exactMatch) {
      return {
        category: exactMatch,
        subcategory: rawSubcategory ? titleCase(rawSubcategory) : '',
        resolution: 'exact' as const,
      };
    }
  }

  const subcategoryCandidate = rawSubcategory || rawCategory;
  const subcategoryMatch = subcategoryCandidate ? getCategoryForExpenseSubcategory(subcategoryCandidate) : null;
  if (subcategoryMatch) {
    return {
      category: subcategoryMatch,
      subcategory: titleCase(subcategoryCandidate),
      resolution: 'mapped' as const,
    };
  }

  if (rawCategory) {
    const normalized = normalizeCategorySelection(rawCategory, 'expense');
    if (existingNames.has(normalized)) {
      return {
        category: normalized,
        subcategory: rawSubcategory ? titleCase(rawSubcategory) : '',
        resolution: normalizeText(normalized) === normalizeText(rawCategory) ? 'exact' as const : 'mapped' as const,
      };
    }

    const closest = findClosestCategory(rawCategory, Array.from(existingNames));
    if (closest) {
      return {
        category: closest,
        subcategory: rawSubcategory ? titleCase(rawSubcategory) : '',
        resolution: 'mapped' as const,
      };
    }
  }

  const detection = detectExpenseCategoryFromText([rawCategory, rawSubcategory, contextText].filter(Boolean).join(' '));
  if (detection) {
    return {
      category: detection.category,
      subcategory: rawSubcategory ? titleCase(rawSubcategory) : detection.subcategory,
      resolution: 'detected' as const,
    };
  }

  if (rawCategory) {
    return {
      category: titleCase(rawCategory),
      subcategory: rawSubcategory ? titleCase(rawSubcategory) : '',
      resolution: 'created' as const,
    };
  }

  return {
    category: 'Miscellaneous',
    subcategory: rawSubcategory ? titleCase(rawSubcategory) : '',
    resolution: 'fallback' as const,
  };
};

const resolveIncomeCategory = (rawCategory: string, contextText: string, existingNames: Set<string>) => {
  const exact = rawCategory ? findClosestCategory(rawCategory, Array.from(existingNames)) : null;
  if (exact) {
    return {
      category: exact,
      subcategory: '',
      resolution: normalizeText(exact) === normalizeText(rawCategory) ? 'exact' as const : 'mapped' as const,
    };
  }

  const normalizedContext = normalizeText(`${rawCategory} ${contextText}`);
  const keywordMap: Array<{ category: string; keywords: string[] }> = [
    { category: 'Salary', keywords: ['salary', 'payroll', 'payout', 'stipend'] },
    { category: 'Gift & Refund', keywords: ['refund', 'reimbursement', 'cashback', 'gift'] },
    { category: 'Investment Returns', keywords: ['interest', 'dividend', 'capital gains'] },
    { category: 'Business', keywords: ['invoice', 'client payment', 'service revenue', 'sale'] },
  ];

  for (const item of keywordMap) {
    if (item.keywords.some((keyword) => normalizedContext.includes(keyword)) && existingNames.has(item.category)) {
      return { category: item.category, subcategory: '', resolution: 'detected' as const };
    }
  }

  if (rawCategory) {
    return { category: titleCase(rawCategory), subcategory: '', resolution: 'created' as const };
  }

  return { category: 'Other Income', subcategory: '', resolution: 'fallback' as const };
};

const getCategoryCatalog = async (): Promise<ExistingCategoryCatalog> => {
  const rawCategories = await db.categories.toArray();
  const expenseNames = new Set<string>([
    ...getExpenseCategoryNames(),
    ...rawCategories.filter((item) => item.type === 'expense').map((item) => item.name),
  ]);
  const incomeNames = new Set<string>([
    ...getIncomeCategoryNames(),
    ...rawCategories.filter((item) => item.type === 'income').map((item) => item.name),
  ]);
  return { expenseNames, incomeNames, rawCategories };
};

const getFallbackAccountId = (accounts: Account[], requestedAccountId: number) => {
  if (accounts.some((account) => account.id === requestedAccountId)) return requestedAccountId;
  return accounts[0]?.id ?? 0;
};

const parseMembers = (value: unknown): Array<{ name: string; share?: number }> => {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => {
        if (typeof item === 'string') return [{ name: item.trim() }];
        if (item && typeof item === 'object') {
          const record = item as Record<string, unknown>;
          const name = toDisplayValue(record.name ?? record.member ?? record.participant ?? record.user);
          const share = parseAmountValue(record.share ?? record.amount ?? record.value);
          return name ? [{ name, share: share ?? undefined }] : [];
        }
        return [];
      })
      .filter((member) => member.name);
  }

  const text = toDisplayValue(value);
  if (!text) return [];

  return text
    .split(/[,;|/]/)
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => ({ name: token }));
};

const extractGroupData = (lookup: Record<string, unknown>, row: ImportPreviewRow): ExtractedGroupData | null => {
  const groupName = toDisplayValue(getFieldValue(lookup, GROUP_NAME_KEYS));
  const members = parseMembers(getFieldValue(lookup, GROUP_MEMBER_KEYS));
  if (!groupName && members.length === 0) return null;
  if (row.transactionType !== 'expense') return null;

  return {
    name: groupName || row.description || 'Imported Group Expense',
    members,
    splitType: members.some((member) => member.share != null) ? 'custom' : 'equal',
  };
};

const extractGoalData = (lookup: Record<string, unknown>): ExtractedGoalData | null => {
  const goalName = toDisplayValue(getFieldValue(lookup, GOAL_NAME_KEYS));
  if (!goalName) return null;

  const targetAmount = parseAmountValue(getFieldValue(lookup, GOAL_TARGET_KEYS)) ?? undefined;
  const targetDate = parseDateValue(getFieldValue(lookup, GOAL_DATE_KEYS)) ?? undefined;
  return {
    goalName: titleCase(goalName),
    targetAmount,
    targetDate,
  };
};

class SmartExpenseImportService {
  private structuredPayload: Record<string, unknown> | null = null;

  async analyzeFile(file: File, options: AnalyzeOptions): Promise<SmartImportPreview> {
    const text = await file.text();
    const fileType = file.name.toLowerCase().endsWith('.csv') ? 'csv' : 'json';

    if (fileType === 'json') {
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error('Invalid JSON file');
      }

      if (isKANAKUBackupPayload(payload)) {
        this.structuredPayload = null;
        return this.buildBackupPreview(file.name, payload);
      }

      this.structuredPayload = isStructuredLedgerPayload(payload) ? payload : null;

      return this.buildThirdPartyPreview({
        fileName: file.name,
        fileType,
        records: extractStructuredLedgerRecords(payload),
        defaultAccountId: options.defaultAccountId,
      });
    }

    this.structuredPayload = null;
    return this.buildThirdPartyPreview({
      fileName: file.name,
      fileType,
      records: parseCsvRecords(text),
      defaultAccountId: options.defaultAccountId,
    });
  }

  async applyPreviewImport(options: ApplyPreviewOptions): Promise<ThirdPartyImportResult> {
    initializeBackendSync();

    const importableRows = options.rows.filter((row) => {
      if (row.errors.length > 0) return false;
      if (options.skipDuplicates && row.duplicate) return false;
      return true;
    });

    const categoryCatalog = await getCategoryCatalog();
    const importedAt = new Date();
    const invalidRowErrors = options.rows
      .filter((row) => row.errors.length > 0)
      .map((row) => `Row ${row.rowNumber}: ${row.errors.join(', ')}`);
    const duplicateCount = options.skipDuplicates ? options.rows.filter((row) => row.duplicate).length : 0;
    const runtimeErrors: string[] = [];
    const accountBalanceChanges = new Map<number, number>();
    const accountFlows = new Map<number, { inflow: number; outflow: number }>();
    const importedAccountSnapshots = new Map<number, { date: Date; balance: number }>();
    const updatedGoals = new Set<string>();

    let createdCategories: string[] = [];
    let createdAccounts: string[] = [];
    let createdGoals: string[] = [];
    let createdGroupExpenses = 0;
    let createdFriends = 0;
    let createdLoans = 0;
    let updatedLoans = 0;
    let createdInvestments = 0;
    let updatedInvestments = 0;
    let importedCount = 0;

    const structuredPayload = this.structuredPayload;
    this.structuredPayload = null;

    await db.transaction(
      'rw',
      [
        db.transactions,
        db.accounts,
        db.friends,
        db.loans,
        db.investments,
        db.importHistories,
        db.categories,
        db.groupExpenses,
        db.goals,
        db.goalContributions,
      ],
      async () => {
        if (structuredPayload && isStructuredLedgerPayload(structuredPayload)) {
          const companionResult = await this.importStructuredCompanionData({
            payload: structuredPayload,
            userId: options.userId,
            timestamp: importedAt,
          });
          createdAccounts = [...createdAccounts, ...companionResult.createdAccounts];
          createdGoals = [...createdGoals, ...companionResult.createdGoals];
          companionResult.updatedGoals.forEach((name) => updatedGoals.add(name));
          createdFriends += companionResult.createdFriends;
          createdLoans += companionResult.createdLoans;
          updatedLoans += companionResult.updatedLoans;
          createdInvestments += companionResult.createdInvestments;
          updatedInvestments += companionResult.updatedInvestments;
          createdGroupExpenses += companionResult.createdGroupExpenses;
        }

        createdCategories = await this.ensureCategories(importableRows, categoryCatalog, options.userId);

        const ensuredAccounts = await this.ensureAccounts(importableRows);
        createdAccounts = ensuredAccounts.createdAccounts;
        const goalRegistry = await this.buildGoalRegistry();

        for (const row of importableRows) {
          try {
            const account = ensuredAccounts.accountsByRowId.get(row.id);
            if (!account?.id) {
              throw new Error('Could not resolve an account for this row');
            }

            const resolvedAmount = resolveImportedAmount(row.amount, row.metadata, account.currency);
            const metadataBase = resolvedAmount !== row.amount
              ? {
                  ...row.metadata,
                  'Original Amount': String(row.amount),
                }
              : row.metadata;
            // Persist the external ID so duplicate detection works on re-import.
            // EXTERNAL_ID_KEYS are excluded from importMetadata by buildImportMetadata
            // (they are in KNOWN_FIELD_GROUPS), so we must inject it explicitly here.
            const metadata = row.externalId
              ? { ...metadataBase, 'Expense Id': row.externalId }
              : metadataBase;

            const description = buildDescription(row.description, row.merchant, row.category);
            const transactionPayload: Transaction = {
              accountId: account.id,
              amount: resolvedAmount,
              category: row.category,
              subcategory: row.subcategory || undefined,
              description,
              merchant: row.merchant || undefined,
              date: row.date!,
              type: row.transactionType,
              expenseMode: row.expenseMode ?? 'individual',
              createdAt: importedAt,
              updatedAt: importedAt,
              importedAt,
              importSource: options.fileName,
              importMetadata: metadata,
              originalCategory: row.rawCategory || undefined,
            };

            const transactionId = await db.transactions.add(transactionPayload);
            importedCount += 1;

            const accountChange = row.transactionType === 'income' ? resolvedAmount : -resolvedAmount;
            accountBalanceChanges.set(account.id, (accountBalanceChanges.get(account.id) ?? 0) + accountChange);

            const currentFlow = accountFlows.get(account.id) ?? { inflow: 0, outflow: 0 };
            if (row.transactionType === 'income') {
              currentFlow.inflow += resolvedAmount;
            } else {
              currentFlow.outflow += resolvedAmount;
            }
            accountFlows.set(account.id, currentFlow);

            const importedBalance = parseAmountValue(row.metadata['Account Balance']);
            if (importedBalance != null && Number.isFinite(importedBalance) && row.date) {
              const previousSnapshot = importedAccountSnapshots.get(account.id);
              if (!previousSnapshot || row.date.getTime() >= previousSnapshot.date.getTime()) {
                importedAccountSnapshots.set(account.id, {
                  date: row.date,
                  balance: importedBalance,
                });
              }
            }

            const lookup = buildLookup(row.originalData);
            const groupData = extractGroupData(lookup, row);
            if (groupData) {
              const groupExpenseId = await this.createImportedGroupExpense({
                accountId: account.id,
                amount: resolvedAmount,
                category: row.category,
                date: row.date!,
                description: row.description,
                groupData,
                transactionId,
                userId: options.userId,
                createdAt: importedAt,
              });

              await db.transactions.update(transactionId, {
                groupExpenseId,
                expenseMode: 'group',
                groupName: groupData.name,
                splitType: groupData.splitType,
                updatedAt: importedAt,
              } as Partial<Transaction>);
              createdGroupExpenses += 1;
            }

            const goalData = extractGoalData(lookup);
            if (goalData) {
              const goalEntry = await this.ensureGoal(goalRegistry, goalData, row, importedAt);
              if (goalEntry.created) createdGoals.push(goalEntry.goal.name);
              updatedGoals.add(goalEntry.goal.name);

              await db.goalContributions.add({
                goalId: goalEntry.goal.id!,
                amount: resolvedAmount,
                accountId: account.id,
                date: row.date!,
                notes: `Imported from ${options.fileName}`,
              });

              await db.goals.update(goalEntry.goal.id!, {
                currentAmount: goalEntry.goal.currentAmount + resolvedAmount,
                updatedAt: importedAt,
              });
              goalEntry.goal.currentAmount += resolvedAmount;
            }
          } catch (error) {
            runtimeErrors.push(`Row ${row.rowNumber}: ${error instanceof Error ? error.message : 'Import failed'}`);
          }
        }

        for (const [accountId, change] of accountBalanceChanges.entries()) {
          const account = await db.accounts.get(accountId);
          if (!account) continue;

          const importedSnapshot = importedAccountSnapshots.get(accountId);
          if (importedSnapshot) {
            await db.accounts.update(accountId, {
              balance: importedSnapshot.balance,
              updatedAt: importedAt,
            });
            continue;
          }

          const flows = accountFlows.get(accountId) ?? { inflow: 0, outflow: 0 };
          const nextBalance = account.balance + change;

          if (
            ensuredAccounts.createdAccountIds.has(accountId)
            && account.type !== 'card'
            && nextBalance < 0
            && flows.inflow <= 0
          ) {
            await db.accounts.update(accountId, {
              balance: 0,
              updatedAt: importedAt,
            });
            continue;
          }

          await db.accounts.update(accountId, {
            balance: nextBalance,
            updatedAt: importedAt,
          });
        }

        const history: ImportHistory = {
          fileName: options.fileName,
          fileType: options.fileType,
          sourceKind: 'third-party',
          totalRecords: options.rows.length,
          importedRecords: importedCount,
          skippedRecords: options.rows.length - importedCount,
          duplicateRecords: options.rows.filter((row) => row.duplicate).length,
          createdCategories,
          errors: [...invalidRowErrors, ...runtimeErrors],
          createdAt: importedAt,
          userId: options.userId,
          metadata: {
            fallbackAccountId: options.rows[0]?.accountId,
            createdAccounts: Array.from(new Set(createdAccounts)),
            createdGoals: Array.from(new Set(createdGoals)),
            updatedGoals: Array.from(updatedGoals),
            createdGroupExpenses,
          },
        };

        await db.importHistories.add(history);
      },
    );

    return {
      importedCount,
      skippedCount: options.rows.length - importedCount,
      duplicateCount,
      failedCount: invalidRowErrors.length + runtimeErrors.length,
      createdAccounts: Array.from(new Set(createdAccounts)),
      createdCategories,
      createdGroupExpenses,
      createdGoals: Array.from(new Set(createdGoals)),
      updatedGoals: Array.from(updatedGoals),
      createdFriends,
      createdLoans,
      updatedLoans,
      createdInvestments,
      updatedInvestments,
    };
  }

  async restoreBackup(options: RestoreBackupOptions) {
    await importDataFromJSON(options.jsonText);

    const payload = JSON.parse(options.jsonText) as Record<string, unknown>;
    await db.importHistories.add({
      fileName: options.fileName,
      fileType: 'json',
      sourceKind: 'backup',
      totalRecords: Array.isArray(payload.transactions) ? payload.transactions.length : 0,
      importedRecords: Array.isArray(payload.transactions) ? payload.transactions.length : 0,
      skippedRecords: 0,
      duplicateRecords: 0,
      createdCategories: [],
      errors: [],
      createdAt: new Date(),
      userId: options.userId,
      metadata: {
        restoredBackup: true,
        exportedAt: typeof payload.exportedAt === 'string' ? payload.exportedAt : undefined,
        version: typeof payload.version === 'string' ? payload.version : undefined,
      },
    });
  }

  private buildBackupPreview(fileName: string, payload: Record<string, unknown>): BackupImportPreview {
    const labels: Array<[string, unknown]> = [
      ['Accounts', payload.accounts],
      ['Transactions', payload.transactions],
      ['Loans', payload.loans],
      ['Goals', payload.goals],
      ['Group Expenses', payload.groupExpenses],
      ['Investments', payload.investments],
      ['Friends', payload.friends],
      ['Categories', payload.categories],
    ];

    return {
      kind: 'backup',
      fileName,
      fileType: 'json',
      exportedAt: typeof payload.exportedAt === 'string' ? payload.exportedAt : undefined,
      version: typeof payload.version === 'string' ? payload.version : undefined,
      counts: labels.map(([label, value]) => ({
        label,
        count: Array.isArray(value) ? value.length : 0,
      })),
    };
  }

  private async buildThirdPartyPreview(options: {
    fileName: string;
    fileType: ImportFileType;
    records: Array<Record<string, unknown>>;
    defaultAccountId: number;
  }): Promise<ThirdPartyImportPreview> {
    const categoryCatalog = await getCategoryCatalog();
    const accounts = await db.accounts.toArray();
    const accountNameById = new Map(accounts.map((account) => [account.id, account.name]));
    const existingTransactions = await db.transactions.toArray();
    const existingKeys = new Set<string>();
    for (const transaction of existingTransactions) {
      const storedExtId = transaction.importMetadata?.['Expense Id'] ?? transaction.importMetadata?.['External Id'];
      if (storedExtId) {
        const normalizedExtId = normalizeExternalId(String(storedExtId));
        if (normalizedExtId) {
          existingKeys.add(`extid::${normalizedExtId}`);
        }
      }

      const sourceAccountName = transaction.importMetadata?.['Source Account']
        || (transaction.accountId ? accountNameById.get(transaction.accountId) : '')
        || '';

      existingKeys.add(buildDuplicateKey(
        new Date(transaction.date),
        Number(transaction.amount) || 0,
        String(transaction.description || ''),
        transaction.accountId ? String(transaction.accountId) : '',
        String(transaction.merchant || ''),
      ));

      existingKeys.add(buildDuplicateKey(
        new Date(transaction.date),
        Number(transaction.amount) || 0,
        String(transaction.description || ''),
        sourceAccountName,
        String(transaction.merchant || ''),
      ));
    }
    const fallbackAccountId = getFallbackAccountId(accounts, options.defaultAccountId);
    const errors: string[] = [];

    const rows = options.records.map((record, index) => {
      const lookup = buildLookup(record);
      const rawTextBundle = collectStringLeaves(record).join(' ');
      const date = parseDateValue(
        getFieldValueByFuzzyKey(lookup, DATE_KEYS, ['date', 'time', 'created', 'txn', 'transaction'], ['targetdate', 'goaldate', 'deadline']),
      );

      const debitAmount = parseAmountValue(
        getFieldValueByFuzzyKey(lookup, AMOUNT_KEYS, ['amount', 'amt', 'total', 'spent', 'debit', 'expense', 'paid'], ['targetamount', 'goalamount', 'balance']),
      );
      const creditAmount = parseAmountValue(
        getFieldValueByFuzzyKey(lookup, CREDIT_KEYS, ['credit', 'income', 'received', 'deposit', 'refund'], ['balance']),
      );
      let amount = debitAmount ?? creditAmount ?? null;
      const rawDescription = toDisplayValue(
        getFieldValueByFuzzyKey(lookup, DESCRIPTION_KEYS, ['description', 'narration', 'details', 'memo', 'note', 'title']),
      );
      const merchant = toDisplayValue(
        getFieldValueByFuzzyKey(lookup, MERCHANT_KEYS, ['merchant', 'vendor', 'payee', 'store']),
      );
      const rawCategory = toDisplayValue(
        getFieldValueByFuzzyKey(lookup, CATEGORY_KEYS, ['category', 'type'], ['transactiontype', 'expensemode', 'paymenttype']),
      );
      const rawSubcategory = toDisplayValue(
        getFieldValueByFuzzyKey(lookup, SUBCATEGORY_KEYS, ['subcategory', 'sub', 'segment']),
      );
      const sourceAccountName = toDisplayValue(
        getFieldValueByFuzzyKey(lookup, ACCOUNT_KEYS, ['account', 'wallet', 'bank', 'card', 'source']),
      );
      const sourcePaymentMethod = toDisplayValue(
        getFieldValueByFuzzyKey(lookup, PAYMENT_KEYS, ['payment', 'method', 'mode', 'channel']),
      );

      const rawTypeCandidate = toDisplayValue(
        getFieldValueByFuzzyKey(lookup, TYPE_KEYS, ['type', 'nature', 'drcr', 'flow', 'credit', 'debit'], ['expensemode']),
      );
      let transactionType = parseTypeValue(rawTypeCandidate);

      const inferredTypeFromContext = inferTransactionTypeFromContext({
        rawCategory,
        rawSubcategory,
        description: rawDescription,
        merchant,
        rawText: rawTextBundle,
      });

      if (!transactionType) {
        if (creditAmount != null && creditAmount > 0 && (debitAmount == null || debitAmount === 0)) {
          transactionType = 'income';
        } else if (debitAmount != null && debitAmount > 0 && (creditAmount == null || creditAmount === 0)) {
          transactionType = 'expense';
        } else if (amount != null && amount < 0) {
          transactionType = 'expense';
        } else {
          transactionType = inferredTypeFromContext ?? 'expense';
        }
      } else if (transactionType === 'expense' && inferredTypeFromContext === 'income') {
        // Some trackers use a generic expense type for every row; prefer strong semantic income hints.
        transactionType = 'income';
      }

      if (amount != null) amount = Math.abs(amount);

      const externalId = toDisplayValue(getFieldValue(lookup, EXTERNAL_ID_KEYS));
      const rawTypeValue = normalizeText(toDisplayValue(getFieldValue(lookup, EXPENSE_MODE_KEYS)));
      const expenseMode: ImportPreviewRow['expenseMode'] =
        rawTypeValue === 'group' || rawTypeValue === 'shared' ? 'group' : 'individual';
      const description = isBoilerplateDescription(rawDescription)
        ? (merchant || rawSubcategory || rawCategory || rawDescription || rawTextBundle || `Imported row ${index + 1}`)
        : (rawDescription || merchant || rawSubcategory || rawCategory || rawTextBundle || `Imported row ${index + 1}`);
      const accountTarget = resolveAccountTarget(accounts, fallbackAccountId, sourceAccountName, sourcePaymentMethod);
      const contextText = [description, merchant, rawCategory, rawSubcategory, sourcePaymentMethod, sourceAccountName, rawTextBundle].filter(Boolean).join(' ');
      const metadata = buildImportMetadata(record, lookup, options.fileName);

      // Final semantic pass after description/context is assembled.
      // This catches generic type fields from third-party apps that can mark every row as expense.
      const narrativeType = inferTransactionTypeFromNarrative(contextText);
      if (narrativeType) {
        transactionType = narrativeType;
      }

      let categoryResult = transactionType === 'income'
        ? resolveIncomeCategory(rawCategory, contextText, categoryCatalog.incomeNames)
        : resolveExpenseCategory(rawCategory, rawSubcategory, contextText, categoryCatalog.expenseNames);

      // Absolute safety net for noisy third-party schemas.
      // If final narrative clearly indicates income, force type/category to income-side mapping.
      const finalNarrative = normalizeText([contextText, rawTypeCandidate].filter(Boolean).join(' '));
      const hasHardIncomeSignal = /\b(salary|payroll|stipend|refund|reimbursement|cashback|interest|dividend|bonus|credited|credit alert|credit from|received|payout)\b/.test(finalNarrative);
      if (hasHardIncomeSignal) {
        transactionType = 'income';
        categoryResult = resolveIncomeCategory(rawCategory || 'Salary', contextText, categoryCatalog.incomeNames);
      }

      const rowErrors: string[] = [];
      if (!date) rowErrors.push('Invalid date');
      if (amount == null || !Number.isFinite(amount)) rowErrors.push('Invalid amount');

      const fallbackDescription = buildPreviewDescription({
        baseDescription: description,
        rawCategory: rawCategory || categoryResult.category,
        transactionType,
      });
      const normalizedExtId = normalizeExternalId(externalId);
      const duplicateKeyByAccountId = buildDuplicateKey(
        date,
        amount ?? 0,
        fallbackDescription,
        accountTarget.accountId > 0 ? String(accountTarget.accountId) : '',
        merchant,
      );
      const duplicateKeyByAccountName = buildDuplicateKey(
        date,
        amount ?? 0,
        fallbackDescription,
        sourceAccountName || accountTarget.resolvedAccountName,
        merchant,
      );

      const duplicateKey = normalizedExtId
        ? `extid::${normalizedExtId}`
        : (duplicateKeyByAccountId || duplicateKeyByAccountName);

      const duplicate = Boolean(
        (normalizedExtId && existingKeys.has(`extid::${normalizedExtId}`))
        || (duplicateKeyByAccountId && existingKeys.has(duplicateKeyByAccountId))
        || (duplicateKeyByAccountName && existingKeys.has(duplicateKeyByAccountName)),
      );

      // Mark this row's keys immediately so duplicates within the same file are detected too.
      if (normalizedExtId) existingKeys.add(`extid::${normalizedExtId}`);
      if (duplicateKeyByAccountId) existingKeys.add(duplicateKeyByAccountId);
      if (duplicateKeyByAccountName) existingKeys.add(duplicateKeyByAccountName);

      return {
        id: createRowId(index),
        rowNumber: index + 1,
        transactionType,
        accountId: accountTarget.accountId,
        sourceAccountName,
        sourcePaymentMethod,
        resolvedAccountName: accountTarget.resolvedAccountName,
        accountResolution: accountTarget.accountResolution,
        date,
        amount: amount ?? 0,
        description: fallbackDescription,
        merchant,
        rawCategory,
        rawSubcategory,
        category: categoryResult.category,
        subcategory: categoryResult.subcategory,
        categoryResolution: categoryResult.resolution,
        duplicateKey,
        duplicate,
        errors: rowErrors,
        metadata,
        originalData: record,
        externalId: externalId || undefined,
        expenseMode,
      } satisfies ImportPreviewRow;
    });

    if (rows.length === 0) {
      errors.push('No importable rows were found in this file.');
    }

    const structuredAccountNames = this.structuredPayload && isStructuredLedgerPayload(this.structuredPayload)
      ? (
        (Array.isArray(this.structuredPayload.accounts)
          ? this.structuredPayload.accounts
          : Array.isArray(this.structuredPayload.wallets)
            ? this.structuredPayload.wallets
            : [])
          .filter(isRecordObject)
          .map((account) => toDisplayValue(account.account_name ?? account.accountName ?? account.name ?? account.title ?? account.wallet_name))
          .filter(Boolean)
      )
      : [];

    const summary = {
      totalRecords: rows.length,
      readyRecords: rows.filter((row) => row.errors.length === 0 && !row.duplicate).length,
      duplicateRecords: rows.filter((row) => row.duplicate).length,
      invalidRecords: rows.filter((row) => row.errors.length > 0).length,
      exactMatches: rows.filter((row) => row.categoryResolution === 'exact').length,
      mappedMatches: rows.filter((row) => row.categoryResolution === 'mapped').length,
      detectedMatches: rows.filter((row) => row.categoryResolution === 'detected').length,
      createdAccounts: Array.from(new Set([
        ...rows
          .filter((row) => row.accountResolution === 'created' || row.accountResolution === 'payment-method')
          .map((row) => row.resolvedAccountName),
        ...structuredAccountNames,
      ])),
      createdCategories: Array.from(new Set(rows
        .filter((row) => row.categoryResolution === 'created')
        .map((row) => row.category))),
    };

    return {
      kind: 'third-party',
      fileName: options.fileName,
      fileType: options.fileType,
      rows,
      errors,
      summary,
    };
  }

  private async ensureCategories(
    rows: ImportPreviewRow[],
    categoryCatalog: ExistingCategoryCatalog,
    userId?: string,
  ) {
    const seenNames = new Set([
      ...Array.from(categoryCatalog.expenseNames).map((name) => `expense::${normalizeText(name)}`),
      ...Array.from(categoryCatalog.incomeNames).map((name) => `income::${normalizeText(name)}`),
    ]);
    const createdCategories: string[] = [];
    const timestamp = new Date();

    for (const row of rows) {
      const categoryType = row.transactionType;
      const key = `${categoryType}::${normalizeText(row.category)}`;
      if (seenNames.has(key)) continue;
      seenNames.add(key);

      const existing = categoryCatalog.rawCategories.find((item) =>
        item.type === categoryType && normalizeText(item.name) === normalizeText(row.category),
      );
      if (existing) continue;

      const details = getCategoryDetails(row.category, categoryType);
      const category: AppCategory = {
        id: `${categoryType}-${slugify(row.category)}`,
        name: row.category,
        type: categoryType,
        color: details?.color ?? (categoryType === 'expense' ? '#64748B' : '#10B981'),
        icon: details?.icon ?? (categoryType === 'expense' ? '' : ''),
        createdAt: timestamp,
        updatedAt: timestamp,
        userId,
        createdFromImport: true,
      };

      await db.categories.put(category);
      createdCategories.push(category.name);
    }

    return createdCategories;
  }

  private async ensureAccounts(rows: ImportPreviewRow[]): Promise<EnsuredAccountResult> {
    const accounts = await db.accounts.toArray();
    const accountCache = [...accounts];
    const accountsByRowId = new Map<string, Account>();
    const createdAccounts: string[] = [];
    const createdAccountIds = new Set<number>();
    const timestamp = new Date();
    const defaultCurrency = accounts[0]?.currency || 'INR';

    for (const row of rows) {
      const desiredName = toFriendlyAccountName(row.sourceAccountName, row.sourcePaymentMethod) || row.resolvedAccountName;
      const matched = findMatchingAccount(accountCache, desiredName, row.sourcePaymentMethod)
        ?? accountCache.find((account) => account.id === row.accountId);

      if (matched) {
        accountsByRowId.set(row.id, matched);
        continue;
      }

      const newAccount: Account = {
        name: desiredName || 'Imported Account',
        type: inferAccountType(row.sourceAccountName || desiredName, row.sourcePaymentMethod),
        balance: 0,
        currency: row.metadata.Currency || defaultCurrency,
        isActive: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      const newAccountId = await db.accounts.add(newAccount);
      const created = { ...newAccount, id: newAccountId };
      accountCache.push(created);
      accountsByRowId.set(row.id, created);
      createdAccounts.push(created.name);
      createdAccountIds.add(newAccountId);
    }

    return {
      accountsByRowId,
      createdAccounts,
      createdAccountIds,
    };
  }

  private async buildGoalRegistry() {
    const goals = await db.goals.toArray();
    return new Map(goals.map((goal) => [normalizeText(goal.name), { goal, created: false } satisfies GoalRegistryEntry]));
  }

  private async ensureGoal(
    registry: Map<string, GoalRegistryEntry>,
    goalData: ExtractedGoalData,
    row: ImportPreviewRow,
    timestamp: Date,
  ): Promise<GoalRegistryEntry> {
    const key = normalizeText(goalData.goalName);
    const existing = registry.get(key);
    if (existing) return existing;

    const baseDate = row.date ?? timestamp;
    const defaultTargetDate = new Date(baseDate);
    defaultTargetDate.setFullYear(defaultTargetDate.getFullYear() + 1);

    const goal: Goal = {
      name: goalData.goalName,
      description: `Imported from ${row.description}`,
      targetAmount: goalData.targetAmount ?? row.amount,
      currentAmount: 0,
      targetDate: goalData.targetDate ?? defaultTargetDate,
      category: row.category,
      isGroupGoal: false,
      createdAt: timestamp,
      updatedAt: timestamp,
      syncStatus: 'pending',
      version: 1,
    };

    const goalId = await db.goals.add(goal);
    const entry: GoalRegistryEntry = {
      goal: { ...goal, id: goalId },
      created: true,
    };
    registry.set(key, entry);
    return entry;
  }

  private async importStructuredCompanionData(options: {
    payload: Record<string, unknown>;
    userId?: string;
    timestamp: Date;
  }): Promise<{
    createdAccounts: string[];
    createdGoals: string[];
    updatedGoals: string[];
    createdFriends: number;
    createdLoans: number;
    updatedLoans: number;
    createdInvestments: number;
    updatedInvestments: number;
    createdGroupExpenses: number;
  }> {
    const { payload, timestamp } = options;
    const createdAccounts: string[] = [];
    const createdGoals: string[] = [];
    const updatedGoals: string[] = [];
    let createdFriends = 0;
    let createdLoans = 0;
    let updatedLoans = 0;
    let createdInvestments = 0;
    let updatedInvestments = 0;
    let createdGroupExpenses = 0;

    const userCurrency = isRecordObject(payload.user)
      ? toDisplayValue(payload.user.currency)
      : (isRecordObject(payload.profile)
        ? toDisplayValue(payload.profile.currency ?? payload.profile.currency_code ?? payload.profile.currencyCode)
        : '');

    const existingAccounts = await db.accounts.toArray();
    const accountNameMap = new Map(existingAccounts.map((account) => [normalizeText(account.name), account]));
    const accountExternalMap = new Map<string, number>();

    const accountRows = Array.isArray(payload.accounts)
      ? payload.accounts.filter(isRecordObject)
      : Array.isArray(payload.wallets)
        ? payload.wallets.filter(isRecordObject)
        : [];

    for (const accountRow of accountRows) {
      const accountName = toDisplayValue(accountRow.account_name ?? accountRow.accountName ?? accountRow.name ?? accountRow.title).trim();
      if (!accountName) continue;

      const normalizedName = normalizeText(accountName);
      let account = accountNameMap.get(normalizedName);
      if (!account) {
        const rawType = toDisplayValue(accountRow.type ?? accountRow.account_type ?? accountRow.accountType ?? accountRow.category);
        const balance = parseAmountValue(accountRow.balance ?? accountRow.current_balance ?? accountRow.currentBalance) ?? 0;
        const currency = toDisplayValue(accountRow.currency ?? accountRow.currency_code ?? accountRow.currencyCode) || userCurrency || 'INR';

        const newAccount: Account = {
          name: accountName,
          type: inferAccountType(accountName, rawType),
          balance,
          currency,
          isActive: true,
          createdAt: timestamp,
          updatedAt: timestamp,
        };

        const id = await db.accounts.add(newAccount);
        account = { ...newAccount, id };
        accountNameMap.set(normalizedName, account);
        createdAccounts.push(accountName);
      }

      const externalAccountId = toDisplayValue(accountRow.account_id ?? accountRow.accountId ?? accountRow.id ?? accountRow.wallet_id ?? accountRow.walletId);
      if (externalAccountId && account.id != null) {
        accountExternalMap.set(normalizeText(externalAccountId), account.id);
      }
    }

    const refreshedAccounts = await db.accounts.toArray();
    const fallbackAccount = refreshedAccounts[0];

    const existingFriends = await db.friends.toArray();
    const friendExternalMap = new Map<string, number>();
    const friendRows = Array.isArray(payload.friends)
      ? payload.friends.filter(isRecordObject)
      : Array.isArray(payload.contacts)
        ? payload.contacts.filter(isRecordObject)
        : [];

    for (const friendRow of friendRows) {
      const name = toDisplayValue(friendRow.name).trim();
      if (!name) continue;
      const email = toDisplayValue(friendRow.email) || undefined;
      const phone = toDisplayValue(friendRow.phone) || undefined;

      let existing = existingFriends.find((friend) => {
        if (email && friend.email && normalizeText(friend.email) === normalizeText(email)) return true;
        if (phone && friend.phone && normalizeText(friend.phone) === normalizeText(phone)) return true;
        return normalizeText(friend.name) === normalizeText(name);
      });

      if (!existing) {
        const newFriend: Friend = {
          name,
          email,
          phone,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        const id = await db.friends.add(newFriend);
        existing = { ...newFriend, id };
        existingFriends.push(existing);
        createdFriends += 1;
      }

      const externalFriendId = toDisplayValue(friendRow.friend_id ?? friendRow.friendId ?? friendRow.id ?? friendRow.cid ?? friendRow.contact_id ?? friendRow.contactId);
      if (externalFriendId && existing.id != null) {
        friendExternalMap.set(normalizeText(externalFriendId), existing.id);
      }
    }

    const existingGoals = await db.goals.toArray();
    const goalRows = Array.isArray(payload.goals)
      ? payload.goals.filter(isRecordObject)
      : Array.isArray(payload.targets)
        ? payload.targets.filter(isRecordObject)
        : [];

    for (const goalRow of goalRows) {
      const goalName = toDisplayValue(goalRow.goal_name ?? goalRow.goalName ?? goalRow.name ?? goalRow.goal).trim();
      if (!goalName) continue;

      const targetAmount = parseAmountValue(goalRow.target_amount ?? goalRow.targetAmount ?? goalRow.target_value ?? goalRow.targetValue) ?? 0;
      const savedAmount = parseAmountValue(goalRow.saved_amount ?? goalRow.savedAmount ?? goalRow.current_amount ?? goalRow.currentAmount ?? goalRow.saved) ?? 0;
      const monthlySavingPlan = parseAmountValue(goalRow.monthly_saving_plan ?? goalRow.monthlySavingPlan) ?? undefined;
      const targetDate = parseDateValue(goalRow.target_date ?? goalRow.targetDate ?? goalRow.deadline) ?? new Date(timestamp.getFullYear() + 1, timestamp.getMonth(), timestamp.getDate());

      const memberRows = Array.isArray(goalRow.friends)
        ? goalRow.friends.filter(isRecordObject)
        : [];
      const members = memberRows.flatMap((memberRow) => {
        const friendId = toDisplayValue(memberRow.friend_id ?? memberRow.friendId);
        const contribution = parseAmountValue(memberRow.contribution ?? memberRow.share) ?? undefined;
        const friend = friendId
          ? existingFriends.find((item) => item.id === friendExternalMap.get(normalizeText(friendId)))
          : undefined;

        if (!friend) return [];
        return [{
          name: friend.name,
          contactType: friend.email ? 'email' as const : 'phone' as const,
          contactValue: friend.email || friend.phone || friend.name,
          contribution,
          status: 'paid' as const,
        }];
      });

      const existingGoal = existingGoals.find((goal) => normalizeText(goal.name) === normalizeText(goalName));
      if (existingGoal?.id != null) {
        await db.goals.update(existingGoal.id, {
          targetAmount: targetAmount || existingGoal.targetAmount,
          currentAmount: savedAmount,
          monthlySavingPlan,
          targetDate,
          members: members.length > 0 ? members : existingGoal.members,
          isGroupGoal: members.length > 0,
          updatedAt: timestamp,
        });
        updatedGoals.push(goalName);
        continue;
      }

      const newGoal: Goal = {
        name: goalName,
        description: `Imported from structured file`,
        targetAmount: targetAmount || savedAmount,
        currentAmount: savedAmount,
        monthlySavingPlan,
        targetDate,
        category: 'Savings',
        isGroupGoal: members.length > 0,
        members: members.length > 0 ? members : undefined,
        createdAt: timestamp,
        updatedAt: timestamp,
        syncStatus: 'pending',
        version: 1,
      };
      await db.goals.add(newGoal);
      existingGoals.push(newGoal);
      createdGoals.push(goalName);
    }

    const existingLoans = await db.loans.toArray();
    const loanRows = Array.isArray(payload.loans)
      ? payload.loans.filter(isRecordObject)
      : Array.isArray(payload.debts)
        ? payload.debts.filter(isRecordObject)
        : [];

    for (const loanRow of loanRows) {
      const rawLoanType = normalizeText(toDisplayValue(loanRow.type ?? loanRow.direction));
      const loanType: Loan['type'] = rawLoanType.includes('emi')
        ? 'emi'
        : rawLoanType.includes('lend')
          ? 'lent'
          : 'borrowed';
      const statusText = normalizeText(toDisplayValue(loanRow.status));
      const status: Loan['status'] = statusText.includes('complete')
        ? 'completed'
        : statusText.includes('overdue')
          ? 'overdue'
          : 'active';

      const friendExternalId = toDisplayValue(loanRow.friend_id ?? loanRow.friendId ?? loanRow.contact ?? loanRow.contact_id ?? loanRow.contactId ?? loanRow.cid);
      const linkedFriendId = friendExternalId ? friendExternalMap.get(normalizeText(friendExternalId)) : undefined;
      const linkedFriend = linkedFriendId != null
        ? existingFriends.find((friend) => friend.id === linkedFriendId)
        : undefined;

      const name = toDisplayValue(loanRow.loan_name ?? loanRow.loanName ?? loanRow.debt_id ?? loanRow.debtId)
        || (linkedFriend ? `${linkedFriend.name} ${loanType === 'lent' ? 'Loan Given' : 'Loan'}` : '')
        || 'Imported Loan';
      const principalAmount = parseAmountValue(loanRow.total_amount ?? loanRow.totalAmount ?? loanRow.amount) ?? 0;
      const emiAmount = parseAmountValue(loanRow.emi_amount ?? loanRow.emiAmount) ?? undefined;
      const remainingEmi = parseAmountValue(loanRow.remaining_emi ?? loanRow.remainingEmi) ?? undefined;
      const outstandingBalance = loanType === 'emi' && emiAmount != null && remainingEmi != null
        ? Number((emiAmount * remainingEmi).toFixed(2))
        : principalAmount;
      const interestRate = parseAmountValue(loanRow.interest_rate ?? loanRow.interestRate) ?? undefined;

      const existingLoan = existingLoans.find((loan) =>
        normalizeText(loan.name) === normalizeText(name) && loan.type === loanType,
      );
      if (existingLoan?.id != null) {
        await db.loans.update(existingLoan.id, {
          principalAmount: principalAmount || existingLoan.principalAmount,
          outstandingBalance,
          emiAmount,
          interestRate,
          dueDate: parseDateValue(loanRow.due_date ?? loanRow.dueDate ?? loanRow.due) ?? existingLoan.dueDate,
          loanDate: parseDateValue(loanRow.start_date ?? loanRow.loan_date ?? loanRow.loanDate) ?? existingLoan.loanDate,
          status,
          friendId: linkedFriendId ?? existingLoan.friendId,
          contactPerson: linkedFriend?.name ?? existingLoan.contactPerson,
          contactEmail: linkedFriend?.email ?? existingLoan.contactEmail,
          contactPhone: linkedFriend?.phone ?? existingLoan.contactPhone,
          accountId: existingLoan.accountId ?? fallbackAccount?.id,
          updatedAt: timestamp,
        });
        updatedLoans += 1;
        continue;
      }

      const newLoan: Loan = {
        type: loanType,
        name,
        principalAmount,
        outstandingBalance,
        interestRate,
        emiAmount,
        dueDate: parseDateValue(loanRow.due_date ?? loanRow.dueDate ?? loanRow.due) ?? undefined,
        loanDate: parseDateValue(loanRow.start_date ?? loanRow.loan_date ?? loanRow.loanDate) ?? undefined,
        status,
        contactPerson: linkedFriend?.name,
        friendId: linkedFriendId,
        contactEmail: linkedFriend?.email,
        contactPhone: linkedFriend?.phone,
        accountId: fallbackAccount?.id,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      await db.loans.add(newLoan);
      existingLoans.push(newLoan);
      createdLoans += 1;
    }

    const existingInvestments = await db.investments.toArray();
    const investmentRows = Array.isArray(payload.investments)
      ? payload.investments.filter(isRecordObject)
      : Array.isArray(payload.portfolio)
        ? payload.portfolio.filter(isRecordObject)
        : [];

    for (const investmentRow of investmentRows) {
      const assetTypeRaw = normalizeText(toDisplayValue(investmentRow.type));
      const assetType: Investment['assetType'] =
        assetTypeRaw === 'stock' || assetTypeRaw === 'crypto' || assetTypeRaw === 'forex' || assetTypeRaw === 'gold' || assetTypeRaw === 'silver'
          ? assetTypeRaw
          : 'other';
      const assetName = toDisplayValue(investmentRow.asset_name ?? investmentRow.assetName ?? investmentRow.name ?? investmentRow.asset).trim();
      if (!assetName) continue;

      const market = normalizeText(toDisplayValue(investmentRow.market ?? investmentRow.exchange));
      const symbol = normalizeText(toDisplayValue(investmentRow.symbol));
      const rowCurrency = toDisplayValue(investmentRow.currency ?? investmentRow.currency_code);
      const assetCurrency = rowCurrency
        ? normalizeCurrencyCode(rowCurrency, normalizeCurrencyCode(userCurrency, 'INR'))
        : (
            market.includes('nse')
            || market.includes('bse')
            || symbol.endsWith('ns')
            || symbol.endsWith('bo')
            || assetType === 'gold'
            || assetType === 'silver'
              ? 'INR'
              : normalizeCurrencyCode(userCurrency, 'INR')
          );
      const baseCurrency = normalizeCurrencyCode(userCurrency, 'INR');

      const quantity = parseAmountValue(investmentRow.quantity ?? investmentRow.qty) ?? 0;
      const buyPrice = parseAmountValue(investmentRow.buy_price ?? investmentRow.buyPrice ?? investmentRow.buy) ?? 0;
      const currentPrice = parseAmountValue(investmentRow.current_price ?? investmentRow.currentPrice) ?? buyPrice;
      const totalInvested = Number((quantity * buyPrice).toFixed(2));
      const currentValue = Number((quantity * currentPrice).toFixed(2));
      const profitLoss = Number((currentValue - totalInvested).toFixed(2));

      const existingInvestment = existingInvestments.find((investment) =>
        normalizeText(investment.assetName) === normalizeText(assetName)
        && investment.assetType === assetType,
      );

      if (existingInvestment?.id != null) {
        await db.investments.update(existingInvestment.id, {
          quantity,
          buyPrice,
          currentPrice,
          assetCurrency,
          baseCurrency,
          totalInvested,
          currentValue,
          profitLoss,
          lastUpdated: timestamp,
          updatedAt: timestamp,
        });
        updatedInvestments += 1;
        continue;
      }

      const newInvestment: Investment = {
        assetType,
        assetName,
        assetCurrency,
        baseCurrency,
        quantity,
        buyPrice,
        currentPrice,
        totalInvested,
        currentValue,
        profitLoss,
        purchaseDate: timestamp,
        lastUpdated: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
      } as Investment;
      await db.investments.add(newInvestment);
      existingInvestments.push(newInvestment);
      createdInvestments += 1;
    }

    const existingGroupExpenses = await db.groupExpenses.toArray();
    const groupRows = Array.isArray(payload.group_expenses)
      ? payload.group_expenses.filter(isRecordObject)
      : Array.isArray(payload.shared_costs)
        ? payload.shared_costs.filter(isRecordObject)
        : [];

    for (const groupRow of groupRows) {
      const name = toDisplayValue(groupRow.title ?? groupRow.name ?? groupRow.group_name).trim() || 'Imported Group Expense';
      const totalAmount = parseAmountValue(groupRow.total_amount ?? groupRow.totalAmount ?? groupRow.amount ?? groupRow.total) ?? 0;
      const date = parseDateValue(groupRow.date) ?? timestamp;
      const key = `${normalizeText(name)}|${toDateKey(date)}|${totalAmount.toFixed(2)}`;
      const exists = existingGroupExpenses.some((item) =>
        `${normalizeText(item.name)}|${toDateKey(new Date(item.date))}|${Number(item.totalAmount).toFixed(2)}` === key,
      );
      if (exists) continue;

      const members = (Array.isArray(groupRow.members) ? groupRow.members : [])
        .filter(isRecordObject)
        .map((memberRow) => {
          const friendExternalId = toDisplayValue(memberRow.friend_id ?? memberRow.friendId ?? memberRow.cid ?? memberRow.contact_id ?? memberRow.contactId);
          const friendId = friendExternalId ? friendExternalMap.get(normalizeText(friendExternalId)) : undefined;
          const friend = friendId != null ? existingFriends.find((item) => item.id === friendId) : undefined;
          const share = parseAmountValue(memberRow.share ?? memberRow.amount) ?? 0;
          const paid = normalizeText(toDisplayValue(memberRow.status)).includes('paid');
          return {
            name: friend?.name || toDisplayValue(memberRow.name) || 'Member',
            share,
            paid,
            friendId,
            email: friend?.email,
            phone: friend?.phone,
            paymentStatus: paid ? 'paid' as const : 'pending' as const,
          };
        });

      const paidByAccountId = fallbackAccount?.id ?? 0;
      if (!paidByAccountId) continue;

      const newGroupExpense: GroupExpense = {
        name,
        totalAmount,
        paidBy: paidByAccountId,
        date,
        members,
        splitType: 'custom',
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      await db.groupExpenses.add(newGroupExpense);
      existingGroupExpenses.push(newGroupExpense);
      createdGroupExpenses += 1;
    }

    return {
      createdAccounts: Array.from(new Set(createdAccounts)),
      createdGoals: Array.from(new Set(createdGoals)),
      updatedGoals: Array.from(new Set(updatedGoals)),
      createdFriends,
      createdLoans,
      updatedLoans,
      createdInvestments,
      updatedInvestments,
      createdGroupExpenses,
    };
  }

  private async createImportedGroupExpense(options: {
    accountId: number;
    amount: number;
    category: string;
    date: Date;
    description: string;
    groupData: ExtractedGroupData;
    transactionId: number;
    userId?: string;
    createdAt: Date;
  }) {
    const memberCount = Math.max(1, options.groupData.members.length + 1);
    const equalShare = Number((options.amount / memberCount).toFixed(2));
    const externalShares = options.groupData.members.reduce((sum, member) => sum + (member.share ?? 0), 0);
    const yourShare = options.groupData.splitType === 'custom'
      ? Math.max(0, Number((options.amount - externalShares).toFixed(2)))
      : equalShare;

    const members = [
      {
        name: 'You',
        share: yourShare,
        paid: true,
        isCurrentUser: true,
        paidAmount: yourShare,
        paymentStatus: 'paid' as const,
      },
      ...options.groupData.members.map((member) => ({
        name: member.name,
        share: member.share ?? equalShare,
        paid: false,
        paidAmount: 0,
        paymentStatus: 'pending' as const,
      })),
    ];

    return db.groupExpenses.add({
      name: options.groupData.name,
      totalAmount: options.amount,
      paidBy: options.accountId,
      date: options.date,
      members,
      description: options.description,
      category: options.category,
      splitType: options.groupData.splitType,
      yourShare,
      expenseTransactionId: options.transactionId,
      createdBy: options.userId,
      status: options.groupData.members.length > 0 ? 'pending' : 'settled',
      notificationStatus: 'pending',
      createdAt: options.createdAt,
      updatedAt: options.createdAt,
    });
  }
}

export const smartExpenseImportService = new SmartExpenseImportService();

