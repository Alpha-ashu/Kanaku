/**
 * Raw-text OCR with PaddleOCR preferred, Tesseract as fallback.
 *
 * PaddleOCR runs in the Python `receipt_ai` service (it needs PaddlePaddle) and
 * is reached over HTTP at PADDLE_OCR_ENDPOINT (its /ocr route). It returns
 * layout-reconstructed text — rows grouped from bounding boxes — which is far
 * more accurate than Tesseract on columnar receipts/statements and stops table
 * layouts from collapsing into merged garbage.
 *
 * Everything degrades gracefully: no endpoint configured, service down, or a
 * blank result all fall through to the in-process Tesseract.js engine, so CI
 * and Donut-only / no-Python deployments are unaffected.
 */
import { logger } from '../config/logger';
import { withCircuitBreaker } from './circuitBreaker';

export type OcrEngine = 'paddleocr' | 'tesseract';

export interface RawOcrResult {
  text: string;
  engine: OcrEngine;
  /** mean per-line confidence (0–1) when the engine reports it */
  confidence?: number;
}

const getPaddleEndpoint = (): string =>
  (process.env.PADDLE_OCR_ENDPOINT || '').trim().replace(/\/+$/, '');

/** True when a PaddleOCR service URL is configured. */
export const isPaddleConfigured = (): boolean => getPaddleEndpoint().length > 0;

/**
 * Extract text via the PaddleOCR service. Throws when unconfigured, the service
 * errors, or it returns nothing — callers fall back to Tesseract.
 */
export const extractTextWithPaddle = async (
  buffer: Buffer,
  contentType = 'image/png',
): Promise<{ text: string; confidence: number }> => {
  const endpoint = getPaddleEndpoint();
  if (!endpoint) throw new Error('PADDLE_OCR_ENDPOINT not configured');

  return withCircuitBreaker(
    { name: 'paddle-ocr', failureThreshold: 3, resetTimeoutMs: 120_000 },
    async () => {
      const form = new FormData();
      form.append(
        'file',
        new Blob([new Uint8Array(buffer)], { type: contentType || 'image/png' }),
        'image.png',
      );

      const headers: Record<string, string> = {};
      if (process.env.RECEIPT_OCR_API_KEY) {
        headers['x-api-key'] = process.env.RECEIPT_OCR_API_KEY;
      }

      const res = await fetch(`${endpoint}/ocr`, { method: 'POST', body: form, headers });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`Paddle OCR returned ${res.status}: ${detail.slice(0, 150)}`);
      }

      const data = (await res.json()) as { text?: string; avgConfidence?: number };
      const text = (data.text || '').trim();
      if (!text) throw new Error('Paddle OCR returned empty text');
      return { text, confidence: typeof data.avgConfidence === 'number' ? data.avgConfidence : 0 };
    },
  );
};

/** Run Tesseract.js in-process. Kept as a dynamic import so the heavy WASM
 *  module only loads when a raw-text OCR pass actually runs. */
const extractTextWithTesseract = async (buffer: Buffer): Promise<string> => {
  const Tesseract = (await import('tesseract.js')).default;
  const result = await Tesseract.recognize(buffer, 'eng', {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text' && Math.round(m.progress * 100) % 25 === 0) {
        logger.debug(`Tesseract progress: ${Math.round(m.progress * 100)}%`);
      }
    },
  });
  return result.data.text.trim();
};

/**
 * Unified raw-text OCR: PaddleOCR when configured & reachable, otherwise
 * Tesseract. Never throws for an engine failure — always returns some text
 * (possibly empty) plus which engine produced it.
 */
export const extractRawText = async (
  buffer: Buffer,
  contentType = 'image/png',
): Promise<RawOcrResult> => {
  if (isPaddleConfigured()) {
    try {
      const { text, confidence } = await extractTextWithPaddle(buffer, contentType);
      logger.info('OCR: PaddleOCR extracted text', { chars: text.length, confidence });
      return { text, engine: 'paddleocr', confidence };
    } catch (err: any) {
      logger.warn('OCR: PaddleOCR failed, falling back to Tesseract', { error: err.message });
    }
  }

  const text = await extractTextWithTesseract(buffer);
  logger.info('OCR: Tesseract extracted text', { chars: text.length });
  return { text, engine: 'tesseract' };
};
