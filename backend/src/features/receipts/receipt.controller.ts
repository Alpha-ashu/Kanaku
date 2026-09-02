import { Response } from 'express';
import { randomUUID, createHash } from 'crypto';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { logger } from '../../config/logger';
import { validateBillUpload, makeStoragePath, ValidatedUpload } from '../../utils/uploadPolicy';
import { uploadBuffer, createSignedUrl } from '../../utils/storage';
import { processImage } from '../../utils/imageProcessing';
import { scanReceiptWithGemini, scanReceiptFromText } from '../ai/ocr.engine';
import type { ExtractedReceipt } from '../ai/receiptSchema';
import { incrementAIUsage } from '../../utils/aiUsageTracker';
import { withCircuitBreaker } from '../../utils/circuitBreaker';
import { audit } from '../../utils/auditLogger';
import { prisma } from '../../db/prisma';

type JsonMap = Record<string, unknown>;

/**
 * Convert a PDF buffer into an OCR-processable form.
 *
 * Strategy 1 — digital PDFs: pdf-parse extracts the selectable text layer and
 *   the pipeline structures it directly (Gemini when configured, local
 *   heuristic parser otherwise) with no visual OCR at all.
 * Strategy 2 — scanned/flat PDFs: rasterise the first page to a real PNG via
 *   pdfjs-dist + @napi-rs/canvas, then run the normal image OCR pipeline
 *   (Gemini vision / Tesseract) on it.
 */
const convertPdfToImageForOcr = async (validated: ValidatedUpload): Promise<ValidatedUpload> => {
  logger.info('Converting PDF to processable format for OCR...');

  // Strategy 1: Extract text directly from the PDF (works for digital/text PDFs)
  try {
    const { extractPdfText } = await import('../../utils/pdfRender');
    const extractedText = await extractPdfText(validated.buffer);

    if (extractedText.length > 50) {
      logger.info('PDF contains extractable text, using direct text extraction', {
        textLength: extractedText.length,
      });
      // Store the extracted text in memory and pass it through as a pseudo-image
      // The OCR engine will detect this and skip Tesseract, going straight to parsing
      return {
        kind: 'image',
        originalName: validated.originalName,
        contentType: 'text/plain',
        extension: 'txt',
        buffer: Buffer.from(extractedText, 'utf-8'),
        _pdfExtractedText: extractedText,
      } as ValidatedUpload & { _pdfExtractedText: string };
    }
  } catch (pdfErr: any) {
    logger.warn('pdf-parse failed, will attempt page rasterisation', { error: pdfErr.message });
  }

  // Strategy 2: Scanned PDF (no text layer) — rasterise the first page and let
  // the standard image OCR pipeline handle the PNG.
  const { renderPdfFirstPageToPng } = await import('../../utils/pdfRender');
  const png = await renderPdfFirstPageToPng(validated.buffer);
  logger.info('Scanned PDF rasterised to PNG for OCR', { bytes: png.length });
  return {
    kind: 'image',
    originalName: validated.originalName,
    contentType: 'image/png',
    extension: 'png',
    buffer: png,
  };
};

const DEFAULT_OCR_ENDPOINT = 'http://127.0.0.1:8001/scan-receipt';

const getReceiptOcrEndpoint = () =>
  (process.env.RECEIPT_OCR_ENDPOINT || DEFAULT_OCR_ENDPOINT).replace(/\/+$/, '');

// NOTE: parseNumber / parseDate / firstString lived here as OCR response
// normalisers. The receipt pipeline moved to the shared extraction schema and
// stopped calling them; they were dead for long enough that keeping them only
// invited a second, divergent copy of date parsing. Removed.



const extractJson = async (response: globalThis.Response): Promise<JsonMap> => {
  const text = await response.text();
  if (!text) return {};

  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object') {
      return parsed as JsonMap;
    }
  } catch {
    // no-op
  }

  return {};
};

const OCR_JOBS = new Map<string, { status: string; data?: any; error?: string; startedAt?: number }>();

