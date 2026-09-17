/**
 * LLM provider ladder for the conversational assistant and KAI.
 *
 * Gemini first — the configured model, the rolling `gemini-flash-latest`
 * alias, then a lite model with its own quota bucket (see gemini.models.ts) —
 * then the xkiro proxy's free models, then the paid OpenLux proxy (its Gemini
 * models, then its OpenAI models), then Groq and OpenRouter when their keys are
 * set. Each call is bounded, and the whole ladder shares one deadline so a slow
 * provider can never push a chat request past the client's timeout.
 */

import { logger } from '../../config/logger';
import { getAIConfigurations } from '../../utils/aiConfig';
import { classifyLLMError, geminiModelLadder, isGeminiModelCoolingDown, noteGeminiFailure } from './gemini.models';

export type LLMParser = 'gemini' | 'openlux' | 'xkiro' | 'groq' | 'openrouter';

export interface LLMOptions {
  /** Ask for a JSON object (response_format / responseMimeType). */
  json?: boolean;
  system?: string;
  /** Tokens the answer itself needs. Gemini gets thinking headroom on top. */
  maxTokens?: number;
  temperature?: number;
  /** Per-call bound. */
  timeoutMs?: number;
  /** Bound on the whole ladder, retries included. */
  deadlineMs?: number;
}

const DEFAULT_TIMEOUT_MS = Number(process.env.AI_CHAT_TIMEOUT_MS || 20_000);
const DEFAULT_DEADLINE_MS = Number(process.env.AI_LLM_DEADLINE_MS || 28_000);
const TRANSIENT_RETRY_DELAY_MS = Number(process.env.AI_TRANSIENT_RETRY_MS || 1500);
/**
 * Gemini's flash alias is a thinking model, and thought tokens count against
 * maxOutputTokens: a 512-token cap was routinely spent on thinking, leaving a
 * truncated or empty JSON answer and a silent fall back to the regex parser.
 * An unused cap costs nothing, so every Gemini call gets this much on top —
 * and so does every OpenAI reasoning model, whose reasoning tokens count
 * against max_completion_tokens the same way.
 */
const THINKING_HEADROOM_TOKENS = Number(process.env.GEMINI_THINKING_HEADROOM_TOKENS || 3072);

/** OpenLux serves Gemini's REST API at the root and OpenAI's under /v1. */
const OPENLUX_BASE_URL = (process.env.OPENLUX_BASE_URL || 'https://api.openlux.ai').replace(/\/+$/, '');
const DEFAULT_OPENLUX_GEMINI_MODELS = 'gemini-3.1-pro-preview';
const DEFAULT_OPENLUX_OPENAI_MODELS = 'gpt-5.5-pro';

/** xkiro is OpenAI-compatible only; its `:free` models are rate limited, so each has its own cooldown. */
const XKIRO_BASE_URL = (process.env.XKIRO_BASE_URL || 'https://api.xkiro.com/v1').replace(/\/+$/, '');
/**
 * Fastest first: minimax answered KAI in ~3s and qwen in ~9s when measured
 * (2026-09-17). openai/gpt-5.3-codex-spark is listed by xkiro but answered
 * every request with 503 then, so it is opt-in via XKIRO_MODELS.
 */
const DEFAULT_XKIRO_MODELS = 'minimax/minimax-m3:free,qwen/qwen3.8-max:free';

const modelList = (value: string | undefined, fallback: string): string[] =>
  (value || fallback).split(',').map((m) => m.trim()).filter(Boolean);

/** gpt-5.x and o-series reject `max_tokens` and any non-default temperature. */
const isOpenAIReasoningModel = (model: string): boolean => /(?:^|\/)(?:gpt-5|o\d)/i.test(model);

const withTimeout = async <T>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

export const stripJsonFence = (text: string): string =>
  text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

/** Models that rejected `thinkingBudget: 0` — they get the plain config from then on. */
const thinkingConfigRejected = new Set<string>();

interface GeminiEndpoint {
  apiKey: string;
  /** A proxy serving Gemini's REST API; Google's own endpoint when unset. */
  baseUrl?: string;
  /** Bookkeeping key — the same model behind a proxy is a different deployment. */
  key: string;
}

