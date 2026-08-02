import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '../../config/logger';
import { extractRawText } from '../../utils/paddleOcr';
import { sanitizeAIInput, sanitizeAIOutput } from '../../utils/sanitize';
import { audit } from '../../utils/auditLogger';
import { getAIConfigurations } from '../../utils/aiConfig';
import { parseReceiptFromText } from './receiptTextParser';
import { RECEIPT_SYSTEM_INSTRUCTION, buildVisionPrompt, buildTextPrompt } from './receiptPrompt';
import { normalizeExtractedReceipt, type ExtractedReceipt } from './receiptSchema';

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || '';
const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);

/**
 * Bill extraction pipeline, in descending order of how well it reads a receipt:
 *
 *   1. **Gemini vision on the image.** The model sees the layout — column
 *      alignment, which text is the header, where the total sits — and reads
 *      the pixels directly. On the benchmark bills, OCR-then-parse loses
 *      digits that vision recovers ("Net Amount 5226.00" comes back from
 *      Tesseract as 6226.00), so anything that depends on an OCR transcript is
 *      strictly worse and is only a fallback.
 *   2. **Gemini over OCR text.** Used when vision is unavailable or refuses.
 *   3. **Offline heuristic parser.** No network, no key, no LLM. Deliberately
 *      capped at a lower confidence: it can be internally consistent and still
 *      be reading corrupted characters.
 *
 * Every path returns the same normalised shape (see receiptSchema), so callers
 * never branch on which engine answered.
 */

/** A single model call may not exceed this; the caller's budget is larger. */
const MODEL_CALL_TIMEOUT_MS = Number(process.env.OCR_MODEL_TIMEOUT_MS || 45_000);
/** Thinking models spend output tokens before emitting JSON — leave headroom. */
const MAX_OUTPUT_TOKENS = 8192;

export interface OcrEngineResult extends ExtractedReceipt {
  /** Raw OCR transcript when one was produced, for debugging and audit. */
  rawText?: string;
}

const withTimeout = async <T>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} exceeded ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const stripJsonFence = (text: string) =>
  text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

/**
 * Run one Gemini call and return parsed JSON.
 *
 * Empty candidates are a real outcome (token budget consumed by thinking, a
 * safety stop, recitation) and used to surface as an anonymous
 * "Unexpected end of JSON input" from the parse. They now fail with the reason
 * attached, so an outage is diagnosable from the logs alone.
 */
const callGemini = async (
  model: string,
  parts: Array<Record<string, unknown>>,
): Promise<Record<string, unknown>> => {
  const generativeModel = genAI.getGenerativeModel({
    model,
    systemInstruction: RECEIPT_SYSTEM_INSTRUCTION,
    generationConfig: {
      temperature: 0.1,
      topP: 0.95,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      responseMimeType: 'application/json',
    },
  });

  const result = await withTimeout(
    generativeModel.generateContent(parts as never),
    MODEL_CALL_TIMEOUT_MS,
    `Gemini ${model}`,
  );

  const text = stripJsonFence(result.response.text().trim());
  if (!text) {
    const candidate = result.response.candidates?.[0];
    throw new Error(
      `Gemini returned an empty response (finishReason=${candidate?.finishReason ?? 'unknown'}, `
      + `blockReason=${result.response.promptFeedback?.blockReason ?? 'none'})`,
    );
  }

  const parsed = JSON.parse(sanitizeAIOutput(text));
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Gemini returned JSON that is not an object');
  }
  return parsed as Record<string, unknown>;
};

/**
 * Failures worth a second attempt: a timeout, a rate limit, a 5xx, or an empty
 * candidate. A malformed request or a safety block fails identically the second
 * time, and retrying it only delays the fallback engine.
 */
const TRANSIENT_ERROR = /timeout|exceeded \d+ms|429|rate limit|quota|5\d\d|unavailable|empty response|ECONNRESET|ETIMEDOUT|fetch failed/i;
const RATE_LIMITED = /429|rate limit|quota|RESOURCE_EXHAUSTED/i;

/** Total time the retry ladder may spend before giving the fallback its turn. */
const RETRY_BUDGET_MS = Number(process.env.OCR_RETRY_BUDGET_MS || 25_000);

