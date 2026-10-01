/**
 * Statement Import Component
 * Allows users to upload, preview, edit, and import bank statements
 */

import React, { useState, useRef, useMemo } from 'react';
import { 
  Upload, 
  FileText, 
  Table, 
  CheckCircle, 
  XCircle, 
  Download, 
  Eye, 
  Edit2, 
  Trash2, 
  Plus, 
  Search, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Check, 
  X, 
  Sparkles, 
  FileSpreadsheet, 
  RefreshCw,
  FileCheck,
  Building2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { statementImportService, ImportResult, ParsedTransaction, StatementImportOptions } from '@/services/statementImportService';
import { financialDataCaptureService } from '@/services/financialDataCaptureService';
import { Button } from '@/app/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useApp } from '@/contexts/AppContext';
import { formatCurrencyAmount, getCurrencySymbol } from '@/lib/currencyUtils';

interface StatementImportProps {
  accountId: number;
  accountName: string;
  accountType: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

const CATEGORY_OPTIONS = [
  'Food & Dining',
  'Shopping',
  'Transportation',
  'Utilities',
  'Housing & Rent',
  'Health & Medical',
  'Entertainment',
  'Investments',
  'Salary & Income',
  'Business & Work',
  'Loan & Debt',
  'Subscriptions',
  'Personal Care',
  'Travel',
  'Family & Kids',
  'Gifts & Donations',
  'Transfer',
  'Miscellaneous',
];

const PAYMENT_CHANNELS = ['UPI', 'Net Banking', 'Debit Card', 'Credit Card', 'ATM', 'IMPS/NEFT', 'Cheque', 'Cash', 'Other'];

export const StatementImport: React.FC<StatementImportProps> = ({
  accountId,
  accountName,
  accountType,
  onSuccess,
  onCancel
}) => {
  const { user } = useAuth();
  const { currency } = useApp();
  
  // File & import state
  const [file, setFile] = useState<File | null>(null);
  const [importState, setImportState] = useState<'idle' | 'uploading' | 'processing' | 'preview' | 'importing' | 'success' | 'error'>('idle');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [transactions, setTransactions] = useState<ParsedTransaction[]>([]);
  const [errorDetail, setErrorDetail] = useState<string>('');
  const [selectedTransactions, setSelectedTransactions] = useState<Set<number>>(new Set());
  
  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'expense' | 'income' | 'duplicate'>('all');
  
  // Editing state
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<{
    transaction_date: string;
    cleaned_description: string;
    amount: string;
    transaction_type: 'expense' | 'income' | 'transfer';
    category: string;
    payment_channel: string;
    merchant_name: string;
  }>({
    transaction_date: '',
    cleaned_description: '',
    amount: '',
    transaction_type: 'expense',
    category: 'Miscellaneous',
    payment_channel: 'UPI',
    merchant_name: '',
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const getFileFormatDetails = (targetFile: File | null) => {
    if (!targetFile) return { label: 'FILE', badgeColor: 'bg-slate-100 text-slate-700', icon: FileText, name: 'File' };
    const name = targetFile.name.toLowerCase();
    if (targetFile.type === 'application/pdf' || name.endsWith('.pdf')) {
      return { 
        label: 'PDF', 
        badgeColor: 'bg-rose-100/80 text-rose-700 border-rose-200/80', 
        cardBg: 'bg-rose-50/30 border-rose-200/70',
        iconBg: 'bg-rose-100 text-rose-600',
        icon: FileText, 
        name: 'PDF Statement' 
      };
    }
    if (targetFile.type === 'text/csv' || name.endsWith('.csv')) {
      return { 
        label: 'CSV', 
        badgeColor: 'bg-emerald-100/80 text-emerald-700 border-emerald-200/80', 
        cardBg: 'bg-emerald-50/30 border-emerald-200/70',
        iconBg: 'bg-emerald-100 text-emerald-600',
        icon: Table, 
        name: 'CSV Spreadsheet' 
      };
    }
    return { 
      label: 'EXCEL', 
      badgeColor: 'bg-blue-100/80 text-blue-700 border-blue-200/80', 
      cardBg: 'bg-blue-50/30 border-blue-200/70',
      iconBg: 'bg-blue-100 text-blue-600',
      icon: FileSpreadsheet, 
      name: 'Excel Sheet' 
    };
  };

  const toDateInputString = (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (!d || isNaN(d.getTime())) return new Date().toISOString().split('T')[0];
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const fromDateInputValue = (val: string) => {
    if (!val) return new Date();
    const parts = val.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      return new Date(year, month, day, 12, 0, 0);
    }
    return new Date(val);
  };

  const recomputeSummary = (txs: ParsedTransaction[]) => {
    let credits = 0;
    let debits = 0;
    let duplicates = 0;
    for (const t of txs) {
      if (t.isDuplicate) duplicates++;
      if (t.transaction_type === 'income') {
        credits += t.amount;
      } else {
        debits += t.amount;
      }
    }
    return {
      total: credits + debits,
      credits,
      debits,
      count: txs.length,
      duplicates,
    };
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      const allowedExtensions = ['.pdf', '.csv', '.xlsx', '.xls'];
      const ext = '.' + selectedFile.name.split('.').pop()?.toLowerCase();
      
      const allowedTypes = [
        'application/pdf',
        'text/csv',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      ];

      if (!allowedTypes.includes(selectedFile.type) && !allowedExtensions.includes(ext)) {
        toast.error('Please select a PDF, CSV, or Excel file');
        return;
      }

      if (selectedFile.size > 15 * 1024 * 1024) {
        toast.error('File size must be less than 15MB');
        return;
      }

      setFile(selectedFile);
      setImportState('idle');
      setImportResult(null);
      setTransactions([]);
      setSelectedTransactions(new Set());
      setEditingIndex(null);
    }
  };

  const handleUpload = async () => {
    if (!file || !user) return;

    setImportState('uploading');
    setErrorDetail('');
    
    try {
      const options: StatementImportOptions = {
        accountId,
        userId: user.id,
        accountType
      };

      setImportState('processing');
      const result = await statementImportService.parseStatement(file, options);
      
      if (!result) throw new Error('No response from import service');
      
      setImportResult(result);
      
      if (result.success && result.transactions.length > 0) {
        setTransactions(result.transactions);
        setSelectedTransactions(new Set(
          result.transactions
            .map((transaction, index) => transaction.isDuplicate ? null : index)
            .filter((value): value is number => value != null),
        ));
        setImportState('preview');
        toast.success(`Found ${result.transactions.length} transactions from ${file.name}`);
      } else {
        const hint = result.errors && result.errors.length > 0
          ? result.errors[0]
          : 'No transactions were detected. Try a different format.';
        setErrorDetail(hint);
        setImportState('error');
      }

    } catch (error: any) {
      console.error('Statement parsing crash prevented:', error);
      setImportState('error');
      const msg = error?.message || 'Unknown error';
      setErrorDetail(msg.includes('worker') ? 'Service worker failed to initialize. Please refresh.' : msg);
    }
  };

  const handleImport = async () => {
    if (!importResult || !user || transactions.length === 0) return;

    if (selectedTransactions.size === 0) {
      toast.error('Please select at least one transaction to import');
      return;
    }

    setImportState('importing');
    
    try {
      const options: StatementImportOptions = {
        accountId,
        userId: user.id,
        accountType,
        documentId: importResult.documentId,
      };

      // Get user-selected transactions (guaranteeing isDuplicate is false if explicitly selected)
      const transactionsToImport: ParsedTransaction[] = Array.from(selectedTransactions)
        .map(index => transactions[index])
        .filter((tx): tx is ParsedTransaction => tx != null)
        .map(tx => ({
          ...tx,
          isDuplicate: false, // User explicitly selected this row to import
        }));
      
      const importApplyResult = await statementImportService.importTransactions(transactionsToImport, options);

      const queueCandidates = importApplyResult.importedTransactions
        .map((transaction, index) => ({
          transaction,
          transactionId: importApplyResult.insertedTransactionIds[index],
        }))
        .filter(({ transaction, transactionId }) => {
          if (!transactionId) return false;
          const lowConfidence = (transaction.confidenceScore ?? 0) < 0.72;
          const uncertainCategory = !transaction.category || /^(others?|miscellaneous)$/i.test(transaction.category);
          return lowConfidence || uncertainCategory;
        });

      await financialDataCaptureService.enqueueAiTasks(
        queueCandidates.map(({ transaction, transactionId }) => ({
          kind: 'statement-ai-parse' as const,
          payload: {
            transactionId,
            userId: user.id,
            accountId,
            type: transaction.transaction_type,
            amount: transaction.amount,
            category: transaction.category,
            subcategory: undefined,
            merchant: transaction.merchant_name,
            rawText: transaction.raw_description,
            confidence: transaction.confidenceScore,
          },
        })),
        { processNow: true },
      );

      if (queueCandidates.length > 0) {
        toast.info(`${queueCandidates.length} transactions queued for AI category refinement.`);
      }
      
      setImportState('success');
      toast.success(`Successfully imported ${transactionsToImport.length} transactions to ${accountName}`);
      
      setTimeout(() => {
        onSuccess?.();
      }, 1500);

    } catch (error) {
      setImportState('error');
      toast.error('Failed to import transactions. Please try again.');
      console.error('Import error:', error);
    }
  };

  const toggleTransactionSelection = (index: number) => {
    const newSelected = new Set(selectedTransactions);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedTransactions(newSelected);
  };

  const toggleAllTransactions = () => {
    if (selectedTransactions.size === transactions.length) {
      setSelectedTransactions(new Set());
    } else {
      setSelectedTransactions(new Set(transactions.map((_, index) => index)));
    }
  };

  const startEditing = (index: number) => {
    const tx = transactions[index];
    if (!tx) return;
    setEditingIndex(index);
    setEditForm({
      transaction_date: toDateInputString(tx.transaction_date),
      cleaned_description: tx.cleaned_description || tx.raw_description || '',
      amount: String(tx.amount || ''),
      transaction_type: tx.transaction_type || 'expense',
      category: tx.category || 'Miscellaneous',
      payment_channel: tx.payment_channel || 'UPI',
      merchant_name: tx.merchant_name || '',
    });
  };

  const saveEditing = (index: number) => {
    const parsedAmount = parseFloat(editForm.amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      toast.error('Please enter a valid positive amount');
      return;
    }
    if (!editForm.cleaned_description.trim()) {
      toast.error('Description cannot be empty');
      return;
    }

    const updated = [...transactions];
    const oldTx = updated[index];
    updated[index] = {
      ...oldTx,
      transaction_date: fromDateInputValue(editForm.transaction_date),
      cleaned_description: editForm.cleaned_description.trim(),
      amount: Math.abs(parsedAmount),
      transaction_type: editForm.transaction_type,
      category: editForm.category,
      payment_channel: editForm.payment_channel,
      merchant_name: editForm.merchant_name.trim() || undefined,
      isDuplicate: false, // mark verified
    };

    setTransactions(updated);
    if (importResult) {
      setImportResult({
        ...importResult,
        transactions: updated,
        summary: recomputeSummary(updated),
      });
    }

    // Auto-select the updated transaction
    setSelectedTransactions(prev => new Set(prev).add(index));
    setEditingIndex(null);
    toast.success('Transaction saved');
  };

  const handleDeleteTransaction = (index: number) => {
    const updated = transactions.filter((_, i) => i !== index);
    setTransactions(updated);

    // Adjust selected indices
    const newSelected = new Set<number>();
    selectedTransactions.forEach(i => {
      if (i < index) newSelected.add(i);
      else if (i > index) newSelected.add(i - 1);
    });
    setSelectedTransactions(newSelected);

    if (importResult) {
      setImportResult({
        ...importResult,
        transactions: updated,
        summary: recomputeSummary(updated),
      });
    }

    if (editingIndex === index) {
      setEditingIndex(null);
    } else if (editingIndex !== null && editingIndex > index) {
      setEditingIndex(editingIndex - 1);
    }

    toast.info('Transaction removed from import');
  };

  const handleAddManualTransaction = () => {
    const newTx: ParsedTransaction = {
      transaction_date: new Date(),
      raw_description: 'Manual entry',
      cleaned_description: 'New Transaction',
      amount: 0,
      transaction_type: 'expense',
      payment_channel: 'UPI',
      category: 'Food & Dining',
      isDuplicate: false,
    };

    const updated = [newTx, ...transactions];
    setTransactions(updated);

    const newSelected = new Set<number>();
    newSelected.add(0);
    selectedTransactions.forEach(i => newSelected.add(i + 1));
    setSelectedTransactions(newSelected);

    if (importResult) {
      setImportResult({
        ...importResult,
        transactions: updated,
        summary: recomputeSummary(updated),
      });
    }

    setEditingIndex(0);
    setEditForm({
      transaction_date: toDateInputString(new Date()),
      cleaned_description: '',
      amount: '',
      transaction_type: 'expense',
      category: 'Food & Dining',
      payment_channel: 'UPI',
      merchant_name: '',
    });
  };

  const handleKeepDuplicate = (index: number) => {
    const updated = [...transactions];
    updated[index] = {
      ...updated[index],
      isDuplicate: false,
    };
    setTransactions(updated);
    setSelectedTransactions(prev => new Set(prev).add(index));

    if (importResult) {
      setImportResult({
        ...importResult,
        transactions: updated,
        summary: recomputeSummary(updated),
      });
    }
    toast.success('Marked duplicate as valid for import');
  };

  const formatCurrency = (amount: number) => {
    if (isNaN(amount)) return '0.00';
    return formatCurrencyAmount(Math.abs(amount), currency);
  };

  const formatDate = (date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (!d || isNaN(d.getTime())) return 'Invalid Date';
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const getTransactionTypeColor = (type: string) => {
    switch (type) {
      case 'income': return 'text-emerald-600';
      case 'expense': return 'text-rose-600';
      default: return 'text-slate-600';
    }
  };

  // Filtered transactions for display
  const filteredTransactions = useMemo(() => {
    return transactions.map((transaction, originalIndex) => ({ transaction, originalIndex }))
      .filter(({ transaction }) => {
        if (filterTab === 'expense' && transaction.transaction_type !== 'expense') return false;
        if (filterTab === 'income' && transaction.transaction_type !== 'income') return false;
        if (filterTab === 'duplicate' && !transaction.isDuplicate) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const desc = (transaction.cleaned_description || '').toLowerCase();
          const raw = (transaction.raw_description || '').toLowerCase();
          const cat = (transaction.category || '').toLowerCase();
          const channel = (transaction.payment_channel || '').toLowerCase();
          const amt = transaction.amount.toString();
          return desc.includes(q) || raw.includes(q) || cat.includes(q) || channel.includes(q) || amt.includes(q);
        }
        return true;
      });
  }, [transactions, filterTab, searchQuery]);

  const fileFormatInfo = getFileFormatDetails(file);

  return (
    <div 
      data-testid="statement-import-div" 
      onClick={(e) => { e.stopPropagation(); onCancel?.(); }}
      className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-3 sm:p-4"
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className={`bg-white border border-slate-100 rounded-[28px] sm:rounded-[36px] shadow-2xl overflow-hidden flex flex-col relative z-[101] pointer-events-auto transition-all duration-300 w-full ${
          importState === 'preview' 
            ? 'max-w-4xl max-h-[92vh]' 
            : 'max-w-lg max-h-[88vh]'
        }`}
      >
        {/* Hidden file input */}
        <input 
          data-testid="statement-import-input"
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          accept=".pdf,.csv,.xlsx,.xls"
          className="hidden"
        />

        {/* ─── Header ────────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 sm:px-7 py-4 sm:py-5 border-b border-slate-100 bg-white/80 backdrop-blur-md shrink-0">
          <div className="min-w-0 pr-3">
            <div className="flex items-center gap-2">
              <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight truncate">
                {importState === 'preview' ? 'Review & Edit Statement' : 'Import Statement'}
              </h2>
              {importState === 'preview' && (
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-extrabold bg-blue-50 text-blue-700 border border-blue-200/60">
                  Step 2 of 2
                </span>
              )}
            </div>
            
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400">
                <Building2 size={13} className="text-slate-400 shrink-0" />
                <span>Account:</span>
                <span className="text-slate-900 font-bold truncate max-w-[160px] sm:max-w-[220px]">{accountName}</span>
              </div>
              <span className="text-slate-300">•</span>
              <span className="text-2xs font-bold uppercase tracking-wider text-slate-400">{accountType}</span>
            </div>
          </div>

          <button 
            data-testid="statement-import-cancel-statement-import"
            onClick={(e) => { e.stopPropagation(); onCancel?.(); }}
            className="w-9 h-9 rounded-full bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-all cursor-pointer shrink-0 active:scale-95"
            aria-label="Cancel statement import"
          >
            <X size={18} />
          </button>
        </div>

        {/* ─── Main Content Container ────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <AnimatePresence mode="wait">
            
            {/* STATE 1: IDLE / FILE SELECTION */}
            {importState === 'idle' && (
              <motion.div 
                key="idle"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="p-5 sm:p-7 space-y-5"
              >
                {/* Drag and Drop Zone */}
                {!file ? (
                  <div 
                    className="relative group border-2 border-dashed border-slate-200/90 hover:border-slate-400 hover:bg-slate-50/60 rounded-[28px] transition-all duration-300 p-7 sm:p-10 text-center cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-blue-500', 'bg-blue-50/30'); }}
                    onDragLeave={(e) => { e.preventDefault(); e.currentTarget.classList.remove('border-blue-500', 'bg-blue-50/30'); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const droppedFile = e.dataTransfer.files[0];
                      if (droppedFile) {
                        const event = { target: { files: [droppedFile] } } as any;
                        handleFileSelect(event);
                      }
                    }}
                  >
                    <div className="w-16 h-16 rounded-3xl bg-slate-100 group-hover:bg-blue-50 text-slate-500 group-hover:text-blue-600 flex items-center justify-center mx-auto mb-4 transition-all duration-300 group-hover:scale-105 shadow-xs">
                      <Upload size={28} />
                    </div>
                    
                    <h3 className="text-lg font-black text-slate-900 mb-1.5 tracking-tight">
                      Upload Bank Statement
                    </h3>
                    <p className="text-xs text-slate-500 mb-6 max-w-sm mx-auto leading-relaxed">
                      Drop your official bank statement here or click browse. Automatic data extraction identifies all credits, debits, and categories.
                    </p>
                    
                    <Button 
                      data-testid="statement-import-button"
                      type="button"
                      onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                      className="rounded-full px-6 h-11 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 shadow-xs font-bold text-xs cursor-pointer active:scale-95"
                    >
                      <Upload size={15} className="mr-2" />
                      Browse Files
                    </Button>

                    <div className="mt-7 pt-6 border-t border-slate-100 flex flex-wrap justify-center gap-3 sm:gap-6 text-2xs font-bold text-slate-400">
                      <span className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                        PDF STATEMENTS
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        CSV EXPORTS
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                        EXCEL SHEETS
                      </span>
                    </div>
                  </div>
                ) : (
                  /* Uploaded File Card */
                  <div className="space-y-4">
                    <div className={`border rounded-[26px] p-5 transition-all ${fileFormatInfo.cardBg}`}>
                      <div className="flex items-start gap-4">
                        <div className={`w-13 h-13 rounded-2xl flex items-center justify-center shrink-0 shadow-xs ${fileFormatInfo.iconBg}`}>
                          {file.type === 'text/csv' ? (
                            <Table data-testid="statement-import-table" size={26} />
                          ) : (
                            <FileText size={26} />
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className={`px-2 py-0.5 rounded-md text-3xs font-black uppercase tracking-wider border ${fileFormatInfo.badgeColor}`}>
                              {fileFormatInfo.label}
                            </span>
                            <span className="text-2xs font-semibold text-slate-500">
                              {fileFormatInfo.name}
                            </span>
                            <span className="inline-flex items-center gap-1 text-2xs font-bold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-full ml-auto">
                              <CheckCircle size={11} /> Ready to parse
                            </span>
                          </div>

                          <p className="text-sm font-bold text-slate-900 truncate" title={file.name}>
                            {file.name}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5 font-medium">
                            {formatFileSize(file.size)} • Uploaded just now
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 pt-4 border-t border-slate-200/50 flex items-center justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="text-xs font-bold text-slate-600 hover:text-slate-900 transition-colors flex items-center gap-1.5 cursor-pointer py-1"
                        >
                          <RefreshCw size={13} /> Change File
                        </button>
                        <button
                          type="button"
                          onClick={() => setFile(null)}
                          className="text-xs font-bold text-rose-600 hover:text-rose-700 transition-colors flex items-center gap-1 cursor-pointer py-1"
                        >
                          <X size={14} /> Remove
                        </button>
                      </div>
                    </div>

                    <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-100 flex items-start gap-3">
                      <Sparkles size={17} className="text-indigo-600 shrink-0 mt-0.5" />
                      <p className="text-xs text-slate-600 leading-relaxed font-medium">
                        Click below to extract data. You will see every fetched transaction and can <strong className="text-slate-900 font-bold">edit dates, amounts, categories, and descriptions</strong> before saving.
                      </p>
                    </div>

                    <div className="pt-2">
                      <Button 
                        data-testid="statement-import-analyze-statement"
                        onClick={handleUpload}
                        className="w-full h-12 rounded-full bg-[#18181B] text-white hover:bg-black shadow-md font-bold text-sm cursor-pointer transition-all active:scale-98 flex items-center justify-center gap-2"
                      >
                        <Eye size={17} />
                        Analyze & Extract Transactions
                      </Button>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* STATE 2: UPLOADING / EXTRACTING DATA */}
            {(importState === 'uploading' || importState === 'processing') && (
              <motion.div 
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-center py-16 px-6"
              >
                <div className="relative w-20 h-20 mx-auto mb-6">
                  <div className="absolute inset-0 border-4 border-slate-100 rounded-full" />
                  <div className="absolute inset-0 border-4 border-[#18181B] border-t-transparent rounded-full animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <FileCheck size={28} className="text-slate-800 animate-pulse" />
                  </div>
                </div>
                
                <h3 className="text-xl font-bold text-slate-900 mb-2 tracking-tight">
                  {importState === 'uploading' ? 'Reading Statement File...' : 'Extracting & Categorizing Data...'}
                </h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                  Our OCR and financial parser are reading transactions, dates, amounts, and smart categories from <strong className="text-slate-700">{file?.name}</strong>.
                </p>
              </motion.div>
            )}

            {/* STATE 3: PREVIEW & EDITING WORKBENCH */}
            {importState === 'preview' && importResult && (
              <motion.div 
                key="preview"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 sm:p-6 space-y-5"
              >
                {/* ─── Source File Banner ──────────────────────────────────────── */}
                <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 sm:p-3.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${fileFormatInfo.iconBg}`}>
                      {file?.type === 'text/csv' ? <Table size={18} /> : <FileText size={18} />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-xs sm:text-sm font-bold text-slate-900 truncate" title={file?.name}>
                          {file?.name}
                        </p>
                        <span className={`px-1.5 py-0.2 rounded text-3xs font-extrabold border ${fileFormatInfo.badgeColor}`}>
                          {fileFormatInfo.label}
                        </span>
                      </div>
                      <p className="text-2xs text-slate-500">
                        {file ? formatFileSize(file.size) : ''} • {transactions.length} transactions extracted
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setImportState('idle');
                      setTransactions([]);
                    }}
                    className="text-xs font-bold text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-full hover:bg-white border border-transparent hover:border-slate-200 transition-all shrink-0 cursor-pointer"
                  >
                    Change File
                  </button>
                </div>

                {/* ─── Summary Metric Cards ────────────────────────────────────── */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
                  <div className="bg-white border border-slate-200/80 rounded-2xl p-3 shadow-2xs">
                    <span className="text-3xs font-extrabold text-slate-400 uppercase tracking-wider block mb-1">
                      Total Volume
                    </span>
                    <p className="text-sm sm:text-base font-black text-slate-900 tracking-tight truncate">
                      {formatCurrency(importResult.summary.total)}
                    </p>
                    <span className="text-3xs font-bold text-slate-400 mt-0.5 block">
                      {transactions.length} rows total
                    </span>
                  </div>

                  <div className="bg-white border border-emerald-100 rounded-2xl p-3 shadow-2xs">
                    <div className="flex items-center gap-1 mb-1">
                      <ArrowDownLeft size={12} className="text-emerald-600" />
                      <span className="text-3xs font-extrabold text-emerald-700 uppercase tracking-wider">
                        Total Income
                      </span>
                    </div>
                    <p className="text-sm sm:text-base font-black text-emerald-600 tracking-tight truncate">
                      +{formatCurrency(importResult.summary.credits)}
                    </p>
                    <span className="text-3xs font-bold text-slate-400 mt-0.5 block">
                      {transactions.filter(t => t.transaction_type === 'income').length} credits
                    </span>
                  </div>

                  <div className="bg-white border border-rose-100 rounded-2xl p-3 shadow-2xs">
                    <div className="flex items-center gap-1 mb-1">
                      <ArrowUpRight size={12} className="text-rose-600" />
                      <span className="text-3xs font-extrabold text-rose-700 uppercase tracking-wider">
                        Total Expense
                      </span>
                    </div>
                    <p className="text-sm sm:text-base font-black text-rose-600 tracking-tight truncate">
                      -{formatCurrency(importResult.summary.debits)}
                    </p>
                    <span className="text-3xs font-bold text-slate-400 mt-0.5 block">
                      {transactions.filter(t => t.transaction_type === 'expense').length} debits
                    </span>
                  </div>

                  <div className="bg-white border border-blue-100 rounded-2xl p-3 shadow-2xs">
                    <span className="text-3xs font-extrabold text-blue-700 uppercase tracking-wider block mb-1">
                      Selected to Save
                    </span>
                    <p className="text-sm sm:text-base font-black text-blue-600 tracking-tight truncate">
                      {selectedTransactions.size} of {transactions.length}
                    </p>
                    <span className="text-3xs font-bold text-slate-400 mt-0.5 block">
                      {importResult.summary.duplicates > 0 ? `${importResult.summary.duplicates} dupes unselected` : 'Ready to import'}
                    </span>
                  </div>
                </div>

                {/* ─── Statement Meta (Bank & Period Info) ────────────────────── */}
                {importResult.statementMeta && (
                  <div data-testid="statement-import-meta" className="bg-white border border-slate-200/80 rounded-2xl p-3.5 shadow-2xs space-y-2">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <p className="text-xs font-black text-slate-900 truncate">
                          {importResult.statementMeta.bankName || 'Detected Bank Statement'}
                          {importResult.statementMeta.accountNumber ? ` · ${importResult.statementMeta.accountNumber}` : ''}
                        </p>
                        {importResult.statementMeta.period?.from && (
                          <p className="text-2xs font-bold text-slate-400">
                            Period: {importResult.statementMeta.period.from} → {importResult.statementMeta.period.to || 'Present'}
                          </p>
                        )}
                      </div>
                      {importResult.statementMeta.reconciled !== null && importResult.statementMeta.reconciled !== undefined && (
                        <span data-testid="statement-import-reconciled" className={`shrink-0 px-2.5 py-1 rounded-full text-2xs font-bold uppercase tracking-wide ${
                          importResult.statementMeta.reconciled ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60' : 'bg-amber-50 text-amber-700 border border-amber-200/60'
                        }`}>
                          {importResult.statementMeta.reconciled ? '✓ Balances Reconcile' : '⚠ Balances Unverified'}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* ─── Filter & Search Bar ────────────────────────────────────── */}
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    {/* Filter Pills */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-hide">
                      <button
                        type="button"
                        onClick={() => setFilterTab('all')}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                          filterTab === 'all' 
                            ? 'bg-[#18181B] text-white shadow-xs' 
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                        }`}
                      >
                        All ({transactions.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setFilterTab('expense')}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                          filterTab === 'expense' 
                            ? 'bg-rose-600 text-white shadow-xs' 
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                        }`}
                      >
                        Expenses ({transactions.filter(t => t.transaction_type === 'expense').length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setFilterTab('income')}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                          filterTab === 'income' 
                            ? 'bg-emerald-600 text-white shadow-xs' 
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                        }`}
                      >
                        Income ({transactions.filter(t => t.transaction_type === 'income').length})
                      </button>
                      {importResult.summary.duplicates > 0 && (
                        <button
                          type="button"
                          onClick={() => setFilterTab('duplicate')}
                          className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                            filterTab === 'duplicate' 
                              ? 'bg-amber-600 text-white shadow-xs' 
                              : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                          }`}
                        >
                          Duplicates ({transactions.filter(t => t.isDuplicate).length})
                        </button>
                      )}
                    </div>

                    {/* Quick Tools */}
                    <div className="flex items-center gap-2 shrink-0">
                      <Button 
                        data-testid="statement-import-button-2"
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={toggleAllTransactions}
                        className="h-8 rounded-full text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200/80 px-3 cursor-pointer"
                      >
                        {selectedTransactions.size === transactions.length ? 'Deselect All' : 'Select All'}
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        onClick={handleAddManualTransaction}
                        className="h-8 rounded-full text-xs font-bold bg-white border border-slate-200 text-slate-800 hover:bg-slate-50 px-3 shadow-2xs cursor-pointer flex items-center gap-1"
                      >
                        <Plus size={14} /> Add Missing
                      </Button>
                    </div>
                  </div>

                  {/* Search input */}
                  <div className="relative">
                    <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search by description, category, merchant, amount..."
                      className="w-full h-10 pl-9 pr-9 bg-slate-50 border border-slate-200/80 rounded-full text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 transition-all"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>

                {/* ─── Transactions List & Inline Editor ───────────────────────── */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <p className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
                      Extracted Transactions ({filteredTransactions.length})
                    </p>
                    <span className="text-2xs font-semibold text-slate-400">
                      Click edit to modify data or click row to toggle selection
                    </span>
                  </div>

                  {filteredTransactions.length === 0 ? (
                    <div className="p-8 text-center bg-slate-50/60 rounded-3xl border border-dashed border-slate-200">
                      <p className="text-sm font-bold text-slate-700">No matching transactions</p>
                      <p className="text-xs text-slate-400 mt-1">Try clearing your search query or filter</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[380px] overflow-y-auto custom-scrollbar pr-0.5">
                      {filteredTransactions.map(({ transaction, originalIndex }) => {
                        const isSelected = selectedTransactions.has(originalIndex);
                        const isEditing = editingIndex === originalIndex;

                        if (isEditing) {
                          /* Inline Edit Card */
                          return (
                            <div 
                              key={originalIndex}
                              className="bg-white border-2 border-indigo-500/80 rounded-2xl p-4 shadow-md space-y-4 animate-in fade-in zoom-in-95 duration-150"
                            >
                              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                                <span className="text-xs font-black text-indigo-950 flex items-center gap-1.5">
                                  <Edit2 size={13} className="text-indigo-600" />
                                  Edit Transaction #{originalIndex + 1}
                                </span>
                                
                                {/* Transaction Type Toggle */}
                                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-full">
                                  <button
                                    type="button"
                                    onClick={() => setEditForm(prev => ({ ...prev, transaction_type: 'expense' }))}
                                    className={`px-3 py-1 rounded-full text-2xs font-bold transition-all ${
                                      editForm.transaction_type === 'expense'
                                        ? 'bg-rose-600 text-white shadow-xs'
                                        : 'text-slate-600 hover:text-slate-900'
                                    }`}
                                  >
                                    Expense (-)
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditForm(prev => ({ ...prev, transaction_type: 'income' }))}
                                    className={`px-3 py-1 rounded-full text-2xs font-bold transition-all ${
                                      editForm.transaction_type === 'income'
                                        ? 'bg-emerald-600 text-white shadow-xs'
                                        : 'text-slate-600 hover:text-slate-900'
                                    }`}
                                  >
                                    Income (+)
                                  </button>
                                </div>
                              </div>

                              {/* Form Fields Grid */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {/* Description */}
                                <div className="sm:col-span-2">
                                  <label className="text-3xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
                                    Description / Merchant Name
                                  </label>
                                  <input
                                    type="text"
                                    value={editForm.cleaned_description}
                                    onChange={(e) => setEditForm(prev => ({ ...prev, cleaned_description: e.target.value }))}
                                    placeholder="e.g. Swiggy, Amazon, Monthly Salary"
                                    className="w-full h-9 px-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                  />
                                </div>

                                {/* Amount */}
                                <div>
                                  <label className="text-3xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
                                    Amount
                                  </label>
                                  <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                                      {getCurrencySymbol(currency)}
                                    </span>
                                    <input
                                      type="number"
                                      step="any"
                                      min="0"
                                      value={editForm.amount}
                                      onChange={(e) => setEditForm(prev => ({ ...prev, amount: e.target.value }))}
                                      className="w-full h-9 pl-7 pr-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                    />
                                  </div>
                                </div>

                                {/* Date */}
                                <div>
                                  <label className="text-3xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
                                    Date
                                  </label>
                                  <input
                                    type="date"
                                    value={editForm.transaction_date}
                                    onChange={(e) => setEditForm(prev => ({ ...prev, transaction_date: e.target.value }))}
                                    className="w-full h-9 px-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                  />
                                </div>

                                {/* Category */}
                                <div>
                                  <label className="text-3xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
                                    Category
                                  </label>
                                  <select
                                    value={editForm.category}
                                    onChange={(e) => setEditForm(prev => ({ ...prev, category: e.target.value }))}
                                    className="w-full h-9 px-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                  >
                                    {CATEGORY_OPTIONS.map(cat => (
                                      <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                  </select>
                                </div>

                                {/* Payment Channel */}
                                <div>
                                  <label className="text-3xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
                                    Payment Method
                                  </label>
                                  <select
                                    value={editForm.payment_channel}
                                    onChange={(e) => setEditForm(prev => ({ ...prev, payment_channel: e.target.value }))}
                                    className="w-full h-9 px-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                                  >
                                    {PAYMENT_CHANNELS.map(ch => (
                                      <option key={ch} value={ch}>{ch}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>

                              {/* Action Buttons */}
                              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setEditingIndex(null)}
                                  className="h-8 rounded-full text-xs font-bold text-slate-600 hover:bg-slate-100 px-3 cursor-pointer"
                                >
                                  Cancel
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => saveEditing(originalIndex)}
                                  className="h-8 rounded-full text-xs font-bold bg-[#18181B] text-white hover:bg-black px-4 shadow-xs cursor-pointer flex items-center gap-1.5"
                                >
                                  <Check size={13} /> Save Changes
                                </Button>
                              </div>
                            </div>
                          );
                        }

                        /* Normal Display Row */
                        return (
                          <div 
                            key={originalIndex}
                            data-testid={`statement-import-div-3-${originalIndex}`}
                            className={`group p-3 sm:p-3.5 rounded-2xl border transition-all duration-150 flex items-center gap-3 sm:gap-4 ${
                              isSelected 
                                ? 'bg-white border-slate-200 shadow-2xs hover:border-slate-300' 
                                : 'bg-slate-50/60 border-slate-100/80 opacity-60 hover:opacity-90'
                            }`}
                          >
                            {/* Checkbox */}
                            <div 
                              onClick={() => toggleTransactionSelection(originalIndex)}
                              className={`w-5 h-5 rounded-lg border-2 flex-shrink-0 flex items-center justify-center transition-all cursor-pointer ${
                                isSelected 
                                  ? 'bg-[#18181B] border-[#18181B] text-white' 
                                  : 'border-slate-300 bg-white hover:border-slate-400'
                              }`}
                            >
                              {isSelected && <Check size={12} strokeWidth={3} />}
                            </div>

                            {/* Content & Details */}
                            <div 
                              onClick={() => toggleTransactionSelection(originalIndex)}
                              className="flex-1 min-w-0 cursor-pointer"
                            >
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-3xs font-black text-slate-400 uppercase tracking-wider">
                                  {formatDate(transaction.transaction_date)}
                                </span>
                                {transaction.payment_channel && (
                                  <span className="px-1.5 py-0.2 rounded text-3xs font-extrabold bg-slate-100 text-slate-600 uppercase">
                                    {transaction.payment_channel}
                                  </span>
                                )}
                                {transaction.isDuplicate && (
                                  <span className="px-1.5 py-0.2 rounded text-3xs font-black bg-amber-100 text-amber-800 uppercase tracking-tight">
                                    Duplicate
                                  </span>
                                )}
                              </div>

                              <p className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                                {transaction.cleaned_description || transaction.raw_description}
                              </p>

                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-2xs font-semibold text-slate-500 bg-slate-100/90 px-2 py-0.5 rounded-full truncate max-w-[140px]">
                                  {transaction.category || 'Miscellaneous'}
                                </span>
                                {transaction.isDuplicate && !isSelected && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleKeepDuplicate(originalIndex);
                                    }}
                                    className="text-3xs font-bold text-amber-700 hover:text-amber-900 underline cursor-pointer"
                                  >
                                    Import anyway
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Amount & Actions */}
                            <div className="text-right flex-shrink-0 flex items-center gap-3">
                              <div>
                                <p className={`text-xs sm:text-sm font-black tracking-tight ${getTransactionTypeColor(transaction.transaction_type)}`}>
                                  {transaction.transaction_type === 'income' ? '+' : '-'}
                                  {formatCurrency(transaction.amount)}
                                </p>
                                <span className="text-3xs font-bold text-slate-400 uppercase">
                                  {transaction.transaction_type}
                                </span>
                              </div>

                              {/* Row Action Buttons */}
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    startEditing(originalIndex);
                                  }}
                                  className="w-7 h-7 rounded-full bg-slate-100 hover:bg-indigo-50 text-slate-500 hover:text-indigo-600 flex items-center justify-center transition-colors cursor-pointer"
                                  title="Edit Transaction"
                                  aria-label="Edit Transaction"
                                >
                                  <Edit2 size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteTransaction(originalIndex);
                                  }}
                                  className="w-7 h-7 rounded-full bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-600 flex items-center justify-center transition-colors cursor-pointer"
                                  title="Delete Transaction"
                                  aria-label="Delete Transaction"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* ─── Footer Action Bar ───────────────────────────────────────── */}
                <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="text-xs font-bold text-slate-500 text-center sm:text-left">
                    <span className="text-slate-900 font-black">{selectedTransactions.size}</span> of {transactions.length} transactions selected
                  </div>

                  <div className="flex items-center gap-2.5 w-full sm:w-auto">
                    <Button 
                      data-testid="statement-import-discard"
                      type="button"
                      variant="outline"
                      onClick={onCancel}
                      className="flex-1 sm:flex-initial h-10 px-5 rounded-full border-slate-200 text-slate-700 font-bold hover:bg-slate-50 text-xs cursor-pointer active:scale-95"
                    >
                      Discard
                    </Button>
                    <Button 
                      data-testid="statement-import-complete"
                      type="button"
                      onClick={handleImport}
                      disabled={selectedTransactions.size === 0}
                      className="flex-1 sm:flex-initial h-10 px-6 rounded-full bg-[#18181B] text-white hover:bg-black font-bold shadow-sm transition-all flex items-center justify-center gap-2 text-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                    >
                      <Download size={15} />
                      Import & Save ({selectedTransactions.size})
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* STATE 4: IMPORTING IN PROGRESS */}
            {importState === 'importing' && (
              <motion.div 
                key="importing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-16 px-6"
              >
                <div className="w-16 h-16 border-4 border-[#18181B] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <h3 className="text-lg font-bold text-slate-900 mb-1">Importing Verified Transactions...</h3>
                <p className="text-xs text-slate-500">Writing to {accountName} and synchronizing database</p>
              </motion.div>
            )}

            {/* STATE 5: SUCCESS */}
            {importState === 'success' && (
              <motion.div 
                key="success"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-16 px-6"
              >
                <div className="w-18 h-18 bg-emerald-100 rounded-3xl flex items-center justify-center mx-auto mb-5 text-emerald-600 shadow-xs">
                  <CheckCircle size={36} />
                </div>
                <h3 className="text-xl font-black text-slate-900 mb-2">Import Successful!</h3>
                <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
                  All selected transactions have been verified, categorized, and recorded in <strong className="text-slate-800">{accountName}</strong>.
                </p>
              </motion.div>
            )}

            {/* STATE 6: ERROR */}
            {importState === 'error' && (
              <motion.div 
                key="error"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-12 px-6"
              >
                <div className="w-16 h-16 bg-rose-100 rounded-3xl flex items-center justify-center mx-auto mb-4 text-rose-600">
                  <XCircle size={32} />
                </div>
                <h3 className="text-lg font-black text-slate-900 mb-2">Unable to Process Statement</h3>
                {errorDetail ? (
                  <div className="mx-auto max-w-sm bg-rose-50/80 border border-rose-200/80 rounded-2xl p-4 mb-6 text-left">
                    <p className="text-xs font-bold text-rose-800">Reason:</p>
                    <p className="text-xs text-rose-700 mt-1 leading-relaxed">{errorDetail}</p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 mb-6 max-w-sm mx-auto leading-relaxed">
                    There was an issue extracting transactions from this document. Please ensure the document is a supported PDF, CSV, or Excel statement.
                  </p>
                )}
                <div className="flex gap-3 justify-center">
                  <Button 
                    data-testid="statement-import-try-again" 
                    onClick={() => { setImportState('idle'); setErrorDetail(''); }} 
                    className="h-10 px-6 rounded-full bg-[#18181B] text-white hover:bg-black font-bold text-xs cursor-pointer active:scale-95"
                  >
                    Try Again
                  </Button>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};
