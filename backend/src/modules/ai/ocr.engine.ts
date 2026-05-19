import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '../../config/logger';
import Tesseract from 'tesseract.js';
import { sanitizeAIInput, sanitizeAIOutput, validateOcrResult } from '../../utils/sanitize';
import { withCircuitBreaker } from '../../utils/circuitBreaker';
import { audit } from '../../utils/auditLogger';
import { getAIConfigurations } from '../../utils/aiConfig';

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || '';
const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);

/**
 * Hybrid OCR Pipeline using Open-Source Tesseract + Gemini:
 * 1. Tesseract OCR: Scans the image to extract all raw text exactly as printed.
 *    (This fulfills the request to use the specific open-source OCR engine).
 * 2. Gemini LLM: Takes the raw Tesseract text and structures it into the required JSON shape.
 */

const SYSTEM_INSTRUCTION = `You are a specialist financial data extractor.
Your job is to read raw, messy OCR text (extracted by Tesseract) and map it into structured JSON.
You NEVER hallucinate or invent data. If a field isn't present in the raw text, return null for it.
Fix obvious OCR typos (like O vs 0, or \`?\` instead of \`\`), but do not invent items or amounts.`;

const buildPrompt = (rawText: string) => `
Here is the raw text extracted from a receipt using Tesseract OCR.
Translate it into structured JSON with professional-grade accuracy.

--- RAW OCR TEXT ---
${rawText}
--- END RAW OCR TEXT ---

 CRITICAL EXTRACTION RULES:

1. MERCHANT BLOCK: Look at the top 5-10 lines. Find the legal name, address (e.g., "Nana Chowk, Mumbai"), and Phone numbers ("Ph:", "Tel:").
2. DATE & BILL NO: Identify "Date", "Bill No", "Invoice No", "Token". If date is "01/07/17", year is 2017.
3. TABLE EXTRACTION (QTY/RATE/AMOUNT): 
   - Receipts often have columns: Particulars | Qty | Rate | Amount.
   - If an item line says "MEDU WADA 1 65 65", the quantity is 1, rate is 65, and amount is 65.
   - Verify: Qty * Rate should equal Amount.
4. TOTALS & TAXES (INDIA SPECIFIC):
   - "Sub Total": The raw sum of items.
   - "Dis" or "Discount": The amount subtracted. You MUST find this.
   - "Net Total" or "Taxable Value": Subtotal minus Discount.
   - "CGST" & "SGST": Usually 9% or 2.5% each. They MUST both be extracted.
   - "Grand Total": The final payable amount (e.g. 70). This is your netAmount.
5. CURRENCY: Always "INR" for Indian receipts.
6. GSTIN: The 15-character ID (e.g. 27AADFH5037M1Z6).

 MATH VALIDATION:
- Ensure (Subtotal - Discount + Taxes) roughly equals Grand Total.
- If they differ slightly (e.g. 69.62 vs 70), the "Grand Total" is the source of truth for the transaction amount.

Return ONLY the JSON. No explanation.

{
  "merchantName": "string",
  "netAmount": number (Grand Total / Final Payable),
  "preTaxSubtotal": number | null,
  "totalTaxAmount": number | null,
  "discountAmount": number | null,
  "taxBreakdown": [ { "name": "string", "rate": number | null, "amount": number } ],
  "gstin": "string | null",
  "items": [ { "name": "string", "quantity": number | null, "rate": number | null, "amount": number } ],
  "date": "YYYY-MM-DD | null",
  "time": "HH:MM | null",
  "currency": "INR",
  "location": "INDIA",
  "invoiceNumber": "string | null",
  "paymentMethod": "Cash | Card | UPI | Online | null",
  "category": "expense category",
  "subcategory": "specific type",
  "description": "Short summary of main items",
  "confidence": number (0.0 to 1.0)
}
`;

/**
 * Tesseract-only fallback: runs OCR and builds structured JSON from
 * the raw text using heuristics  including item table extraction,
 * GST/tax breakdown, GSTIN detection, and math validation.
 * Used when Gemini is unavailable.
 */
const scanReceiptTesseractOnly = async (imageBuffer: Buffer): Promise<Record<string, unknown>> => {
  logger.info('Tesseract-only OCR pass (Gemini unavailable)...');
  const tesseractResult = await Tesseract.recognize(imageBuffer, 'eng', {
    logger: m => {
      if (m.status === 'recognizing text' && Math.round(m.progress * 100) % 25 === 0) {
        logger.debug(`Tesseract progress: ${Math.round(m.progress * 100)}%`);
      }
    }
  });
  const rawText = tesseractResult.data.text.trim();
  return extractStructuredDataFromText(rawText);
};