async function callGemini(model: string, prompt: string, opts: LLMOptions, endpoint: GeminiEndpoint): Promise<string> {
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(endpoint.apiKey);

  const request = async (disableThinking: boolean): Promise<string> => {
    const generationConfig = {
      temperature: opts.temperature ?? (opts.json ? 0.1 : 0.4),
      maxOutputTokens: (opts.maxTokens ?? (opts.json ? 768 : 900)) + THINKING_HEADROOM_TOKENS,
      ...(opts.json ? { responseMimeType: 'application/json' } : {}),
      // Structured extraction gains nothing from thinking and pays for it in latency.
      ...(disableThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
    };
    const generativeModel = genAI.getGenerativeModel(
      {
        model,
        ...(opts.system ? { systemInstruction: opts.system } : {}),
        // thinkingConfig is not in this SDK's types; the REST API accepts it.
        generationConfig: generationConfig as Record<string, unknown>,
      },
      endpoint.baseUrl ? { baseUrl: endpoint.baseUrl } : undefined,
    );
    const result = await generativeModel.generateContent(prompt);
    const text = result.response.text();
    const candidate = result.response.candidates?.[0];
    if (!text || !text.trim()) {
      throw new Error(`Gemini returned an empty response (finishReason=${candidate?.finishReason ?? 'unknown'})`);
    }
    if (opts.json && candidate?.finishReason === 'MAX_TOKENS') {
      throw new Error('Gemini returned an empty response (finishReason=MAX_TOKENS, JSON truncated)');
    }
    return text;
  };

  const disableThinking = Boolean(opts.json) && !thinkingConfigRejected.has(endpoint.key);
  try {
    return await request(disableThinking);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (disableThinking && /\b400\b|invalid argument|thinking/i.test(message)) {
      thinkingConfigRejected.add(endpoint.key);
      return request(false);
    }
    throw err;
  }
}

/** OpenAI chat content parts — text, or an image as a data: URL. */
export type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

/**
 * One chat-completions call against any OpenAI-compatible server (Groq,
 * OpenRouter, the xkiro/OpenLux proxies, Docker Model Runner). An empty apiKey
 * sends no Authorization header — local servers don't take one.
 */
export async function callOpenAICompatible(
  prompt: string | ChatContentPart[],
  opts: LLMOptions,
  provider: { baseUrl: string; apiKey: string; model: string; label: string; signal?: AbortSignal },
): Promise<string> {
  const messages: Array<{ role: string; content: string | ChatContentPart[] }> = [];
  if (opts.system) messages.push({ role: 'system', content: opts.system });
  messages.push({ role: 'user', content: prompt });

  const answerTokens = opts.maxTokens ?? (opts.json ? 768 : 900);
  const res = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {}),
    },
    signal: provider.signal,
    body: JSON.stringify({
      model: provider.model,
      messages,
      ...(isOpenAIReasoningModel(provider.model)
        ? { max_completion_tokens: answerTokens + THINKING_HEADROOM_TOKENS }
        : { temperature: opts.temperature ?? (opts.json ? 0.1 : 0.4), max_tokens: answerTokens }),
      ...(opts.json ? { response_format: { type: 'json_object' } } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${provider.label} API error ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data?.choices?.[0]?.message?.content ?? '';
  if (!text.trim()) throw new Error(`${provider.label} returned an empty response`);
  return text;
}

interface LadderStep {
  parser: LLMParser;
  label: string;
  model?: string;
  /** Quota/missing-model cooldowns apply to steps that carry one (Gemini and the proxies). */
  cooldownKey?: string;
  run: () => Promise<string>;
}

/** One step per model on an OpenAI-compatible proxy, each with its own cooldown. */
const proxyModelSteps = (
  prompt: string,
  opts: LLMOptions,
  proxy: { parser: LLMParser; label: string; baseUrl: string; apiKey: string; models: string[] },
): LadderStep[] =>
  proxy.models.map((model) => {
    const key = `${proxy.parser}:${model}`;
    return {
      parser: proxy.parser,
      label: key,
      model,
      cooldownKey: key,
      run: () => callOpenAICompatible(prompt, opts, { baseUrl: proxy.baseUrl, apiKey: proxy.apiKey, model, label: proxy.label }),
    };
  });

/**
 * Run the prompt through the first provider that answers. Returns null when no
 * provider is configured, every one failed, or the deadline passed — callers
 * fall back to offline heuristics and label the answer accordingly.
 */
export async function completeWithLLM(
  prompt: string,
  opts: LLMOptions = {},
): Promise<{ text: string; parser: LLMParser; model?: string } | null> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const deadline = Date.now() + (opts.deadlineMs ?? DEFAULT_DEADLINE_MS);
  const steps: LadderStep[] = [];

  if (process.env.GOOGLE_API_KEY) {
    const config = await getAIConfigurations();
    for (const model of geminiModelLadder(config.voice.model)) {
      steps.push({
        parser: 'gemini',
        label: `gemini:${model}`,
        model,
        cooldownKey: model,
        run: () => callGemini(model, prompt, opts, { apiKey: process.env.GOOGLE_API_KEY!, key: model }),
      });
    }
  }
  // Backups for when the free Google key has spent its daily quota: free proxy models first, then paid.
  if (process.env.XKIRO_API_KEY) {
    steps.push(...proxyModelSteps(prompt, opts, {
      parser: 'xkiro',
      label: 'xkiro',
      baseUrl: XKIRO_BASE_URL,
      apiKey: process.env.XKIRO_API_KEY,
      models: modelList(process.env.XKIRO_MODELS, DEFAULT_XKIRO_MODELS),
    }));
  }
  if (process.env.OPENLUX_GEMINI_API_KEY) {
    for (const model of modelList(process.env.OPENLUX_GEMINI_MODELS, DEFAULT_OPENLUX_GEMINI_MODELS)) {
      const key = `openlux:${model}`;
      steps.push({
        parser: 'openlux',
        label: key,
        model,
        cooldownKey: key,
        run: () => callGemini(model, prompt, opts, { apiKey: process.env.OPENLUX_GEMINI_API_KEY!, baseUrl: OPENLUX_BASE_URL, key }),
      });
    }
  }
  if (process.env.OPENLUX_OPENAI_API_KEY) {
    steps.push(...proxyModelSteps(prompt, opts, {
      parser: 'openlux',
      label: 'OpenLux',
      baseUrl: `${OPENLUX_BASE_URL}/v1`,
      apiKey: process.env.OPENLUX_OPENAI_API_KEY,
      models: modelList(process.env.OPENLUX_OPENAI_MODELS, DEFAULT_OPENLUX_OPENAI_MODELS),
    }));
  }
  if (process.env.GROQ_API_KEY) {
    steps.push({
      parser: 'groq',
      label: 'groq',
      run: () => callOpenAICompatible(prompt, opts, {
        baseUrl: 'https://api.groq.com/openai/v1',
        apiKey: process.env.GROQ_API_KEY!,
        model: process.env.GROQ_CHAT_MODEL || 'llama-3.3-70b-versatile',
        label: 'Groq',
      }),
    });
  }
  if (process.env.OPENROUTER_API_KEY) {
    steps.push({
      parser: 'openrouter',
      label: 'openrouter',
      run: () => callOpenAICompatible(prompt, opts, {
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: process.env.OPENROUTER_API_KEY!,
        model: process.env.OPENROUTER_CHAT_MODEL || 'meta-llama/llama-3.3-70b-instruct',
        label: 'OpenRouter',
      }),
    });
  }

  for (const step of steps) {
    if (step.cooldownKey && isGeminiModelCoolingDown(step.cooldownKey)) continue;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const remaining = deadline - Date.now();
      if (remaining < 1_000) {
        logger.warn('Chat LLM: deadline reached before any provider answered', { lastTried: step.label });
        return null;
      }
      try {
        const text = await withTimeout(step.run(), Math.min(timeoutMs, remaining), step.label);
        return { text, parser: step.parser, model: step.model };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const kind = step.cooldownKey ? noteGeminiFailure(step.cooldownKey, message) : classifyLLMError(message);
        // A capacity blip (503 "high demand") usually clears within a second; one
        // short retry beats dropping to the next model. Quota, timeouts and bad
        // requests fail the same way twice, so those move straight on.
        if (attempt === 0 && kind === 'unavailable' && isCapacityBlip(message) && remaining > TRANSIENT_RETRY_DELAY_MS + 2_000) {
          logger.warn(`Chat LLM: ${step.label} transient error, retrying once`, { error: message.slice(0, 200) });
          await new Promise((resolve) => setTimeout(resolve, TRANSIENT_RETRY_DELAY_MS));
          continue;
        }
        logger.warn(`Chat LLM: ${step.label} failed (${kind}), trying next provider`, { error: message.slice(0, 300) });
        break;
      }
    }
  }
  return null;
}

const isCapacityBlip = (message: string): boolean =>
  /\[(?:503|500)\b|\b503\b|high demand|overloaded/i.test(message);

export const isTransientLLMError = (message: string): boolean =>
  /\[(?:503|429|500)\b|\b(?:503|429)\b|high demand|overloaded|RESOURCE_EXHAUSTED|rate limit|try again later/i.test(message);
