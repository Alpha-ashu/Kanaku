/**
 * LLM provider ladder for the conversational assistant.
 *
 * Gemini is primary (rolling `gemini-flash-latest` alias — pinned point
 * versions like gemini-1.5-flash 404 for newer API keys), then Groq and
 * OpenRouter as outage/quota fallbacks. Each call is bounded so a wedged
 * provider can never hang a chat request.
 */

import { logger } from '../../config/logger';
import { getAIConfigurations } from '../../utils/aiConfig';

export type LLMParser = 'gemini' | 'groq' | 'openrouter';

export interface LLMOptions {
  /** Ask for a JSON object (response_format / responseMimeType). */
  json?: boolean;
  system?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = Number(process.env.AI_CHAT_TIMEOUT_MS || 25_000);

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

async function callGemini(prompt: string, opts: LLMOptions): Promise<string> {
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const config = await getAIConfigurations();
  const modelName = config.voice.model || 'gemini-flash-latest';
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
  const model = genAI.getGenerativeModel({
    model: modelName,
    ...(opts.system ? { systemInstruction: opts.system } : {}),
    generationConfig: {
      temperature: opts.temperature ?? (opts.json ? 0.1 : 0.4),
      maxOutputTokens: opts.maxTokens ?? (opts.json ? 768 : 900),
      ...(opts.json ? { responseMimeType: 'application/json' } : {}),
    },
  });
  const result = await model.generateContent(prompt);
  const text = result.response.text();
  if (!text || !text.trim()) {
    const candidate = result.response.candidates?.[0];
    throw new Error(`Gemini returned an empty response (finishReason=${candidate?.finishReason ?? 'unknown'})`);
  }
  return text;
}

async function callOpenAICompatible(
  prompt: string,
  opts: LLMOptions,
  provider: { baseUrl: string; apiKey: string; model: string; label: string },
): Promise<string> {
  const messages: Array<{ role: string; content: string }> = [];
  if (opts.system) messages.push({ role: 'system', content: opts.system });
  messages.push({ role: 'user', content: prompt });

  const res = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.apiKey}` },
    body: JSON.stringify({
      model: provider.model,
      messages,
      temperature: opts.temperature ?? (opts.json ? 0.1 : 0.4),
      max_tokens: opts.maxTokens ?? (opts.json ? 768 : 900),
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

/**
 * Run the prompt through the first provider that answers. Returns null when no
 * provider is configured or every one failed — callers fall back to offline
 * heuristics and label the answer accordingly.
 */
export async function completeWithLLM(
  prompt: string,
  opts: LLMOptions = {},
): Promise<{ text: string; parser: LLMParser } | null> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const providers: Array<{ parser: LLMParser; run: () => Promise<string> }> = [];

  if (process.env.GOOGLE_API_KEY) {
    providers.push({ parser: 'gemini', run: () => callGemini(prompt, opts) });
  }
  if (process.env.GROQ_API_KEY) {
    providers.push({
      parser: 'groq',
      run: () => callOpenAICompatible(prompt, opts, {
        baseUrl: 'https://api.groq.com/openai/v1',
        apiKey: process.env.GROQ_API_KEY!,
        model: process.env.GROQ_CHAT_MODEL || 'llama-3.3-70b-versatile',
        label: 'Groq',
      }),
    });
  }
  if (process.env.OPENROUTER_API_KEY) {
    providers.push({
      parser: 'openrouter',
      run: () => callOpenAICompatible(prompt, opts, {
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: process.env.OPENROUTER_API_KEY!,
        model: process.env.OPENROUTER_CHAT_MODEL || 'meta-llama/llama-3.3-70b-instruct',
        label: 'OpenRouter',
      }),
    });
  }

  for (const provider of providers) {
    try {
      const text = await withTimeout(provider.run(), timeoutMs, provider.parser);
      return { text, parser: provider.parser };
    } catch (err) {
      logger.warn(`Chat LLM: ${provider.parser} failed, trying next provider`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return null;
}
