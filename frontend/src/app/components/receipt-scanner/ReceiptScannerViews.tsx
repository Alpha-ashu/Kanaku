import React from 'react';
import {
 Upload,
 Camera,
 CheckCircle2,
 AlertCircle,
 AlertTriangle,
 Loader,
 ScanLine,
 RefreshCw,
 Globe,
 Receipt,
 Layers,
 Sparkles,
 Paperclip,
} from 'lucide-react';

import { parseDateInputValue, toLocalDateKey } from '@/lib/dateUtils';
import { normalizeCategorySelection, getSubcategoriesForCategory } from '@/lib/expenseCategories';
import { type Account } from '@/lib/database';
import { cn } from '@/lib/utils';
import type { ReceiptScanResult, TaxComponent, TotalValidationResult } from '@/types/receipt.types';

export type ScanFieldUpdater = <K extends keyof ReceiptScanResult>(
 field: K,
 value: ReceiptScanResult[K],
) => void;

// 
// MODE SELECTION VIEW (Scan Receipt vs Add Attachment)
// 

export const ModeSelectionView: React.FC<{
 onSelectMode: (mode: 'scan' | 'attachment') => void;
}> = ({ onSelectMode }) => (
 <div className="space-y-4 pt-2">
 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Choose an action</p>
 <div className="grid grid-cols-1 gap-3">
 <button
 onClick={() => onSelectMode('scan')}
 className="flex items-center gap-4 p-5 rounded-[24px] bg-slate-900 text-white hover:bg-slate-800 active:scale-[0.98] transition-all shadow-xl shadow-slate-200"
 >
 <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center shrink-0">
 <ScanLine size={22} />
 </div>
 <div className="text-left">
 <p className="text-sm font-black uppercase tracking-wide">Scan Receipt</p>
 <p className="text-[11px] font-semibold text-white/50 mt-0.5">AI reads &amp; auto-fills expense details</p>
 </div>
 </button>

 <button
 onClick={() => onSelectMode('attachment')}
 className="flex items-center gap-4 p-5 rounded-[24px] bg-slate-50 text-slate-900 hover:bg-slate-100 active:scale-[0.98] transition-all border border-slate-100"
 >
 <div className="w-12 h-12 rounded-2xl bg-slate-200 flex items-center justify-center shrink-0">
 <Paperclip size={22} className="text-slate-600" />
 </div>
 <div className="text-left">
 <p className="text-sm font-black uppercase tracking-wide">Add Attachment</p>
 <p className="text-[11px] font-semibold text-slate-400 mt-0.5">Save file as proof no OCR processing</p>
 </div>
 </button>
 </div>
 </div>
);

// 
// SOURCE PICKER VIEW (Camera vs Gallery used by both modes)
// 

export const SourcePickerView: React.FC<{
 mode: 'scan' | 'attachment';
 onCameraClick: () => void;
 onUploadClick: () => void;
 onBack: () => void;
}> = ({ mode, onCameraClick, onUploadClick, onBack }) => (
 <div className="space-y-4 pt-2">
 <div className="flex items-center gap-2">
 <button
 onClick={onBack}
 className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-700 transition-colors"
 >
 Back
 </button>
 <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">/</span>
 <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest">
 {mode === 'scan' ? 'Scan Receipt' : 'Add Attachment'}
 </span>
 </div>

 {mode === 'attachment' && (
 <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-50 border border-amber-100">
 <Paperclip size={14} className="text-amber-500 shrink-0" />
 <p className="text-[11px] font-bold text-amber-700">File will be saved as-is. No OCR or data extraction.</p>
 </div>
 )}

 <div className="grid grid-cols-2 gap-4">
 <SelectionCard
 onClick={onCameraClick}
 icon={<Camera size={24} />}
 label="Camera"
 sublabel="Take Photo"
 className="bg-slate-900 text-white hover:bg-slate-800 shadow-xl shadow-slate-200"
 />
 <SelectionCard
 onClick={onUploadClick}
 icon={<Upload size={24} />}
 label="Gallery"
 sublabel="Files / Library"
 className="bg-slate-50 text-slate-900 hover:bg-slate-100"
 />
 </div>
 </div>
);