/**
 * Pure-text structured extraction engine. Used by:
 * 1. Tesseract-only fallback (from image OCR text)
 * 2. PDF text extraction (from pdf-parse text)
 *
 * Extracts: merchant, date, items table, subtotal, discount,
 * CGST/SGST/IGST/VAT taxes, GSTIN, grand total, payment method,
 * invoice number, and validates the math.
 */
const extractStructuredDataFromText = (rawText: string): Record<string, unknown> => {
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);

  //  Helper: extract trailing number from a line 
  const extractLineAmount = (line: string): number | undefined => {
    const m = line.match(/([\d,]+\.?\d*)\s*$/);
    if (!m) return undefined;
    const n = parseFloat(m[1].replace(/,/g, ''));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };

  //  Merchant name: first meaningful line 
  const labelPattern = /^(sub|net|dis|tax|cgst|sgst|igst|gst|total|grand|amount|invoice|bill|date|time|phone|tel|gstin|table|token|rs\.?|inr|qty|rate|mrp|item|particulars|sl|sr|s\.?no)/i;
  let merchantName: string | undefined;
  for (const line of lines.slice(0, 8)) {
    if (line.length >= 3 && !labelPattern.test(line) && !/^\d/.test(line)) {
      merchantName = line;
      break;
    }
  }

  //  Date extraction 
  let date: string | null = null;
  for (const line of lines) {
    const dateMatch = line.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
    if (dateMatch) {
      const [, d, m, y] = dateMatch;
      const year = y.length === 2 ? `20${y}` : y;
      date = `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      break;
    }
  }

  //  Time extraction 
  let time: string | null = null;
  for (const line of lines) {
    const tm = line.match(/(\d{1,2}:\d{2}(?::\d{2})?)\s*(am|pm)?/i);
    if (tm) { time = tm[1]; break; }
  }

  //  Invoice / Bill number 
  let invoiceNumber: string | null = null;
  for (const line of lines) {
    const inv = line.match(/(bill|invoice|token|receipt)\s*(no\.?|#|number)?\s*[:\s]\s*([A-Za-z0-9\-]+)/i);
    if (inv) { invoiceNumber = inv[3]; break; }
  }

  //  GSTIN (15-char Indian GST ID) 
  let gstin: string | null = null;
  for (const line of lines) {
    const gstMatch = line.match(/[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}/);
    if (gstMatch) { gstin = gstMatch[0]; break; }
  }

  //  Payment method 
  let paymentMethod: string | null = null;
  for (const line of lines) {
    const pm = line.match(/(upi|cash|card|gpay|paytm|credit|debit|neft|imps|netbanking|phonepe|bhim)/i);
    if (pm) { paymentMethod = pm[1].toUpperCase(); break; }
  }

  //  Item table extraction 
  // Matches patterns like:
  //   "MEDU WADA    1   65   65"
  //   "Paneer Tikka  2  120.00  240.00"
  //   "Coffee         1   35    35"
  const items: Array<{ name: string; quantity: number | null; rate: number | null; amount: number }> = [];
  for (const line of lines) {
    // Pattern 1: NAME QTY RATE AMOUNT (4 columns)
    const match4 = line.match(/^([A-Za-z][A-Za-z\s.&'\/]{1,40}?)\s+(\d+)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s*$/);
    if (match4) {
      const qty = parseInt(match4[2], 10);
      const rate = parseFloat(match4[3].replace(/,/g, ''));
      const amount = parseFloat(match4[4].replace(/,/g, ''));
      if (amount > 0 && !labelPattern.test(match4[1])) {
        items.push({ name: match4[1].trim(), quantity: qty, rate, amount });
        continue;
      }
    }
    // Pattern 2: NAME AMOUNT (2 columns  no qty/rate)
    const match2 = line.match(/^([A-Za-z][A-Za-z\s.&'\/]{2,40}?)\s{2,}([\d,]+\.?\d*)\s*$/);
    if (match2) {
      const amount = parseFloat(match2[2].replace(/,/g, ''));
      if (amount > 0 && !labelPattern.test(match2[1])) {
        items.push({ name: match2[1].trim(), quantity: null, rate: null, amount });
      }
    }
  }

  //  Tax breakdown extraction 
  const taxBreakdown: Array<{ name: string; rate: number | null; amount: number }> = [];
  let subtotal: number | undefined;
  let discount: number | undefined;
  let netTotal: number | undefined; // pre-tax net total
  let grandTotal: number | undefined;

  for (const line of lines) {
    const lower = line.toLowerCase();
    const amount = extractLineAmount(line);
    if (amount === undefined) continue;

    if (/grand\s*total|amount\s*payable|net\s*payable|total\s*amount\s*due|bill\s*total/i.test(lower)) {
      grandTotal = amount;
    } else if (/^sub\s*total|subtotal|item\s*total/i.test(lower)) {
      subtotal = amount;
    } else if (/^(dis\b|discount)/i.test(lower)) {
      discount = amount;
    } else if (/net\s*total|taxable\s*value|net\s*amt|net\s*amount/i.test(lower)) {
      netTotal = amount;
    } else if (/^total/i.test(lower) && grandTotal === undefined) {
      grandTotal = amount;
    }

    // Tax lines: CGST @9% 5.31 / SGST @9% 5.31 / IGST @18% 10.62 / VAT 12.5% etc.
    const taxMatch = line.match(/^(CGST|SGST|IGST|GST|VAT|CESS|Service\s*Tax|Service\s*Charge|Swachh\s*Bharat)\s*(?:@?\s*([\d.]+)\s*%?)?/i);
    if (taxMatch && amount > 0) {
      taxBreakdown.push({
        name: taxMatch[1].toUpperCase().replace(/\s+/g, '_'),
        rate: taxMatch[2] ? parseFloat(taxMatch[2]) : null,
        amount,
      });
    }
  }

  // Compute derived tax total
  const taxTotal = taxBreakdown.length > 0
    ? Number(taxBreakdown.reduce((s, t) => s + t.amount, 0).toFixed(2))
    : undefined;

  // If no grand total found, try computing it
  if (grandTotal === undefined && subtotal !== undefined) {
    grandTotal = Number(((subtotal) - (discount || 0) + (taxTotal || 0)).toFixed(2));
  }

  // Math validation
  let validationResult: { isValid: boolean; calculated: number; detected: number } | undefined;
  if (grandTotal !== undefined && subtotal !== undefined) {
    const calculated = Number((subtotal - (discount || 0) + (taxTotal || 0)).toFixed(2));
    validationResult = {
      isValid: Math.abs(calculated - grandTotal) < 2.0,
      calculated,
      detected: grandTotal,
    };
  }

  return {
    merchantName: merchantName || 'Unknown Merchant',
    netAmount: grandTotal,
    preTaxSubtotal: subtotal,
    totalTaxAmount: taxTotal,
    discountAmount: discount || undefined,
    taxBreakdown: taxBreakdown.length > 0 ? taxBreakdown : undefined,
    gstin,
    items: items.length > 0 ? items : undefined,
    date,
    time,
    invoiceNumber,
    paymentMethod,
    currency: 'INR',
    confidence: items.length > 0 && grandTotal ? 0.65 : taxBreakdown.length > 0 ? 0.55 : 0.45,
    validationResult,
    _rawOcrText: rawText,
    _source: 'tesseract-only',
  };
};

export const scanReceiptWithGemini = async (imageBuffer: Buffer, mimeType: string) => {
  const config = await getAIConfigurations();

  if (config.ocr.provider === 'tesseract') {
    logger.info('OCR Provider is set to Tesseract-only. Bypassing Gemini...');
    return scanReceiptTesseractOnly(imageBuffer);
  }

  if (!GOOGLE_API_KEY) {
    logger.warn('GOOGLE_API_KEY not configured - falling back to Tesseract-only OCR');
    return scanReceiptTesseractOnly(imageBuffer);
  }

  try {
    let rawOcrText = '';
    
    // Check if we need to do Tesseract raw extraction (hybrid mode)
    if (config.ocr.provider === 'hybrid') {
      logger.info('Starting open-source Tesseract OCR pass...');
      const tesseractResult = await Tesseract.recognize(
        imageBuffer,
        'eng',
        {
          logger: m => {
            if (m.status === 'recognizing text' && Math.round(m.progress * 100) % 20 === 0) {
              logger.debug(`Tesseract progress: ${Math.round(m.progress * 100)}%`);
            }
          }
        }
      );
      rawOcrText = tesseractResult.data.text.trim();
      logger.info('Tesseract OCR pass complete', { extractedLength: rawOcrText.length });
    }

    // Prepare content for Gemini
    const { sanitized: cleanText, flagged } = sanitizeAIInput(rawOcrText || '(Direct image input)');
    if (flagged) {
      audit({
        event: 'ai.prompt_injection',
        resource: 'ocr',
        meta: { inputLength: rawOcrText.length, preview: rawOcrText.slice(0, 200) },
      });
      logger.warn('Prompt-injection pattern detected in OCR text - proceeding with sanitised input');
    }

    // Execute Gemini Mapping via circuit breaker
    logger.info('Starting Gemini JSON Mapping pass...', { model: config.ocr.model, provider: config.ocr.provider });

    const jsonString = await withCircuitBreaker(
      { 
        name: 'gemini-ocr', 
        failureThreshold: config.ocr.maxRetries || 5, 
        resetTimeoutMs: config.ocr.timeoutMs || 60_000 
      },
      async () => {
        const model = genAI.getGenerativeModel({
          model: config.ocr.model || 'gemini-1.5-flash',
          systemInstruction: SYSTEM_INSTRUCTION,
          generationConfig: {
            temperature: 0.1,
            topP: 0.95,
            maxOutputTokens: 2048,
          },
        });

        let result;
        if (config.ocr.provider === 'gemini') {
          // Direct image to Gemini
          result = await model.generateContent([
            {
              inlineData: {
                data: imageBuffer.toString('base64'),
                mimeType: mimeType || 'image/jpeg'
              }
            },
            { text: buildPrompt('(Image scanned directly)') }
          ]);
        } else {
          // Hybrid: raw text to Gemini
          result = await model.generateContent([{ text: buildPrompt(cleanText) }]);
        }

        let text = result.response.text().trim();
        text = text
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/\s*```\s*$/i, '')
          .trim();

        return sanitizeAIOutput(text);
      },
    );

    const parsed = JSON.parse(jsonString);

    // Validate parsed result
    const validation = validateOcrResult(parsed);
    if (!validation.valid) {
      logger.warn('OCR result failed validation', { reason: validation.reason });
      throw new Error(`OCR result validation failed: ${validation.reason}`);
    }
    
    // Safety fallback for Tesseract hallucinated artifacts
    if (parsed.items) {
      parsed.items = parsed.items.filter((item: { name?: string }) => item.name && item.name.length > 2);
    }

    // If confidence score is below the threshold, log warning or flag it
    const itemConfidence = parsed.confidence ?? (parsed.items && parsed.items.length > 0 ? 0.9 : 0.7);
    if (itemConfidence < config.ocr.confidenceThreshold) {
      logger.warn('OCR processing confidence below threshold', { confidence: itemConfidence, threshold: config.ocr.confidenceThreshold });
    }

    logger.info('OCR success', {
      merchantName: parsed.merchantName,
      netAmount: parsed.netAmount,
      invoiceNumber: parsed.invoiceNumber,
      provider: config.ocr.provider,
    });

    return parsed;
  } catch (error: any) {
    logger.error('OCR pipeline failed, attempting Tesseract-only fallback', { error: error.message || error });
    try {
      return await scanReceiptTesseractOnly(imageBuffer);
    } catch (fallbackErr: any) {
      logger.error('Tesseract-only fallback also failed', { error: fallbackErr.message });
      throw error;
    }
  }
};

