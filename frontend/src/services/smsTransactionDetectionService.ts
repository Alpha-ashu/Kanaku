import { App as CapacitorApp } from '@capacitor/app';
import {
  Capacitor,
  type PluginListenerHandle,
  registerPlugin,
} from '@capacitor/core';
import {
  detectExpenseCategoryFromText,
  normalizeCategorySelection,
} from '@/lib/expenseCategories';
import { createNotificationRecord } from '@/lib/notifications';
import {
  db,
  type Account,
  type SmsDetectedTransaction,
  type Transaction,
} from '@/lib/database';
import { financialDataCaptureService } from '@/services/financialDataCaptureService';

export const SMS_TRANSACTION_DRAFT_STORAGE_KEY = 'smsTransactionDraft';
const DEEP_LINK_SMS_TRANSACTION_ID_KEY = 'deepLink_smsTransactionId';
const SMS_DETECTION_ENABLED_SETTING_KEY = 'sms_detection_enabled';
const SMS_HISTORICAL_SCAN_COMPLETED_SETTING_KEY = 'sms_detection_historical_scan_completed';
const SMS_LAST_SCAN_AT_SETTING_KEY = 'sms_detection_last_scan_at';

type SmsPermissionState = 'prompt' | 'granted' | 'denied' | 'unavailable';

export interface NativeSmsTransaction {
  sourceSmsId: string;
  amount: number;
  transactionType: 'expense' | 'income';
  merchant?: string;
  bankName?: string;
  accountLast4?: string;
  currencyCode?: string;
  dateIso: string;
  balance?: number;
  sourceAddress?: string;
  sourceChannel?: string;
  messagePreview?: string;
  confidenceScore?: number;
}

export interface SmsDetectionStatus {
  supported: boolean;
  enabled: boolean;
  permissionState: SmsPermissionState;
  historicalScanCompleted: boolean;
  lastScanAt?: string;
}

export interface SmsDetectionEnableResult {
  status: SmsDetectionStatus;
  historicalScan: SmsSyncResult;
}

export interface SmsSyncResult {
  scanned: number;
  created: number;
  duplicates: number;
}

export interface SmsTransactionDraft {
  smsTransactionId: number;
  duplicateTransactionId?: number;
  linkedTransactionId?: number;
  type: 'expense' | 'income';
  amount: number;
  accountId?: number;
  category: string;
  subcategory?: string;
  description: string;
  merchant: string;
  date: string;
}

interface SmsDetectionPlugin {
  getStatus(): Promise<{ enabled: boolean; permissionState: SmsPermissionState; supported: boolean }>;
  requestSmsPermissions(): Promise<{ granted: boolean; permissionState: SmsPermissionState }>;
  setEnabled(options: { enabled: boolean }): Promise<{ enabled: boolean; permissionState: SmsPermissionState; supported: boolean }>;
  scanHistoricalMessages(options: { days?: number; limit?: number }): Promise<{ transactions: NativeSmsTransaction[] }>;
  getPendingTransactions(): Promise<{ transactions: NativeSmsTransaction[] }>;
  markTransactionHandled(options: { sourceSmsId: string; status?: string }): Promise<void>;
  addListener(
    eventName: 'smsTransactionDetected',
    listenerFunc: (event: { transaction: NativeSmsTransaction }) => void,
  ): Promise<PluginListenerHandle>;
}

const SmsDetection = registerPlugin<SmsDetectionPlugin>('SmsDetection');

let initialized = false;
let listenerHandle: PluginListenerHandle | null = null;
let appStateHandle: PluginListenerHandle | null = null;
let processingChain = Promise.resolve();

const normalizeLookup = (value?: string) =>
  (value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]/g, '');

const toDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toLocalDayKey = (date: Date) => toDateInputValue(date);