export const FileSelectionView: React.FC<{
 onFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
 onUploadClick: () => void;
 onCameraClick: () => void;
 onDeviceOnly: boolean;
 onDeviceOnlyChange: (value: boolean) => void;
}> = ({ onUploadClick, onCameraClick, onDeviceOnly, onDeviceOnlyChange }) => (
 <div className="space-y-6 pt-2">
 <div className="grid grid-cols-2 gap-4">
 <SelectionCard
 onClick={onUploadClick}
 icon={<Upload size={24} />}
 label="Upload"
 sublabel="Gallery/Files"
 className="bg-slate-50 text-slate-900 hover:bg-slate-100"
 />
 <SelectionCard
 onClick={onCameraClick}
 icon={<Camera size={24} />}
 label="Camera"
 sublabel="Take Photo"
 className="bg-slate-900 text-white hover:bg-slate-800 shadow-xl shadow-slate-200"
 />
 </div>

 <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
 <div className="flex items-center gap-3">
 <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-slate-400">
 <Globe size={14} />
 </div>
 <div>
 <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest leading-none mb-1">On-Device OCR</p>
 <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">Privacy Mode</p>
 </div>
 </div>
 <label className="relative inline-flex items-center cursor-pointer">
 <input
 type="checkbox"
 checked={onDeviceOnly}
 onChange={(e) => onDeviceOnlyChange(e.target.checked)}
 className="sr-only peer"
 />
 <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
 </label>
 </div>
 </div>
);

const SelectionCard: React.FC<{
 onClick: () => void;
 icon: React.ReactNode;
 label: string;
 sublabel: string;
 className?: string;
}> = ({ onClick, icon, label, sublabel, className }) => (
 <button
 onClick={onClick}
 className={cn(
"flex flex-col items-center justify-center gap-3 rounded-[32px] p-8 transition-all active:scale-95 border border-transparent",
 className
 )}
 >
 <div className="w-12 h-12 flex items-center justify-center rounded-2xl bg-white/10 backdrop-blur-md">
 {icon}
 </div>
 <div className="text-center">
 <p className="text-sm font-black uppercase tracking-widest">{label}</p>
 <p className="text-[10px] font-bold opacity-40 uppercase tracking-tight">{sublabel}</p>
 </div>
 </button>
);



// 
// PREVIEW VIEW
// 

export const PreviewView: React.FC<{
 file: File;
 previewUrl: string;
 isScanning: boolean;
 scanProgress: number;
 scanStatus: string;
 onScan: () => void;
 onChange: () => void;
}> = ({ file, previewUrl, isScanning, scanProgress, scanStatus, onScan, onChange }) => (
 <div className="space-y-4">
 <div className="relative overflow-hidden rounded-2xl border border-gray-200 shadow-sm">
 {previewUrl ? (
 <img src={previewUrl} alt="Receipt preview" className="max-h-72 w-full bg-white object-contain" />
 ) : (
 <div className="flex min-h-56 flex-col items-center justify-center bg-white px-6 text-center">
 <ScanLine size={28} className="mb-3 text-gray-400" />
 <p className="text-sm font-semibold text-gray-700">{file.name}</p>
 <p className="mt-1 text-xs text-gray-500">PDF statement rendering will be optimized before OCR.</p>
 </div>
 )}
 {isScanning && <ScanningOverlay progress={scanProgress} status={scanStatus} />}
 </div>

 <div className="flex gap-3">
 <button
 onClick={onChange}
 disabled={isScanning}
 className="flex-[0.4] flex items-center justify-center gap-2 rounded-xl border border-gray-200 py-3 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-40"
 >
 <RefreshCw size={14} /> Change
 </button>
 <button
 onClick={onScan}
 disabled={isScanning}
 className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-black py-3 text-sm font-bold text-white shadow-lg transition-colors hover:bg-gray-900 disabled:opacity-40"
 >
 {isScanning ? (
 <>
 <Loader size={16} className="animate-spin" /> Scanning...
 </>
 ) : (
 <>
 <ScanLine size={16} /> Scan Receipt
 </>
 )}
 </button>
 </div>
 </div>
);

