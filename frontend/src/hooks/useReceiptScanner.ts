import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { DocumentManagementService } from '@/services/documentManagementService';
import { EnhancedReceiptScannerService } from '@/services/enhancedReceiptScannerService';
import { cloudReceiptScanService } from '@/services/cloudReceiptScanService';
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
      return localStorage.getItem(RECEIPT_OCR_ON_DEVICE_ONLY_KEY) === 'true';
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

      if (onDeviceOnly) {
        result = await scanWithOnDeviceOcr();
      } else {
        try {
          result = await cloudOcrService.current.scanReceipt(selectedFile, (progress) => {
            setScanProgress(progress.progress);
            setScanStatus(progress.status);
          });
        } catch (cloudError: any) {
          // Which engine reads the bill is an implementation detail. Telling the
          // user the cloud failed and we are "falling back to on-device OCR"
          // reads as a malfunction in the middle of a scan that is still going
          // to succeed — so the retry happens quietly and only a genuine
          // end-to-end failure is ever reported.
          console.info('[ReceiptScanner] Cloud extraction unavailable, retrying on device:', cloudError?.message);
          setScanStatus('Still analyzing your receipt…');
          result = await scanWithOnDeviceOcr();
        }
      }
      
      if (!result) {
        return null;
      }

      await documentService.current.updateDocumentStatus(documentId, 'preview', {
        extractedCurrency: result.currency,
        metadata: {
          merchantName: result.merchantName || '',
          invoiceNumber: result.invoiceNumber || '',
          paymentMethod: result.paymentMethod || '',
          taxAmount: result.taxAmount?.toFixed(2) || '',
          subtotal: result.subtotal?.toFixed(2) || '',
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
