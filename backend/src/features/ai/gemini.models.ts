/**
 * Which Gemini model to call, and which ones to leave alone for a while.
 *
 * Every AI surface (KAI, chat, bill scanning) shares one Google project, and on
 * the free tier each model has its own small daily request quota — 20 a day
 * for the flash alias when this was written. Once that is spent, every further
 * call 429s until the window resets, so:
 *
 *   - a model that answered 429 is skipped until its cooldown ends instead of
 *     paying a retry on every request;
 *   - a model that 404s (retired — gemini-2.5-flash did in 2026-09) is skipped
 *     for hours, and the ladder moves on to the rolling alias;
 *   - the ladder ends with a lite model, which has a separate quota bucket.
 *
 * Enabling billing on the key is the real fix for quota; this keeps the app
 * answering with a model for as long as any model is still available.
 */

import { logger } from '../../config/logger';

export const DEFAULT_GEMINI_MODEL = 'gemini-flash-latest';
const DEFAULT_FALLBACK_MODELS = 'gemini-flash-lite-latest';

/** Families Google has shut down. Admin settings saved with these would 404 on every call. */
const RETIRED_MODEL = /^gemini-(?:pro|pro-vision|ultra|1\.0|1\.5|2\.0)(?:$|-)/i;

const DAILY_QUOTA_COOLDOWN_MS = Number(process.env.AI_DAILY_QUOTA_COOLDOWN_MS || 15 * 60_000);
const RATE_LIMIT_COOLDOWN_MS = Number(process.env.AI_RATE_LIMIT_COOLDOWN_MS || 60_000);
const MISSING_MODEL_COOLDOWN_MS = 6 * 60 * 60_000;

export function resolveGeminiModel(name?: string | null): string {
  const trimmed = (name ?? '').trim().replace(/^models\//i, '');
  if (!trimmed || RETIRED_MODEL.test(trimmed)) return DEFAULT_GEMINI_MODEL;
  return trimmed;
}

/** Configured model first, then the rolling alias, then the fallbacks — without duplicates. */
export function geminiModelLadder(configured?: string | null): string[] {
  const fallbacks = (process.env.GEMINI_FALLBACK_MODELS ?? DEFAULT_FALLBACK_MODELS)
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
  return Array.from(new Set([resolveGeminiModel(configured), DEFAULT_GEMINI_MODEL, ...fallbacks.map(resolveGeminiModel)]));
}

export type LLMErrorKind = 'quota' | 'missing_model' | 'unavailable' | 'other';

export function classifyLLMError(message: string): LLMErrorKind {
  if (/\b429\b|RESOURCE_EXHAUSTED|exceeded your current quota|rate.?limit|quota|deposited balance|top up your wallet|insufficient (?:balance|credits?)/i.test(message)) return 'quota';
  if (/\b404\b|no longer available|is not found|not supported for generateContent/i.test(message)) return 'missing_model';
  if (/\b50[0234]\b|high demand|overloaded|unavailable|timed out|timeout|ECONNRESET|ETIMEDOUT|fetch failed|empty response/i.test(message)) return 'unavailable';
  return 'other';
}

/** "Please retry in 21.27s" / "retryDelay":"21s" → milliseconds. */
const advertisedRetryMs = (message: string): number | undefined => {
  const match = message.match(/retry in (\d+(?:\.\d+)?)s/i) ?? message.match(/retryDelay\\?"?\s*:\s*\\?"?(\d+(?:\.\d+)?)s/i);
  return match ? Math.ceil(Number(match[1]) * 1000) : undefined;
};

const cooldownUntil = new Map<string, number>();

export const isGeminiModelCoolingDown = (model: string): boolean => (cooldownUntil.get(model) ?? 0) > Date.now();

export const geminiCooldownRemainingMs = (model: string): number => Math.max(0, (cooldownUntil.get(model) ?? 0) - Date.now());

export const resetGeminiCooldowns = (): void => cooldownUntil.clear();

/**
 * Record a failed call. Quota and missing-model failures put the model on a
 * cooldown; capacity blips do not (they clear in seconds). Returns the kind so
 * the caller can decide whether a retry is worth it.
 */
export function noteGeminiFailure(model: string, message: string): LLMErrorKind {
  const kind = classifyLLMError(message);
  let cooldown = 0;
  if (kind === 'quota') {
    // A per-day quota or a proxy account out of credit won't clear in a minute.
    cooldown = /PerDay|insufficient_quota|quota is not enough|insufficient (?:balance|credits?)|deposited balance|top up your wallet/i.test(message)
      ? DAILY_QUOTA_COOLDOWN_MS
      : Math.max(10_000, (advertisedRetryMs(message) ?? RATE_LIMIT_COOLDOWN_MS) + 1_000);
  } else if (kind === 'missing_model') {
    cooldown = MISSING_MODEL_COOLDOWN_MS;
  }
  if (cooldown > 0) {
    cooldownUntil.set(model, Date.now() + cooldown);
    logger.warn(`AI model ${model} unavailable (${kind}) — skipping it for ${Math.round(cooldown / 1000)}s`, {
      error: message.slice(0, 300),
    });
  }
  return kind;
}
