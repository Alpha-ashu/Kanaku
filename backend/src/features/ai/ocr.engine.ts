import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '../../config/logger';
import { extractRawText } from '../../utils/paddleOcr';
import { sanitizeAIInput, sanitizeAIOutput } from '../../utils/sanitize';
import { audit } from '../../utils/auditLogger';
import { getAIConfigurations } from '../../utils/aiConfig';
import { parseReceiptFromText } from './receiptTextParser';
import { RECEIPT_SYSTEM_INSTRUCTION, buildVisionPrompt, buildTextPrompt } from './receiptPrompt';
import { normalizeExtractedReceipt, type ExtractedReceipt } from './receiptSchema';
import { callOpenAICompatible, type ChatContentPart } from './chat.llm';
import {
  geminiCooldownRemainingMs,
  geminiModelLadder,
  isGeminiModelCoolingDown,
  noteGeminiFailure,
  resetGeminiCooldowns,
} from './gemini.models';

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
 *   2. **Fallback model vision on the image** — DeepSeek V4.1 Flash by default
 *      (see ocrFallbackEndpoint), for when Gemini has no key, no quota, an
 *      outage, or read no total.
 *   3. **Gemini over OCR text.** Used when vision is unavailable or refuses.
 *   4. **Fallback model over OCR text.**
 *   5. **Offline heuristic parser.** No network, no key, no LLM. Deliberately
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
 * Failures worth a second attempt on the same model: a timeout, a 5xx, or an
 * empty candidate. Quota and retired-model errors are not retried — they put
 * the model on a cooldown (gemini.models.ts) and the next model in the ladder
 * gets its turn. A malformed request or a safety block fails identically the
 * second time, and retrying it only delays the fallback engine.
 */
const TRANSIENT_ERROR = /timeout|exceeded \d+ms|5\d\d|unavailable|empty response|ECONNRESET|ETIMEDOUT|fetch failed/i;

/** Total time the retry ladder may spend on one model before moving on. */
const RETRY_BUDGET_MS = Number(process.env.OCR_RETRY_BUDGET_MS || 25_000);
const RETRY_DELAY_MS = 1_200;

/**
 * Quota cooldown, now per model. An exhausted quota stays exhausted for
 * minutes or until the daily window rolls over; remembering it keeps every
 * later scan from paying for calls that cannot succeed.
 */
const ocrModels = (configured?: string) => geminiModelLadder(configured).filter((m) => !isGeminiModelCoolingDown(m));

/** Time until any model in the default ladder is usable again (0 when one is). Exposed for tests and the admin health surface. */
export const getQuotaCooldownRemainingMs = () => Math.min(...geminiModelLadder().map(geminiCooldownRemainingMs));
export const resetQuotaCooldown = () => resetGeminiCooldowns();

/** Thrown when a model is on cooldown or quota-limited, so the caller tries the next one. */
const isModelUnavailable = (message: string) => /quota|429|RESOURCE_EXHAUSTED|404|no longer available|not found/i.test(message);

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

      const kind = noteGeminiFailure(model, message);
      if (kind === 'quota' || kind === 'missing_model') throw error;
      if (!TRANSIENT_ERROR.test(message) || attempt > 2) throw error;
      if (Date.now() + RETRY_DELAY_MS > deadline) throw error;

      logger.warn(`${label} (${model}) failed transiently, retrying in ${RETRY_DELAY_MS}ms`, { attempt, error: message.slice(0, 200) });
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
};

/**
 * Try each available model in turn. Only quota/retired-model failures move on
 * to the next model — a timeout or a bad reading on one model is not fixed by
 * a smaller one, and the offline engines still get their share of the budget.
 */
const withModelLadder = async <T>(models: string[], run: (model: string) => Promise<T>): Promise<T> => {
  let lastError: unknown = new Error('No AI model available (all on quota cooldown)');
  for (const model of models) {
    if (isGeminiModelCoolingDown(model)) continue;
    try {
      return await run(model);
    } catch (error: any) {
      lastError = error;
      if (!isModelUnavailable(error?.message ?? String(error))) throw error;
    }
  }
  throw lastError;
};

