import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { DocumentManagementService } from '@/services/documentManagementService';
import { EnhancedReceiptScannerService } from '@/services/enhancedReceiptScannerService';
import { cloudReceiptScanService, CloudScanError } from '@/services/cloudReceiptScanService';
import { looksGarbled } from '@/lib/ocrTextQuality';
import type { ReceiptScanResult } from '@/types/receipt.types';

/** Failures the user can act on are shown verbatim; engine internals are not. */
const isActionableCloudFailure = (err: unknown): err is CloudScanError =>
  err instanceof CloudScanError
  && ['PIN_LOCKED', 'FEATURE_DISABLED', 'RATE_LIMITED', 'UNAUTHENTICATED', 'TIMEOUT'].includes(err.code);

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
      return stored !== null ? stored === 'true' : false; // Default to allowing cloud fallback for maximum compatibility
    } catch {
      return false;
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
      let resultSource: 'cloud' | 'device' | null = null;
      let cloudFailure: any = null;

      const isPdf = selectedFile.type === 'application/pdf';
      const isOnline = typeof navigator === 'undefined' || navigator.onLine !== false;
      // PDFs have no pixels for the on-device reader; they always need the server.
      const cloudPermitted = isOnline && (!onDeviceOnly || isPdf);

      const runCloud = async (): Promise<ReceiptScanResult | null> => {
        try {
          return await cloudOcrService.current.scanReceipt(selectedFile, (progress) => {
            setScanProgress(progress.progress);
            setScanStatus(progress.status);
          });
        } catch (err: any) {
          cloudFailure = err instanceof Error ? err : new Error(String(err));
          console.info('[ReceiptScanner] AI extraction unavailable:', cloudFailure.message);
          return null;
        }
      };

      const runOnDevice = async (): Promise<ReceiptScanResult | null> => {
        if (isPdf) return null;
        try {
          return await scanWithOnDeviceOcr();
        } catch (err: any) {
          console.info('[ReceiptScanner] On-device OCR failed:', err?.message);
          return null;
        }
      };

      if (cloudPermitted) {
        // AI (vision) first: it is the only engine that reads thermal-print
        // bills reliably. On-device OCR was previously run first and the AI
        // pass only escalated on a "weak" read — which let plausible-looking
        // but wrong local reads through and doubled the wait on every scan.
        result = await runCloud();
        if (result) resultSource = 'cloud';

        if (!result || !result.amount) {
          const local = await runOnDevice();
          if (local && (local.amount || !result)) {
            result = local;
            resultSource = 'device';
          }
        }
      } else if (isPdf) {
        toast.error(isOnline
          ? 'PDF bills need the AI reader — turn off "on-device only" to scan this file.'
          : 'PDF bills need an internet connection to be read.');
        return null;
      } else {
        result = await runOnDevice();
        if (result) resultSource = 'device';
      }

      if (!result) {
        if (isActionableCloudFailure(cloudFailure)) {
          toast.error(cloudFailure.message, { duration: 7000 });
        } else {
          toast.error('Could not clearly read the receipt. Please enter details manually.', {
            description: cloudFailure?.message,
          });
        }
        return null;
      }

      if (resultSource === 'device' && cloudFailure) {
        // The user is looking at the weaker engine's read — say so instead of
        // presenting it as the AI result.
        toast.warning('AI reading unavailable — showing the on-device read. Please verify the figures.', {
          description: isActionableCloudFailure(cloudFailure) ? cloudFailure.message : undefined,
          duration: 7000,
        });
      }

      // Clean up garbled text
      if (looksGarbled(result.merchantName)) {
        result = { ...result, merchantName: undefined };
      }

      await documentService.current.updateDocumentStatus(documentId, 'preview', {
        extractedCurrency: result.currency,
        extractedAmount: result.amount,
        metadata: {
          merchantName: result.merchantName || '',
          merchant: result.merchantName || '',
          amount: result.amount ? String(result.amount) : '',
          totalAmount: result.amount ? String(result.amount) : '',
          date: result.date ? (result.date instanceof Date ? result.date.toISOString() : String(result.date)) : '',
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
      console.error('[ReceiptScanner] Scan failed:', error);
      toast.error('Could not scan the receipt. Please try again or enter details manually.');
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
