/**
 * Bill scanner — the fallback model ladder behind Gemini.
 *
 * When Gemini cannot read a bill (no key, quota spent, outage), the scanner
 * sends the image to an OpenAI-compatible fallback: DeepSeek V4.1 Flash on
 * xkiro first, then a free vision model — moving past a model that is unfunded
 * and remembering it — before the transcript and offline parser. A custom
 * server (Docker Model Runner) must never receive the xkiro token.
 *
 * fetch, OCR and config are mocked: no request leaves the process.
 */
jest.mock('../../../../backend/src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../../../backend/src/utils/auditLogger', () => ({ audit: jest.fn() }));

let ocrProvider = 'hybrid';
jest.mock('../../../../backend/src/utils/aiConfig', () => ({
  getAIConfigurations: async () => ({ ocr: { provider: ocrProvider, model: 'gemini-flash-latest' } }),
}));

const TRANSCRIPT = 'EATING CIRCLES\nIdli 2 x 40.00 80.00\nCoffee 1 x 35.00 35.00\nNET AMOUNT 115.00';
jest.mock('../../../../backend/src/utils/paddleOcr', () => ({
  extractRawText: async () => ({ text: TRANSCRIPT, engine: 'tesseract' }),
}));

const UNFUNDED = '{"error":{"message":"This pay-as-you-go premium model requires real deposited balance — Top up your wallet to use it.","code":"permission_denied"}}';
const reading = (total: number | null) => ({
  ok: true,
  json: async () => ({
    choices: [{ message: { content: JSON.stringify({ merchant: { name: 'Eating Circles' }, total, items: [{ name: 'Idli', quantity: 2, unitPrice: 40, amount: 80 }] }) } }],
  }),
});

const fetchMock = jest.fn();
const originalFetch = global.fetch;

type OcrEngine = typeof import('../../../../backend/src/features/ai/ocr.engine');
type GeminiModels = typeof import('../../../../backend/src/features/ai/gemini.models');
let ocr: OcrEngine;
let models: GeminiModels;

beforeAll(() => {
  // ocr.engine reads GOOGLE_API_KEY at load: no Google key, so every scan needs the fallback.
  process.env.GOOGLE_API_KEY = '';
  ocr = require('../../../../backend/src/features/ai/ocr.engine');
  models = require('../../../../backend/src/features/ai/gemini.models');
});

beforeEach(() => {
  models.resetGeminiCooldowns();
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  ocrProvider = 'hybrid';
  process.env.XKIRO_API_KEY = 'xkiro-token';
  for (const key of ['OCR_FALLBACK_BASE_URL', 'OCR_FALLBACK_API_KEY', 'OCR_FALLBACK_MODELS']) delete process.env[key];
});

afterAll(() => {
  global.fetch = originalFetch;
  delete process.env.XKIRO_API_KEY;
});

const requestOf = (call: unknown[]) => {
  const [url, init] = call as [string, { headers: Record<string, string>; body: string }];
  return { url, headers: init.headers, body: JSON.parse(init.body) };
};

describe('scanReceiptWithGemini — fallback models', () => {
  it('skips unfunded DeepSeek, reads the image with the free model, and remembers the skip', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 403, text: async () => UNFUNDED }).mockResolvedValueOnce(reading(115));

    const result = await ocr.scanReceiptWithGemini(Buffer.from('fake-image'), 'image/png');

    expect(result.engine).toBe('fallback-vision');
    expect(result.total).toBe(115);
    expect(result.merchant.name).toBe('Eating Circles');

    const [deepseek, qwen] = fetchMock.mock.calls.map(requestOf);
    expect(deepseek.url).toBe('https://api.xkiro.com/v1/chat/completions');
    expect(deepseek.body.model).toBe('deepseek/deepseek-v4.1-flash');
    expect(qwen.body.model).toBe('qwen/qwen3-vl-plus:free');
    expect(qwen.headers.Authorization).toBe('Bearer xkiro-token');
    const userContent = qwen.body.messages.find((m: { role: string }) => m.role === 'user').content;
    expect(userContent[1]).toEqual({ type: 'image_url', image_url: { url: `data:image/png;base64,${Buffer.from('fake-image').toString('base64')}` } });

    // The next scan does not pay for the unfunded model again.
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(reading(115));
    await ocr.scanReceiptWithGemini(Buffer.from('fake-image'), 'image/png');
    expect(fetchMock.mock.calls.map((c) => requestOf(c).body.model)).toEqual(['qwen/qwen3-vl-plus:free']);
  });

  it('structures the transcript with the fallback when no model reads a total from the image', async () => {
    process.env.OCR_FALLBACK_MODELS = 'qwen/qwen3-vl-plus:free';
    fetchMock.mockResolvedValueOnce(reading(null)).mockResolvedValueOnce(reading(115));

    const result = await ocr.scanReceiptWithGemini(Buffer.from('fake-image'), 'image/jpeg');

    expect(result.engine).toBe('fallback-text');
    expect(result.total).toBe(115);
    expect(result.rawText).toBe(TRANSCRIPT);
    const textRequest = requestOf(fetchMock.mock.calls[1]);
    expect(typeof textRequest.body.messages[1].content).toBe('string');
    expect(textRequest.body.messages[1].content).toContain('NET AMOUNT 115.00');
  });

  it('sends a custom server (Docker Model Runner) no xkiro token', async () => {
    process.env.OCR_FALLBACK_BASE_URL = 'http://localhost:12434/engines/v1/';
    process.env.OCR_FALLBACK_MODELS = 'hf.co/some-org/some-vision-model-gguf';
    fetchMock.mockResolvedValueOnce(reading(115));

    const result = await ocr.scanReceiptWithGemini(Buffer.from('fake-image'), 'image/png');

    expect(result.engine).toBe('fallback-vision');
    const request = requestOf(fetchMock.mock.calls[0]);
    expect(request.url).toBe('http://localhost:12434/engines/v1/chat/completions');
    expect(request.headers).not.toHaveProperty('Authorization');
    expect(request.body.model).toBe('hf.co/some-org/some-vision-model-gguf');
  });

  it('keeps every model out when the admin pinned OCR to tesseract', async () => {
    ocrProvider = 'tesseract';

    const result = await ocr.scanReceiptWithGemini(Buffer.from('fake-image'), 'image/png');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.engine).toBe('ocr-heuristic');
  });

  it('falls back to the offline parser when no fallback is configured', async () => {
    delete process.env.XKIRO_API_KEY;

    const result = await ocr.scanReceiptWithGemini(Buffer.from('fake-image'), 'image/png');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.engine).toBe('ocr-heuristic');
  });
});
