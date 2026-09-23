// Lazy-load tesseract.js to reduce initial bundle size
const getTesseract = async () => import('tesseract.js');

import { parseReceiptText, preprocessReceiptFileVariants } from '@/services/receiptScannerService';
import { receiptParserService } from '@/services/receiptParserService';
import type { OCRProgress, ReceiptScanResult } from '@/types/receipt.types';

export interface OCRService {
  extractText(
    input: Blob | File,
    onProgress?: (progress: OCRProgress) => void,
    options?: { language?: string; statusPrefix?: string },
  ): Promise<{ text: string; confidence: number }>;

  scanReceipt(
    file: File,
    userId?: string,
    onProgress?: (progress: OCRProgress) => void,
    preferredCurrency?: string,
  ): Promise<ReceiptScanResult>;
}

export class TesseractOCRService implements OCRService {
  private readonly MIN_CONFIDENCE = 55;

  private readonly MIN_TEXT_LENGTH = 24;

  private readonly OCR_VARIANTS: Array<{ label: string }> = [
    { label: 'original' },
    { label: 'clean' },
    { label: 'enhanced' },
  ];

  async scanReceipt(
    file: File,
    userId?: string,
    onProgress?: (progress: OCRProgress) => void,
    preferredCurrency: string = 'INR',
  ): Promise<ReceiptScanResult> {
    try {
      onProgress?.({ status: 'Preparing receipt variants...', progress: 10 });
      const processedVariants = await preprocessReceiptFileVariants(file);
      const variantInputMap = new Map<string, Blob | File>([
        ['original', file],
        ...processedVariants.map((variant) => [variant.label, variant.blob] as const),
      ]);

      let bestResult: ReceiptScanResult | null = null;
      let bestInput: Blob | File = file;

      for (let index = 0; index < this.OCR_VARIANTS.length; index += 1) {
        const variant = this.OCR_VARIANTS[index];
        const input = variantInputMap.get(variant.label);
        if (!input) continue;

        const startProgress = 18 + (index * 18);
        onProgress?.({
          status: `Reading receipt (${variant.label})...`,
          progress: startProgress,
        });

        const ocr = await this.extractText(input, (progress) => {
          const scaledProgress = startProgress + Math.round(progress.progress * 0.15);
          onProgress?.({
            status: progress.status,
            progress: Math.min(75, scaledProgress),
          });
        }, {
          language: 'eng',
          statusPrefix: `Reading text (${variant.label})...`,
        });

        const result = await this.parseAndComposeResult(ocr.text, ocr.confidence, userId, preferredCurrency);
        if (!bestResult || this.scoreResult(result) > this.scoreResult(bestResult)) {
          bestResult = result;
          bestInput = input;
        }
      }

      if (!bestResult) {
        throw new Error('No OCR text could be extracted from the receipt');
      }

      let result = bestResult;

      if (this.needsMultilingualRetry(result)) {
        try {
          onProgress?.({ status: 'Retrying with multilingual OCR...', progress: 80 });
          const multilingualOcr = await this.extractText(bestInput, onProgress, {
            language: 'eng+hin+spa',
            statusPrefix: 'Multilingual OCR...',
          });
          const fallbackResult = await this.parseAndComposeResult(multilingualOcr.text, multilingualOcr.confidence, userId, preferredCurrency);
          result = this.selectBestResult(result, fallbackResult);
        } catch (multilingualError) {
          console.warn('Multilingual OCR retry failed, using best single-language result:', multilingualError);
        }
      }

      return result;
    } catch (error) {
      console.error('OCR failed:', error);
      throw new Error('Failed to scan receipt. Please try again with a clearer image.');
    }
  }

  private async createWorkerWithProgress(
    onProgress: ((progress: OCRProgress) => void) | undefined,
    language: string,
    statusPrefix: string,
  ) {
    const { createWorker } = await getTesseract();
    return createWorker(language, 1, {
      logger: (message) => {
        if (message.status === 'recognizing text') {
          const progress = Math.round((message.progress ?? 0) * 100);
          onProgress?.({
            status: `${statusPrefix} ${progress}%`,
            progress,
          });
        }
      },
    });
  }