const ScanningOverlay: React.FC<{ progress: number; status: string }> = ({ progress, status }) => (
 <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60">
 <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/30 border-t-white" />
 <p className="text-sm font-semibold text-white">{status}</p>
 <progress className="h-2 w-48 overflow-hidden rounded-full" max={100} value={progress} />
 <p className="text-xs text-white/70">{progress}%</p>
 </div>
);

// 
// RESULTS VIEW - full intelligence display
// 

export const ResultsView: React.FC<{
 scanResult: ReceiptScanResult;
 accounts: Account[];
 selectedAccountId: number | null;
 currency: string;
 expenseCategoryOptions: string[];
 isFormPrefillMode: boolean;
 expenseMode: 'individual' | 'group';
 onAccountChange: (id: number | null) => void;
 onFieldChange: ScanFieldUpdater;
 onSubcategoryChange: (value: string) => void;
 onRescan: () => void;
 onSubmit: () => void;
}> = ({
 scanResult,
 accounts,
 selectedAccountId,
 currency,
 expenseCategoryOptions,
 isFormPrefillMode,
 expenseMode,
 onAccountChange,
 onFieldChange,
 onSubcategoryChange,
 onRescan,
 onSubmit,
}) => {
 const effectiveCurrency = scanResult.currency || currency;

 return (
 <div className="KANKU-receipt-review">
 <div className="KANKU-receipt-review__top">
 <ConfidenceBadge confidence={scanResult.confidence ?? 0} />
 {scanResult.location && scanResult.location !== 'UNKNOWN' && (
 <LocationBadge location={scanResult.location} />
 )}
 </div>

 {((scanResult.validationResult && !scanResult.validationResult.isValid) || scanResult.amountMismatchDetected) && (
 <ValidationWarning
 calculated={scanResult.validationResult?.calculated ?? 0}
 detected={scanResult.validationResult?.detected ?? scanResult.amount ?? 0}
 currency={effectiveCurrency}
 amountMismatchDetected={scanResult.amountMismatchDetected}
 amountCandidates={scanResult.amountCandidates}
 onSelectCandidate={(val) => onFieldChange('amount', val)}
 />
 )}

 {scanResult.description && (
 <SmartDescriptionBadge description={scanResult.description} />
 )}

 <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mt-4">
 {/* Main Grid Area */}
 <section className="col-span-1 lg:col-span-8 bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col">
 <div className="flex items-center justify-between border-b border-gray-50 px-4 py-3 bg-white/50 rounded-t-2xl">
 <p className="text-sm font-bold text-gray-900">Review Data</p>
 <p className="text-xs font-semibold text-gray-500">
 {scanResult.items?.length || 0} item{scanResult.items?.length === 1 ? '' : 's'}
 </p>
 </div>

 <div className="p-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
 <div className="col-span-2 sm:col-span-4 p-2 bg-white rounded-xl border border-gray-100">
 <AmountField
 amount={scanResult.amount}
 currency={effectiveCurrency}
 hasError={scanResult.amountMismatchDetected}
 onChange={(value) => onFieldChange('amount', value)}
 />
 </div>

 <div className="col-span-2 p-2 bg-white rounded-xl border border-gray-100">
 <TextField label="Merchant" value={scanResult.merchantName || ''} onChange={(value) => onFieldChange('merchantName', value)} placeholder="Merchant name" />
 </div>

 <div className="col-span-2 p-2 bg-white rounded-xl border border-gray-100">
 <NumberField label="Tax Amount" value={scanResult.taxAmount} onChange={(value) => onFieldChange('taxAmount', value)} />
 </div>

 <div className="col-span-2 p-2 bg-white rounded-xl border border-gray-100">
 <DateField
 label="Date"
 value={scanResult.date}
 onChange={(value) => onFieldChange('date', value)}
 />
 </div>

 <div className="col-span-2 p-2 bg-white rounded-xl border border-gray-100">
 <SelectField
 label="Category"
 value={scanResult.category || 'Shopping'}
 options={expenseCategoryOptions}
 onChange={(value) => onFieldChange('category', value)}
 />
 </div>

 <div className="col-span-2 sm:col-span-4 p-2 bg-white rounded-xl border border-gray-100">
 <SubcategoryField
 category={scanResult.category || 'Shopping'}
 value={scanResult.subcategory || ''}
 onChange={onSubcategoryChange}
 />
 </div>
 </div>
 </section>

 {/* Sidebar Area */}
 <aside className="col-span-1 lg:col-span-4 flex flex-col gap-3">
 <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
 <AccountSelector
 accounts={accounts}
 selectedId={selectedAccountId}
 currency={currency}
 onChange={onAccountChange}
 />
 </div>

 {scanResult.items && scanResult.items.length > 0 && (
 <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden max-h-48 flex flex-col">
 <ItemsPanel items={scanResult.items} currency={effectiveCurrency} />
 </div>
 )}

 <div className="mt-auto">
 <ActionButtons
 onRescan={onRescan}
 onSubmit={onSubmit}
 isFormPrefillMode={isFormPrefillMode}
 expenseMode={expenseMode}
 isDisabled={!selectedAccountId || !scanResult.amount}
 />
 </div>
 </aside>
 </div>
 </div>
 );
 };