// ─── Extraction paths ────────────────────────────────────────────────────────

const extractWithVision = async (
  imageBuffer: Buffer,
  mimeType: string,
  model: string,
  preferredCurrency: string = 'INR',
): Promise<OcrEngineResult> => {
  const raw = await callGeminiWithRetry(
    model,
    [
      { inlineData: { data: imageBuffer.toString('base64'), mimeType: mimeType || 'image/jpeg' } },
      { text: buildVisionPrompt(preferredCurrency) },
    ],
    'Gemini vision',
  );
  return normalizeExtractedReceipt(raw, { engine: 'gemini-vision', preferredCurrency });
};

const extractWithTextModel = async (
  rawText: string,
  model: string,
  preferredCurrency: string = 'INR',
): Promise<OcrEngineResult> => {
  const { sanitized, flagged } = sanitizeAIInput(rawText);
  if (flagged) {
    audit({
      event: 'ai.prompt_injection',
      resource: 'ocr',
      meta: { inputLength: rawText.length, preview: rawText.slice(0, 200) },
    });
    logger.warn('Prompt-injection pattern detected in OCR text - proceeding with sanitised input');
  }

  const raw = await callGeminiWithRetry(model, [{ text: buildTextPrompt(sanitized, preferredCurrency) }], 'Gemini text');
  return { ...normalizeExtractedReceipt(raw, { engine: 'gemini-text', rawText, preferredCurrency }), rawText };
};

// ─── Fallback models (any OpenAI-compatible server) ─────────────────────────

/**
 * DeepSeek V4.1 Flash reads images and costs a fraction of a cent per bill,
 * but on xkiro it needs a funded wallet; the free vision models behind it keep
 * the fallback working until then. Measured on the 11 sample bills
 * (2026-09-17): qwen3-vl-plus:free and qwen3.8-max:free each reconciled all 11
 * and agreed on every total, ~12-23s and ~11-38s a bill.
 * OCR_FALLBACK_BASE_URL points the ladder at any other OpenAI-compatible server
 * instead — Docker Model Runner serves http://localhost:12434/engines/v1
 * (OCR_FALLBACK_MODELS = the pulled model).
 */
const DEFAULT_OCR_FALLBACK_MODELS = 'deepseek/deepseek-v4.1-flash,qwen/qwen3-vl-plus:free,qwen/qwen3.8-max:free';
const XKIRO_BASE_URL = 'https://api.xkiro.com/v1';
/**
 * Model passes must finish inside the job budget (OCR_JOB_BUDGET_MS, 110s),
 * leaving time for the transcript and the offline parser — overrunning it fails
 * the whole scan instead of returning the heuristic reading.
 */
const MODEL_BUDGET_MS = Number(process.env.OCR_MODEL_BUDGET_MS || 90_000);
const MIN_FALLBACK_CALL_MS = 10_000;

interface FallbackEndpoint {
  baseUrl: string;
  apiKey: string;
  models: string[];
}

const fallbackCooldownKey = (model: string) => `ocr-fallback:${model}`;

const ocrFallbackEndpoint = (): FallbackEndpoint | null => {
  const configuredBase = process.env.OCR_FALLBACK_BASE_URL?.trim();
  const baseUrl = configuredBase || (process.env.XKIRO_API_KEY ? XKIRO_BASE_URL : '');
  if (!baseUrl) return null;
  // The xkiro token only ever goes to xkiro; a custom server gets its own key, or none.
  const apiKey = process.env.OCR_FALLBACK_API_KEY || (configuredBase ? '' : process.env.XKIRO_API_KEY!);
  const models = (process.env.OCR_FALLBACK_MODELS || DEFAULT_OCR_FALLBACK_MODELS)
    .split(',')
    .map((m) => m.trim())
    .filter((m) => m && !isGeminiModelCoolingDown(fallbackCooldownKey(m)));
  return models.length > 0 ? { baseUrl: baseUrl.replace(/\/+$/, ''), apiKey, models } : null;
};

