/**
 * KAI / chat LLM ladder — the xkiro and OpenLux proxies as backups.
 *
 * The Google key can spend its daily quota early, after which every Gemini
 * model 429s. The ladder must then reach xkiro's free models, then the paid
 * OpenLux proxy (its Gemini models through the Google SDK with a proxy
 * baseUrl, then its OpenAI models over chat completions) with each proxy's own
 * token — and a quota cooldown on Google's copy of a model must not also skip
 * the proxy's copy.
 *
 * Both SDKs are mocked: no request leaves the process.
 */
jest.mock('../../../../backend/src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

let voiceModel = 'gemini-flash-latest';
jest.mock('../../../../backend/src/utils/aiConfig', () => ({
  getAIConfigurations: async () => ({ voice: { model: voiceModel } }),
}));

type GeminiBehaviour = (call: { apiKey: string; model: string; baseUrl?: string }) => Promise<string>;
let geminiBehaviour: GeminiBehaviour;
const geminiCalls: Array<{ apiKey: string; model: string; baseUrl?: string }> = [];

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class {
    constructor(private readonly apiKey: string) {}
    getGenerativeModel(params: { model: string }, requestOptions?: { baseUrl?: string }) {
      const call = { apiKey: this.apiKey, model: params.model, baseUrl: requestOptions?.baseUrl };
      return {
        generateContent: async () => {
          geminiCalls.push(call);
          const text = await geminiBehaviour(call);
          return { response: { text: () => text, candidates: [{ finishReason: 'STOP' }] } };
        },
      };
    }
  },
}));

import { completeWithLLM } from '../../../../backend/src/features/ai/chat.llm';
import { geminiCooldownRemainingMs, noteGeminiFailure, resetGeminiCooldowns } from '../../../../backend/src/features/ai/gemini.models';

const DAILY_QUOTA = '[429 Too Many Requests] quotaId GenerateRequestsPerDayPerProjectPerModel-FreeTier';
const PROVIDER_KEYS = ['GOOGLE_API_KEY', 'XKIRO_API_KEY', 'OPENLUX_GEMINI_API_KEY', 'OPENLUX_OPENAI_API_KEY', 'GROQ_API_KEY', 'OPENROUTER_API_KEY'];

const fetchMock = jest.fn();
const originalFetch = global.fetch;

beforeEach(() => {
  resetGeminiCooldowns();
  geminiCalls.length = 0;
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  voiceModel = 'gemini-flash-latest';
  for (const key of PROVIDER_KEYS) process.env[key] = '';
  process.env.GOOGLE_API_KEY = 'google-free-key';
  process.env.OPENLUX_GEMINI_API_KEY = 'openlux-gemini-token';
  process.env.OPENLUX_OPENAI_API_KEY = 'openlux-openai-token';
});

afterAll(() => {
  global.fetch = originalFetch;
});

describe('completeWithLLM — proxy backups', () => {
  it('answers through OpenLux Gemini once the Google key is out of quota', async () => {
    geminiBehaviour = async ({ apiKey }) => {
      if (apiKey === 'google-free-key') throw new Error(DAILY_QUOTA);
      return '{"ok":true}';
    };

    const result = await completeWithLLM('log 200 for lunch', { json: true });

    expect(result).toEqual({ text: '{"ok":true}', parser: 'openlux', model: 'gemini-3.1-pro-preview' });
    const proxied = geminiCalls.filter((c) => c.apiKey === 'openlux-gemini-token');
    expect(proxied).toEqual([{ apiKey: 'openlux-gemini-token', model: 'gemini-3.1-pro-preview', baseUrl: 'https://api.openlux.ai' }]);
    // Google's own endpoint never receives the proxy token, and vice versa.
    expect(geminiCalls.filter((c) => c.apiKey === 'google-free-key').every((c) => c.baseUrl === undefined)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls through to OpenLux OpenAI with reasoning-model parameters', async () => {
    geminiBehaviour = async () => { throw new Error(DAILY_QUOTA); };
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"kind":"expense"}' } }] }),
    });

    const result = await completeWithLLM('log 200 for lunch', { json: true, maxTokens: 512, system: 'be terse' });

    expect(result).toEqual({ text: '{"kind":"expense"}', parser: 'openlux', model: 'gpt-5.5-pro' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openlux.ai/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer openlux-openai-token');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('gpt-5.5-pro');
    expect(body.max_completion_tokens).toBeGreaterThan(512);
    expect(body).not.toHaveProperty('max_tokens');
    expect(body).not.toHaveProperty('temperature');
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.messages).toEqual([
      { role: 'system', content: 'be terse' },
      { role: 'user', content: 'log 200 for lunch' },
    ]);
  });

  it("keeps Google's quota cooldown off the proxy's copy of the same model", async () => {
    voiceModel = 'gemini-3.1-pro-preview';
    geminiBehaviour = async ({ apiKey }) => {
      if (apiKey === 'google-free-key') throw new Error(DAILY_QUOTA);
      return 'hello';
    };

    await completeWithLLM('hi');
    geminiCalls.length = 0;
    const second = await completeWithLLM('hi again');

    expect(second?.parser).toBe('openlux');
    // Google's models are cooling down, so the second request goes straight to the proxy.
    expect(geminiCalls).toEqual([{ apiKey: 'openlux-gemini-token', model: 'gemini-3.1-pro-preview', baseUrl: 'https://api.openlux.ai' }]);
  });

  it('tries the free xkiro models before paid OpenLux, moving on when one is rate limited', async () => {
    process.env.XKIRO_API_KEY = 'xkiro-token';
    geminiBehaviour = async ({ apiKey }) => {
      if (apiKey === 'google-free-key') throw new Error(DAILY_QUOTA);
      return 'from openlux';
    };
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => '{"error":{"message":"rate limited"}}' })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: 'from qwen' } }] }) });

    const result = await completeWithLLM('hi');

    expect(result).toEqual({ text: 'from qwen', parser: 'xkiro', model: 'qwen/qwen3.8-max:free' });
    expect(geminiCalls.some((c) => c.apiKey === 'openlux-gemini-token')).toBe(false);
    const requests = fetchMock.mock.calls.map(([url, init]) => ({ url, auth: init.headers.Authorization, model: JSON.parse(init.body).model }));
    expect(requests).toEqual([
      { url: 'https://api.xkiro.com/v1/chat/completions', auth: 'Bearer xkiro-token', model: 'minimax/minimax-m3:free' },
      { url: 'https://api.xkiro.com/v1/chat/completions', auth: 'Bearer xkiro-token', model: 'qwen/qwen3.8-max:free' },
    ]);
    const qwenBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(qwenBody).toHaveProperty('max_tokens');
    expect(qwenBody).toHaveProperty('temperature');
  });

  it('skips a proxy account that is out of credit for longer than a rate limit', () => {
    noteGeminiFailure(
      'openlux:gpt-5.5-pro',
      'OpenLux API error 403: {"error":{"message":"user quota is not enough","code":"local:insufficient_quota"}}',
    );
    expect(geminiCooldownRemainingMs('openlux:gpt-5.5-pro')).toBeGreaterThan(10 * 60_000);
  });

  it('adds no proxy steps when their tokens are unset', async () => {
    process.env.OPENLUX_GEMINI_API_KEY = '';
    process.env.OPENLUX_OPENAI_API_KEY = '';
    geminiBehaviour = async () => { throw new Error(DAILY_QUOTA); };

    await expect(completeWithLLM('hi')).resolves.toBeNull();
    expect(geminiCalls.every((c) => c.apiKey === 'google-free-key')).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
