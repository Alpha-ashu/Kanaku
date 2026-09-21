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
  ArrowLeft,
} from 'lucide-react';

import { parseDateInputValue, toLocalDateKey } from '@/lib/dateUtils';
import { normalizeCategorySelection, getSubcategoriesForCategory } from '@/lib/expenseCategories';
import { type Account } from '@/lib/database';
import {
  CONFIDENCE_TITLES,
  describeConfidence,
  resolveConfidenceTier,
} from '@/lib/receiptConfidence';
import { cn } from '@/lib/utils';
import type { ReceiptCharge, ReceiptScanResult, TaxComponent } from '@/types/receipt.types';

export type ScanFieldUpdater = <K extends keyof ReceiptScanResult>(
 field: K,
 value: ReceiptScanResult[K],
) => void;

// 
// MODE SELECTION VIEW (Scan Receipt vs Add Attachment)
// 

export const ModeSelectionView: React.FC<{
  onSelectMode: (mode: 'scan' | 'attachment') => void;
  isOcrEnabled?: boolean;
}> = ({ onSelectMode, isOcrEnabled = true }) => (
  <div className="space-y-4 pt-1">
    <p className="text-2xs font-black text-slate-400 uppercase tracking-widest text-center">Choose an action</p>
    <div className="grid grid-cols-2 gap-4">
      <button
        data-testid="receipt-scanner-views-button"
        onClick={() => onSelectMode('scan')}
        disabled={!isOcrEnabled}
        className={cn(
          "flex flex-col items-center justify-center gap-3.5 p-6 rounded-3xl transition-all duration-200 cursor-pointer min-h-[160px]",
          isOcrEnabled 
            ? "bg-slate-900 text-white hover:bg-slate-800 border border-slate-800 shadow-xl shadow-slate-900/10 hover:scale-[1.02] active:scale-[0.98]" 
            : "bg-slate-100 text-slate-400 border border-slate-200 shadow-none cursor-not-allowed"
        )}
      >
        <div className={cn(
          "w-12 h-12 rounded-2xl flex items-center justify-center transition-colors",
          isOcrEnabled ? "bg-indigo-500/20 text-indigo-400" : "bg-slate-200 text-slate-400"
        )}>
          <ScanLine size={22} />
        </div>
        <div className="text-center space-y-1">
          <p className="text-xs font-black uppercase tracking-wider leading-tight">Scan Receipt</p>
          <p className={cn("text-2xs font-semibold leading-none", isOcrEnabled ? "text-slate-400" : "text-slate-400/60")}>
            OCR auto-fill
          </p>
        </div>
      </button>

      <button
        data-testid="receipt-scanner-views-button-2"
        onClick={() => onSelectMode('attachment')}
        className="flex flex-col items-center justify-center gap-3.5 p-6 rounded-3xl bg-slate-50 text-slate-900 hover:bg-slate-100/90 border border-slate-200/80 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 cursor-pointer min-h-[160px] shadow-xs"
      >
        <div className="w-12 h-12 rounded-2xl bg-slate-200/80 text-slate-700 flex items-center justify-center">
          <Paperclip size={22} />
        </div>
        <div className="text-center space-y-1">
          <p className="text-xs font-black uppercase tracking-wider leading-tight">Add Attachment</p>
          <p className="text-2xs font-semibold text-slate-400 leading-none">
            Save file as-is
          </p>
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
  canGoBack?: boolean;
}> = ({ onCameraClick, onUploadClick, onBack, canGoBack = false }) => (
  <div className="space-y-3.5 pt-1">
    {canGoBack && (
      <div className="flex items-center">
        <button
          data-testid="receipt-scanner-views-back"
          onClick={onBack}
          type="button"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
        >
          <ArrowLeft size={13} />
          <span>Back</span>
        </button>
      </div>
    )}

    <div className="grid grid-cols-2 gap-3 sm:gap-4">
      <SelectionCard
        testId="receipt-scanner-views-card"
        onClick={onCameraClick}
        icon={<Camera size={22} className="text-indigo-600 group-hover:text-white transition-colors" />}
        iconBg="bg-indigo-50 group-hover:bg-indigo-600"
        label="Camera"
        sublabel="Take Photo"
      />
      <SelectionCard
        testId="receipt-scanner-views-card-2"
        onClick={onUploadClick}
        icon={<Upload size={22} className="text-blue-600 group-hover:text-white transition-colors" />}
        iconBg="bg-blue-50 group-hover:bg-blue-600"
        label="Gallery"
        sublabel="Files / Library"
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
}> = ({ onUploadClick, onCameraClick }) => (
  <div className="space-y-4 pt-1">
    <div className="grid grid-cols-2 gap-3 sm:gap-4">
      <SelectionCard
        testId="receipt-scanner-views-card-3"
        onClick={onUploadClick}
        icon={<Upload size={22} className="text-blue-600 group-hover:text-white transition-colors" />}
        iconBg="bg-blue-50 group-hover:bg-blue-600"
        label="Gallery"
        sublabel="Files / Library"
      />
      <SelectionCard
        testId="receipt-scanner-views-card-4"
        onClick={onCameraClick}
        icon={<Camera size={22} className="text-indigo-600 group-hover:text-white transition-colors" />}
        iconBg="bg-indigo-50 group-hover:bg-indigo-600"
        label="Camera"
        sublabel="Take Photo"
      />
    </div>
  </div>
);