  async extractText(
    input: Blob | File,
    onProgress?: (progress: OCRProgress) => void,
    options?: { language?: string; statusPrefix?: string },
  ): Promise<{ text: string; confidence: number }> {
    const language = options?.language || 'eng';
    const statusPrefix = options?.statusPrefix || 'Reading text...';
    const worker = await this.createWorkerWithProgress(onProgress, language, statusPrefix);

    try {
      const { data } = await worker.recognize(input);
      const ocrConfidenceRaw = data.confidence;
      const normalizedOcrConfidence = typeof ocrConfidenceRaw === 'number'
        ? (ocrConfidenceRaw > 1 ? ocrConfidenceRaw / 100 : ocrConfidenceRaw)
        : 0;

      return { text: data.text || '', confidence: Math.max(0, Math.min(1, normalizedOcrConfidence || 0)) };
    } finally {
      await worker.terminate();
    }
  }

  private async parseAndComposeResult(
    rawText: string,
    ocrConfidence: number,
    userId?: string,
    preferredCurrency: string = 'INR',
  ): Promise<ReceiptScanResult> {
    const parsed = await this.parseWithStrategies(rawText, userId, preferredCurrency);
    const parserConfidence = parsed.confidence;
    const combinedConfidence = (() => {
      if (typeof parserConfidence === 'number') {
        return Math.max(0, Math.min(1, (ocrConfidence * 0.65) + (parserConfidence * 0.35)));
      }
      return Math.max(0, Math.min(1, ocrConfidence));
    })();

    return {
      ...parsed,
      rawText,
      confidence: combinedConfidence,
    };
  }

  private async parseWithStrategies(
    rawText: string,
    userId?: string,
    preferredCurrency: string = 'INR',
  ): Promise<ReceiptScanResult> {
    try {
      const strategic = await receiptParserService.parseReceipt(rawText, { userId });
      const heuristic = await parseReceiptText(rawText, userId, preferredCurrency);

      const resolvedCurrency = strategic.currency || heuristic.currency || preferredCurrency;

      return {
        ...heuristic,
        ...strategic,
        currency: resolvedCurrency,
        items: strategic.items?.length ? strategic.items : heuristic.items,
        taxBreakdown: strategic.taxBreakdown?.length ? strategic.taxBreakdown : heuristic.taxBreakdown,
        validationResult: strategic.validationResult ?? heuristic.validationResult,
        description: strategic.description ?? heuristic.description,
        rawText,
      };
    } catch {
      // Keep existing parser as a safety fallback for unknown receipt formats.
      return parseReceiptText(rawText, userId, preferredCurrency);
    }
  }

  private selectBestResult(primary: ReceiptScanResult, fallback: ReceiptScanResult): ReceiptScanResult {
    return this.scoreResult(fallback) > this.scoreResult(primary) ? fallback : primary;
  }

  private scoreResult(result: ReceiptScanResult): number {
    let score = result.confidence || 0;
    const rawTextLength = result.rawText?.replace(/\s+/g, '').length || 0;

    if (result.amount && result.amount > 0) score += 0.18;
    else score -= 0.3;

    if (result.subtotal && result.amount && result.subtotal > 0 && result.subtotal <= result.amount * 1.05) score += 0.05;
    if (result.taxAmount !== undefined && result.amount && result.taxAmount >= 0 && result.taxAmount <= result.amount * 0.35) score += 0.06;
    if (result.date) score += 0.06;
    if (result.invoiceNumber) score += 0.04;
    if (result.items && result.items.length > 0) score += Math.min(0.12, result.items.length * 0.03);
    if (result.merchantName && !this.looksLikeGarbageMerchant(result.merchantName)) score += 0.12;
    else if (result.merchantName) score -= 0.08;
    if (rawTextLength >= this.MIN_TEXT_LENGTH) score += 0.05;

    if (result.taxAmount !== undefined && result.amount && result.taxAmount > result.amount * 0.4) score -= 0.25;
    if (result.subtotal && result.amount && result.subtotal > result.amount * 1.15) score -= 0.2;
    if (result.category === 'Housing' && /restaurant|cafe|food|menu|gst|fssai/i.test(result.rawText || '')) score -= 0.15;

    return score;
  }

  private looksLikeGarbageMerchant(value: string): boolean {
    const compact = value.replace(/\s+/g, '');
    const alpha = compact.match(/[a-z]/gi)?.length || 0;
    if (compact.length < 3) return true;
    if (alpha < 3) return true;
    if ((alpha / compact.length) < 0.45) return true;
    if (/(.)\1{3,}/i.test(compact)) return true;
    if (/^aiatea$/i.test(compact)) return true;
    return false;
  }

  private needsMultilingualRetry(result: ReceiptScanResult): boolean {
    return (
      (result.confidence ?? 0) < this.MIN_CONFIDENCE / 100
      || (result.rawText?.replace(/\s+/g, '').length ?? 0) < this.MIN_TEXT_LENGTH
    );
  }
}
