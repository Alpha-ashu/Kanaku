import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { DocumentManagementService } from '@/services/documentManagementService';
import { EnhancedReceiptScannerService } from '@/services/enhancedReceiptScannerService';
import { cloudReceiptScanService } from '@/services/cloudReceiptScanService';
import { assessScanQuality, looksGarbled } from '@/lib/ocrTextQuality';
import type { ReceiptScanResult } from '@/types/receipt.types';

const RECEIPT_OCR_ON_DEVICE_ONLY_KEY = 'receipt_scanner_on_device_only';

export const useReceiptScanner = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanStatus, setScanStatus] = useState('');
  const [scanResult, setScanResult] = useState<ReceiptScanResult | null>(null);
  const [scanDocumentId, setScanDocumentId] = useState<number | null>(null);

  const [onDeviceOnly, setOnDeviceOnly] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(RECEIPT_OCR_ON_DEVICE_ONLY_KEY);
      return stored !== null ? stored === 'true' : true; // Default ON-DEVICE OCR to true
    } catch {
      return true;
    }
  });

  const ocrService = useRef(new EnhancedReceiptScannerService());
  const documentService = useRef(new DocumentManagementService());
  const cloudOcrService = useRef(cloudReceiptScanService);

  const updateOnDeviceOnly = useCallback((value: boolean) => {
    setOnDeviceOnly(value);
    try {
      localStorage.setItem(RECEIPT_OCR_ON_DEVICE_ONLY_KEY, String(value));
    } catch {
      // Ignore storage failures.
    }
  }, []);

  const selectFile = useCallback((file: File) => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setSelectedFile(file);
    setPreviewUrl(file.type.startsWith('image/') ? URL.createObjectURL(file) : '');
    setScanResult(null);
    setScanProgress(0);
    setScanStatus('');
    setScanDocumentId(null);
  }, [previewUrl]);

  const clearFile = useCallback(() => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl('');
    setScanResult(null);
    setScanDocumentId(null);
    setScanProgress(0);
    setScanStatus('');
  }, [previewUrl]);

  const scanReceipt = useCallback(async (accountId?: number, userId?: string) => {
    if (!selectedFile) {
      toast.error('Please select an image first');
      return null;
    }

    setIsScanning(true);
    setScanProgress(0);
    setScanStatus('Preparing receipt...');

    let documentId: number | null = null;

    try {
      documentId = await documentService.current.createDocumentRecord(selectedFile, accountId);
      setScanDocumentId(documentId);

      const scanWithOnDeviceOcr = async () => ocrService.current.scanAndParseReceipt(
        selectedFile,
        userId,
        (status, progress) => {
          setScanProgress(progress);
          setScanStatus(status);
        },
      );

      let result: ReceiptScanResult | null = null;

      // 1. On-device OCR first — it is private and fast, and on a clean bill it
      //    is all we need.
      try {
        result = await scanWithOnDeviceOcr();
      } catch (onDeviceErr: any) {
        console.info('[ReceiptScanner] On-device OCR attempt error:', onDeviceErr?.message);
      }

      // 2. Escalate on QUALITY, not on emptiness.
      //
      //    On-device OCR of a thermal receipt nearly always yields *an* amount,
      //    so gating on `!result.amount` meant the cloud engine effectively
      //    never ran: a bill whose merchant read as "SHREGQWRICKI" and whose
      //    unreadable printed total was silently replaced by the sum of its
      //    parts still counted as success. Escalating when the reading is
      //    visibly degraded is what makes the better engine reachable.
      const quality = assessScanQuality(result);
      if (!onDeviceOnly && quality.shouldEscalate) {
        console.info('[ReceiptScanner] Local read is weak, asking the cloud engine:', quality.reasons.join(', '));
        try {
          const cloudResult = await cloudOcrService.current.scanReceipt(selectedFile, (progress) => {
            setScanProgress(progress.progress);
            setScanStatus(progress.status);
          });

          // Only take the cloud reading if it is actually better — a rate-limited
          // backend can fall back to the same heuristics we just ran.
          const cloudQuality = assessScanQuality(cloudResult);
          if (cloudResult?.amount && cloudQuality.score >= quality.score) {
            result = cloudResult;
          }
        } catch (cloudError: any) {
          console.info('[ReceiptScanner] Cloud extraction unavailable:', cloudError?.message);
        }
      }

      
      if (!result) {
        return null;
      }

      // A garbled merchant is worse than an empty one: the user cannot tell
      // "SHREGQWRICKI" is a misread until they compare it against the bill,
      // whereas an empty field visibly asks to be filled in.
      if (looksGarbled(result.merchantName)) {
        result = { ...result, merchantName: undefined };
      }

      await documentService.current.updateDocumentStatus(documentId, 'preview', {
        extractedCurrency: result.currency,
        extractedAmount: result.amount,
        metadata: {
          merchantName: result.merchantName || '',
          amount: result.amount ? String(result.amount) : '',
          totalAmount: result.amount ? String(result.amount) : '',
          invoiceNumber: result.invoiceNumber || '',
          paymentMethod: result.paymentMethod || '',
          taxAmount: result.taxAmount?.toFixed(2) || '',
          subtotal: result.subtotal?.toFixed(2) || '',
          category: result.category || '',
        },
      });


      setScanResult(result);

      if (result.amount && result.amount > 0) {
        if (result.requiresReview) {
          // The components did not reconcile with the printed total. Saying
          // "found ₹X" here would present a number the engine itself does not
          // trust as a clean read.
          toast.warning(`Read ${result.currency || 'INR'} ${result.amount.toFixed(2)} — please check the figures before saving.`, {
            description: result.reviewIssues?.[0],
            duration: 7000,
          });
        } else {
          toast.success(`Found total: ${result.currency || 'INR'} ${result.amount.toFixed(2)}`);
        }
      } else {
        toast.warning('Could not detect the total. Please enter it before saving.');
      }

      return result;
    } catch (error) {
      if (documentId) {
        await documentService.current.markAsFailed(documentId);
      }
      toast.error(error instanceof Error ? error.message : 'Scan failed. Please try again.');
      return null;
    } finally {
      setIsScanning(false);
      setScanProgress(100);
    }
  }, [onDeviceOnly, selectedFile]);

  return {
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
    setOnDeviceOnly: updateOnDeviceOnly,
  };
};
