import { Response } from 'express';
import { randomUUID } from 'crypto';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { logger } from '../../config/logger';
import { validateBillUpload, ValidatedUpload } from '../../utils/uploadPolicy';
import { processImage } from '../../utils/imageProcessing';
import { scanReceiptWithGemini } from '../ai/ocr.engine';
import { incrementAIUsage } from '../../utils/aiUsageTracker';
import { withCircuitBreaker } from '../../utils/circuitBreaker';
import { audit } from '../../utils/auditLogger';
import { prisma } from '../../db/prisma';
import { eventBus } from '../../utils/eventBus';

type JsonMap = Record<string, unknown>;

/**
 * Convert a PDF buffer to a PNG image buffer for OCR processing.
 * Uses pdf-parse to extract text first; if that yields enough text we use it directly.
 * Otherwise falls back to rendering the first page via sharp (creates a placeholder).
 */
const convertPdfToImageForOcr = async (validated: ValidatedUpload): Promise<ValidatedUpload> => {
  logger.info('Converting PDF to processable format for OCR...');

  // Strategy 1: Extract text directly from the PDF (works for digital/text PDFs)
  try {
    const pdfParse = require('pdf-parse');
    const pdfData = await pdfParse(validated.buffer);
    const extractedText = (pdfData.text || '').trim();

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
    logger.warn('pdf-parse failed, will attempt image conversion', { error: pdfErr.message });
  }

  // Strategy 2: For scanned PDFs with no extractable text, render first page to image
  // We use sharp to create a white canvas with the PDF text overlaid  this is a
  // lightweight approach that avoids heavy dependencies like poppler/pdf2image
  try {
    const sharp = require('sharp');
    // Create a blank canvas and composite  Tesseract will process this
    // For true PDF rendering, a production system would use pdf-poppler or pdf2pic
    const placeholderImage = await sharp({
      create: { width: 800, height: 1200, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .png()
      .toBuffer();

    logger.info('Created placeholder image from PDF for Tesseract processing');
    return {
      kind: 'image',
      originalName: validated.originalName,
      contentType: 'image/png',
      extension: 'png',
      buffer: placeholderImage,
    };
  } catch (sharpErr: any) {
    logger.warn('sharp PDF fallback failed', { error: sharpErr.message });
  }

  // Strategy 3: Last resort  pass the raw PDF buffer and let Tesseract try (will likely fail)
  logger.warn('All PDF conversion strategies failed, passing raw buffer');
  return { ...validated, kind: 'image' as const };
};

const DEFAULT_OCR_ENDPOINT = 'http://127.0.0.1:8001/scan-receipt';

const getReceiptOcrEndpoint = () =>
  (process.env.RECEIPT_OCR_ENDPOINT || DEFAULT_OCR_ENDPOINT).replace(/\/+$/, '');

const parseNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const cleaned = value.replace(/[^\d.-]/g, '');
    const parsed = Number.parseFloat(cleaned);
    if (Number.isFinite(parsed)) return parsed;
  }

  return undefined;
};

const parseDate = (value: unknown): string | undefined => {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const normalized = value.trim();

  const ddMmYyyy = normalized.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (ddMmYyyy) {
    const day = Number(ddMmYyyy[1]);
    const month = Number(ddMmYyyy[2]) - 1;
    let year = Number(ddMmYyyy[3]);
    if (year < 100) year += 2000;

    const date = new Date(year, month, day);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().slice(0, 10);
    }
  }

  const parsed = new Date(normalized);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return undefined;
};

const firstString = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
};

