import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '../../config/logger';
import { extractRawText } from '../../utils/paddleOcr';
import { sanitizeAIInput, sanitizeAIOutput, validateOcrResult } from '../../utils/sanitize';
import { withCircuitBreaker } from '../../utils/circuitBreaker';
import { audit } from '../../utils/auditLogger';
import { getAIConfigurations } from '../../utils/aiConfig';
import { parseReceiptFromText } from './receiptTextParser';

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
  "currency": "ISO 4217 code — default INR; use the foreign currency ONLY when the receipt clearly shows a foreign country, city, or currency symbol (e.g. VND for Vietnam/Hanoi/₫, USD for a US receipt)",
  "location": "city/country as printed on the receipt — default INDIA",
  "invoiceNumber": "string | null",
  "paymentMethod": "Cash | Card | UPI | Online | null",
  "category": "expense category",
  "subcategory": "specific type",
  "description": "Short summary of main items",
  "confidence": number (0.0 to 1.0)
}
`;

/**
 * Raw-OCR fallback: extracts text (PaddleOCR when configured, else Tesseract)
 * and builds structured JSON from it using heuristics — item table extraction,
 * GST/tax breakdown, GSTIN detection, and math validation. Used when Gemini is
 * unavailable. PaddleOCR's row-reconstructed text makes the heuristic parser
 * markedly better on table-layout receipts.
 */
const scanReceiptRawTextOnly = async (imageBuffer: Buffer): Promise<Record<string, unknown>> => {
  logger.info('Raw-OCR pass (Gemini unavailable)...');
  const { text: rawText, engine } = await extractRawText(imageBuffer);
  logger.info(`Raw-OCR pass complete (${engine})`, { extractedLength: rawText.length });
  return extractStructuredDataFromText(rawText);
};

/**
 * Pure-text structured extraction. Used by:
 * 1. The raw-OCR fallback (from image OCR text)
 * 2. PDF text extraction (from pdf-parse text)
 *
 * The rules live in receiptTextParser so they can be unit-tested against real
 * OCR dumps without pulling in Gemini, Prisma or the audit log.
 */
const extractStructuredDataFromText = (rawText: string): Record<string, unknown> =>
  parseReceiptFromText(rawText);

export const scanReceiptWithGemini = async (imageBuffer: Buffer, mimeType: string) => {
  const config = await getAIConfigurations();

  if (config.ocr.provider === 'tesseract') {
    logger.info('OCR Provider is set to Tesseract-only. Bypassing Gemini...');
    return scanReceiptRawTextOnly(imageBuffer);
  }

  if (!GOOGLE_API_KEY) {
    logger.warn('GOOGLE_API_KEY not configured - falling back to Tesseract-only OCR');
    return scanReceiptRawTextOnly(imageBuffer);
  }

  try {
    let rawOcrText = '';

    // Hybrid mode: extract raw text first (PaddleOCR when configured, else
    // Tesseract), then hand it to Gemini for structuring. PaddleOCR's
    // layout-reconstructed rows give Gemini cleaner input on table receipts.
    if (config.ocr.provider === 'hybrid') {
      logger.info('Starting raw-OCR pass (hybrid mode)...');
      const { text, engine } = await extractRawText(imageBuffer, mimeType);
      rawOcrText = text;
      logger.info(`Raw-OCR pass complete (${engine})`, { extractedLength: rawOcrText.length });
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
          model: config.ocr.model || 'gemini-flash-latest',
          systemInstruction: SYSTEM_INSTRUCTION,
          generationConfig: {
            temperature: 0.1,
            topP: 0.95,
            // The flash aliases point at reasoning models that spend output
            // tokens on internal thinking before emitting anything. At 2048 the
            // budget was exhausted before the JSON started, so every scan came
            // back with an empty candidate and silently fell through to the
            // heuristic parser. Leave headroom for thinking + the payload.
            maxOutputTokens: 8192,
            // Ask for JSON directly instead of hoping the model skips the
            // ```json fence.
            responseMimeType: 'application/json',
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

        // An empty candidate is a real API outcome (token budget spent on
        // thinking, safety block, recitation stop). Report why, so this fails
        // as "Gemini returned no content (MAX_TOKENS)" rather than as an
        // anonymous "Unexpected end of JSON input" from the parse below.
        if (!text) {
          const candidate = result.response.candidates?.[0];
          throw new Error(
            `Gemini returned an empty response (finishReason=${candidate?.finishReason ?? 'unknown'}, `
            + `promptFeedback=${result.response.promptFeedback?.blockReason ?? 'none'})`,
          );
        }

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

    // Callers report the engine that produced the data. Without this marker a
    // heuristic result returned from the catch below is still logged and
    // surfaced as "gemini", which hides every LLM outage.
    parsed._source = 'gemini';
    return parsed;
  } catch (error: any) {
    logger.error('OCR pipeline failed, attempting Tesseract-only fallback', { error: error.message || error });
    try {
      return await scanReceiptRawTextOnly(imageBuffer);
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
          model: config.ocr.model || 'gemini-flash-latest',
          systemInstruction: SYSTEM_INSTRUCTION,
          // Same token budget as the image path: a thinking model needs room for
          // the reasoning pass before it can emit the JSON.
          generationConfig: {
            temperature: 0.1,
            topP: 0.95,
            maxOutputTokens: 8192,
            responseMimeType: 'application/json',
          },
        });
        const result = await model.generateContent([{ text: buildPrompt(cleanText) }]);
        let output = result.response.text().trim();
        output = output.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
        if (!output) {
          const candidate = result.response.candidates?.[0];
          throw new Error(`Gemini returned an empty response (finishReason=${candidate?.finishReason ?? 'unknown'})`);
        }
        return sanitizeAIOutput(output);
      },
    );

    const parsed = JSON.parse(jsonString);
    const validation = validateOcrResult(parsed);
    if (!validation.valid) throw new Error(`Validation failed: ${validation.reason}`);
    parsed._source = 'gemini';
    
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

