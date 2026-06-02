/**
 * Statement Import Component
 * Allows users to upload and import bank statements
 */

import React, { useState, useRef } from 'react';
import { Upload, FileText, Table, CheckCircle, XCircle, AlertCircle, Download, Eye } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { statementImportService, ImportResult, ParsedTransaction, StatementImportOptions } from '@/services/statementImportService';
import { financialDataCaptureService } from '@/services/financialDataCaptureService';
import { Button } from '@/app/components/ui/button';
import { Card } from '@/app/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { useApp } from '@/contexts/AppContext';
import { formatCurrencyAmount } from '@/lib/currencyUtils';

interface StatementImportProps {
 accountId: number;
 accountName: string;
 accountType: string;
 onSuccess?: () => void;
 onCancel?: () => void;
}

export const StatementImport: React.FC<StatementImportProps> = ({
 accountId,
 accountName,
 accountType,
 onSuccess,
 onCancel
}) => {
 const { user } = useAuth();
 const { currency } = useApp();
 const [file, setFile] = useState<File | null>(null);
 const [importState, setImportState] = useState<'idle' | 'uploading' | 'processing' | 'preview' | 'importing' | 'success' | 'error'>('idle');
 const [importResult, setImportResult] = useState<ImportResult | null>(null);
 const [errorDetail, setErrorDetail] = useState<string>('');
 const [selectedTransactions, setSelectedTransactions] = useState<Set<number>>(new Set());
 const fileInputRef = useRef<HTMLInputElement>(null);

 const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
 const selectedFile = event.target.files?.[0];
 if (selectedFile) {
 // Validate file type
 const allowedTypes = [
 'application/pdf',
 'text/csv',
 'application/vnd.ms-excel',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
 ];

 if (!allowedTypes.includes(selectedFile.type)) {
 toast.error('Please select a PDF, CSV, or Excel file');
 return;
 }

 // Validate file size (max 10MB)
 if (selectedFile.size > 10 * 1024 * 1024) {
 toast.error('File size must be less than 10MB');
 return;
 }

 setFile(selectedFile);
 setImportState('idle');
 setImportResult(null);
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
 setSelectedTransactions(new Set(
 result.transactions
 .map((transaction, index) => transaction.isDuplicate ? null : index)
 .filter((value): value is number => value != null),
 ));
 setImportState('preview');
 toast.success(`Found ${result.transactions.length} transactions`);
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
 if (!importResult || !user) return;

 setImportState('importing');
 
 try {
 const options: StatementImportOptions = {
 accountId,
 userId: user.id,
 accountType,
 documentId: importResult.documentId,
 };

 // Get selected transactions
 const transactionsToImport = Array.from(selectedTransactions).map(index => importResult.transactions[index]);
 
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
 }, 2000);

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
 if (selectedTransactions.size === importResult?.transactions.length) {
 setSelectedTransactions(new Set());
 } else {
 setSelectedTransactions(new Set(importResult?.transactions.map((_, index) => index) || []));
 }
 };

 const getFileIcon = () => {
 if (!file) return <Upload size={24} />;
 
 if (file.type === 'application/pdf') return <FileText size={24} />;
 if (file.type === 'text/csv') return <Table size={24} />;
 return <FileText size={24} />;
 };

  const formatCurrency = (amount: number) => {
    if (isNaN(amount)) return '0.00';
    return formatCurrencyAmount(Math.abs(amount), currency);
  };

 const formatDate = (date: Date) => {
 if (!date || isNaN(date.getTime())) {
 return 'Invalid Date';
 }
 return date.toLocaleDateString('en-IN', {
 day: '2-digit',
 month: 'short',
 year: 'numeric'
 });
 };

 const getTransactionTypeColor = (type: string) => {
 switch (type) {
 case 'income': return 'text-green-600';
 case 'expense': return 'text-red-600';
 default: return 'text-gray-600';
 }
 };

 return (
 <div 
 className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4"
 onClick={(e) => e.target === e.currentTarget && onCancel?.()}
 >
 <motion.div
 initial={{ opacity: 0, y: 20, scale: 0.95 }}
 animate={{ opacity: 1, y: 0, scale: 1 }}
 exit={{ opacity: 0, scale: 0.95 }}
 onClick={(e) => e.stopPropagation()}
 className="bg-white/95 backdrop-blur-2xl border border-white/20 rounded-[2rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.3)] w-[95%] max-w-lg max-h-[85vh] overflow-hidden flex flex-col relative z-[101] pointer-events-auto"
 >
 {/* Hidden file input */}
 <input
 type="file"
 ref={fileInputRef}
 onChange={handleFileSelect}
 accept=".pdf,.csv,.xls,.xlsx"
 className="hidden"
 />

 {/* Decorative background glow */}
 <div className="absolute top-0 left-1/4 w-1/2 h-1 bg-gradient-to-r from-transparent via-blue-400 to-transparent blur-md opacity-50" />

 {/* Header */}
 <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
 <div>
 <h2 className="text-xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600 tracking-tight">
 Import Statement
 </h2>
 <div className="flex items-center gap-2 mt-1">
 <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
 <p className="text-sm font-medium text-gray-500">Account: <span className="text-gray-900">{accountName}</span></p>
 </div>
 </div>
 <button
 onClick={(e) => { e.stopPropagation(); onCancel?.(); }}
 className="p-2.5 bg-white hover:bg-gray-100 rounded-2xl transition-all duration-200 group active:scale-95 touch-manipulation"
 aria-label="Cancel statement import"
 >
 <XCircle size={22} className="text-gray-400 group-hover:text-gray-600 group-hover:rotate-90 transition-all" />
 </button>
 </div>

 {/* Content */}
 <div className="flex-1 overflow-y-auto custom-scrollbar">
 <AnimatePresence mode="wait">
 {importState === 'idle' && (
 <motion.div 
 key="idle"
 initial={{ opacity: 0, y: 10 }}
 animate={{ opacity: 1, y: 0 }}
 exit={{ opacity: 0, y: -10 }}
 className="p-6 md:p-8"
 >
 <div 
 className={`relative group border-2 border-dashed rounded-3xl transition-all duration-300 p-8 md:p-10 text-center ${
 file ? 'border-blue-200 bg-blue-50/30' : 'border-gray-200 hover:border-blue-400 hover:bg-gray-50'
 }`}
 onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-blue-500', 'bg-blue-50/50'); }}
 onDragLeave={(e) => { e.preventDefault(); e.currentTarget.classList.remove('border-blue-500', 'bg-blue-50/50'); }}
 onDrop={(e) => {
 e.preventDefault();
 const droppedFile = e.dataTransfer.files[0];
 if (droppedFile) {
 const event = { target: { files: [droppedFile] } } as any;
 handleFileSelect(event);
 }
 }}
 >
 <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 transition-transform duration-500 group-hover:scale-110 ${
 file ? 'bg-blue-600 text-white shadow-xl shadow-blue-200' : 'bg-gray-100 text-gray-400'
 }`}>
 {getFileIcon()}
 </div>
 
 <h3 className="text-2xl font-bold text-gray-900 mb-3 tracking-tight">
 {file ? file.name : 'Select Statement File'}
 </h3>
 <p className="text-gray-500 mb-8 max-w-sm mx-auto leading-relaxed">
 Drop your bank statement here or click to browse. We support PDF, CSV, and Excel exports.
 </p>
 
 <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
 <Button
 onClick={() => fileInputRef.current?.click()}
 className="rounded-2xl px-8 h-12 bg-white border border-gray-200 text-gray-900 hover:bg-gray-50 hover:shadow-md transition-all font-semibold"
 >
 <Upload size={18} className="mr-2" />
 {file ? 'Change File' : 'Browse Files'}
 </Button>
 
 {file && (
 <Button
 onClick={handleUpload}
 className="rounded-2xl px-8 h-12 bg-blue-600 text-white hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-200 transition-all font-semibold animate-in fade-in zoom-in duration-300"
 >
 <Eye size={18} className="mr-2" />
 Analyze Statement
 </Button>
 )}
 </div>
 
 <div className="mt-8 pt-8 border-t border-gray-100/50 flex justify-center gap-8 opacity-60">
 <div className="flex items-center gap-2 text-xs font-medium text-gray-400">
 <div className="w-1.5 h-1.5 rounded-full bg-gray-300" />
 PDF SUPPORTED
 </div>
 <div className="flex items-center gap-2 text-xs font-medium text-gray-400">
 <div className="w-1.5 h-1.5 rounded-full bg-gray-300" />
 CSV & EXCEL
 </div>
 <div className="flex items-center gap-2 text-xs font-medium text-gray-400">
 <div className="w-1.5 h-1.5 rounded-full bg-gray-300" />
 ENCRYPTED (NO PASS)
 </div>
 </div>
 </div>
 </motion.div>
 )}

 {(importState === 'uploading' || importState === 'processing') && (
 <motion.div 
 key="loading"
 initial={{ opacity: 0 }}
 animate={{ opacity: 1 }}
 exit={{ opacity: 0 }}
 className="text-center py-24"
 >
 <div className="relative w-24 h-24 mx-auto mb-8">
 <div className="absolute inset-0 border-4 border-blue-100 rounded-full" />
 <div className="absolute inset-0 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
 <div className="absolute inset-0 flex items-center justify-center">
 <FileText size={32} className="text-blue-600 animate-pulse" />
 </div>
 </div>
 <h3 className="text-2xl font-bold text-gray-900 mb-3 tracking-tight">
 {importState === 'uploading' ? 'Securely Uploading...' : 'Extracting Data...'}
 </h3>
 <p className="text-gray-500 max-w-xs mx-auto">
 Our intelligence engine is identifying transactions and categories from your document.
 </p>
 </motion.div>
 )}

 {importState === 'preview' && importResult && (
 <motion.div 
 initial={{ opacity: 0, y: 20 }}
 animate={{ opacity: 1, y: 0 }}
 className="p-5 space-y-5"
 >
 {/* Summary Cards */}
 <div className="grid grid-cols-2 gap-2 md:gap-3">
 {[
 { label: 'Volume', value: formatCurrency(importResult.summary.total), icon: <FileText size={14} />, color: 'bg-blue-50 text-blue-600' },
 { label: 'Credits', value: `+${formatCurrency(importResult.summary.credits)}`, icon: <CheckCircle size={14} />, color: 'bg-green-50 text-green-600' },
 { label: 'Debits', value: `-${formatCurrency(importResult.summary.debits)}`, icon: <XCircle size={14} />, color: 'bg-red-50 text-red-600' },
 { label: 'Dupes', value: importResult.summary.duplicates, icon: <AlertCircle size={14} />, color: 'bg-amber-50 text-amber-600' },
 ].map((stat, i) => (
 <div key={i} className="bg-white border border-gray-100 rounded-xl p-2.5 shadow-sm">
 <div className="flex items-center gap-1.5 mb-1">
 <div className={`p-1 rounded-md ${stat.color}`}>
 {stat.icon}
 </div>
 <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tight truncate">{stat.label}</span>
 </div>
 <p className="text-xs font-black text-gray-900 tracking-tighter truncate">{stat.value}</p>
 </div>
 ))}
 </div>

 {/* Warnings/Metadata */}
 <div className="flex flex-col gap-3">
 {importResult.errors.length > 0 && (
 <div className="p-4 bg-amber-50/50 border border-amber-100 rounded-2xl flex items-center gap-3">
 <AlertCircle size={18} className="text-amber-500" />
 <span className="text-sm font-medium text-amber-800">
 {importResult.errors.length} parsing warnings. Review the list below carefully.
 </span>
 </div>
 )}

 {importResult.summary.duplicates > 0 && (
 <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-2xl">
 <div className="flex items-start gap-3">
 <AlertCircle size={18} className="text-indigo-500 mt-0.5" />
 <div>
 <p className="text-sm font-bold text-indigo-900">Duplicates Filtered</p>
 <p className="text-xs text-indigo-700 mt-0.5">
 {importResult.summary.duplicates} items already exist and are unselected by default.
 </p>
 </div>
 </div>
 </div>
 )}
 </div>

 {/* Transaction List */}
 <div className="space-y-4">
 <div className="flex items-center justify-between px-1">
 <h3 className="text-base font-bold text-gray-900 tracking-tight">Transactions</h3>
 <div className="flex items-center gap-3">
 <span className="text-[9px] font-black text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-md uppercase">
 {selectedTransactions.size} SEL
 </span>
 <Button
 variant="ghost"
 size="sm"
 onClick={toggleAllTransactions}
 className="h-7 rounded-lg text-[10px] font-black text-blue-600 hover:bg-blue-50 px-2"
 >
 {selectedTransactions.size === importResult.transactions.length ? 'NONE' : 'ALL'}
 </Button>
 </div>
 </div>

 <div className="bg-white/50 rounded-3xl border border-gray-100 overflow-hidden">
 <div className="max-h-[250px] overflow-y-auto custom-scrollbar divide-y divide-gray-100">
 {importResult.transactions.map((transaction, index) => (
 <motion.div
 key={index}
 initial={{ opacity: 0 }}
 animate={{ opacity: 1 }}
 transition={{ delay: index * 0.01 }}
 className={`group p-4 flex items-center gap-4 transition-all duration-200 cursor-pointer ${
 selectedTransactions.has(index) ? 'bg-white' : 'opacity-60'
 }`}
 onClick={() => toggleTransactionSelection(index)}
 >
 <div className={`w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-all ${
 selectedTransactions.has(index) 
 ? 'bg-blue-600 border-blue-600 text-white' 
 : 'border-gray-200 bg-white group-hover:border-blue-400'
 }`}>
 {selectedTransactions.has(index) && <CheckCircle size={12} strokeWidth={3} />}
 </div>
 
 <div className="flex-1 flex flex-row items-center justify-between gap-3 overflow-hidden">
 <div className="flex-1 min-w-0">
 <div className="flex items-center gap-2 mb-0.5">
 <p className="text-[9px] font-bold text-gray-400 uppercase whitespace-nowrap">
 {formatDate(transaction.transaction_date).split(' ')[1]} {formatDate(transaction.transaction_date).split(' ')[0]}
 </p>
 <span className="text-[8px] font-bold text-gray-300">
 {formatDate(transaction.transaction_date).split(' ')[2]}
 </span>
 </div>
 <p className="text-xs font-bold text-gray-900 truncate mb-1">
 {transaction.cleaned_description}
 </p>
 <div className="flex items-center gap-1.5">
 <span className="px-1 py-0.25 bg-white text-gray-400 text-[8px] font-black rounded uppercase">
 {transaction.payment_channel}
 </span>
 {transaction.isDuplicate && (
 <span className="px-1 py-0.25 bg-amber-50 text-amber-500 text-[8px] font-black rounded uppercase">
 DUP
 </span>
 )}
 <span className="text-[8px] font-bold text-gray-300 uppercase truncate">
 {transaction.category || 'MISC'}
 </span>
 </div>
 </div>
 
 <div className="text-right flex-shrink-0">
 <p className={`text-xs font-black tracking-tight ${getTransactionTypeColor(transaction.transaction_type)}`}>
 {transaction.transaction_type === 'income' ? '+' : '-'}
 {formatCurrency(transaction.amount)}
 </p>
 </div>
 </div>
 </motion.div>
 ))}
 </div>
 </div>
 </div>

 {/* Actions */}
 <div className="flex gap-4 pt-4">
 <Button
 variant="outline"
 onClick={onCancel}
 className="flex-1 h-12 md:h-14 rounded-xl md:rounded-2xl border-gray-200 text-gray-600 font-bold hover:bg-gray-50 transition-all"
 >
 Discard
 </Button>
 <Button
 onClick={handleImport}
 disabled={selectedTransactions.size === 0}
 className="flex-[2] h-11 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 shadow-xl shadow-blue-200 transition-all flex items-center justify-center gap-2 text-xs"
 >
 <Download size={16} />
 Complete ({selectedTransactions.size})
 </Button>
 </div>
 </motion.div>
 )}

 {importState === 'importing' && (
 <div className="text-center py-12">
 <div className="w-16 h-16 border-4 border-green-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
 <h3 className="text-lg font-semibold text-gray-900 mb-2">Importing Transactions...</h3>
 <p className="text-gray-500">Adding transactions to your account</p>
 </div>
 )}

 {importState === 'success' && (
 <div className="text-center py-12">
 <div className="w-20 h-20 bg-green-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
 <CheckCircle size={32} className="text-green-600" />
 </div>
 <h3 className="text-xl font-bold text-gray-900 mb-2">Import Successful!</h3>
 <p className="text-gray-500">
 Transactions have been added to {accountName}
 </p>
 </div>
 )}

 {importState === 'error' && (
 <div className="text-center py-12">
 <div className="w-20 h-20 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
 <XCircle size={32} className="text-red-600" />
 </div>
 <h3 className="text-xl font-bold text-gray-900 mb-2">Import Failed</h3>
 {errorDetail ? (
 <div className="mx-auto max-w-sm bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-left">
 <p className="text-sm text-red-700 font-medium">What went wrong:</p>
 <p className="text-sm text-red-600 mt-1">{errorDetail}</p>
 </div>
 ) : (
 <p className="text-gray-500 mb-6">There was an error processing your statement. Please check the file format and try again.</p>
 )}
 <div className="flex gap-3 justify-center">
 <Button onClick={() => { setImportState('idle'); setErrorDetail(''); }} className="bg-blue-600 text-white hover:bg-blue-700">
 Try Again
 </Button>
 </div>
 </div>
 )}
 </AnimatePresence>
 </div>
 </motion.div>
 </div>
 );
};