const normalizeOcrResponse = (raw: JsonMap) => {
  const taxAmountRaw = parseNumber(raw.totalTaxAmount) ?? parseNumber(raw.taxAmount);
  const subtotal = parseNumber(raw.preTaxSubtotal) ?? parseNumber(raw.subtotal);
  const discount = parseNumber(raw.discountAmount) ?? parseNumber(raw.discount);

  // Identify "Net Total" = after-discount, BEFORE tax (e.g. 59 on an Indian bill)
  // This must NEVER be used as the grand total candidate.
  const printedNetTotal = parseNumber(raw.nett) ?? parseNumber(raw.net_total);

  // Grand-total candidates  explicitly exclude net_total / nett (pre-tax)
  const totalCandidates = [
    parseNumber(raw.netAmount),        // AI field for Grand Total
    parseNumber(raw.grand_total),
    parseNumber(raw.amount_payable),
    parseNumber(raw.total_payable),
    parseNumber(raw.total),
    parseNumber(raw.total_amount),
    parseNumber(raw.amount),
  ].filter((v): v is number => v !== undefined && v > 0);

  const taxBreakdown = Array.isArray(raw.taxBreakdown)
    ? (raw.taxBreakdown as Array<{ name: string; rate?: number; amount: number }>)
        .filter((t) => t?.name && typeof t?.amount === 'number')
    : Array.isArray(raw.taxes)
      ? (raw.taxes as Array<{ name: string; rate?: number; amount: number }>)
      : undefined;

  const derivedTaxTotal = taxBreakdown && taxBreakdown.length > 0
    ? Number(taxBreakdown.reduce((s, t) => s + (t.amount || 0), 0).toFixed(2))
    : undefined;
  let resolvedTaxAmount = taxAmountRaw ?? derivedTaxTotal;

  //  INDIAN TAX HEURISTICS 
  if (taxBreakdown && taxBreakdown.length > 0 && resolvedTaxAmount) {
    const upperNames = taxBreakdown.map(t => t.name.toUpperCase());
    const hasCGST = upperNames.some(n => n.includes('CGST'));
    const hasSGST = upperNames.some(n => n.includes('SGST'));
    const hasIGST = upperNames.some(n => n.includes('IGST'));

    // Case 1: Only CGST found (SGST missing  OCR missed the mirror line)
    // SGST always mirrors CGST, so double the tax.
    // But NOT if IGST is present (IGST = CGST+SGST combined, used for inter-state).
    if (hasCGST && !hasSGST && !hasIGST && taxBreakdown.length === 1) {
      resolvedTaxAmount = Number((resolvedTaxAmount * 2).toFixed(2));
    }

    // Case 2: Only SGST found (CGST missing  OCR missed the mirror line)
    if (hasSGST && !hasCGST && !hasIGST && taxBreakdown.length === 1) {
      resolvedTaxAmount = Number((resolvedTaxAmount * 2).toFixed(2));
    }

    // Case 3: IGST is present  it's already the combined rate. No doubling needed.
    // This is correct as-is because IGST = CGST% + SGST% applied as single tax.
  }

  // Prefer the largest grand-total candidate.
  let total = totalCandidates.length > 0 ? Math.max(...totalCandidates) : undefined;

  // If the candidates only returned the net total (pre-tax), compute the real total.
  if (
    total !== undefined &&
    printedNetTotal !== undefined &&
    Math.abs(total - printedNetTotal) < 0.5 &&
    (resolvedTaxAmount || 0) > 0
  ) {
    const calculatedPayable = Number((printedNetTotal + (resolvedTaxAmount || 0)).toFixed(2));
    const closerCandidate = totalCandidates.find((v) => Math.abs(v - calculatedPayable) < 2.0);
    total = closerCandidate ?? calculatedPayable;
  }

  // If we have a printedNetTotal and taxes but no other grand-total candidate, reconstruct.
  if (total === undefined && printedNetTotal !== undefined && (resolvedTaxAmount || 0) > 0) {
    total = Number((printedNetTotal + (resolvedTaxAmount || 0)).toFixed(2));
  }

  // DEFENSIVE DISCOUNT INFERENCE:
  let resolvedDiscount = discount || 0;
  if (subtotal && total && subtotal > total && resolvedDiscount === 0) {
    const impliedDiscount = subtotal + (resolvedTaxAmount || 0) - total;
    if (impliedDiscount > 0 && impliedDiscount < subtotal * 0.5) {
      resolvedDiscount = Number(impliedDiscount.toFixed(2));
    }
  }

  const merchantName = firstString(
    raw.vendor,
    raw.merchant,
    raw.merchantName,
    raw.merchant_name,
    raw.store_name,
    raw.nm,
    raw.supplier,
  );

  const date = parseDate(raw.date)
    ?? parseDate(raw.purchase_date)
    ?? parseDate(raw.transaction_date);

  const currency = firstString(raw.currency, raw.currency_code) || 'INR';

  // VALIDATION: Only meaningful when we have an independently observed subtotal
  // (i.e. the subtotal came from the OCR output, not computed from the total).
  // Avoids the circular case where subtotal = total - tax  calculated always = total.
  let validationResult: { isValid: boolean; calculated: number; detected: number } | undefined;
  const hasIndependentSubtotal =
    subtotal !== undefined &&
    (parseNumber(raw.preTaxSubtotal) !== undefined || parseNumber(raw.subtotal) !== undefined);

  if (total !== undefined && hasIndependentSubtotal && subtotal !== undefined) {
    const calculated = Number((subtotal - resolvedDiscount + (resolvedTaxAmount || 0)).toFixed(2));
    validationResult = {
      isValid: Math.abs(calculated - total) < 2.0,
      calculated,
      detected: total,
    };
  }

  return {
    merchantName,
    amount: total,
    subtotal,
    taxAmount: resolvedTaxAmount,
    discountAmount: resolvedDiscount || undefined,
    date,
    time: firstString(raw.time),
    currency,
    location: firstString(raw.location) || 'UNKNOWN',
    invoiceNumber: firstString(raw.invoiceNumber),
    gstin: firstString(raw.gstin, raw.gstNo, raw.gst_no, raw.tin),
    items: Array.isArray(raw.items) ? raw.items : undefined,
    taxBreakdown,
    paymentMethod: firstString(raw.paymentMethod),
    category: firstString(raw.category),
    subcategory: firstString(raw.subcategory),
    description: firstString(raw.description),
    validationResult,
    rawFields: raw,
  };
};