/**
 * Quota cooldown.
 *
 * An exhausted API quota is not a per-request accident — it stays exhausted for
 * minutes or until the daily window rolls over. Without this, every scan pays
 * the full retry ladder (two 8s waits on the vision pass, two more on the text
 * pass) before reaching the offline parser: roughly 50 seconds of waiting to
 * rediscover a fact we already knew. Remembering it turns those scans into fast
 * ones that degrade immediately instead.
 */
const QUOTA_COOLDOWN_MS = Number(process.env.OCR_QUOTA_COOLDOWN_MS || 90_000);
let quotaBlockedUntil = 0;

const isQuotaBlocked = () => Date.now() < quotaBlockedUntil;

const noteQuotaExhausted = () => {
  quotaBlockedUntil = Date.now() + QUOTA_COOLDOWN_MS;
  logger.warn(
    `AI quota exhausted — skipping the model for ${Math.round(QUOTA_COOLDOWN_MS / 1000)}s and reading bills `
    + 'with the offline parser. Accuracy is reduced until quota frees up; enable billing on the Google API key to avoid this.',
  );
};

/** Exposed for tests and for the admin health surface. */
export const getQuotaCooldownRemainingMs = () => Math.max(0, quotaBlockedUntil - Date.now());
export const resetQuotaCooldown = () => { quotaBlockedUntil = 0; };

/**
 * How long to wait before retrying.
 *
 * A rate limit is not a blip: Gemini's per-minute quota needs seconds, not
 * milliseconds, to free up, and the API often says exactly how long via
 * RetryInfo. Retrying a 429 after 1.2s just burns another request against the
 * same exhausted quota, so its delay is read from the response when offered and
 * otherwise defaults to something that can plausibly work.
 */
const retryDelayFor = (message: string): number => {
  if (!RATE_LIMITED.test(message)) return 1_200;
  const advertised = message.match(/retryDelay"?\s*:\s*"?(\d+(?:\.\d+)?)s/i);
  if (advertised) {
    return Math.min(20_000, Math.ceil(Number(advertised[1]) * 1000) + 500);
  }
  return 8_000;
};