/**
 * Process pre-extracted text (from digital PDFs) through the Gemini structuring
 * pipeline, or fall back to the heuristic text parser.
 */
export const scanReceiptFromText = async (text: string): Promise<Record<string, unknown>> => {
  const config = await getAIConfigurations();

  if (!GOOGLE_API_KEY) {
    logger.info('No GOOGLE_API_KEY - using heuristic text parser for PDF text');
    return extractStructuredDataFromText(text);
  }

  try {
    const { sanitized: cleanText } = sanitizeAIInput(text);

    const jsonString = await withCircuitBreaker(
      { 
        name: 'gemini-ocr', 
        failureThreshold: config.ocr.maxRetries || 5, 
        resetTimeoutMs: config.ocr.timeoutMs || 60_000 
      },
      async () => {
        const model = genAI.getGenerativeModel({
          model: config.ocr.model || 'gemini-1.5-flash',
          systemInstruction: SYSTEM_INSTRUCTION,
          generationConfig: { temperature: 0.1, topP: 0.95, maxOutputTokens: 2048 },
        });
        const result = await model.generateContent([{ text: buildPrompt(cleanText) }]);
        let output = result.response.text().trim();
        output = output.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
        return sanitizeAIOutput(output);
      },
    );

    const parsed = JSON.parse(jsonString);
    const validation = validateOcrResult(parsed);
    if (!validation.valid) throw new Error(`Validation failed: ${validation.reason}`);
    
    // Check confidence threshold
    const confidence = parsed.confidence ?? 0.8;
    if (confidence < config.ocr.confidenceThreshold) {
      logger.warn('Text OCR processing confidence below threshold', { confidence, threshold: config.ocr.confidenceThreshold });
    }

    return parsed;
  } catch (err: any) {
    logger.warn('Gemini text structuring failed, falling back to heuristic parser', { error: err.message });
    return extractStructuredDataFromText(text);
  }
};