const SelectionCard: React.FC<{
  onClick: () => void;
  icon: React.ReactNode;
  iconBg?: string;
  label: string;
  sublabel: string;
  className?: string;
  testId?: string;
}> = ({ onClick, icon, iconBg = 'bg-slate-100 group-hover:bg-slate-900', label, sublabel, className, testId }) => (
  <button
    data-testid={testId}
    type="button"
    onClick={onClick}
    className={cn(
      "flex flex-col items-center justify-center gap-2.5 sm:gap-3 rounded-2xl p-5 sm:p-6 border border-slate-200/80 bg-slate-50/70 hover:bg-white hover:border-slate-300 hover:shadow-md transition-all duration-200 active:scale-[0.98] cursor-pointer group text-slate-900 shadow-2xs",
      className
    )}
  >
    <div className={cn("w-12 h-12 flex items-center justify-center rounded-2xl transition-all duration-200 group-hover:scale-105 shadow-2xs", iconBg)}>
      {icon}
    </div>
    <div className="text-center space-y-0.5">
      <p className="text-xs sm:text-sm font-bold text-slate-900 tracking-tight">{label}</p>
      <p className="text-2xs font-medium text-slate-400 group-hover:text-slate-500 transition-colors">{sublabel}</p>
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
  onDeviceOnly?: boolean;
  onDeviceOnlyChange?: (value: boolean) => void;
}> = ({
  file,
  previewUrl,
  isScanning,
  scanProgress,
  scanStatus,
  onScan,
  onChange,
}) => (
  <div className="space-y-4">
    <div className="relative overflow-hidden rounded-2xl border border-slate-200/90 shadow-sm bg-slate-50 flex items-center justify-center min-h-[220px]">
      {previewUrl ? (
        <img src={previewUrl} alt="Receipt preview" className="max-h-80 w-full object-contain bg-white" />
      ) : (
        <div className="flex min-h-56 flex-col items-center justify-center bg-white px-6 text-center">
          <ScanLine size={28} className="mb-3 text-slate-400" />
          <p className="text-sm font-semibold text-slate-700">{file.name}</p>
          <p className="mt-1 text-xs text-slate-500">PDF statement rendering will be optimized before OCR.</p>
        </div>
      )}
      {isScanning && <ScanningOverlay progress={scanProgress} status={scanStatus} />}
    </div>

    <div className="flex gap-3">
      <button
        data-testid="receipt-scanner-views-change"
        onClick={onChange}
        disabled={isScanning}
        className="flex-[0.4] flex items-center justify-center gap-2 rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
      >
        <RefreshCw size={14} /> Change
      </button>
      <button
        data-testid="receipt-scanner-views-button-4"
        onClick={onScan}
        disabled={isScanning}
        className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-sm font-bold text-white shadow-lg transition-all hover:bg-black active:scale-[0.98] disabled:opacity-40 cursor-pointer"
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
  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/75 backdrop-blur-sm p-6 text-center select-none animate-in fade-in duration-200">
    <div className="relative flex flex-col items-center justify-center p-6 rounded-3xl border border-white/10 bg-white/5 shadow-2xl backdrop-blur-md max-w-[280px] w-full">
      {/* Corner HUD reticle brackets */}
      <div className="absolute top-2.5 left-2.5 w-3.5 h-3.5 border-t-2 border-l-2 border-cyan-400 rounded-tl-md" />
      <div className="absolute top-2.5 right-2.5 w-3.5 h-3.5 border-t-2 border-r-2 border-cyan-400 rounded-tr-md" />
      <div className="absolute bottom-2.5 left-2.5 w-3.5 h-3.5 border-b-2 border-l-2 border-cyan-400 rounded-bl-md" />
      <div className="absolute bottom-2.5 right-2.5 w-3.5 h-3.5 border-b-2 border-r-2 border-cyan-400 rounded-br-md" />

      {/* Laser sweep animation across the box */}
      <div className="pointer-events-none absolute inset-x-2 h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_12px_#22d3ee] animate-scan-laser" />

      {/* Center radar/spinner */}
      <div className="relative mb-3 flex items-center justify-center">
        <div className="h-12 w-12 rounded-full border-2 border-cyan-400/20 border-t-cyan-400 animate-spin" />
        <div className="absolute inset-0 m-auto h-7 w-7 rounded-full bg-gradient-to-tr from-indigo-500 to-cyan-400 opacity-20 animate-pulse" />
        <ScanLine size={18} className="absolute text-cyan-300" />
      </div>

      <p className="text-xs font-bold text-white tracking-tight mb-3 line-clamp-1">{status || 'Reading receipt...'}</p>

      {/* Modern gradient pill progress bar */}
      <div className="w-full h-2 rounded-full bg-white/15 overflow-hidden p-0.5 border border-white/10 mb-2">
        <div
          className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-400 transition-all duration-300 ease-out"
          style={{ width: `${Math.min(100, Math.max(6, progress))}%` }}
        />
      </div>

      <div className="flex items-center justify-between w-full text-3xs font-bold text-slate-300">
        <span className="uppercase tracking-widest text-cyan-400/80">Processing</span>
        <span className="font-mono text-white">{Math.round(progress)}%</span>
      </div>
    </div>
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
  previewUrl?: string;
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
  previewUrl,
  onAccountChange,
  onFieldChange,
  onSubcategoryChange,
  onRescan,
  onSubmit,
}) => {
  const effectiveCurrency = scanResult.currency || currency;

  return (
    <div className={cn("KANAKU-receipt-review", previewUrl && "lg:grid lg:grid-cols-12 lg:gap-6 lg:items-start")}>
      {/* Desktop Left Column: Original Scanned Image Preview */}
      {previewUrl && (
        <div className="hidden lg:block lg:col-span-5 sticky top-2 space-y-3">
          <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-slate-50/80 p-2.5 shadow-2xs">
            <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-slate-200/60 mb-2">
              <span className="text-2xs font-extrabold uppercase tracking-wider text-slate-500">Scanned Bill</span>
              <span className="text-3xs font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 uppercase tracking-wider">Original</span>
            </div>
            <div className="max-h-[520px] overflow-auto rounded-xl bg-white flex items-center justify-center p-1 border border-slate-100">
              <img
                src={previewUrl}
                alt="Scanned receipt preview"
                className="max-h-[500px] w-full object-contain rounded-lg shadow-2xs"
              />
            </div>
          </div>
        </div>
      )}

      {/* Extracted Intelligence & Form Fields */}
      <div className={cn("space-y-3.5", previewUrl ? "lg:col-span-7" : "w-full")}>
        {/* Confidence + optional location */}
        <div className="KANAKU-receipt-review__top">
          <div className="min-w-0">
            <ConfidenceBadge confidence={scanResult.confidence ?? 0} />
          </div>
          {scanResult.location && scanResult.location !== 'UNKNOWN' && (
            <LocationBadge location={scanResult.location} />
          )}
        </div>

      {/* Validation warning */}
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

      {/* Missing critical fields alert */}
      {(!scanResult.amount || scanResult.amount <= 0 || !scanResult.merchantName || scanResult.merchantName.trim() === '') && (
        <div className="flex flex-col gap-2 rounded-2xl border border-amber-200 bg-amber-50/80 p-3.5 mb-2">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0 text-amber-600" />
            <p className="text-xs font-bold text-amber-900">Please review missing details:</p>
          </div>
          <ul className="text-xs text-amber-800 space-y-1 pl-6 list-disc">
            {(!scanResult.amount || scanResult.amount <= 0) && (
              <li><strong>Total Amount:</strong> Could not be read. Please enter the bill total.</li>
            )}
            {(!scanResult.merchantName || scanResult.merchantName.trim() === '') && (
              <li><strong>Merchant Name:</strong> Not detected. You can type the store name below.</li>
            )}
          </ul>
        </div>
      )}

      {/* Arithmetic Reconciliation Breakdown */}
      {scanResult.items && scanResult.items.length > 0 && (() => {
        const itemSum = scanResult.items.reduce((acc, it) => acc + (Number(it.amount) || 0), 0);
        const taxSum = Number(scanResult.taxAmount) || scanResult.taxBreakdown?.reduce((acc, t) => acc + (Number(t.amount) || 0), 0) || 0;
        const chargesSum = Number(scanResult.totalCharges)
          || scanResult.additionalCharges?.reduce((acc, c) => acc + (Number(c.amount) || 0), 0)
          || 0;
        const discountSum = Number(scanResult.discountAmount) || 0;
        const roundOff = Number(scanResult.roundOff) || 0;
        const calculatedTotal = Number((itemSum - discountSum + taxSum + chargesSum + roundOff).toFixed(2));
        const detectedTotal = Number(scanResult.amount) || 0;
        const diff = Math.abs(calculatedTotal - detectedTotal);
        const isMatched = diff < 0.05;

        return (
          <div className={cn(
            "rounded-xl p-2.5 border mb-2.5 transition-all",
            isMatched
              ? "bg-emerald-50/60 border-emerald-200"
              : "bg-blue-50/60 border-blue-200"
          )}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-3xs font-black uppercase tracking-widest text-slate-500">Bill Arithmetic Check</span>
              <span className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-3xs font-black uppercase tracking-wider",
                isMatched ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800"
              )}>
                {isMatched ? <CheckCircle2 size={11} /> : <AlertCircle size={11} />}
                {isMatched ? 'Balanced' : 'Review Sum'}
              </span>
            </div>
            <div className={cn(
              "grid gap-1.5 text-center text-xs font-semibold py-0.5",
              chargesSum > 0 ? "grid-cols-4" : "grid-cols-3"
            )}>
              <div className="bg-white/80 rounded-lg p-1.5 border border-slate-100">
                <p className="text-3xs text-slate-400 uppercase font-black">Items ({scanResult.items.length})</p>
                <p className="text-slate-900 font-bold mt-0.5 text-xs">{effectiveCurrency} {itemSum.toFixed(2)}</p>
              </div>
              {chargesSum > 0 && (
                <div className="bg-white/80 rounded-lg p-1.5 border border-slate-100">
                  <p className="text-3xs text-slate-400 uppercase font-black">Charges (SERC)</p>
                  <p className="text-indigo-600 font-bold mt-0.5 text-xs">{effectiveCurrency} {chargesSum.toFixed(2)}</p>
                </div>
              )}
              <div className="bg-white/80 rounded-lg p-1.5 border border-slate-100">
                <p className="text-3xs text-slate-400 uppercase font-black">Tax / GST</p>
                <p className="text-slate-900 font-bold mt-0.5 text-xs">{effectiveCurrency} {taxSum.toFixed(2)}</p>
              </div>
              <div className="bg-white/80 rounded-lg p-1.5 border border-slate-100">
                <p className="text-3xs text-slate-400 uppercase font-black">Calculated</p>
                <p className="text-emerald-700 font-bold mt-0.5 text-xs">{effectiveCurrency} {calculatedTotal.toFixed(2)}</p>
              </div>
            </div>
            {!isMatched && calculatedTotal > 0 && (
              <div className="mt-2 flex items-center justify-between pt-1.5 border-t border-blue-200/60">
                <p className="text-xs text-blue-900 font-medium">Calculated total is <strong>{effectiveCurrency} {calculatedTotal.toFixed(2)}</strong></p>
                <button
                  type="button"
                  onClick={() => onFieldChange('amount', Number(calculatedTotal.toFixed(2)))}
                  className="px-2 py-0.5 bg-blue-600 text-white rounded text-3xs font-black uppercase tracking-wider hover:bg-blue-700 transition-colors cursor-pointer"
                >
                  Use Calculated
                </button>
              </div>
            )}
          </div>
        );
      })()}

      {/* AI description */}
      {scanResult.description && (
        <SmartDescriptionBadge description={scanResult.description} />
      )}

      {/* ── Main fields card ── */}
      <div className="KANAKU-receipt-card">
        {/* Card header */}
        <div className="KANAKU-receipt-card__head">
          <p className="KANAKU-receipt-card__title">Review Data</p>
          <p className="text-xs font-semibold text-gray-400">
            {scanResult.items?.length || 0} item{scanResult.items?.length === 1 ? '' : 's'}
          </p>
        </div>

        {/* Fields grid */}
        <div className="KANAKU-receipt-fields">
          {/* Amount */}
          <AmountField
            amount={scanResult.amount}
            currency={effectiveCurrency}
            hasError={scanResult.amountMismatchDetected || !scanResult.amount || scanResult.amount <= 0}
            onChange={(value) => onFieldChange('amount', value)}
          />

          {/* Merchant */}
          <TextField
            label="Merchant"
            value={scanResult.merchantName || ''}
            onChange={(value) => onFieldChange('merchantName', value)}
            placeholder="Merchant name (e.g. Starbucks, Amazon)"
          />

          {/* Tax Amount */}
          <NumberField
            label="Tax / GST Amount"
            value={scanResult.taxAmount}
            onChange={(value) => onFieldChange('taxAmount', value)}
          />

          {/* Date */}
          <DateField
            label="Date"
            value={scanResult.date}
            onChange={(value) => onFieldChange('date', value)}
          />

          {/* Category */}
          <SelectField
            label="Category"
            value={scanResult.category || 'Shopping'}
            options={expenseCategoryOptions}
            onChange={(value) => onFieldChange('category', value)}
          />

          {/* Subcategory */}
          <SubcategoryField
            category={scanResult.category || 'Shopping'}
            value={scanResult.subcategory || ''}
            onChange={onSubcategoryChange}
          />
        </div>
      </div>

      {/* ── Account selector — full width ── */}
      <AccountSelector
        accounts={accounts}
        selectedId={selectedAccountId}
        currency={currency}
        onChange={onAccountChange}
      />

      {/* ── Detected items — full width ── */}
      {scanResult.items && scanResult.items.length > 0 && (
        <ItemsPanel items={scanResult.items} currency={effectiveCurrency} />
      )}

      {/* ── Tax breakdown — full width ── */}
      {((scanResult.taxBreakdown && scanResult.taxBreakdown.length > 0) || (scanResult.additionalCharges && scanResult.additionalCharges.length > 0)) && (
        <TaxBreakdownPanel
          taxes={scanResult.taxBreakdown || []}
          additionalCharges={scanResult.additionalCharges}
          roundOff={scanResult.roundOff}
          currency={effectiveCurrency}
        />
      )}

      {/* ── Action buttons ── */}
      <ActionButtons
        onRescan={onRescan}
        onSubmit={onSubmit}
        isFormPrefillMode={isFormPrefillMode}
        expenseMode={expenseMode}
        isDisabled={!selectedAccountId || !scanResult.amount}
      />
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