/**
 * Ceiling for a whole extraction job. Generous because the vision pass on a
 * large bill legitimately takes tens of seconds, but finite so a job can never
 * sit in `processing` indefinitely — the client's own budget is set above this,
 * so the user sees the real reason rather than a client-side timeout.
 */
const JOB_BUDGET_MS = Number(process.env.OCR_JOB_BUDGET_MS || 110_000);

/** Completed jobs are dropped after this, so the map cannot grow unbounded. */
const JOB_RETENTION_MS = 10 * 60_000;

const pruneExpiredJobs = () => {
  const cutoff = Date.now() - JOB_RETENTION_MS;
  for (const [id, job] of OCR_JOBS) {
    if (job.status !== 'processing' && (job.startedAt ?? 0) < cutoff) {
      OCR_JOBS.delete(id);
    }
  }
};

/**
 * Map a canonical reading onto the wire format.
 *
 * The legacy field names (merchantName, amount, taxBreakdown…) are kept because
 * existing clients read them; the structured fields (taxes, additionalCharges,
 * taxModel, validation) are added alongside. Nothing is computed here — this is
 * a rename, so the numbers a client sees are the ones the schema reconciled.
 */
const toApiPayload = (receipt: ExtractedReceipt) => ({
  // Structured contract
  merchant: receipt.merchant,
  billNumber: receipt.billNumber,
  date: receipt.date,
  time: receipt.time,
  currency: receipt.currency,
  subtotal: receipt.subtotal,
  discount: receipt.discount,
  discountPercent: receipt.discountPercent,
  taxes: receipt.taxes,
  totalTax: receipt.totalTax,
  additionalCharges: receipt.additionalCharges,
  totalCharges: receipt.totalCharges,
  roundOff: receipt.roundOff,
  total: receipt.total,
  taxModel: receipt.taxModel,
  items: receipt.items,
  paymentMethod: receipt.paymentMethod,
  category: receipt.category,
  description: receipt.description,
  validation: receipt.validation,
  engine: receipt.engine,

  // Legacy aliases retained for existing clients.
  merchantName: receipt.merchant.name ?? undefined,
  amount: receipt.total ?? undefined,
  taxAmount: receipt.totalTax ?? undefined,
  discountAmount: receipt.discount ?? undefined,
  invoiceNumber: receipt.billNumber ?? undefined,
  gstin: receipt.merchant.gstin ?? undefined,
  taxBreakdown: receipt.taxes.map((tax) => ({ name: tax.type, rate: tax.rate ?? undefined, amount: tax.amount })),
  validationResult: receipt.validation
    ? {
      isValid: receipt.validation.isValid,
      calculated: receipt.validation.calculated,
      detected: receipt.validation.detected,
    }
    : undefined,
  location: 'INDIA',
});

/**
 * Run the extraction pipeline and return a canonical reading.
 *
 * The engine ladder (vision -> text model -> offline heuristics) lives in
 * ocr.engine; this function owns only what surrounds it: the PDF text-layer
 * shortcut, the optional OCR.space detour for deployments without a Google key,
 * and the audit trail. The per-engine normalising that used to live here has
 * moved into receiptSchema so that every path is judged by the same rules.
 */