const formatMoney = (amount: number, currencyCode?: string) => {
  const safeCurrency = (currencyCode || 'INR').toUpperCase();

  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: safeCurrency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${safeCurrency} ${amount.toFixed(2)}`;
  }
};

const trimPreview = (value?: string) => {
  const preview = (value || '').trim().replace(/\s+/g, ' ');
  return preview.length > 180 ? `${preview.slice(0, 177)}...` : preview;
};

const getSetting = async <T,>(key: string, fallback: T): Promise<T> => {
  const record = await db.settings.get(key);
  return (record?.value as T | undefined) ?? fallback;
};

const putSetting = async (key: string, value: unknown) => {
  await db.settings.put({
    key,
    value,
    timestamp: new Date(),
  });
};

const isNativeAndroid = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

const parseSmsDate = (value?: string) => {
  const parsed = value ? new Date(value) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const normalizeMerchant = (transaction: NativeSmsTransaction) => {
  const merchant = transaction.merchant?.trim();
  if (merchant) return merchant;

  const bankName = transaction.bankName?.trim();
  if (bankName) return bankName;

  const sender = transaction.sourceAddress?.trim();
  if (sender) return sender;

  return transaction.transactionType === 'income' ? 'Incoming transfer' : 'Card / bank payment';
};

const matchAccount = (accounts: Account[], bankName?: string, accountLast4?: string) => {
  const normalizedBank = normalizeLookup(bankName);
  const normalizedLast4 = (accountLast4 || '').replace(/\D/g, '').slice(-4);
  const candidates = accounts.filter((account) => account.isActive);

  if (normalizedBank && normalizedLast4) {
    const exact = candidates.find((account) => {
      const haystack = normalizeLookup(account.name);
      return haystack.includes(normalizedBank) && haystack.includes(normalizedLast4);
    });
    if (exact?.id) return exact.id;
  }

  if (normalizedBank) {
    const byBank = candidates.find((account) => normalizeLookup(account.name).includes(normalizedBank));
    if (byBank?.id) return byBank.id;
  }

  if (normalizedLast4) {
    const byLast4 = candidates.find((account) => normalizeLookup(account.name).includes(normalizedLast4));
    if (byLast4?.id) return byLast4.id;
  }

  const preferred = candidates.find((account) => account.type === 'bank' || account.type === 'card');
  return preferred?.id ?? candidates[0]?.id;
};

const suggestIncomeCategory = (transaction: NativeSmsTransaction) => {
  const haystack = [
    transaction.merchant,
    transaction.bankName,
    transaction.sourceAddress,
    transaction.messagePreview,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (/(salary|payroll|wage|monthly salary)/.test(haystack)) {
    return { category: 'Salary', subcategory: 'Monthly Salary' };
  }

  if (/(refund|reversal|cashback|reimburs|chargeback)/.test(haystack)) {
    return { category: 'Gift & Refund', subcategory: 'Refund' };
  }

  if (/(interest|dividend|coupon)/.test(haystack)) {
    return { category: 'Investment Returns', subcategory: 'Interest' };
  }

  return { category: 'Other Income', subcategory: '' };
};

const suggestExpenseCategory = (transaction: NativeSmsTransaction) => {
  const detected = detectExpenseCategoryFromText(
    [
      transaction.merchant,
      transaction.bankName,
      transaction.sourceAddress,
      transaction.sourceChannel,
      transaction.messagePreview,
    ]
      .filter(Boolean)
      .join(' '),
  );

  if (!detected) {
    return { category: 'Miscellaneous', subcategory: '' };
  }

  return {
    category: normalizeCategorySelection(detected.category, 'expense'),
    subcategory: detected.subcategory,
  };
};

const buildDraftDescription = (record: SmsDetectedTransaction) => {
  const parts = ['SMS detected transaction'];
  if (record.bankName) parts.push(record.bankName);
  if (record.sourceChannel) parts.push(record.sourceChannel);
  return parts.join(' - ');
};

const buildDraftFromRecord = (record: SmsDetectedTransaction): SmsTransactionDraft => ({
  smsTransactionId: record.id!,
  duplicateTransactionId: record.duplicateTransactionId,
  linkedTransactionId: record.linkedTransactionId,
  type: record.transactionType,
  amount: record.amount,
  accountId: record.matchedAccountId,
  category: record.transactionType === 'expense'
    ? normalizeCategorySelection(record.suggestedCategory || 'Miscellaneous', 'expense')
    : normalizeCategorySelection(record.suggestedCategory || 'Other Income', 'income'),
  subcategory: record.suggestedSubcategory || '',
  description: buildDraftDescription(record),
  merchant: record.merchant,
  date: toDateInputValue(new Date(record.date)),
});

const findDuplicateTransaction = async (
  transaction: NativeSmsTransaction,
  merchant: string,
  matchedAccountId?: number,
) => {
  const smsDate = parseSmsDate(transaction.dateIso);
  const smsDayKey = toLocalDayKey(smsDate);
  const merchantKey = normalizeLookup(merchant);

  const candidates = await db.transactions
    .filter((candidate) => {
      if (candidate.type !== transaction.transactionType) return false;
      if (Math.abs(Number(candidate.amount) - Number(transaction.amount)) > 0.009) return false;
      if (toLocalDayKey(new Date(candidate.date)) !== smsDayKey) return false;
      if (matchedAccountId && candidate.accountId !== matchedAccountId) return false;
      return true;
    })
    .toArray();

  return candidates.find((candidate) => {
    const candidateMerchant = normalizeLookup(
      candidate.merchant || candidate.description || candidate.subcategory || candidate.category,
    );

    if (!merchantKey || !candidateMerchant) {
      return true;
    }

    return candidateMerchant.includes(merchantKey) || merchantKey.includes(candidateMerchant);
  });
};

const queueProcessing = <T,>(work: () => Promise<T>) => {
  const next = processingChain.then(work, work);
  processingChain = next.then(() => undefined, () => undefined);
  return next;
};

const createNotificationForSmsTransaction = async (record: SmsDetectedTransaction) => {
  const amountLabel = formatMoney(record.amount, record.currencyCode);
  const title = record.duplicateTransactionId
    ? 'Possible Duplicate Transaction Detected'
    : 'New Transaction Detected';
  const action = record.transactionType === 'income' ? 'received' : 'spent';

  await createNotificationRecord({
    type: 'message',
    title,
    message: `${amountLabel} ${action} at ${record.merchant}. ${record.duplicateTransactionId ? 'Review before adding.' : 'Add to your tracker?'}`,
    relatedId: record.id,
    deepLink: `/add-transaction?smsTransactionId=${record.id}`,
    metadata: {
      smsTransactionId: String(record.id),
      smsStatus: record.status,
    },
  });
};

const persistNativeTransaction = async (
  nativeTransaction: NativeSmsTransaction,
  notifyUser: boolean,
) => {
  if (!nativeTransaction.sourceSmsId) {
    return { created: false, duplicate: false };
  }

  const accounts = await db.accounts.toArray();
  const merchant = normalizeMerchant(nativeTransaction);
  const matchedAccountId = matchAccount(accounts, nativeTransaction.bankName, nativeTransaction.accountLast4);
  const duplicateTransaction = await findDuplicateTransaction(nativeTransaction, merchant, matchedAccountId);
  const suggestions = nativeTransaction.transactionType === 'income'
    ? suggestIncomeCategory(nativeTransaction)
    : suggestExpenseCategory(nativeTransaction);

  const existing = await db.smsTransactions.where('sourceSmsId').equals(nativeTransaction.sourceSmsId).first();
  const now = new Date();
  const nextRecord: SmsDetectedTransaction = {
    id: existing?.id,
    userId: existing?.userId,
    amount: Number(nativeTransaction.amount),
    merchant,
    bankName: nativeTransaction.bankName?.trim() || undefined,
    accountLast4: nativeTransaction.accountLast4?.trim() || undefined,
    transactionType: nativeTransaction.transactionType,
    currencyCode: (nativeTransaction.currencyCode || 'INR').toUpperCase(),
    date: parseSmsDate(nativeTransaction.dateIso),
    balance: nativeTransaction.balance,
    sourceSmsId: nativeTransaction.sourceSmsId,
    sourceAddress: nativeTransaction.sourceAddress?.trim() || undefined,
    sourceChannel: nativeTransaction.sourceChannel?.trim() || undefined,
    messagePreview: trimPreview(nativeTransaction.messagePreview),
    matchedAccountId,
    suggestedCategory: suggestions.category,
    suggestedSubcategory: suggestions.subcategory || undefined,
    duplicateTransactionId: duplicateTransaction?.id,
    linkedTransactionId: existing?.linkedTransactionId,
    status: existing?.status ?? 'detected',
    confidenceScore: nativeTransaction.confidenceScore ?? 0.84,
    detectedAt: existing?.detectedAt ?? now,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  let recordId = existing?.id;
  if (recordId) {
    await db.smsTransactions.put({ ...nextRecord, id: recordId });
  } else {
    recordId = await db.smsTransactions.add(nextRecord);
  }

  const savedRecord = { ...nextRecord, id: recordId };

  if (!existing && notifyUser && savedRecord.status === 'detected') {
    await createNotificationForSmsTransaction(savedRecord);
  }

  const lowConfidence = Number(savedRecord.confidenceScore || 0) < 0.78;
  const uncertainCategory = !savedRecord.suggestedCategory || /^(miscellaneous|others?)$/i.test(savedRecord.suggestedCategory);
  if (savedRecord.id && savedRecord.status === 'detected' && (lowConfidence || uncertainCategory)) {
    await financialDataCaptureService.enqueueAiTask('sms-ai-parse', {
      smsTransactionId: savedRecord.id,
      userId: savedRecord.userId,
      accountId: savedRecord.matchedAccountId,
      amount: savedRecord.amount,
      type: savedRecord.transactionType,
      merchant: savedRecord.merchant,
      text: savedRecord.messagePreview,
      category: savedRecord.suggestedCategory,
      subcategory: savedRecord.suggestedSubcategory,
      confidence: savedRecord.confidenceScore,
    }, { processNow: true });
  }

  return {
    created: !existing,
    duplicate: Boolean(savedRecord.duplicateTransactionId),
  };
};

const persistNativeTransactions = async (
  nativeTransactions: NativeSmsTransaction[],
  notifyUser: boolean,
) => {
  let created = 0;
  let duplicates = 0;

  for (const nativeTransaction of nativeTransactions) {
    const result = await persistNativeTransaction(nativeTransaction, notifyUser);
    if (result.created) created += 1;
    if (result.duplicate) duplicates += 1;
  }

  return {
    scanned: nativeTransactions.length,
    created,
    duplicates,
  };
};

const syncPendingNativeTransactions = async () => {
  if (!isNativeAndroid()) return;

  const enabled = await getSetting(SMS_DETECTION_ENABLED_SETTING_KEY, false);
  if (!enabled) return;

  try {
    const { transactions } = await SmsDetection.getPendingTransactions();
    if (!transactions?.length) return;

    await persistNativeTransactions(transactions, true);

    await Promise.all(
      transactions.map((transaction) =>
        SmsDetection.markTransactionHandled({
          sourceSmsId: transaction.sourceSmsId,
          status: 'processed',
        })),
    );
  } catch (error) {
    console.error('Failed to sync pending SMS transactions:', error);
  }
};

const ensureSmsListeners = async () => {
  if (!isNativeAndroid() || initialized) return;

  listenerHandle = await SmsDetection.addListener('smsTransactionDetected', ({ transaction }) => {
    void queueProcessing(async () => {
      await persistNativeTransactions([transaction], true);
      await SmsDetection.markTransactionHandled({
        sourceSmsId: transaction.sourceSmsId,
        status: 'processed',
      });
    });
  });

  appStateHandle = await CapacitorApp.addListener('appStateChange', ({ isActive }) => {
    if (isActive) {
      void queueProcessing(syncPendingNativeTransactions);
    }
  });

  initialized = true;
};

export const isSmsDetectionSupported = () => isNativeAndroid();

export const getSmsDetectionStatus = async (): Promise<SmsDetectionStatus> => {
  const historicalScanCompleted = await getSetting(SMS_HISTORICAL_SCAN_COMPLETED_SETTING_KEY, false);
  const lastScanAt = await getSetting<string | undefined>(SMS_LAST_SCAN_AT_SETTING_KEY, undefined);

  if (!isNativeAndroid()) {
    return {
      supported: false,
      enabled: false,
      permissionState: 'unavailable',
      historicalScanCompleted,
      lastScanAt,
    };
  }

  try {
    const status = await SmsDetection.getStatus();
    return {
      supported: status.supported,
      enabled: status.enabled,
      permissionState: status.permissionState,
      historicalScanCompleted,
      lastScanAt,
    };
  } catch (error) {
    console.error('Failed to read SMS detection status:', error);
    return {
      supported: false,
      enabled: false,
      permissionState: 'unavailable',
      historicalScanCompleted,
      lastScanAt,
    };
  }
};

export const initializeSmsTransactionDetection = async () => {
  if (!isNativeAndroid()) {
    return getSmsDetectionStatus();
  }

  await ensureSmsListeners();
  await queueProcessing(syncPendingNativeTransactions);
  return getSmsDetectionStatus();
};

export const enableSmsTransactionDetection = async (
  historicalDays = 30,
): Promise<SmsDetectionEnableResult> => {
  if (!isNativeAndroid()) {
    return {
      status: await getSmsDetectionStatus(),
      historicalScan: { scanned: 0, created: 0, duplicates: 0 },
    };
  }

  const permission = await SmsDetection.requestSmsPermissions();
  if (!permission.granted) {
    await putSetting(SMS_DETECTION_ENABLED_SETTING_KEY, false);
    return {
      status: await getSmsDetectionStatus(),
      historicalScan: { scanned: 0, created: 0, duplicates: 0 },
    };
  }

  await SmsDetection.setEnabled({ enabled: true });
  await putSetting(SMS_DETECTION_ENABLED_SETTING_KEY, true);
  await ensureSmsListeners();

  const historicalScanCompleted = await getSetting(SMS_HISTORICAL_SCAN_COMPLETED_SETTING_KEY, false);
  const historicalScan = historicalScanCompleted
    ? { scanned: 0, created: 0, duplicates: 0 }
    : await scanHistoricalSmsTransactions(historicalDays, 300);

  return {
    status: await getSmsDetectionStatus(),
    historicalScan,
  };
};

export const disableSmsTransactionDetection = async () => {
  await putSetting(SMS_DETECTION_ENABLED_SETTING_KEY, false);

  if (isNativeAndroid()) {
    await SmsDetection.setEnabled({ enabled: false });
  }

  return getSmsDetectionStatus();
};

export const scanHistoricalSmsTransactions = async (
  days = 30,
  limit = 300,
) => {
  if (!isNativeAndroid()) {
    return { scanned: 0, created: 0, duplicates: 0 };
  }

  const { transactions } = await SmsDetection.scanHistoricalMessages({ days, limit });
  const result = await persistNativeTransactions(transactions || [], false);

  await putSetting(SMS_HISTORICAL_SCAN_COMPLETED_SETTING_KEY, true);
  await putSetting(SMS_LAST_SCAN_AT_SETTING_KEY, new Date().toISOString());

  return result;
};

export const clearSmsDetectedTransactions = async () => {
  await db.smsTransactions.clear();
};

export const markSmsTransactionIgnored = async (id: number) => {
  await db.smsTransactions.update(id, {
    status: 'ignored',
    updatedAt: new Date(),
  });
};

export const markSmsTransactionImported = async (id: number, linkedTransactionId?: number) => {
  await db.smsTransactions.update(id, {
    status: 'imported',
    linkedTransactionId,
    updatedAt: new Date(),
  });
};

export const updateSmsTransactionDirection = async (id: number, direction: 'expense' | 'income' | 'transfer' | string) => {
  await db.smsTransactions.update(id, {
    transactionType: direction === 'income' ? 'income' : 'expense',
    updatedAt: new Date(),
  });
};

export const primeSmsTransactionDraft = async (id: number) => {
  const record = await db.smsTransactions.get(id);
  if (!record?.id) return null;

  const draft = buildDraftFromRecord(record);
  localStorage.setItem(SMS_TRANSACTION_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  return draft;
};

export const resolvePendingSmsTransactionDraft = async () => {
  const deepLinkId = Number(localStorage.getItem(DEEP_LINK_SMS_TRANSACTION_ID_KEY) || '');
  if (Number.isFinite(deepLinkId) && deepLinkId > 0) {
    localStorage.removeItem(DEEP_LINK_SMS_TRANSACTION_ID_KEY);
    const deepLinkedRecord = await db.smsTransactions.get(deepLinkId);
    if (deepLinkedRecord?.id) {
      return buildDraftFromRecord(deepLinkedRecord);
    }
  } else {
    localStorage.removeItem(DEEP_LINK_SMS_TRANSACTION_ID_KEY);
  }

  const rawDraft = localStorage.getItem(SMS_TRANSACTION_DRAFT_STORAGE_KEY);
  if (!rawDraft) return null;

  localStorage.removeItem(SMS_TRANSACTION_DRAFT_STORAGE_KEY);

  try {
    return JSON.parse(rawDraft) as SmsTransactionDraft;
  } catch (error) {
    console.error('Failed to parse SMS transaction draft:', error);
    return null;
  }
};

export const getSmsTransactionRecord = async (id: number) => {
  return db.smsTransactions.get(id);
};

export const getSmsToggleState = async () => {
  return getSetting(SMS_DETECTION_ENABLED_SETTING_KEY, false);
};

export const describeSmsTransaction = (record: SmsDetectedTransaction) => {
  const amountLabel = formatMoney(record.amount, record.currencyCode);
  const action = record.transactionType === 'income' ? 'received' : 'spent';
  return `${amountLabel} ${action} at ${record.merchant}`;
};

export const parseSmsTextToTransaction = async (text: string): Promise<NativeSmsTransaction | null> => {
  if (!text || !text.trim()) return null;
  const compact = text.trim().replace(/\s+/g, ' ');
  const lowered = compact.toLowerCase();

  const amountPatterns = [
    /(?:rs\.?|inr|₹)\s*([0-9,]+(?:\.\d{1,2})?)\s+(?:has\s+been\s+)?(?:debited|credited|spent|received|paid|withdrawn|sent|transferred)/i,
    /(?:debited|credited|spent|received|paid|withdrawn|sent|transferred)\D{0,18}(?:rs\.?|inr|₹)\s*([0-9,]+(?:\.\d{1,2})?)/i,
    /(?:amt|amount)\D{0,8}(?:rs\.?|inr|₹)\s*([0-9,]+(?:\.\d{1,2})?)/i,
    /(?:rs\.?|inr|₹)\s*([0-9,]+(?:\.\d{1,2})?)/i,
  ];

  let amount: number | null = null;
  for (const pattern of amountPatterns) {
    const match = compact.match(pattern);
    if (match && match[1]) {
      const parsed = parseFloat(match[1].replace(/,/g, ''));
      if (Number.isFinite(parsed) && parsed > 0) {
        amount = parsed;
        break;
      }
    }
  }

  if (!amount) return null;

  const isDebit = /debited|spent|withdrawn|purchase|paid\s+to|paid\s+at|sent\s+to|transferred\s+to|sent\s+rs|sent\s+inr/i.test(lowered);
  const isCredit = /credited|deposited|received\s+from|received\s+rs|received\s+inr|received/i.test(lowered);
  const transactionType: 'income' | 'expense' = isDebit ? 'expense' : (isCredit ? 'income' : 'expense');

  let merchant = 'Bank Alert';
  const merchantPatterns = transactionType === 'income'
    ? [
        /from\s+([A-Za-z0-9&.,'\- ]{2,40}?)(?=\s+(?:on|ref|utr|txn|txnid|avl|available|balance|via|$)|[.,])/i,
        /by\s+([A-Za-z0-9&.,'\- ]{2,40}?)(?=\s+(?:on|ref|utr|txn|avl|available|balance|via|$)|[.,])/i,
      ]
    : [
        /(?:via\s+(?:upi|imps|neft)\s+to|to)\s+([A-Za-z0-9&.,'\- ]{2,40}?)(?=\s+(?:on|ref|utr|txn|txnid|avl|available|balance|from|via|$)|[.,])/i,
        /at\s+([A-Za-z0-9&.,'\- ]{2,40}?)(?=\s+(?:on|ref|utr|txn|txnid|avl|available|balance|from|via|$)|[.,])/i,
      ];

  for (const pattern of merchantPatterns) {
    const match = compact.match(pattern);
    if (match && match[1]) {
      merchant = match[1].trim();
      break;
    }
  }

  const bankMatches = compact.match(/\b(HDFC|ICICI|SBI|AXIS|KOTAK|YESBANK|IDFC|HSBC|CHASE|CITI|AMEX|BOB|CANARA|PNB|FEDERAL|INDUSIND|UNION|BANDHAN|RBL|AUBANK|PAYTM|PHONEPE|GPAY|CRED|SLICE|FI|JUPITER|UPI)\b/i);
  const bankName = bankMatches ? bankMatches[1].toUpperCase() : undefined;

  const accountMatch = compact.match(/(?:a\/c|acct|account|card)\s*(?:no\.?|number)?\s*[:\-]?\s*[xX*]{0,8}(\d{3,8})/i);
  const accountLast4 = accountMatch ? accountMatch[1] : undefined;

  const sourceSmsId = `manual_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  return {
    sourceSmsId,
    amount,
    transactionType,
    merchant,
    bankName,
    accountLast4,
    currencyCode: 'INR',
    dateIso: new Date().toISOString(),
    sourceAddress: 'Manual Paste',
    sourceChannel: 'manual',
    messagePreview: compact.slice(0, 180),
    confidenceScore: 0.95,
  };
};

export const importManualSmsText = async (text: string): Promise<SmsDetectedTransaction | null> => {
  const native = await parseSmsTextToTransaction(text);
  if (!native) return null;
  await persistNativeTransaction(native, true);
  const record = await db.smsTransactions.where('sourceSmsId').equals(native.sourceSmsId).first();
  return record ?? null;
};
