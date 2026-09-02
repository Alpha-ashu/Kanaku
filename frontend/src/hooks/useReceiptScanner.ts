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

      // 1. Try on-device OCR first (fast & local)
      try {
        result = await scanWithOnDeviceOcr();
      } catch (onDeviceErr: any) {
        console.info('[ReceiptScanner] On-device OCR attempt error (falling back to cloud):', onDeviceErr?.message);
      }

      // 2. If on-device produced no result OR weak quality, escalate to cloud OCR engine
      const quality = assessScanQuality(result);
      if (!result || (!onDeviceOnly && quality.shouldEscalate)) {
        console.info('[ReceiptScanner] Local read missing or weak, attempting cloud OCR...');
        try {
          const cloudResult = await cloudOcrService.current.scanReceipt(selectedFile, (progress) => {
            setScanProgress(progress.progress);
            setScanStatus(progress.status);
          });

          if (cloudResult && (cloudResult.amount || !result)) {
            result = cloudResult;
          }
        } catch (cloudError: any) {
          console.info('[ReceiptScanner] Cloud extraction unavailable:', cloudError?.message);
        }
      }

      if (!result) {
        toast.error('Could not clearly read the receipt. Please enter details manually.');
        return null;
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