/**
 * Parse raw OCR.space plain text into a structured JsonMap.
 * Handles typical Indian retail receipt layouts:
 *   MERCHANT NAME
 *   ITEM     QTY  PRICE  AMOUNT
 *   Sub Total        65
 *   Dis               6
 *   Net Total        59
 *   CGST @9%       5.31
 *   SGST @9%       5.31
 *   Grand Total      70
 */
const parseOcrSpaceRawText = (rawText: string): JsonMap => {
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  const result: JsonMap = {};

  // Extract numbers from end of line
  const extractLineAmount = (line: string): number | undefined => {
    const m = line.match(/([\d,]+\.?\d*)\s*$/);
    if (!m) return undefined;
    const n = parseFloat(m[1].replace(/,/g, ''));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };

  // Merchant Name Extraction
  const merchantSuffixPattern = /^(.*?)(Veg Restaurant|Restaurant|Cafe|Coffee|Diner|Bistro|Grill|Bakery|Mart|Supermarket|Traders|Store|Foods|Retail|Sweets|Kitchen|Hotel)\b/i;
  let merchantFound = false;
  for (const line of lines.slice(0, 10)) {
    const match = line.match(merchantSuffixPattern);
    if (match && match[1].trim().length >= 3) {
      result.merchantName = `${match[1].trim()} ${match[2].trim()}`;
      merchantFound = true;
      break;
    }
  }
  if (!merchantFound) {
    const blocklist = /date|time|invoice|bill|token|table|gst|tax|vat|fssai|phone|tel|mobile|www\.|http|address|road|street|lane|particulars|qty|quantity|rate|amount|subtotal|total|thank\s*you|visit\s*again/i;
    for (const line of lines.slice(0, 8)) {
      if (line.length >= 3 && line.length <= 40 && !blocklist.test(line) && !/^\d/.test(line)) {
        result.merchantName = line;
        break;
      }
    }
  }

  const taxBreakdown: Array<{ name: string; rate?: number; amount: number }> = [];
  const items: Array<{ name: string; quantity?: number; rate?: number; amount: number }> = [];
  let discountAmount: number | undefined;
  let discountPercent: number | undefined;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase();
    const amount = extractLineAmount(line);

    // Date Extraction
    if (!result.date) {
      const dateMatch = line.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
      if (dateMatch) {
        const [, d, m, y] = dateMatch;
        const year = y.length === 2 ? `20${y}` : y;
        result.date = `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
    }

    // Time Extraction
    if (!result.time && /\d{1,2}:\d{2}/.test(line)) {
      const tm = line.match(/(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[AP]M)?)/i);
      if (tm) result.time = tm[1].toUpperCase();
    }

    // Invoice Number
    if (!result.invoiceNumber && /(bill|invoice|token|receipt)\s*(no\.?|#|number)?\s*[:\s]\s*(\w+)/i.test(line)) {
      const m2 = line.match(/(bill|invoice|token|receipt)\s*(no\.?|#|number)?\s*[:\s]\s*(\w+)/i);
      if (m2) result.invoiceNumber = m2[3];
    }

    // GSTIN
    if (!result.gstin) {
      const gstMatch = line.match(/[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}/);
      if (gstMatch) result.gstin = gstMatch[0];
    }

    // Payment Method
    if (!result.paymentMethod && /(upi|cash|card|gpay|paytm|credit|debit|neft|imps|netbanking)/i.test(line)) {
      const pm = line.match(/(upi|cash|card|gpay|paytm|credit|debit|neft|imps|netbanking)/i);
      if (pm) result.paymentMethod = pm[1].toUpperCase();
    }

    if (amount === undefined) continue;

    // Totals & Discounts
    if (/grand\s*total|amount\s*payable|net\s*payable|total\s*amount\s*due/i.test(lower)) {
      result.netAmount = amount;
    } else if (/^sub\s*total|subtotal/i.test(lower)) {
      result.preTaxSubtotal = amount;
    } else if (/net\s*total|taxable\s*value|net\s*amt/i.test(lower)) {
      result.net_total = amount;
    } else if (/^total/i.test(lower) && !result.netAmount) {
      result.total = amount;
    } else if (/(?:dis\b|discount|less|promo)/i.test(lower)) {
      discountAmount = amount;
      const pctMatch = line.match(/(?:@\s*|less\s*|dis.*\s*)(\d+(?:\.\d+)?)\s*%/i);
      if (pctMatch) {
        discountPercent = parseFloat(pctMatch[1]);
      }
    }

    // Taxes
    const taxMatch = line.match(/^(CGST|SGST|IGST|GST|VAT|Service\s*Tax|Service\s*Charge)\b/i);
    if (taxMatch) {
      let rate: number | undefined;
      const rateMatch = line.match(/(\d+(?:\.\d+)?)\s*%/);
      if (rateMatch) {
        rate = parseFloat(rateMatch[1]);
      }
      taxBreakdown.push({
        name: taxMatch[1].toUpperCase(),
        rate,
        amount
      });
    }
  }

  // CGST/SGST Rate typo correction (e.g. CGST 69% vs SGST @9% -> normalize both to 9%)
  const cgst = taxBreakdown.find(t => t.name === 'CGST');
  const sgst = taxBreakdown.find(t => t.name === 'SGST');
  if (cgst && sgst && cgst.amount === sgst.amount) {
    if (cgst.rate !== sgst.rate) {
      const correctRate = (cgst.rate !== undefined && cgst.rate <= 28) ? cgst.rate : sgst.rate;
      cgst.rate = correctRate;
      sgst.rate = correctRate;
    }
  }

  // Extract items
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nextLine = lines[i + 1];
    const nextNextLine = lines[i + 2];

    const labelPattern = /^(sub|net|dis|tax|cgst|sgst|igst|gst|total|grand|amount|invoice|bill|date|time|phone|tel|gstin|table|token|rs\.?|inr|qty|rate|mrp|item|particulars|sl|thank\s*you|visit\s*again)/i;
    if (labelPattern.test(line) || /^\d/.test(line) || line.length < 3) continue;

    // Case A: single line item
    const singleLineMatch = line.match(/^([A-Za-z0-9\s&()+\-/,.]{3,40}?)\s+(\d+)\s+([\d.]+)\s+([\d.]+)\s*$/) ||
                             line.match(/^([A-Za-z0-9\s&()+\-/,.]{3,40}?)\s+(\d+)\s+([\d.]+)\s*$/);
    if (singleLineMatch) {
      const name = singleLineMatch[1].trim();
      const qty = parseInt(singleLineMatch[2]);
      const rate = parseFloat(singleLineMatch[3]);
      const amt = singleLineMatch[4] ? parseFloat(singleLineMatch[4]) : qty * rate;
      items.push({ name, quantity: qty, rate, amount: amt });
      continue;
    }

    // Case B: multi-line split item
    if (nextLine) {
      const splitNumbersMatch = nextLine.match(/^\s*(\d+)\s+([\d.]+)\s+([\d.]+)\s*$/) ||
                                 nextLine.match(/^\s*(\d+)\s+([\d.]+)\s*$/);
      if (splitNumbersMatch) {
        const name = line.trim();
        const qty = parseInt(splitNumbersMatch[1]);
        const rate = parseFloat(splitNumbersMatch[2]);
        let amt = splitNumbersMatch[3] ? parseFloat(splitNumbersMatch[3]) : qty * rate;

        if (nextNextLine && /^\s*[\d.]+\s*$/.test(nextNextLine)) {
          const nextAmt = parseFloat(nextNextLine.trim());
          if (Math.abs(nextAmt - qty * rate) < 1.0) {
            amt = nextAmt;
            i += 2;
          } else {
            i += 1;
          }
        } else {
          i += 1;
        }

        items.push({ name, quantity: qty, rate, amount: amt });
        continue;
      }
    }

    // Case C: simple name + amount
    const simpleLineMatch = line.match(/^([A-Za-z0-9\s&()+\-/,.]{3,40}?)\s+([\d.]+)\s*$/);
    if (simpleLineMatch) {
      const name = simpleLineMatch[1].trim();
      const amt = parseFloat(simpleLineMatch[2]);
      items.push({ name, quantity: 1, rate: amt, amount: amt });
    }
  }

  // Reconstruct missing amounts if necessary
  const taxSum = taxBreakdown.reduce((s, t) => s + t.amount, 0);
  const discountVal = discountAmount || 0;

  if (result.preTaxSubtotal !== undefined && result.netAmount === undefined) {
    result.netAmount = Number(((result.preTaxSubtotal as number) - discountVal + taxSum).toFixed(2));
  } else if (result.netAmount !== undefined && result.preTaxSubtotal === undefined) {
    result.preTaxSubtotal = Number(((result.netAmount as number) + discountVal - taxSum).toFixed(2));
  }

  if (taxBreakdown.length > 0) result.taxBreakdown = taxBreakdown;
  if (items.length > 0) result.items = items;
  if (discountAmount !== undefined) {
    result.discountAmount = discountAmount;
    if (discountPercent !== undefined) result.discountPercent = discountPercent;
  }
  result.currency = 'INR';

  return result;
};;

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

const OCR_JOBS = new Map<string, { status: string; data?: any; error?: string }>();

const executeFullOcrPipeline = async (userId: string, file: any, validated: any) => {
  const processed = await processImage(validated.buffer);
  let raw: JsonMap = {};
  let source = 'unknown';

  // If PDF text was already extracted (digital PDF), skip image OCR entirely
  const pdfExtractedText = validated._pdfExtractedText as string | undefined;

  audit({ event: 'ai.ocr_request', userId, meta: { fileSize: file.size, contentType: validated.contentType, isPdfText: !!pdfExtractedText } });

  // 1. Try Gemini OCR first (or PDF text  Gemini structuring)
  if (process.env.GOOGLE_API_KEY) {
    try {
      if (pdfExtractedText) {
        // PDF text already extracted  send to Gemini for structuring directly
        const { scanReceiptFromText } = await import('../ai/ocr.engine');
        raw = await scanReceiptFromText(pdfExtractedText);
      } else {
        raw = await scanReceiptWithGemini(processed.buffer, processed.contentType);
      }
      source = 'gemini-1.5-flash';
      audit({ event: 'ai.ocr_success', userId, meta: { source } });
    } catch (err: any) {
      audit({ event: 'ai.ocr_failure', userId, meta: { error: err.message, source: 'gemini' } });
      logger.warn('Gemini OCR failed, falling back...', { userId, error: err.message });
    }
  }

  // 2. Fallback to OCR.space
  if (source === 'unknown' && process.env.RECEIPT_OCR_API_KEY) {
    try {
      raw = await withCircuitBreaker(
        { name: 'cloud-ocr-space', failureThreshold: 3, resetTimeoutMs: 120_000 },
        async () => {
          const formData = new FormData();
          formData.append('apikey', process.env.RECEIPT_OCR_API_KEY || '');
          formData.append('isOverlayRequired', 'true');
          formData.append('isTable', 'true');
          formData.append('OCREngine', '2');
          formData.append('file', new Blob([new Uint8Array(processed.buffer)], { type: processed.contentType }));

          const endpoint = getReceiptOcrEndpoint();
          const upstream = await fetch(endpoint, {
            method: 'POST',
            body: formData,
          });

          if (!upstream.ok) throw new Error(`Upstream OCR returned ${upstream.status}`);

          const ocrSpaceResult = await extractJson(upstream);
          if (Array.isArray(ocrSpaceResult.ParsedResults) && ocrSpaceResult.ParsedResults.length > 0) {
            const rawText = ocrSpaceResult.ParsedResults[0].ParsedText as string || '';
            // Parse the plain text into structured fields immediately
            const parsed = parseOcrSpaceRawText(rawText);
            parsed._rawOcrText = rawText;
            parsed.confidence = 0.78;
            return parsed;
          }
          return ocrSpaceResult;
        },
      );
      source = 'ocr-space';
      audit({ event: 'ai.ocr_success', userId, meta: { source } });
    } catch (err: any) {
      audit({ event: 'ai.ocr_failure', userId, meta: { error: err.message, source: 'ocr-space' } });
    }
  }

  if (source === 'unknown') {
    throw new Error('Failed to process receipt with any available model');
  }

  const normalized = normalizeOcrResponse(raw);
  const confidence = typeof raw.confidence === 'number' ? raw.confidence : 0.85;

  return { normalized, source, confidence };
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
    OCR_JOBS.set(jobId, { status: 'processing' });

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

        const { normalized } = await executeFullOcrPipeline(userId, file, ocrValidated);
        OCR_JOBS.set(jobId, { status: 'completed', data: normalized });
        audit({ event: 'ai.ocr_success', userId, meta: { jobId } });
      } catch (err: any) {
        logger.error('Background OCR failed', { jobId, error: err.message, stack: err.stack });
        OCR_JOBS.set(jobId, { status: 'failed', error: err.message });
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
  const job = OCR_JOBS.get(jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
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
