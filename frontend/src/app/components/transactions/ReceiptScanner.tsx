import React, { useEffect, useRef, useState } from 'react';
import { X, ScanLine, Paperclip, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useApp, useAICapability } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { useReceiptScanner } from '@/hooks/useReceiptScanner';
import { useTransactionCreation } from '@/hooks/useTransactionCreation';
import { detectExpenseCategoryFromText, getExpenseCategoryNames } from '@/lib/expenseCategories';
import { SUPPORTED_RECEIPT_MIME_TYPES } from '@/services/receiptScannerService';
import { DocumentManagementService } from '@/services/documentManagementService';
import type { ReceiptScannerProps } from '@/types/receipt.types';
import {
 ModeSelectionView,
 SourcePickerView,
 PreviewView,
 ResultsView,
 type ScanFieldUpdater,
} from '@/app/components/receipt-scanner/ReceiptScannerViews';
import { useSubmitLock } from '@/hooks/useSubmitLock';

export type { ReceiptScanPayload } from '@/types/receipt.types';

type Step =
 | 'mode' // Choose Scan Receipt or Add Attachment
 | 'source-scan' // Camera / Gallery (OCR path)
 | 'source-attach' // Camera / Gallery (attachment-only path)
 | 'preview-scan' // File selected, ready to scan
 | 'results' // OCR done
 | 'attaching'; // Saving attachment (no OCR)

const ATTACHMENT_MIME_TYPES = [
 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
 'application/pdf',
];