const callGeminiWithRetry = async (
  model: string,
  parts: Array<Record<string, unknown>>,
  label: string,
): Promise<Record<string, unknown>> => {
  const deadline = Date.now() + RETRY_BUDGET_MS;
  let attempt = 0;

  for (;;) {
    try {
      return await callGemini(model, parts);
    } catch (error: any) {
      const message = error?.message ?? String(error);
      attempt += 1;

      if (RATE_LIMITED.test(message) && attempt >= 2) {
        // Two rate limits in a row is quota exhaustion, not a burst.
        noteQuotaExhausted();
        throw error;
      }

      if (!TRANSIENT_ERROR.test(message) || attempt > 2) throw error;

      const delay = retryDelayFor(message);
      if (Date.now() + delay > deadline) {
        // Waiting would eat the budget the fallback engine needs.
        if (RATE_LIMITED.test(message)) noteQuotaExhausted();
        throw error;
      }

      logger.warn(`${label} failed transiently, retrying in ${delay}ms`, { attempt, error: message.slice(0, 200) });
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};

// ─── Extraction paths ────────────────────────────────────────────────────────

const extractWithVision = async (
  imageBuffer: Buffer,
  mimeType: string,
  model: string,
): Promise<OcrEngineResult> => {
  const raw = await callGeminiWithRetry(
    model,
    [
      { inlineData: { data: imageBuffer.toString('base64'), mimeType: mimeType || 'image/jpeg' } },
      { text: buildVisionPrompt() },
    ],
    'Gemini vision',
  );
  return normalizeExtractedReceipt(raw, { engine: 'gemini-vision' });
};

const extractWithTextModel = async (rawText: string, model: string): Promise<OcrEngineResult> => {
  const { sanitized, flagged } = sanitizeAIInput(rawText);
  if (flagged) {
    audit({
      event: 'ai.prompt_injection',
      resource: 'ocr',
      meta: { inputLength: rawText.length, preview: rawText.slice(0, 200) },
    });
    logger.warn('Prompt-injection pattern detected in OCR text - proceeding with sanitised input');
  }

  const raw = await callGeminiWithRetry(model, [{ text: buildTextPrompt(sanitized) }], 'Gemini text');
  return { ...normalizeExtractedReceipt(raw, { engine: 'gemini-text', rawText }), rawText };
};

const extractWithHeuristics = (rawText: string): OcrEngineResult => ({
  ...normalizeExtractedReceipt(parseReceiptFromText(rawText), { engine: 'ocr-heuristic', rawText }),
  rawText,
});

/** OCR transcript, cached per call so vision and text paths don't both pay. */
const readRawText = async (imageBuffer: Buffer, mimeType?: string): Promise<string> => {
  const { text, engine } = await extractRawText(imageBuffer, mimeType);
  logger.info(`OCR transcript ready (${engine})`, { chars: text.length });
  return text;
};

/**
 * Extract a bill from an image.
 *
 * Tries each engine in order and returns the first that produces a usable
 * reading — one with a total on it. A structurally valid response with no total
 * is not usable, so the next engine still gets its turn rather than the caller
 * receiving an empty shell.
 */
export const scanReceiptWithGemini = async (
  imageBuffer: Buffer,
  mimeType: string,
): Promise<OcrEngineResult> => {
  const config = await getAIConfigurations();
  const model = config.ocr.model || 'gemini-flash-latest';
  const provider = config.ocr.provider;
  const failures: string[] = [];

  const usable = (result: OcrEngineResult) => result.total !== null && result.total > 0;
  // During a quota cooldown the model calls are guaranteed to fail; skipping
  // them takes the scan straight to the offline parser in seconds instead of
  // making the user wait out a retry ladder that cannot succeed.
  const modelAvailable = Boolean(GOOGLE_API_KEY) && provider !== 'tesseract' && !isQuotaBlocked();

  if (!modelAvailable && isQuotaBlocked()) {
    logger.info('OCR: skipping model passes, quota cooldown active', {
      remainingMs: getQuotaCooldownRemainingMs(),
    });
  }

  // 1. Vision — unless the admin pinned the provider to text-only OCR.
  if (modelAvailable) {
    try {
      const started = Date.now();
      const result = await extractWithVision(imageBuffer, mimeType, model);
      logger.info('OCR: vision pass complete', {
        ms: Date.now() - started,
        total: result.total,
        confidence: result.confidence,
        merchant: result.merchant.name,
      });
      if (usable(result)) return result;
      failures.push('vision returned no total');
    } catch (error: any) {
      failures.push(`vision: ${error?.message ?? error}`);
      logger.warn('OCR: vision pass failed', { error: error?.message ?? String(error) });
    }
  }

  // 2 & 3 both need the OCR transcript.
  let rawText = '';
  try {
    rawText = await readRawText(imageBuffer, mimeType);
  } catch (error: any) {
    failures.push(`ocr: ${error?.message ?? error}`);
  }

  if (modelAvailable && !isQuotaBlocked() && rawText.trim().length > 20) {
    try {
      const result = await extractWithTextModel(rawText, model);
      logger.info('OCR: text-model pass complete', { total: result.total, confidence: result.confidence });
      if (usable(result)) return result;
      failures.push('text model returned no total');
    } catch (error: any) {
      failures.push(`text model: ${error?.message ?? error}`);
      logger.warn('OCR: text-model pass failed', { error: error?.message ?? String(error) });
    }
  }

  if (rawText.trim().length > 0) {
    const result = extractWithHeuristics(rawText);
    logger.info('OCR: heuristic pass complete', {
      total: result.total,
      confidence: result.confidence,
      priorFailures: failures,
    });
    return result;
  }

  throw new Error(`Could not read this bill (${failures.join('; ') || 'no text extracted'})`);
};

/**
 * Structure text that was already extracted (a digital PDF's text layer, or a
 * transcript from elsewhere). Same engine ladder minus the vision step.
 */
export const scanReceiptFromText = async (text: string): Promise<OcrEngineResult> => {
  const config = await getAIConfigurations();
  const model = config.ocr.model || 'gemini-flash-latest';

  if (GOOGLE_API_KEY && config.ocr.provider !== 'tesseract') {
    try {
      const result = await extractWithTextModel(text, model);
      if (result.total !== null && result.total > 0) return result;
    } catch (error: any) {
      logger.warn('Text structuring failed, using the offline parser', { error: error?.message ?? String(error) });
    }
  }

  return extractWithHeuristics(text);
};