// 
// INTELLIGENCE BADGES & PANELS
// 

const LOCATION_FLAGS: Record<string, string> = {
 INDIA: '',
 USA: '',
 EU: '',
 UAE: '',
 UK: '',
 AUSTRALIA: '',
};

const LocationBadge: React.FC<{ location: string }> = ({ location }) => {
 const flag = LOCATION_FLAGS[location] ?? '';
 return (
 <div className="flex shrink-0 items-center gap-1.5 rounded-2xl border border-purple-100 bg-purple-50 px-3 py-2">
 <Globe size={13} className="text-purple-500" />
 <span className="text-xs font-bold text-purple-700">{flag} {location}</span>
 </div>
 );
};

const ConfidenceBadge: React.FC<{ confidence: number }> = ({ confidence }) => {
 const isHighConfidence = confidence >= 0.8;

 return (
 <div
 className={cn(
 'flex items-center gap-3 rounded-2xl p-3.5',
 isHighConfidence ? 'border border-emerald-100 bg-emerald-50' : 'border border-amber-100 bg-amber-50',
 )}
 >
 {isHighConfidence ? (
 <CheckCircle2 size={18} className="shrink-0 text-emerald-600" />
 ) : (
 <AlertCircle size={18} className="shrink-0 text-amber-600" />
 )}
 <div>
 <p className={cn('text-sm font-bold', isHighConfidence ? 'text-emerald-800' : 'text-amber-800')}>
 {isHighConfidence ? 'High confidence scan' : 'Please review the extracted data'}
 </p>
 <p className={cn('text-xs', isHighConfidence ? 'text-emerald-600' : 'text-amber-600')}>
 Confidence: {(confidence * 100).toFixed(0)}% - edit any field if needed
 </p>
 </div>
 </div>
 );
};