export const ReceiptScanner: React.FC<ReceiptScannerProps> = ({
 isOpen,
 onClose,
 onTransactionCreated,
 onApplyScan,
 onAttachmentSaved,
 expenseMode = 'individual',
 initialAccountId,
 initialMode = null,
}) => {
 const guardSubmit = useSubmitLock();
 const { accounts, currency, setCurrentPage } = useApp();
 const { user } = useAuth();
 const isOcrCapability = useAICapability('ocrEngine', 'transactionOCR');
 const isOcrEnabled = isOcrCapability !== false;

 const {
 selectedFile,
 previewUrl,
 isScanning,
 scanProgress,
 scanStatus,
 scanResult,
 scanDocumentId,
 onDeviceOnly,
 setScanResult,
 selectFile,
 clearFile,
 scanReceipt,
 setOnDeviceOnly,
 } = useReceiptScanner();

 const { createTransaction } = useTransactionCreation();
 const documentService = useRef(new DocumentManagementService());

 const [selectedAccountId, setSelectedAccountId] = useState<number | null>(
 initialAccountId ?? accounts[0]?.id ?? null,
 );

 // Step machine 
 const [step, setStep] = useState<Step>(() =>
 initialMode === 'scan' ? 'source-scan'
 : initialMode === 'attachment' ? 'source-attach'
 : 'mode'
 );

 // Attachment-only state
 const [attachFile, setAttachFile] = useState<File | null>(null);
 const [isSavingAttachment, setIsSavingAttachment] = useState(false);

 const fileInputRef = useRef<HTMLInputElement>(null);
 const cameraInputRef = useRef<HTMLInputElement>(null);
 const attachFileInputRef = useRef<HTMLInputElement>(null);
 const attachCameraInputRef = useRef<HTMLInputElement>(null);

 const expenseCategoryOptions = getExpenseCategoryNames();
 const isFormPrefillMode = !!onApplyScan;

 useEffect(() => {
 if (isOpen) {
 setSelectedAccountId(initialAccountId ?? accounts[0]?.id ?? null);
 setStep(
 initialMode === 'scan' ? 'source-scan'
 : initialMode === 'attachment' ? 'source-attach'
 : 'mode'
 );
 }
 }, [accounts, initialAccountId, initialMode, isOpen]);

 // Reset on close 
 const handleClose = () => {
 clearFile();
 setAttachFile(null);
 setSelectedAccountId(accounts[0]?.id ?? null);
 setStep(
 initialMode === 'scan' ? 'source-scan'
 : initialMode === 'attachment' ? 'source-attach'
 : 'mode'
 );
 onClose();
 };

 // Scan-mode file selection 
 const handleScanFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
 const file = event.target.files?.[0];
 if (!file) return;
 if (!SUPPORTED_RECEIPT_MIME_TYPES.includes(file.type)) {
 toast.error('Supported files: JPG, PNG, PDF, HEIC, WEBP');
 return;
 }
 if (file.size > 15 * 1024 * 1024) {
 toast.error('File size must be under 15 MB');
 return;
 }
 selectFile(file);
 setStep('preview-scan');
 };

 const handleScanReceipt = async () => {
 if (!selectedFile) {
 toast.error('Please select an image first');
 return;
 }
 const result = await scanReceipt(selectedAccountId ?? undefined, user?.id);
 if (result?.validationResult && !result.validationResult.isValid) {
 const { calculated, detected } = result.validationResult;
 const cur = result.currency ?? '';
 const hint = calculated > detected
 ? `The printed amount (${cur} ${detected.toFixed(2)}) appears to be a pre-tax subtotal. The amount field has been set to the calculated total (${cur} ${calculated.toFixed(2)}) please verify.`
 : `Calculated total (${cur} ${calculated.toFixed(2)}) doesn't match the printed total (${cur} ${detected.toFixed(2)}). Please verify the amount before saving.`;
 toast.warning(hint, { duration: 10000 });
 }
 if (result) setStep('results');
 };

 const handleCreateTransaction = guardSubmit(async () => {
 if (!scanResult || !selectedAccountId) {
 toast.error('Please select an account to continue');
 return;
 }
 if (!scanResult.amount || scanResult.amount <= 0) {
 toast.error('Amount must be greater than zero');
 return;
 }
 if (scanDocumentId) {
 await documentService.current.updateDocumentStatus(scanDocumentId, 'completed', {
 extractedCurrency: scanResult.currency,
 extractedAmount: scanResult.amount,
 metadata: {
 merchantName: scanResult.merchantName || '',
 merchant: scanResult.merchantName || '',
 amount: scanResult.amount ? String(scanResult.amount) : '',
 totalAmount: scanResult.amount ? String(scanResult.amount) : '',
 invoiceNumber: scanResult.invoiceNumber || '',
 paymentMethod: scanResult.paymentMethod || '',
 taxAmount: scanResult.taxAmount?.toFixed(2) || '',
 subtotal: scanResult.subtotal?.toFixed(2) || '',
 category: scanResult.category || '',
 date: scanResult.date ? (scanResult.date instanceof Date ? scanResult.date.toISOString() : String(scanResult.date)) : '',
 },
 });
 }
 await createTransaction(scanResult, selectedAccountId, scanDocumentId, (transactionId) => {
 onTransactionCreated?.(transactionId);
 handleClose();
 setCurrentPage('transactions');
 });
 });

 const handleApplyScanToForm = async () => {
 if (!scanResult || !selectedAccountId) {
 toast.error('Please select an account to continue');
 return;
 }
 if (scanDocumentId) {
 await documentService.current.updateDocumentStatus(scanDocumentId, 'completed', {
 extractedCurrency: scanResult.currency,
 extractedAmount: scanResult.amount,
 metadata: {
 merchantName: scanResult.merchantName || '',
 merchant: scanResult.merchantName || '',
 amount: scanResult.amount ? String(scanResult.amount) : '',
 totalAmount: scanResult.amount ? String(scanResult.amount) : '',
 invoiceNumber: scanResult.invoiceNumber || '',
 paymentMethod: scanResult.paymentMethod || '',
 taxAmount: scanResult.taxAmount?.toFixed(2) || '',
 subtotal: scanResult.subtotal?.toFixed(2) || '',
 category: scanResult.category || '',
 date: scanResult.date ? (scanResult.date instanceof Date ? scanResult.date.toISOString() : String(scanResult.date)) : '',
 },
 });
 }
 onApplyScan?.({ ...scanResult, accountId: selectedAccountId, scanDocumentId });
 toast.success(`Receipt applied to ${expenseMode === 'group' ? 'group' : 'individual'} expense form`);
 handleClose();
 };

 const updateScanResultField: ScanFieldUpdater = (field, value) => {
 if (scanResult) setScanResult({ ...scanResult, [field]: value });
 };

 const handleSubcategoryChange = (value: string) => {
 if (!scanResult) return;
 const detected = value.trim().length >= 3 ? detectExpenseCategoryFromText(value) : null;
 setScanResult({
 ...scanResult,
 subcategory: value,
 category: detected?.category ?? scanResult.category ?? 'Shopping',
 });
 };

 // Attachment-mode file selection 
 const handleAttachFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
 const file = event.target.files?.[0];
 if (!file) return;
 if (!ATTACHMENT_MIME_TYPES.includes(file.type)) {
 toast.error('Supported files: JPG, PNG, PDF, HEIC, WEBP');
 return;
 }
 if (file.size > 15 * 1024 * 1024) {
 toast.error('File size must be under 15 MB');
 return;
 }
 setAttachFile(file);
 setStep('attaching');
 saveAttachment(file);
 };

 const saveAttachment = async (file: File) => {
 setIsSavingAttachment(true);
 try {
 const docId = await documentService.current.createDocumentRecord(file, selectedAccountId ?? undefined);
 // Mark as completed immediately no OCR
 await documentService.current.updateDocumentStatus(docId, 'completed');
 toast.success('Attachment saved link it to an expense when you save.');
 onAttachmentSaved?.(docId);
 handleClose();
 } catch (err) {
 toast.error('Failed to save attachment. Please try again.');
 setStep('source-attach');
 } finally {
 setIsSavingAttachment(false);
 }
 };

 if (!isOpen) return null;

 // Dynamic header title 
 const headerTitle =
 step === 'mode' ? 'Receipt' :
 step === 'source-scan' || step === 'preview-scan' || step === 'results' ? 'Scan Receipt' :
 'Add Attachment';

 const headerSubtitle =
 step === 'mode' ? 'Choose how you want to add a receipt' :
 step === 'source-scan' ? 'AI-powered OCR reads any receipt' :
 step === 'source-attach' ? 'No OCR file saved as proof only' :
 step === 'preview-scan' ? 'Ready to extract data' :
 step === 'results' ? 'Review extracted data' :
 'Saving attachment';

 const headerIcon = (step === 'source-attach' || step === 'attaching')
 ? <Paperclip size={17} className="text-white" />
 : <ScanLine size={17} className="text-white" />;

 return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-4 animate-in fade-in duration-200">
      <div className={cn(
        "flex max-h-[88vh] w-full flex-col overflow-hidden rounded-[24px] sm:rounded-[32px] bg-white shadow-2xl border border-slate-100 transition-all duration-300",
        step === 'results' ? "max-w-xl" : "max-w-sm sm:max-w-md"
      )}>

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 sm:px-6 py-4 shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 shrink-0 text-white shadow-2xs">
              {headerIcon}
            </div>
            <h2 className="font-display text-base sm:text-lg font-bold text-slate-900 truncate">{headerTitle}</h2>
          </div>
          <button
            data-testid="receipt-scanner-close"
            type="button"
            onClick={handleClose}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-slate-100 hover:bg-slate-200/80 transition-colors flex items-center justify-center shrink-0 cursor-pointer text-slate-600"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">

          {/* Step: Mode selection */}
          {step === 'mode' && (
            <ModeSelectionView
              onSelectMode={(mode) => setStep(mode === 'scan' ? 'source-scan' : 'source-attach')}
              isOcrEnabled={isOcrEnabled}
            />
          )}

          {/* Step: Source picker Scan mode */}
          {step === 'source-scan' && (
            <SourcePickerView
              mode="scan"
              onCameraClick={() => cameraInputRef.current?.click()}
              onUploadClick={() => fileInputRef.current?.click()}
              onBack={() => setStep('mode')}
              canGoBack={initialMode === null}
            />
          )}

          {/* Step: Source picker Attachment mode */}
          {step === 'source-attach' && (
            <SourcePickerView
              mode="attachment"
              onCameraClick={() => attachCameraInputRef.current?.click()}
              onUploadClick={() => attachFileInputRef.current?.click()}
              onBack={() => setStep('mode')}
              canGoBack={initialMode === null}
            />
          )}

          {/* Step: Preview (scan mode) */}
          {step === 'preview-scan' && selectedFile && !scanResult && (
            <div className="space-y-4">
              <PreviewView
                file={selectedFile}
                previewUrl={previewUrl}
                isScanning={isScanning}
                scanProgress={scanProgress}
                scanStatus={scanStatus}
                onScan={handleScanReceipt}
                onChange={() => { clearFile(); setStep('source-scan'); }}
              />
            </div>
          )}

 {/* Step: Results (OCR done) */}
 {step === 'results' && scanResult && (
 <ResultsView
 scanResult={scanResult}
 accounts={accounts}
 selectedAccountId={selectedAccountId}
 currency={currency}
 expenseCategoryOptions={expenseCategoryOptions}
 isFormPrefillMode={isFormPrefillMode}
 expenseMode={expenseMode}
 onAccountChange={setSelectedAccountId}
 onFieldChange={updateScanResultField}
 onSubcategoryChange={handleSubcategoryChange}
 onRescan={() => { setScanResult(null); clearFile(); setStep('source-scan'); }}
 onSubmit={isFormPrefillMode ? handleApplyScanToForm : handleCreateTransaction}
 />
 )}

 {/* Step: Saving attachment */}
 {step === 'attaching' && (
 <div className="flex flex-col items-center justify-center gap-4 py-12">
 <Loader2 size={36} className="animate-spin text-slate-400" />
 <p className="text-sm font-bold text-slate-600">Saving attachment</p>
 {attachFile && (
 <p className="text-xs text-slate-400 truncate max-w-[200px]">{attachFile.name}</p>
 )}
 </div>
 )}
 </div>
 </div>

 {/* Hidden file inputs Scan mode */}
 <input data-testid="receipt-scanner-upload-receipt-for-scanning"
 ref={fileInputRef}
 type="file"
 accept="image/*,.pdf,.heic,.heif,.webp"
 onChange={handleScanFileSelect}
 className="hidden"
 aria-label="Upload receipt for scanning"
 />
 <input data-testid="receipt-scanner-take-photo-for-scanning"
 ref={cameraInputRef}
 type="file"
 accept="image/*"
 capture="environment"
 onChange={handleScanFileSelect}
 className="hidden"
 aria-label="Take photo for scanning"
 />

 {/* Hidden file inputs Attachment mode */}
 <input data-testid="receipt-scanner-upload-attachment"
 ref={attachFileInputRef}
 type="file"
 accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
 onChange={handleAttachFileSelect}
 className="hidden"
 aria-label="Upload attachment"
 />
 <input data-testid="receipt-scanner-take-photo-for-attachment"
 ref={attachCameraInputRef}
 type="file"
 accept="image/*"
 capture="environment"
 onChange={handleAttachFileSelect}
 className="hidden"
 aria-label="Take photo for attachment"
 />
 </div>
 );
};