const executeFullOcrPipeline = async (userId: string, file: any, validated: any) => {
  // If PDF text was already extracted (digital PDF), there is no image to
  // preprocess — sharp would throw on the UTF-8 pseudo-buffer.
  const pdfExtractedText = validated._pdfExtractedText as string | undefined;
  const processed = pdfExtractedText
    ? { buffer: validated.buffer, contentType: 'text/plain', extension: 'txt', size: validated.buffer.length }
    : await processImage(validated.buffer);

  audit({
    event: 'ai.ocr_request',
    userId,
    meta: { fileSize: file.size, contentType: validated.contentType, isPdfText: !!pdfExtractedText },
  });

  let receipt: ExtractedReceipt | null = null;
  let failure: string | undefined;

  try {
    receipt = pdfExtractedText
      ? await scanReceiptFromText(pdfExtractedText)
      : await scanReceiptWithGemini(processed.buffer, processed.contentType);
  } catch (err: any) {
    failure = err?.message ?? String(err);
    logger.warn('Receipt extraction pipeline failed', { userId, error: failure });
  }

  // OCR.space is only worth trying when the in-process ladder produced nothing
  // usable — it is a third-party round trip and the slowest option available.
  if ((!receipt || receipt.total === null) && process.env.RECEIPT_OCR_API_KEY && !pdfExtractedText) {
    try {
      const spaceText = await withCircuitBreaker(
        { name: 'cloud-ocr-space', failureThreshold: 3, resetTimeoutMs: 120_000 },
        async () => {
          const formData = new FormData();
          formData.append('apikey', process.env.RECEIPT_OCR_API_KEY || '');
          formData.append('isOverlayRequired', 'true');
          formData.append('isTable', 'true');
          formData.append('OCREngine', '2');
          formData.append('file', new Blob([new Uint8Array(processed.buffer)], { type: processed.contentType }));

          const upstream = await fetch(getReceiptOcrEndpoint(), { method: 'POST', body: formData });
          if (!upstream.ok) throw new Error(`Upstream OCR returned ${upstream.status}`);

          const result = await extractJson(upstream);
          const parsedResults = result.ParsedResults as Array<{ ParsedText?: string }> | undefined;
          return Array.isArray(parsedResults) ? parsedResults[0]?.ParsedText ?? '' : '';
        },
      );

      if (spaceText.trim().length > 20) {
        receipt = await scanReceiptFromText(spaceText);
        audit({ event: 'ai.ocr_success', userId, meta: { source: 'ocr-space' } });
      }
    } catch (err: any) {
      audit({ event: 'ai.ocr_failure', userId, meta: { error: err.message, source: 'ocr-space' } });
    }
  }

  if (!receipt) {
    audit({ event: 'ai.ocr_failure', userId, meta: { error: failure ?? 'no engine produced a result' } });
    throw new Error(failure ?? 'Failed to read this bill');
  }

  audit({ event: 'ai.ocr_success', userId, meta: { source: receipt.engine, confidence: receipt.confidence } });

  return {
    normalized: toApiPayload(receipt),
    source: receipt.engine,
    // The API has always spoken 0-1 here; the schema scores 0-100.
    confidence: receipt.confidence / 100,
  };
};