const ValidationWarning: React.FC<{
 calculated: number;
 detected: number;
 currency: string;
 amountMismatchDetected?: boolean;
 amountCandidates?: number[];
 onSelectCandidate?: (amount: number) => void;
}> = ({ calculated, detected, currency, amountMismatchDetected, amountCandidates, onSelectCandidate }) => {
 if (amountMismatchDetected) {
 return (
 <div className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 p-3.5 mb-4">
 <div className="flex items-start gap-3">
 <AlertTriangle size={18} className="shrink-0 text-red-500 mt-0.5" />
 <div>
 <p className="text-sm font-bold text-red-800">Possible amount mismatch detected</p>
 <p className="text-xs text-red-700 mt-1">
 The printed total on the receipt does not match the sum of items and taxes mathematically.
 </p>
 </div>
 </div>
 {amountCandidates && amountCandidates.length > 0 && onSelectCandidate && (
 <div className="mt-2 pl-7">
 <p className="text-[10px] font-bold text-red-800/60 mb-2 uppercase tracking-widest">Detected Candidates:</p>
 <div className="flex flex-wrap gap-2">
 {amountCandidates.map((candidate, i) => (
 <button
 key={i}
 onClick={() => onSelectCandidate(candidate)}
 className="px-3 py-1.5 bg-white border border-red-100 rounded-lg text-sm font-bold text-red-600 hover:bg-red-50 transition-colors shadow-sm"
 >
 {currency} {candidate.toFixed(2)}
 </button>
 ))}
 </div>
 </div>
 )}
 </div>
 );
 }

 const calculatedIsHigher = calculated > detected;
 return (
 <div className="flex items-start gap-3 rounded-2xl border border-amber-100 bg-amber-50 p-3.5 mb-4">
 <AlertTriangle size={18} className="shrink-0 text-amber-500 mt-0.5" />
 <div>
 <p className="text-sm font-bold text-amber-800">Amount verify needed</p>
 <p className="text-xs text-amber-700 mt-1">
 {calculatedIsHigher ? (
 <>
 The printed figure <strong>{currency} {detected.toFixed(2)}</strong> may be a partial or pre-tax amount.
 {' '}The amount field is set to the calculated total <strong>{currency} {calculated.toFixed(2)}</strong> please verify before saving.
 </>
 ) : (
 <>
 Calculated from items + taxes: <strong>{currency} {calculated.toFixed(2)}</strong>
 {' vs '}
 printed total: <strong>{currency} {detected.toFixed(2)}</strong>.
 Please verify the amount before saving.
 </>
 )}
 </p>
 </div>
 </div>
 );
};

const SmartDescriptionBadge: React.FC<{ description: string }> = ({ description }) => (
 <div className="flex items-start gap-2.5 rounded-2xl border border-indigo-100 bg-indigo-50 px-3.5 py-3">
 <Sparkles size={15} className="mt-0.5 shrink-0 text-indigo-500" />
 <div>
 <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-400">AI Summary</p>
 <p className="text-sm font-medium text-indigo-800">{description}</p>
 </div>
 </div>
);

// Tax Breakdown 

const TaxBreakdownPanel: React.FC<{
 taxes: TaxComponent[];
 currency: string;
}> = ({ taxes, currency }) => {
 const totalTax = taxes.reduce((s, t) => s + t.amount, 0);

 return (
 <div className="KANKU-receipt-card overflow-hidden border-orange-100 bg-orange-50">
 <div className="flex items-center gap-2 border-b border-orange-100 px-4 py-3">
 <Layers size={14} className="text-orange-500" />
 <p className="text-[10px] font-bold uppercase tracking-widest text-orange-600">
 Tax Breakdown
 </p>
 </div>
 <div className="divide-y divide-orange-100">
 {taxes.map((tax, idx) => (
 <div key={idx} className="flex items-center justify-between px-4 py-2.5">
 <div>
 <span className="text-sm font-semibold text-gray-800">{tax.name}</span>
 {tax.rate !== undefined && (
 <span className="ml-1.5 text-xs text-gray-400">@{tax.rate}%</span>
 )}
 </div>
 <span className="text-sm font-bold text-orange-700">
 {currency} {tax.amount.toFixed(2)}
 </span>
 </div>
 ))}
 <div className="flex items-center justify-between bg-orange-100/60 px-4 py-2.5">
 <span className="text-xs font-bold uppercase tracking-wider text-orange-700">Total Tax</span>
 <span className="text-sm font-bold text-orange-800">
 {currency} {totalTax.toFixed(2)}
 </span>
 </div>
 </div>
 </div>
 );
};

// Items Panel 

const ItemsPanel: React.FC<{
 items: ReceiptScanResult['items'];
 currency: string;
}> = ({ items, currency }) => {
 if (!items || items.length === 0) return null;

 return (
 <div className="KANKU-receipt-card overflow-hidden border-gray-200 bg-white">
 <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
 <Receipt size={14} className="text-gray-500" />
 <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
 Detected Items ({items.length})
 </p>
 </div>
 <div className="max-h-44 divide-y divide-gray-50 overflow-y-auto">
 {items.map((item, idx) => (
 <div key={idx} className="flex items-center justify-between px-4 py-2.5">
 <div className="min-w-0 flex-1 mr-3">
 <p className="truncate text-sm font-medium text-gray-800">{item.name}</p>
 {item.quantity !== undefined && item.rate !== undefined && (
 <p className="text-[11px] text-gray-400">
 {item.quantity} {currency} {item.rate.toFixed(2)}
 </p>
 )}
 </div>
 <span className="shrink-0 text-sm font-bold text-gray-900">
 {currency} {item.amount.toFixed(2)}
 </span>
 </div>
 ))}
 </div>
 </div>
 );
};

