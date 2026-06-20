import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
 AlertTriangle,
 CheckCircle2,
 Database,
 FileJson,
 FileSpreadsheet,
 Loader2,
 RefreshCcw,
 Upload,
 X,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { type Account, db } from '@/lib/database';
import { INCOME_CATEGORIES, getExpenseCategoryNames } from '@/lib/expenseCategories';
import {
 smartExpenseImportService,
 type ImportPreviewRow,
 type SmartImportPreview,
 type ThirdPartyImportResult,
} from '@/services/smartExpenseImportService';

interface ImportDataModalProps {
 accounts: Account[];
 userId?: string;
 onClose: () => void;
 onImported?: () => void;
}

const formatAmount = (amount: number) =>
 new Intl.NumberFormat('en-IN', {
 style: 'currency',
 currency: 'INR',
 maximumFractionDigits: 2,
 }).format(amount || 0);

const formatDate = (date: Date | null) =>
 date
 ? date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
 : 'Invalid date';

const BUILTIN_EXPENSE_CATEGORIES = getExpenseCategoryNames();
const BUILTIN_INCOME_CATEGORIES = Object.values(INCOME_CATEGORIES).map((category) => category.name);

export const ImportDataModal: React.FC<ImportDataModalProps> = ({
 accounts,
 userId,
 onClose,
 onImported,
}) => {
 const fileInputRef = useRef<HTMLInputElement | null>(null);
 const closeButtonRef = useRef<HTMLButtonElement | null>(null);
 const modalRef = useRef<HTMLDivElement | null>(null);
 const [selectedFile, setSelectedFile] = useState<File | null>(null);
 const [preview, setPreview] = useState<SmartImportPreview | null>(null);
 const [rows, setRows] = useState<ImportPreviewRow[]>([]);

 // Merge built-in categories with any user-created custom categories from prior imports
 const dbCustomCategories = useLiveQuery(
 () => db.categories.filter((c) => !c.deletedAt).toArray(),
 [],
 ) ?? [];
 const expenseCategoryOptions = useMemo(() => [
 ...BUILTIN_EXPENSE_CATEGORIES,
 ...dbCustomCategories
 .filter((c) => c.type === 'expense' && !BUILTIN_EXPENSE_CATEGORIES.includes(c.name))
 .map((c) => c.name),
 ], [dbCustomCategories]);
 const incomeCategoryOptions = useMemo(() => [
 ...BUILTIN_INCOME_CATEGORIES,
 ...dbCustomCategories
 .filter((c) => c.type === 'income' && !BUILTIN_INCOME_CATEGORIES.includes(c.name))
 .map((c) => c.name),
 ], [dbCustomCategories]);
 const [fallbackAccountId, setFallbackAccountId] = useState<number>(accounts[0]?.id ?? 0);
 const [skipDuplicates, setSkipDuplicates] = useState(true);
 const [isParsing, setIsParsing] = useState(false);
 const [isImporting, setIsImporting] = useState(false);
 const [importReport, setImportReport] = useState<ThirdPartyImportResult | null>(null);

 const visibleRows = useMemo(() => rows.slice(0, 120), [rows]);

 const resetImportState = () => {
 setSelectedFile(null);
 setPreview(null);
 setRows([]);
 setImportReport(null);
 setIsParsing(false);
 setIsImporting(false);
 };

 const handleFileSelection = async (file: File) => {
 if (!file.name.match(/\.(csv|json)$/i)) {
 toast.error('Select a CSV or JSON file');
 return;
 }

 if (file.size > 20 * 1024 * 1024) {
 toast.error('File size must be under 20MB');
 return;
 }

 setSelectedFile(file);
 setPreview(null);
 setRows([]);
 setImportReport(null);
 setIsParsing(true);

 try {
 const nextPreview = await smartExpenseImportService.analyzeFile(file, {
 defaultAccountId: fallbackAccountId,
 });
 setPreview(nextPreview);
 if (nextPreview.kind === 'third-party') {
 setRows(nextPreview.rows);
 }
 } catch (error) {
 console.error('Import preview failed:', error);
 toast.error('Could not read this file');
 } finally {
 setIsParsing(false);
 }
 };

 const handleFallbackAccountChange = (accountId: number) => {
 setFallbackAccountId(accountId);
 const fallbackAccount = accounts.find((account) => account.id === accountId);
 setRows((currentRows) => currentRows.map((row) => (
 row.accountResolution === 'fallback'
 ? {
 ...row,
 accountId,
 resolvedAccountName: fallbackAccount?.name ?? row.resolvedAccountName,
 }
 : row
 )));
 };

 const handleCategoryChange = (rowId: string, category: string) => {
 setRows((currentRows) =>
 currentRows.map((row) =>
 row.id === rowId
 ? {
 ...row,
 category,
 categoryResolution: 'manual',
 }
 : row,
 ),
 );
 };

 const handleImport = async () => {
 if (!selectedFile || !preview) return;

 setIsImporting(true);

 try {
 if (preview.kind === 'backup') {
 if (!window.confirm('This backup restore will replace all existing local data. Continue?')) {
 setIsImporting(false);
 return;
 }

 await smartExpenseImportService.restoreBackup({
 fileName: selectedFile.name,
 jsonText: await selectedFile.text(),
 userId,
 });

 toast.success('Backup restored successfully');
 onImported?.();
 onClose();
 window.location.reload();
 return;
 }

 const result = await smartExpenseImportService.applyPreviewImport({
 rows,
 fileName: selectedFile.name,
 fileType: preview.fileType,
 skipDuplicates,
 userId,
 });

 setImportReport(result);
 toast.success(`Imported ${result.importedCount} record${result.importedCount === 1 ? '' : 's'}`);
 onImported?.();
 } catch (error) {
 console.error('Import failed:', error);
 toast.error('Import failed');
 } finally {
 setIsImporting(false);
 }
 };

 const canImportThirdParty = rows.some((row) => row.errors.length === 0 && (!skipDuplicates || !row.duplicate));

 const liveStatusMessage = useMemo(() => {
 if (isImporting) return 'Import in progress. Please wait.';
 if (isParsing) return 'Preparing import preview and validating rows.';
 if (importReport) {
 return `Import completed. Imported ${importReport.importedCount} records, skipped ${importReport.duplicateCount} duplicates, and failed ${importReport.failedCount}.`;
 }
 if (selectedFile && preview?.kind === 'third-party') {
 return `Preview ready. ${rows.length} rows loaded.`;
 }
 if (selectedFile && preview?.kind === 'backup') {
 return 'Backup file detected. Restoring will replace local data.';
 }
 return 'Choose a CSV or JSON file to begin smart import.';
 }, [importReport, isImporting, isParsing, preview?.kind, rows.length, selectedFile]);

 useEffect(() => {
 const previouslyFocused = document.activeElement as HTMLElement | null;
 const previousOverflow = document.body.style.overflow;
 document.body.style.overflow = 'hidden';

 closeButtonRef.current?.focus();

 const getFocusableElements = () => {
 if (!modalRef.current) return [];

 return Array.from(
 modalRef.current.querySelectorAll<HTMLElement>(
 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
 ),
 ).filter((element) => !element.hasAttribute('disabled') && !element.getAttribute('aria-hidden') && element.offsetParent !== null);
 };

 const onKeyDown = (event: KeyboardEvent) => {
 if (event.key === 'Escape') {
 event.preventDefault();
 onClose();
 return;
 }

 if (event.key !== 'Tab') return;

 const focusables = getFocusableElements();
 if (focusables.length === 0) {
 event.preventDefault();
 closeButtonRef.current?.focus();
 return;
 }

 const first = focusables[0];
 const last = focusables[focusables.length - 1];
 const activeElement = document.activeElement as HTMLElement | null;
 const isInsideModal = activeElement ? modalRef.current?.contains(activeElement) : false;

 if (event.shiftKey) {
 if (!isInsideModal || activeElement === first) {
 event.preventDefault();
 last.focus();
 }
 return;
 }

 if (!isInsideModal || activeElement === last) {
 event.preventDefault();
 first.focus();
 }
 };

 window.addEventListener('keydown', onKeyDown);
 return () => {
 window.removeEventListener('keydown', onKeyDown);
 document.body.style.overflow = previousOverflow;
 previouslyFocused?.focus();
 };
 }, [onClose]);

 const openFilePicker = () => fileInputRef.current?.click();

 const getRowStatusBadge = (row: ImportPreviewRow) => {
 if (row.errors.length > 0) {
 return (
 <div className="inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
 <AlertTriangle size={14} />
 {row.errors.join(', ')}
 </div>
 );
 }

 if (row.duplicate) {
 return (
 <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
 <RefreshCcw size={14} />
 Duplicate
 </div>
 );
 }

 return (
 <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
 <CheckCircle2 size={14} />
 {row.accountResolution === 'created' || row.accountResolution === 'payment-method'
 ? 'Will create account'
 : row.categoryResolution === 'created'
 ? 'New category'
 : row.categoryResolution === 'mapped'
 ? 'Will map'
 : row.categoryResolution === 'detected'
 ? 'Auto-detected'
 : row.categoryResolution === 'manual'
 ? 'Manually set'
 : 'Ready'}
 </div>
 );
 };

 return (
 <div
 className="fixed inset-0 z-[300] bg-black/60 p-3 pb-24 sm:p-6 sm:pb-6"
 onMouseDown={(event) => {
 if (event.target === event.currentTarget) {
 onClose();
 }
 }}
 >
 <motion.div data-testid="import-data-modal-div"
 ref={modalRef}
 initial={{ opacity: 0, y: 16, scale: 0.98 }}
 animate={{ opacity: 1, y: 0, scale: 1 }}
 exit={{ opacity: 0, y: 12, scale: 0.98 }}
 role="dialog"
 aria-modal="true"
 aria-labelledby="smart-import-title"
 aria-describedby="smart-import-description"
 className="mx-auto flex h-[calc(100dvh-7.5rem)] sm:h-[min(94vh,980px)] max-w-6xl flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl"
 >
 <div aria-live="polite" aria-atomic="true" className="sr-only">
 {liveStatusMessage}
 </div>

 <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4 sm:px-6">
 <div>
 <h3 id="smart-import-title" className="text-xl font-semibold text-gray-900">Smart Import</h3>
 <p id="smart-import-description" className="mt-1 text-sm text-gray-600">
 Import CSV or JSON from other expense trackers with preview, mapping, and duplicate checks.
 </p>
 </div>
 <button data-testid="import-data-modal-close-import-modal"
 ref={closeButtonRef}
 type="button"
 onClick={onClose}
 className="flex h-11 w-11 items-center justify-center rounded-2xl border border-gray-200 text-gray-600 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-black/15"
 aria-label="Close import modal"
 >
 <X size={18} />
 </button>
 </div>

 <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6" aria-busy={isParsing || isImporting ? 'true' : 'false'}>
 {importReport && (
 <div className="space-y-5">
 <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 px-5 py-4">
 <div className="flex items-start gap-3">
 <div className="mt-0.5 rounded-2xl bg-emerald-100 p-2 text-emerald-700">
 <CheckCircle2 size={18} />
 </div>
 <div>
 <h4 className="font-semibold text-emerald-900">Import completed</h4>
 <p className="mt-1 text-sm text-emerald-800">
 Transactions, accounts, and dependent modules were updated from this file.
 </p>
 </div>
 </div>
 </div>

 <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
 <div className="rounded-[24px] border border-gray-200 bg-white px-4 py-4">
 <p className="text-xs font-bold uppercase tracking-[0.22em] text-gray-400">Imported</p>
 <p className="mt-2 text-2xl font-semibold text-gray-900">{importReport.importedCount}</p>
 </div>
 <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-4">
 <p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-600">Duplicates Ignored</p>
 <p className="mt-2 text-2xl font-semibold text-amber-900">{importReport.duplicateCount}</p>
 </div>
 <div className="rounded-[24px] border border-red-200 bg-red-50 px-4 py-4">
 <p className="text-xs font-bold uppercase tracking-[0.22em] text-red-500">Failed</p>
 <p className="mt-2 text-2xl font-semibold text-red-700">{importReport.failedCount}</p>
 </div>
 <div className="rounded-[24px] border border-sky-200 bg-sky-50 px-4 py-4">
 <p className="text-xs font-bold uppercase tracking-[0.22em] text-sky-600">Accounts Created</p>
 <p className="mt-2 text-2xl font-semibold text-sky-900">{importReport.createdAccounts.length}</p>
 </div>
 <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 px-4 py-4">
 <p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-600">Categories Created</p>
 <p className="mt-2 text-2xl font-semibold text-emerald-800">{importReport.createdCategories.length}</p>
 </div>
 <div className="rounded-[24px] border border-violet-200 bg-violet-50 px-4 py-4">
 <p className="text-xs font-bold uppercase tracking-[0.22em] text-violet-600">Group Expenses</p>
 <p className="mt-2 text-2xl font-semibold text-violet-900">{importReport.createdGroupExpenses}</p>
 </div>
 <div className="rounded-[24px] border border-indigo-200 bg-indigo-50 px-4 py-4">
 <p className="text-xs font-bold uppercase tracking-[0.22em] text-indigo-600">Friends Added</p>
 <p className="mt-2 text-2xl font-semibold text-indigo-900">{importReport.createdFriends}</p>
 </div>
 <div className="rounded-[24px] border border-orange-200 bg-orange-50 px-4 py-4">
 <p className="text-xs font-bold uppercase tracking-[0.22em] text-orange-600">Loans (New / Updated)</p>
 <p className="mt-2 text-2xl font-semibold text-orange-900">{importReport.createdLoans} / {importReport.updatedLoans}</p>
 </div>
 <div className="rounded-[24px] border border-cyan-200 bg-cyan-50 px-4 py-4">
 <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-600">Investments (New / Updated)</p>
 <p className="mt-2 text-2xl font-semibold text-cyan-900">{importReport.createdInvestments} / {importReport.updatedInvestments}</p>
 </div>
 </div>

 {(importReport.createdAccounts.length > 0 || importReport.createdCategories.length > 0 || importReport.updatedGoals.length > 0) && (
 <div className="grid gap-4 lg:grid-cols-3">
 {importReport.createdAccounts.length > 0 && (
 <div className="rounded-[24px] border border-gray-200 bg-white px-4 py-4">
 <h5 className="text-sm font-semibold text-gray-900">Accounts Created</h5>
 <p className="mt-2 text-sm text-gray-600">{importReport.createdAccounts.join(', ')}</p>
 </div>
 )}
 {importReport.createdCategories.length > 0 && (
 <div className="rounded-[24px] border border-gray-200 bg-white px-4 py-4">
 <h5 className="text-sm font-semibold text-gray-900">Categories Created</h5>
 <p className="mt-2 text-sm text-gray-600">{importReport.createdCategories.join(', ')}</p>
 </div>
 )}
 {importReport.updatedGoals.length > 0 && (
 <div className="rounded-[24px] border border-gray-200 bg-white px-4 py-4">
 <h5 className="text-sm font-semibold text-gray-900">Goals Updated</h5>
 <p className="mt-2 text-sm text-gray-600">{importReport.updatedGoals.join(', ')}</p>
 </div>
 )}
 </div>
 )}
 </div>
 )}

 {!importReport && !selectedFile && !isParsing && (
 <div data-testid="import-data-modal-upload-a-csv-or"
 className="flex h-full min-h-[360px] flex-col items-center justify-center rounded-[28px] border-2 border-dashed border-gray-300 bg-white/90 px-6 py-10 text-center sm:py-16"
 role="button"
 tabIndex={0}
 onClick={openFilePicker}
 onKeyDown={(event) => {
 if (event.key === 'Enter' || event.key === ' ') {
 event.preventDefault();
 openFilePicker();
 }
 }}
 aria-label="Upload a CSV or JSON file to start smart import"
 >
 <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-black text-white shadow-lg">
 <Upload size={24} />
 </div>
 <h4 className="text-lg font-semibold text-gray-900">Import transactions from another app</h4>
 <p className="mt-2 max-w-xl text-sm text-gray-600">
 Supports CSV and JSON. We preview rows first, map categories, preserve extra fields in metadata,
 and only then import.
 </p>
 <span
 aria-hidden="true"
 className="mt-6 inline-block min-h-11 rounded-full bg-black px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-900"
 >
 Choose file
 </span>
 <p className="mt-3 text-xs text-gray-500">Maximum size: 20MB</p>
 </div>
 )}

 {isParsing && (
 <div data-testid="import-data-modal-div-2" className="flex h-full flex-col items-center justify-center py-16 text-center" role="status" aria-live="polite">
 <Loader2 size={36} className="animate-spin text-gray-500" />
 <h4 className="mt-4 text-lg font-semibold text-gray-900">Preparing preview</h4>
 <p className="mt-1 text-sm text-gray-500">Parsing rows, matching categories, and checking duplicates.</p>
 </div>
 )}

 {!importReport && selectedFile && preview?.kind === 'backup' && !isParsing && (
 <div className="space-y-5">
 <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-5 py-4">
 <div className="flex items-start gap-3">
 <div className="mt-0.5 rounded-2xl bg-amber-100 p-2 text-amber-700">
 <Database size={18} />
 </div>
 <div>
 <h4 className="font-semibold text-amber-900">KANAKUbackup detected</h4>
 <p className="mt-1 text-sm text-amber-800">
 Restoring this file will replace your current local data.
 </p>
 </div>
 </div>
 </div>

 <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
 {preview.counts.map((item) => (
 <div key={item.label} className="rounded-[24px] border border-gray-200 bg-white px-4 py-4">
 <p className="text-xs font-bold uppercase tracking-[0.22em] text-gray-400">{item.label}</p>
 <p className="mt-2 text-2xl font-semibold text-gray-900">{item.count}</p>
 </div>
 ))}
 </div>

 <div className="rounded-[24px] border border-gray-200 bg-white px-5 py-4">
 <div className="flex flex-wrap gap-6 text-sm text-gray-600">
 <div>
 <span className="font-medium text-gray-900">File:</span> {preview.fileName}
 </div>
 {preview.version && (
 <div>
 <span className="font-medium text-gray-900">Version:</span> {preview.version}
 </div>
 )}
 {preview.exportedAt && (
 <div>
 <span className="font-medium text-gray-900">Exported:</span>{' '}
 {new Date(preview.exportedAt).toLocaleString('en-IN')}
 </div>
 )}
 </div>
 </div>
 </div>
 )}

 {!importReport && selectedFile && preview?.kind === 'third-party' && !isParsing && (
 <div className="space-y-5">
 {accounts.length === 0 && (
 <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
 No accounts exist yet. The importer will create accounts automatically from the file or use a generic imported account when needed.
 </div>
 )}

 <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
 <div className="rounded-[24px] border border-gray-200 bg-white px-4 py-4">
 <p className="text-xs font-bold uppercase tracking-[0.22em] text-gray-400">Ready</p>
 <p className="mt-2 text-2xl font-semibold text-gray-900">{preview.summary.readyRecords}</p>
 </div>
 <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-4">
 <p className="text-xs font-bold uppercase tracking-[0.22em] text-amber-600">Duplicates</p>
 <p className="mt-2 text-2xl font-semibold text-amber-900">{preview.summary.duplicateRecords}</p>
 </div>
 <div className="rounded-[24px] border border-red-200 bg-red-50 px-4 py-4">
 <p className="text-xs font-bold uppercase tracking-[0.22em] text-red-500">Invalid</p>
 <p className="mt-2 text-2xl font-semibold text-red-700">{preview.summary.invalidRecords}</p>
 </div>
 <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 px-4 py-4">
 <p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-600">New Categories</p>
 <p className="mt-2 text-2xl font-semibold text-emerald-800">{preview.summary.createdCategories.length}</p>
 </div>
 <div className="rounded-[24px] border border-sky-200 bg-sky-50 px-4 py-4">
 <p className="text-xs font-bold uppercase tracking-[0.22em] text-sky-600">New Accounts</p>
 <p className="mt-2 text-2xl font-semibold text-sky-900">{preview.summary.createdAccounts.length}</p>
 </div>
 </div>

 <div className="grid gap-4 rounded-[28px] border border-gray-200 bg-white/80 p-4 lg:grid-cols-[1.2fr_0.8fr]">
 <div>
 <p className="text-xs font-bold uppercase tracking-[0.22em] text-gray-400">Import Into Account</p>
 {accounts.length > 0 ? (
 <select data-testid="import-data-modal-select-import-target-account"
 value={fallbackAccountId}
 onChange={(event) => handleFallbackAccountChange(Number(event.target.value))}
 className="mt-2 h-12 w-full rounded-2xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 outline-none transition focus:border-black/20 focus:ring-4 focus:ring-black/10"
 aria-label="Select import target account"
 >
 {accounts.map((account) => (
 <option data-testid={`import-data-modal-option-${account.id}`} key={account.id} value={account.id}>
 {account.name} ({account.currency} {account.balance.toFixed(2)})
 </option>
 ))}
 </select>
 ) : (
 <div className="mt-2 rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
 Rows without an account hint will be assigned to an imported fallback account automatically.
 </div>
 )}
 <p className="mt-2 text-xs text-gray-500">
 Explicit account and payment method fields will create or map accounts automatically. Other extra fields are preserved in metadata.
 </p>
 </div>

 <div className="flex flex-col justify-between rounded-[24px] border border-gray-200 bg-white px-4 py-4">
 <label className="flex items-center gap-3 text-sm font-medium text-gray-700">
 <input data-testid="import-data-modal-checkbox"
 type="checkbox"
 checked={skipDuplicates}
 onChange={(event) => setSkipDuplicates(event.target.checked)}
 className="h-5 w-5 rounded border-gray-300 text-black focus:ring-black"
 aria-describedby="duplicate-rule-help"
 />
 Skip duplicate rows on import
 </label>
 <div id="duplicate-rule-help" className="mt-3 text-xs text-gray-500">
 Duplicate rule: same date + amount + description.
 </div>
 </div>
 </div>

 {preview.errors.length > 0 && (
 <div className="rounded-[24px] border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
 {preview.errors.map((error) => (
 <div key={error}>{error}</div>
 ))}
 </div>
 )}

 <div className="overflow-hidden rounded-[28px] border border-gray-200 bg-white">
 <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
 <div>
 <h4 className="font-semibold text-gray-900">Import Preview</h4>
 <p className="text-sm text-gray-600">
 Review mappings before import. Showing {visibleRows.length} of {rows.length} rows.
 </p>
 </div>
 <button data-testid="import-data-modal-re-scan"
 type="button"
 onClick={() => selectedFile && handleFileSelection(selectedFile)}
 className="flex min-h-10 items-center gap-2 rounded-full border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-black/10"
 >
 <RefreshCcw size={14} />
 Re-scan
 </button>
 </div>

 <div className="max-h-[48vh] overflow-auto lg:hidden p-3 space-y-3 bg-white/40">
 {visibleRows.map((row) => (
 <div key={row.id} className="rounded-2xl border border-gray-200 bg-white p-3">
 <div className="flex items-start justify-between gap-3">
 <div>
 <p className="text-sm font-semibold text-gray-900">{formatAmount(row.amount)}</p>
 <p className="text-xs text-gray-600">{formatDate(row.date)} - {row.transactionType}</p>
 </div>
 {getRowStatusBadge(row)}
 </div>

 <p className="mt-2 text-sm font-medium text-gray-900">{row.description}</p>
 <p className="mt-1 text-xs text-gray-600">Account: {row.resolvedAccountName}</p>
 {row.merchant && <p className="mt-1 text-xs text-gray-600">Merchant: {row.merchant}</p>}

 <div className="mt-3">
 <label className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
 Category
 </label>
 <select data-testid={`import-data-modal-category-for-row-${row.id}`}
 value={row.category}
 onChange={(event) => handleCategoryChange(row.id, event.target.value)}
 className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-black/20 focus:ring-4 focus:ring-black/10"
 aria-label={`Category for row ${row.rowNumber}`}
 >
 {(row.transactionType === 'expense' ? expenseCategoryOptions : incomeCategoryOptions)
 .concat(row.category)
 .filter((value, index, array) => array.indexOf(value) === index)
 .map((value) => (
 <option data-testid={`import-data-modal-option-2-${value}`} key={value} value={value}>
 {value}
 </option>
 ))}
 </select>
 </div>
 </div>
 ))}
 </div>

 <div className="max-h-[48vh] overflow-auto hidden lg:block">
 <table data-testid="import-data-modal-table" className="min-w-full divide-y divide-gray-100 text-sm">
 <caption className="sr-only">
 Import preview table with date, amount, account, category, status, and description columns.
 </caption>
 <thead className="sticky top-0 bg-white">
 <tr className="text-left text-xs uppercase tracking-[0.18em] text-gray-400">
 <th className="px-4 py-3">Date</th>
 <th className="px-4 py-3">Amount</th>
 <th className="px-4 py-3">Account</th>
 <th className="px-4 py-3">Category</th>
 <th className="px-4 py-3">Status</th>
 <th className="px-4 py-3">Description</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-gray-100">
 {visibleRows.map((row) => {
 const isError = row.errors.length > 0;
 const isDuplicate = row.duplicate;
 return (
 <tr key={row.id} className="align-top">
 <td className="px-4 py-3 text-gray-700">
 <div>{formatDate(row.date)}</div>
 <div className="mt-1 text-xs uppercase tracking-[0.18em] text-gray-400">
 {row.transactionType}
 </div>
 </td>
 <td className="px-4 py-3 font-semibold text-gray-900">{formatAmount(row.amount)}</td>
 <td className="px-4 py-3 text-gray-600">
 <div className="font-medium text-gray-900">{row.resolvedAccountName}</div>
 {(row.sourceAccountName || row.sourcePaymentMethod) && (
 <p className="mt-1 text-xs text-gray-500">
 Source: {row.sourceAccountName || row.sourcePaymentMethod}
 </p>
 )}
 </td>
 <td className="px-4 py-3">
 <select data-testid={`import-data-modal-category-for-row-2-${row.id}`}
 value={row.category}
 onChange={(event) => handleCategoryChange(row.id, event.target.value)}
 className="h-11 min-w-[200px] rounded-2xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 outline-none transition focus:border-black/20 focus:ring-4 focus:ring-black/10"
 aria-label={`Category for row ${row.rowNumber}`}
 >
 {(row.transactionType === 'expense' ? expenseCategoryOptions : incomeCategoryOptions)
 .concat(row.category)
 .filter((value, index, array) => array.indexOf(value) === index)
 .map((value) => (
 <option data-testid={`import-data-modal-option-3-${value}`} key={value} value={value}>
 {value}
 </option>
 ))}
 </select>
 {row.rawCategory && row.rawCategory !== row.category && (
 <p className="mt-1 text-xs text-gray-500">Source: {row.rawCategory}</p>
 )}
 </td>
 <td className="px-4 py-3">
 {getRowStatusBadge(row)}
 </td>
 <td className="px-4 py-3 text-gray-600">
 <div className="max-w-[360px] truncate font-medium text-gray-900">{row.description}</div>
 {row.merchant && <div className="mt-1 text-xs text-gray-500">Merchant: {row.merchant}</div>}
 {Object.keys(row.metadata).length > 0 && (
 <div className="mt-1 text-xs text-gray-400">
 {Object.keys(row.metadata).length} extra field{Object.keys(row.metadata).length === 1 ? '' : 's'} preserved
 </div>
 )}
 </td>
 </tr>
 );
 })}
 </tbody>
 </table>
 </div>
 </div>
 </div>
 )}
 </div>

 <div className="border-t border-gray-100 px-5 py-4 pb-[max(env(safe-area-inset-bottom),1rem)] sm:px-6">
 <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
 <div className="text-sm text-gray-600">
 {selectedFile ? (
 <div className="flex items-center gap-2">
 {selectedFile.name.toLowerCase().endsWith('.csv') ? <FileSpreadsheet size={16} /> : <FileJson size={16} />}
 {selectedFile.name}
 </div>
 ) : (
 'Choose a file to begin.'
 )}
 </div>

 <div className="flex gap-3">
 {importReport ? (
 <>
 <button data-testid="import-data-modal-import-another-file"
 type="button"
 onClick={resetImportState}
 className="min-h-11 rounded-full border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-black/10"
 >
 Import Another File
 </button>
 <button data-testid="import-data-modal-close"
 type="button"
 onClick={onClose}
 className="min-h-11 rounded-full bg-black px-5 py-2 text-sm font-semibold text-white transition hover:bg-gray-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-black/20"
 >
 Close
 </button>
 </>
 ) : (
 <>
 <button data-testid="import-data-modal-button"
 type="button"
 onClick={openFilePicker}
 className="min-h-11 rounded-full border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-black/10"
 >
 {selectedFile ? 'Change File' : 'Choose File'}
 </button>
 <button data-testid="import-data-modal-button-2"
 type="button"
 onClick={handleImport}
 aria-live="polite"
 disabled={
 isParsing ||
 isImporting ||
 !selectedFile ||
 !preview ||
 (preview.kind === 'third-party' && !canImportThirdParty)
 }
 className="min-h-11 rounded-full bg-black px-5 py-2 text-sm font-semibold text-white transition hover:bg-gray-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-black/20 disabled:cursor-not-allowed disabled:opacity-50"
 >
 {isImporting
 ? 'Importing...'
 : preview?.kind === 'backup'
 ? 'Restore Backup'
 : 'Confirm Import'}
 </button>
 </>
 )}
 </div>
 </div>
 </div>

 <input data-testid="import-data-modal-choose-import-file"
 ref={fileInputRef}
 type="file"
 accept=".csv,.json"
 aria-label="Choose import file"
 className="hidden"
 onChange={(event) => {
 const file = event.target.files?.[0];
 if (file) handleFileSelection(file);
 event.target.value = '';
 }}
 />
 </motion.div>
 </div>
 );
};