/** Without a guaranteed JSON mode a model may wrap the object in prose or fences; take the outermost {...}. */
const parseModelJson = (text: string, label: string): Record<string, unknown> => {
  const cleaned = sanitizeAIOutput(stripJsonFence(text.trim()));
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error(`${label} returned no JSON object`);
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} returned JSON that is not an object`);
  }
  return parsed as Record<string, unknown>;
};

/**
 * Try each fallback model until one returns a usable reading. Unlike the
 * Gemini ladder, any failure moves on: the next model is usually another
 * vendor, so one that is unfunded, refuses the image or times out says nothing
 * about the next. A reading without a total also moves on.
 */
const runFallbackLadder = async (
  endpoint: FallbackEndpoint,
  deadline: number,
  engine: 'fallback-vision' | 'fallback-text',
  content: string | ChatContentPart[],
  rawText?: string,
  preferredCurrency: string = 'INR',
): Promise<OcrEngineResult> => {
  let lastError: unknown = new Error('No OCR fallback model available');
  for (const model of endpoint.models) {
    const remaining = deadline - Date.now();
    if (remaining < MIN_FALLBACK_CALL_MS) {
      throw new Error(`OCR model budget spent before ${model} could run`);
    }
    if (isGeminiModelCoolingDown(fallbackCooldownKey(model))) continue;

    const label = `OCR ${engine} ${model}`;
    const started = Date.now();
    try {
      const text = await callOpenAICompatible(
        content,
        { system: RECEIPT_SYSTEM_INSTRUCTION, json: true, maxTokens: MAX_OUTPUT_TOKENS, temperature: 0.1 },
        {
          baseUrl: endpoint.baseUrl,
          apiKey: endpoint.apiKey,
          model,
          label,
          signal: AbortSignal.timeout(Math.min(MODEL_CALL_TIMEOUT_MS, remaining)),
        },
      );
      const result = normalizeExtractedReceipt(parseModelJson(text, label), { engine, rawText, preferredCurrency });
      logger.info(`OCR: ${engine} pass complete`, {
        model,
        ms: Date.now() - started,
        total: result.total,
        confidence: result.confidence,
      });
      if (result.total !== null && result.total > 0) return rawText ? { ...result, rawText } : result;
      lastError = new Error(`${label} returned no total`);
    } catch (error: any) {
      const message = error?.message ?? String(error);
      lastError = error;
      noteGeminiFailure(fallbackCooldownKey(model), message);
      logger.warn(`OCR: ${label} failed, trying the next fallback`, { ms: Date.now() - started, error: message.slice(0, 300) });
    }
  }
  throw lastError;
};

const extractWithFallbackVision = (
  endpoint: FallbackEndpoint,
  deadline: number,
  imageBuffer: Buffer,
  mimeType: string,
  preferredCurrency: string = 'INR',
) =>
  runFallbackLadder(
    endpoint,
    deadline,
    'fallback-vision',
    [
      { type: 'text', text: buildVisionPrompt(preferredCurrency) },
      { type: 'image_url', image_url: { url: `data:${mimeType || 'image/jpeg'};base64,${imageBuffer.toString('base64')}` } },
    ],
    undefined,
    preferredCurrency,
  );

const extractWithFallbackText = (
  endpoint: FallbackEndpoint,
  deadline: number,
  rawText: string,
  preferredCurrency: string = 'INR',
) =>
  runFallbackLadder(
    endpoint,
    deadline,
    'fallback-text',
    buildTextPrompt(sanitizeAIInput(rawText).sanitized, preferredCurrency),
    rawText,
    preferredCurrency,
  );

const extractWithHeuristics = (rawText: string, preferredCurrency: string = 'INR'): OcrEngineResult => ({
  ...normalizeExtractedReceipt(parseReceiptFromText(rawText), { engine: 'ocr-heuristic', rawText, preferredCurrency }),
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
  preferredCurrency: string = 'INR',
): Promise<OcrEngineResult> => {
  const config = await getAIConfigurations();
  const provider = config.ocr.provider;
  const failures: string[] = [];
  const modelDeadline = Date.now() + MODEL_BUDGET_MS;
  // An admin pin to text-only OCR ('tesseract') keeps every model out, fallbacks included.
  const fallback = provider !== 'tesseract' ? ocrFallbackEndpoint() : null;

  const usable = (result: OcrEngineResult) => result.total !== null && result.total > 0;
  // Models on a quota cooldown are guaranteed to fail; skipping them takes the
  // scan to the next model, or straight to the offline parser in seconds,
  // instead of making the user wait out calls that cannot succeed.
  const keyAndProvider = Boolean(GOOGLE_API_KEY) && provider !== 'tesseract';
  const modelAvailable = keyAndProvider && ocrModels(config.ocr.model).length > 0;

  if (keyAndProvider && !modelAvailable) {
    logger.info('OCR: skipping model passes, every model is on quota cooldown', {
      remainingMs: getQuotaCooldownRemainingMs(),
    });
  }

  // 1. Vision — unless the admin pinned the provider to text-only OCR.
  if (modelAvailable) {
    try {
      const started = Date.now();
      const result = await withModelLadder(ocrModels(config.ocr.model), (model) => extractWithVision(imageBuffer, mimeType, model, preferredCurrency));
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

  // 2. The fallback model reads the image.
  if (fallback) {
    try {
      return await extractWithFallbackVision(fallback, modelDeadline, imageBuffer, mimeType, preferredCurrency);
    } catch (error: any) {
      failures.push(`fallback vision: ${error?.message ?? error}`);
    }
  }

  // 3, 4 & 5 all need the OCR transcript.
  let rawText = '';
  try {
    rawText = await readRawText(imageBuffer, mimeType);
  } catch (error: any) {
    failures.push(`ocr: ${error?.message ?? error}`);
  }

  if (modelAvailable && ocrModels(config.ocr.model).length > 0 && rawText.trim().length > 20) {
    try {
      const result = await withModelLadder(ocrModels(config.ocr.model), (model) => extractWithTextModel(rawText, model, preferredCurrency));
      logger.info('OCR: text-model pass complete', { total: result.total, confidence: result.confidence });
      if (usable(result)) return result;
      failures.push('text model returned no total');
    } catch (error: any) {
      failures.push(`text model: ${error?.message ?? error}`);
      logger.warn('OCR: text-model pass failed', { error: error?.message ?? String(error) });
    }
  }

  const fallbackForText = provider !== 'tesseract' ? ocrFallbackEndpoint() : null;
  if (fallbackForText && rawText.trim().length > 20) {
    try {
      return await extractWithFallbackText(fallbackForText, modelDeadline, rawText, preferredCurrency);
    } catch (error: any) {
      failures.push(`fallback text: ${error?.message ?? error}`);
    }
  }

  if (rawText.trim().length > 0) {
    const result = extractWithHeuristics(rawText, preferredCurrency);
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
export const scanReceiptFromText = async (
  text: string,
  preferredCurrency: string = 'INR',
): Promise<OcrEngineResult> => {
  const config = await getAIConfigurations();

  if (GOOGLE_API_KEY && config.ocr.provider !== 'tesseract' && ocrModels(config.ocr.model).length > 0) {
    try {
      const result = await withModelLadder(ocrModels(config.ocr.model), (model) => extractWithTextModel(text, model, preferredCurrency));
      if (result.total !== null && result.total > 0) return result;
    } catch (error: any) {
      logger.warn('Text structuring failed, using the offline parser', { error: error?.message ?? String(error) });
    }
  }

  const fallback = config.ocr.provider !== 'tesseract' ? ocrFallbackEndpoint() : null;
  if (fallback && text.trim().length > 20) {
    try {
      return await extractWithFallbackText(fallback, Date.now() + MODEL_BUDGET_MS, text, preferredCurrency);
    } catch (error: any) {
      logger.warn('Fallback text structuring failed, using the offline parser', { error: error?.message ?? String(error) });
    }
  }

  return extractWithHeuristics(text, preferredCurrency);
};