// 
// FORM FIELD PRIMITIVES
// 

const AmountField: React.FC<{
 amount?: number;
 currency: string;
 hasError?: boolean;
 onChange: (value: number) => void;
}> = ({ amount, currency, hasError, onChange }) => (
 <div className={cn("KANKU-receipt-field KANKU-receipt-amount transition-colors", hasError &&"rounded-lg bg-red-50/80 p-2")}>
 <label className={cn("mb-1 block text-[10px] font-bold uppercase tracking-widest", hasError ?"text-red-500" :"text-gray-400")}>
 Total Amount *
 </label>
 <div className="flex items-center gap-2">
 <span className={cn("text-sm font-bold", hasError ?"text-red-500" :"text-gray-500")}>{currency}</span>
 <input
 type="number"
 step="0.01"
 value={amount || ''}
 onChange={(event) => onChange(parseFloat(event.target.value) || 0)}
 className={cn("font-display flex-1 bg-transparent text-2xl font-bold focus:outline-none transition-colors", hasError ?"text-red-600" :"text-gray-900")}
 placeholder="0.00"
 />
 </div>
 </div>
);

const TextField: React.FC<{
 label: string;
 value: string;
 onChange: (value: string) => void;
 placeholder?: string;
 className?: string;
}> = ({ label, value, onChange, placeholder, className }) => (
 <div className={cn('KANKU-receipt-field', className)}>
 <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-gray-400">
 {label}
 </label>
 <input
 type="text"
 value={value}
 onChange={(event) => onChange(event.target.value)}
 className="w-full bg-transparent text-sm font-medium text-gray-900 focus:outline-none"
 placeholder={placeholder}
 />
 </div>
);

const NumberField: React.FC<{
 label: string;
 value?: number;
 onChange: (value?: number) => void;
 className?: string;
}> = ({ label, value, onChange, className }) => (
 <div className={cn('KANKU-receipt-field', className)}>
 <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-gray-400">
 {label}
 </label>
 <input
 type="number"
 step="0.01"
 value={value || ''}
 onChange={(event) => onChange(parseFloat(event.target.value) || undefined)}
 className="w-full bg-transparent text-sm font-medium text-gray-900 focus:outline-none"
 aria-label={label}
 title={label}
 />
 </div>
);

const DateField: React.FC<{
 label: string;
 value?: Date;
 onChange: (date?: Date) => void;
 className?: string;
}> = ({ label, value, onChange, className }) => (
 <div className={cn('KANKU-receipt-field', className)}>
 <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-gray-400">
 {label}
 </label>
 <input
 type="date"
 value={value ? toLocalDateKey(value) ?? '' : ''}
 onChange={(event) => {
 const parsed = parseDateInputValue(event.target.value);
 onChange(parsed ?? value);
 }}
 className="w-full bg-transparent text-sm font-medium text-gray-900 focus:outline-none"
 aria-label={label}
 title={label}
 />
 </div>
);

const SelectField: React.FC<{
 label: string;
 value: string;
 options: string[];
 onChange: (value: string) => void;
 className?: string;
}> = ({ label, value, options, onChange, className }) => (
 <div className={cn('KANKU-receipt-field', className)}>
 <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-gray-400">
 {label}
 </label>
 <select
 value={value}
 onChange={(event) => onChange(normalizeCategorySelection(event.target.value, 'expense'))}
 className="w-full appearance-none bg-transparent text-sm font-medium text-gray-900 focus:outline-none"
 aria-label={label}
 title={label}
 >
 {options.map((category) => (
 <option key={category} value={category}>
 {category}
 </option>
 ))}
 </select>
 </div>
);