/**
 * Confidence is reported in three tiers, not two — see lib/receiptConfidence.ts for
 * the thresholds and why the low tier exists.
 */
const ConfidenceBadge: React.FC<{ confidence: number }> = ({ confidence }) => {
 const tier = resolveConfidenceTier(confidence);

 const styles = {
   high: {
     wrap: 'border border-emerald-100 bg-emerald-50',
     icon: 'text-emerald-600',
     title: 'text-emerald-800',
     body: 'text-emerald-600',
   },
   medium: {
     wrap: 'border border-amber-100 bg-amber-50',
     icon: 'text-amber-600',
     title: 'text-amber-800',
     body: 'text-amber-600',
   },
   low: {
     wrap: 'border-2 border-rose-300 bg-rose-50',
     icon: 'text-rose-600',
     title: 'text-rose-800',
     body: 'text-rose-700',
   },
 }[tier];

 const title = CONFIDENCE_TITLES[tier];
 const body = describeConfidence(tier, confidence);

 return (
    <div
      className={cn('flex items-center gap-2.5 rounded-xl p-2.5', styles.wrap)}
      role={tier === 'low' ? 'alert' : undefined}
      data-testid={`receipt-confidence-${tier}`}
    >
      {tier === 'high' ? (
        <CheckCircle2 size={16} className={cn('shrink-0', styles.icon)} />
      ) : (
        <AlertCircle size={tier === 'low' ? 18 : 16} className={cn('shrink-0', styles.icon)} />
      )}
      <div>
        <p className={cn('text-xs font-bold leading-tight', styles.title)}>{title}</p>
        <p className={cn('text-2xs', styles.body)}>{body}</p>
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
      <div className="flex flex-col gap-2 rounded-xl border border-red-200 bg-red-50 p-2.5 mb-2.5">
        <div className="flex items-start gap-2">
          <AlertTriangle size={16} className="shrink-0 text-red-500 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-red-800">Possible amount mismatch detected</p>
            <p className="text-2xs text-red-700 mt-0.5">
              The printed total on the receipt does not match the sum of items and taxes mathematically.
            </p>
          </div>
        </div>
        {amountCandidates && amountCandidates.length > 0 && onSelectCandidate && (
          <div className="mt-1 pl-6">
            <p className="text-3xs font-bold text-red-800/60 mb-1.5 uppercase tracking-widest">Detected Candidates:</p>
            <div className="flex flex-wrap gap-1.5">
              {amountCandidates.map((candidate, i) => (
                <button
                  data-testid={`receipt-scanner-views-button-5-${i}`}
                  key={i}
                  onClick={() => onSelectCandidate(candidate)}
                  className="px-2.5 py-1 bg-white border border-red-100 rounded-lg text-xs font-bold text-red-600 hover:bg-red-50 transition-colors shadow-2xs cursor-pointer"
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
    <div className="flex items-start gap-2 rounded-xl border border-amber-100 bg-amber-50 p-2.5 mb-2.5">
      <AlertTriangle size={16} className="shrink-0 text-amber-500 mt-0.5" />
      <div>
        <p className="text-xs font-bold text-amber-800">Amount verify needed</p>
        <p className="text-2xs text-amber-700 mt-0.5">
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
  <div className="flex items-start gap-2 rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2">
    <Sparkles size={14} className="mt-0.5 shrink-0 text-indigo-500" />
    <div>
      <p className="text-3xs font-bold uppercase tracking-widest text-indigo-400">AI Summary</p>
      <p className="text-xs font-medium text-indigo-800 leading-snug">{description}</p>
    </div>
  </div>
);

// Tax & Charges Breakdown 

const TaxBreakdownPanel: React.FC<{
  taxes: TaxComponent[];
  additionalCharges?: ReceiptCharge[];
  roundOff?: number;
  currency: string;
}> = ({ taxes, additionalCharges, roundOff, currency }) => {
  const cleanCharges = React.useMemo(() => {
    if (!additionalCharges) return [];
    const seen = new Set<string>();
    const result: ReceiptCharge[] = [];
    for (const c of additionalCharges) {
      const key = `${(c.label || '').toLowerCase().trim()}_${c.amount}_${c.rate ?? ''}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(c);
      }
    }
    return result;
  }, [additionalCharges]);

  const cleanTaxes = React.useMemo(() => {
    const isServiceCharge = (name: string) => /service\s*charge|serc|\bsc\b|s\.?\s*charge/i.test(name);
    const filtered = taxes.filter(t => {
      if (isServiceCharge(t.name)) return false;
      const matchesCharge = cleanCharges.some(
        c => (c.label || '').toLowerCase() === t.name.toLowerCase() && Math.abs(c.amount - t.amount) < 0.01,
      );
      return !matchesCharge;
    });

    let gstCount = 0;
    const disambiguated = filtered.map(t => {
      const norm = t.name.trim();
      if (/^state\s*gst/i.test(norm)) return { ...t, name: 'SGST' };
      if (/^central\s*gst/i.test(norm)) return { ...t, name: 'CGST' };
      if (norm.toUpperCase() === 'GST') {
        gstCount++;
        if (gstCount === 1) return { ...t, name: 'SGST' };
        if (gstCount === 2) return { ...t, name: 'CGST' };
      }
      return t;
    });

    const seen = new Set<string>();
    return disambiguated.filter(t => {
      const key = `${t.name.toLowerCase()}_${t.amount}_${t.rate ?? ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [taxes, cleanCharges]);

  const totalTax = cleanTaxes.reduce((s, t) => s + t.amount, 0);
  const totalCharges = cleanCharges.reduce((s, c) => s + c.amount, 0);
  const combinedAdditions = totalTax + totalCharges + (roundOff ?? 0);

  return (
    <div className="KANAKU-receipt-card overflow-hidden border-orange-100 bg-orange-50">
      <div className="flex items-center gap-1.5 border-b border-orange-100 px-3.5 py-2">
        <Layers size={13} className="text-orange-500" />
        <p className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-orange-600">
          Taxes & Charges Breakdown
        </p>
      </div>
      <div className="divide-y divide-orange-100 text-xs sm:text-sm">
        {cleanTaxes.map((tax, idx) => (
          <div key={`tax-${idx}`} className="flex items-center justify-between px-3.5 py-1.5">
            <div>
              <span className="font-semibold text-gray-800">{tax.name}</span>
              {tax.rate !== undefined && (
                <span className="ml-1.5 text-[10px] sm:text-xs text-gray-400">@{tax.rate}%</span>
              )}
            </div>
            <span className="font-bold text-orange-700">
              {currency} {tax.amount.toFixed(2)}
            </span>
          </div>
        ))}
        {cleanCharges.map((charge, idx) => (
          <div key={`charge-${idx}`} className="flex items-center justify-between px-3.5 py-1.5 bg-indigo-50/40">
            <div>
              <span className="font-semibold text-indigo-900">{charge.label}</span>
              {charge.rate !== undefined && (
                <span className="ml-1.5 text-[10px] sm:text-xs text-indigo-400">@{charge.rate}%</span>
              )}
            </div>
            <span className="font-bold text-indigo-700">
              {currency} {charge.amount.toFixed(2)}
            </span>
          </div>
        ))}
        {roundOff !== undefined && roundOff !== 0 && (
          <div className="flex items-center justify-between px-3.5 py-1 text-[11px] sm:text-xs text-slate-500">
            <span>Round Off</span>
            <span className="font-semibold">{roundOff > 0 ? `+${roundOff.toFixed(2)}` : roundOff.toFixed(2)}</span>
          </div>
        )}
        <div className="flex items-center justify-between bg-orange-100/60 px-3.5 py-2">
          <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-orange-700">Total Taxes & Charges</span>
          <span className="text-xs sm:text-sm font-bold text-orange-800">
            {currency} {combinedAdditions.toFixed(2)}
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
    <div className="KANAKU-receipt-card overflow-hidden border-gray-200 bg-white">
      <div className="flex items-center gap-1.5 border-b border-gray-100 px-3.5 py-2">
        <Receipt size={13} className="text-gray-500" />
        <p className="text-3xs font-bold uppercase tracking-widest text-gray-400">
          Detected Items ({items.length})
        </p>
      </div>
      <div className="max-h-36 divide-y divide-gray-50 overflow-y-auto text-xs">
        {items.map((item, idx) => (
          <div key={idx} className="flex items-center justify-between px-3.5 py-1.5">
            <div className="min-w-0 flex-1 mr-2.5">
              <p className="break-words font-medium text-gray-800 leading-snug">{item.name}</p>
              {item.quantity !== undefined && item.rate !== undefined && (
                <p className="text-3xs text-gray-400">
                  {item.quantity} {currency} {item.rate.toFixed(2)}
                </p>
              )}
            </div>
            <span className="shrink-0 font-bold text-gray-900">
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
  <div className={cn("KANAKU-receipt-field KANAKU-receipt-amount transition-all relative overflow-hidden py-2 px-3", hasError && "!border-rose-400/80")}>
    <div className="flex items-center justify-between mb-1">
      <label className={cn("block text-3xs font-bold uppercase tracking-widest", hasError ? "!text-rose-200" : "text-indigo-200")}>
        Total Amount *
      </label>
      {hasError && (
        <span className="text-3xs font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-rose-500/30 text-rose-200 border border-rose-400/40">
          Required
        </span>
      )}
    </div>
    <div className="flex items-center gap-2">
      <span className={cn(
        "px-2 py-0.5 rounded-lg bg-white/15 text-white font-bold text-xs sm:text-sm tracking-wide shrink-0 select-none whitespace-nowrap shadow-inner border border-white/10",
        hasError && "!bg-rose-500/20 !border-rose-400/30"
      )}>
        {currency}
      </span>
      <input
        data-testid="receipt-scanner-views-0-00"
        type="number"
        step="0.01"
        value={amount || ''}
        onChange={(event) => onChange(parseFloat(event.target.value) || 0)}
        className={cn(
          "font-display flex-1 min-w-0 bg-transparent text-base sm:text-lg font-bold focus:outline-none transition-colors text-white placeholder-white/40 tracking-tight",
          hasError && "!text-rose-100"
        )}
        placeholder="0.00"
        aria-label="Total amount"
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
 <div className={cn('KANAKU-receipt-field', className)}>
 <label className="mb-1 block text-2xs font-bold uppercase tracking-widest text-gray-400">
 {label}
 </label>
 <input data-testid="receipt-scanner-views-placeholder"
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
 <div className={cn('KANAKU-receipt-field', className)}>
 <label className="mb-1 block text-2xs font-bold uppercase tracking-widest text-gray-400">
 {label}
 </label>
 <input data-testid="receipt-scanner-views-label"
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
 <div className={cn('KANAKU-receipt-field', className)}>
 <label className="mb-1 block text-2xs font-bold uppercase tracking-widest text-gray-400">
 {label}
 </label>
 <input data-testid="receipt-scanner-views-label-2"
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
 <div className={cn('KANAKU-receipt-field', className)}>
 <label className="mb-1 block text-2xs font-bold uppercase tracking-widest text-gray-400">
 {label}
 </label>
 <select data-testid="receipt-scanner-views-label-3"
 value={value}
 onChange={(event) => onChange(normalizeCategorySelection(event.target.value, 'expense'))}
 className="w-full appearance-none bg-transparent text-sm font-medium text-gray-900 focus:outline-none"
 aria-label={label}
 title={label}
 >
 {options.map((category) => (
 <option data-testid={`receipt-scanner-views-option-${category}`} key={category} value={category}>
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
 <div className="KANAKU-receipt-field KANAKU-receipt-field--wide">
 <label className="mb-1 block text-2xs font-bold uppercase tracking-widest text-gray-400">
 Subcategory
 </label>
 {subcategories.length > 0 ? (
 <>
 <select data-testid="receipt-scanner-views-subcategory"
 value={showCustomInput ? '__custom__' : (value || '')}
 onChange={(e) => handleSelectChange(e.target.value)}
 className="w-full appearance-none bg-transparent text-sm font-medium text-gray-900 focus:outline-none"
 aria-label="Subcategory"
 >
 <option data-testid="receipt-scanner-views-select-subcategory" value="">- Select subcategory -</option>
 {subcategories.map((sub) => (
 <option data-testid={`receipt-scanner-views-option-2-${sub}`} key={sub} value={sub}>{sub}</option>
 ))}
 <option data-testid="receipt-scanner-views-other-type-custom" value="__custom__">Other (type custom)...</option>
 </select>
 {showCustomInput && (
 <input data-testid="receipt-scanner-views-type-custom-subcategory"
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
 <input data-testid="receipt-scanner-views-e-g-restaurant-groceries"
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
  <div className="KANAKU-receipt-card p-3">
    <label className="mb-1.5 block text-3xs font-bold uppercase tracking-widest text-gray-400">
      Charge to Account *
    </label>
    <select
      data-testid="receipt-scanner-views-charge-to-account"
      value={selectedId || ''}
      onChange={(event) => {
        const parsed = parseInt(event.target.value, 10);
        onChange(Number.isNaN(parsed) ? null : parsed);
      }}
      className="w-full appearance-none bg-transparent text-xs sm:text-sm font-semibold text-gray-900 focus:outline-none cursor-pointer"
      aria-label="Charge to account"
      title="Charge to account"
    >
      <option data-testid="receipt-scanner-views-select-an-account" value="">Select an account</option>
      {accounts.map((account) => (
        <option data-testid={`receipt-scanner-views-option-3-${account.id}`} key={account.id} value={account.id}>
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
  <div className="flex gap-2">
    <button
      data-testid="receipt-scanner-views-rescan"
      onClick={onRescan}
      className="flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2.5 text-xs sm:text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50 active:scale-95 cursor-pointer"
    >
      <RefreshCw size={13} /> Rescan
    </button>
    <button
      data-testid="receipt-scanner-views-button-6"
      onClick={onSubmit}
      disabled={isDisabled}
      className="flex flex-1 items-center justify-center rounded-lg bg-gray-900 py-2.5 text-xs sm:text-sm font-bold text-white shadow-md transition-colors hover:bg-black disabled:opacity-40 active:scale-[0.98] cursor-pointer"
    >
      {isFormPrefillMode
        ? `Use in ${expenseMode === 'group' ? 'Group' : 'Individual'} Expense`
        : 'Add Transaction'}
    </button>
  </div>
);