export const startReceiptScan = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const file = req.file;
    if (!file) {
      logger.warn('startReceiptScan: No file provided');
      return res.status(400).json({ error: 'Receipt image file is required' });
    }

    const jobId = randomUUID();
    OCR_JOBS.set(jobId, { status: 'processing', startedAt: Date.now() });

    (async () => {
      try {
        const validated = await validateBillUpload(file);
        if (validated.kind !== 'image' && validated.kind !== 'document') {
          throw new Error('Unsupported file type');
        }

        // Convert PDF pages to images before OCR
        const ocrValidated = validated.kind === 'document' && validated.contentType === 'application/pdf'
          ? await convertPdfToImageForOcr(validated)
          : validated;

        // A hard ceiling on the whole job. The engine ladder already bounds each
        // model call, but a wedged upstream must not leave a job in
        // `processing` forever — the client would poll it until its own budget
        // ran out and report a timeout it could not explain.
        const { normalized, source, confidence } = await Promise.race([
          executeFullOcrPipeline(userId, file, ocrValidated),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Extraction took too long')), JOB_BUDGET_MS)),
        ]);

        // Persist the original uploaded file to backend storage and canonical database
        let persistedBillId: string | undefined;
        let persistedDownloadUrl: string | null = null;
        try {
          const baseName = (file.originalname || 'receipt').replace(/\.[^/.]+$/, '');
          const extension = ocrValidated.extension || 'jpg';
          const displayName = `${baseName}.${extension}`;
          const storagePath = makeStoragePath(userId, extension);
          await uploadBuffer(storagePath, validated.buffer, validated.contentType);

          const sha256 = createHash('sha256').update(validated.buffer).digest('hex');
          const bill = await prisma.expenseBill.create({
            data: {
              userId,
              originalName: displayName,
              contentType: validated.contentType,
              size: validated.buffer.length,
              storagePath,
              sha256,
              scanStatus: 'completed',
              scanResult: JSON.stringify(normalized),
            },
          });
          persistedBillId = bill.id;
          persistedDownloadUrl = await createSignedUrl(storagePath);
          logger.info('ATTACHMENT_DB_CREATED', { userId, billId: bill.id, storagePath });
        } catch (saveErr: any) {
          logger.warn('Failed to persist receipt image to storage/DB', { error: saveErr?.message || saveErr });
        }

        // confidence and source travel with the payload: the polling client
        // renders the confidence banner from them, and without them it fell back
        // to a hardcoded 85% that read "high confidence" on every scan.
        OCR_JOBS.set(jobId, {
          status: 'completed',
          startedAt: Date.now(),
          data: {
            ...normalized,
            billId: persistedBillId,
            downloadUrl: persistedDownloadUrl,
            source,
            confidence,
            requiresConfirmation: true,
          },
        });
        audit({ event: 'ai.ocr_success', userId, meta: { jobId, billId: persistedBillId, source, confidence } });
      } catch (err: any) {
        logger.error('Background OCR failed', { jobId, error: err.message, stack: err.stack });
        OCR_JOBS.set(jobId, { status: 'failed', error: err.message, startedAt: Date.now() });
      }
    })();

    return res.json({ job_id: jobId, status: 'processing' });
  } catch (error: any) {
    logger.error('Failed to start OCR job', { error: error.message, stack: error.stack });
    return res.status(500).json({ error: 'Failed to start OCR job' });
  }
};

export const getScanStatus = async (req: AuthRequest, res: Response) => {
  const { jobId } = req.params;
  pruneExpiredJobs();
  const job = OCR_JOBS.get(jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  // Elapsed time lets the client pace its polling and show honest progress
  // instead of counting its own attempts.
  if (job.status === 'processing') {
    return res.json({
      status: job.status,
      elapsedMs: Date.now() - (job.startedAt ?? Date.now()),
      budgetMs: JOB_BUDGET_MS,
    });
  }
  return res.json(job);
};

export const scanReceipt = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Receipt image file is required' });

    const quota = await incrementAIUsage(userId);
    if (!quota.allowed) {
      return res.status(429).json({ error: 'Daily AI scan limit reached' });
    }

    const validated = await validateBillUpload(file);
    if (validated.kind !== 'image' && validated.kind !== 'document') {
      return res.status(400).json({ error: 'Only images and PDF files are supported' });
    }

    // Convert PDF to image for OCR processing
    const ocrValidated = validated.kind === 'document' && validated.contentType === 'application/pdf'
      ? await convertPdfToImageForOcr(validated)
      : validated;

    const { normalized, source, confidence } = await executeFullOcrPipeline(userId, file, ocrValidated);

    // Persist scan result (Fail-safe: Don't crash if DB is down)
    try {
      const startTime = Date.now();
      await prisma.aiScan.create({
        data: {
          id: randomUUID(),
          userId,
          extractedJson: JSON.stringify(normalized),
          confidence,
          provider: source,
          processingMs: Date.now() - startTime,
          status: 'completed',
        },
      });
    } catch (dbError: any) {
      logger.warn('Failed to persist AI scan to DB, continuing anyway', { error: dbError.message });
    }

    return res.json({
      ...normalized,
      source,
      confidence,
      requiresConfirmation: true,
      quota: { remaining: quota.remaining, limit: quota.limit },
    });
  } catch (error: any) {
    logger.error('Receipt scan failed', { error: error.message, stack: error.stack });
    return res.status(500).json({ error: 'Failed to scan receipt. Please try again.' });
  }
};