const SubcategoryField: React.FC<{
 category: string;
 value: string;
 onChange: (value: string) => void;
}> = ({ category, value, onChange }) => {
 const subcategories = getSubcategoriesForCategory(category);
 const isCustom = value !== '' && !subcategories.includes(value) && value !== '__custom__';
 const [showCustomInput, setShowCustomInput] = React.useState(isCustom);

 const handleSelectChange = (selected: string) => {
 if (selected === '__custom__') {
 setShowCustomInput(true);
 onChange('');
 } else {
 setShowCustomInput(false);
 onChange(selected);
 }
 };

 return (
 <div className="KANKU-receipt-field KANKU-receipt-field--wide">
 <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-gray-400">
 Subcategory
 </label>
 {subcategories.length > 0 ? (
 <>
 <select
 value={showCustomInput ? '__custom__' : (value || '')}
 onChange={(e) => handleSelectChange(e.target.value)}
 className="w-full appearance-none bg-transparent text-sm font-medium text-gray-900 focus:outline-none"
 aria-label="Subcategory"
 >
 <option value="">- Select subcategory -</option>
 {subcategories.map((sub) => (
 <option key={sub} value={sub}>{sub}</option>
 ))}
 <option value="__custom__">Other (type custom)...</option>
 </select>
 {showCustomInput && (
 <input
 type="text"
 value={value}
 onChange={(e) => onChange(e.target.value)}
 className="mt-2 w-full bg-transparent text-sm font-medium text-gray-900 focus:outline-none border-t border-gray-100 pt-2"
 placeholder="Type custom subcategory..."
 autoFocus
 />
 )}
 </>
 ) : (
 <input
 type="text"
 value={value}
 onChange={(e) => onChange(e.target.value)}
 className="w-full bg-transparent text-sm font-medium text-gray-900 focus:outline-none"
 placeholder="e.g. Restaurant, Groceries, Uber Ride..."
 />
 )}
 <p className="mt-1 text-xs text-gray-400">
 Specific expense type - updates automatically with AI or choose from list.
 </p>
 </div>
 );
};

// 
// ACCOUNT SELECTOR & ACTIONS
// 

const AccountSelector: React.FC<{
 accounts: Account[];
 selectedId: number | null;
 currency: string;
 onChange: (id: number | null) => void;
}> = ({ accounts, selectedId, currency, onChange }) => (
 <div className="KANKU-receipt-card p-4">
 <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-gray-400">
 Charge to Account *
 </label>
 <select
 value={selectedId || ''}
 onChange={(event) => {
 const parsed = parseInt(event.target.value, 10);
 onChange(Number.isNaN(parsed) ? null : parsed);
 }}
 className="w-full appearance-none bg-transparent text-sm font-semibold text-gray-900 focus:outline-none"
 aria-label="Charge to account"
 title="Charge to account"
 >
 <option value="">Select an account</option>
 {accounts.map((account) => (
 <option key={account.id} value={account.id}>
 {account.name} ({currency} {account.balance.toFixed(2)})
 </option>
 ))}
 </select>
 </div>
);

const ActionButtons: React.FC<{
 onRescan: () => void;
 onSubmit: () => void;
 isFormPrefillMode: boolean;
 expenseMode: 'individual' | 'group';
 isDisabled: boolean;
}> = ({ onRescan, onSubmit, isFormPrefillMode, expenseMode, isDisabled }) => (
 <div className="KANKU-receipt-actions">
 <button
 onClick={onRescan}
 className="flex-[0.4] flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 py-3 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50"
 >
 <RefreshCw size={13} /> Rescan
 </button>
 <button
 onClick={onSubmit}
 disabled={isDisabled}
 className="flex-1 rounded-xl bg-black py-3 text-sm font-bold text-white shadow-lg transition-colors hover:bg-gray-900 disabled:opacity-40"
 >
 {isFormPrefillMode
 ? `Use in ${expenseMode === 'group' ? 'Group' : 'Individual'} Expense`
 : 'Add Transaction'}
 </button>
 </div>
);

