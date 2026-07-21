/**
 * Unit tests for the PaddleOCR client + unified raw-text extraction.
 * No Python/Paddle needed — the HTTP call is mocked and Tesseract is stubbed —
 * so this verifies the contract: prefer Paddle, fall back to Tesseract, never
 * hard-fail an engine outage.
 */
jest.mock('tesseract.js', () => {
  const recognize = jest.fn().mockResolvedValue({ data: { text: 'TESSERACT FALLBACK TEXT' } });
  return { __esModule: true, default: { recognize }, recognize };
});

import {
  isPaddleConfigured,
  extractTextWithPaddle,
  extractRawText,
} from '../../../../backend/src/utils/paddleOcr';

describe('PaddleOCR client + raw-text fallback', () => {
  const ORIGINAL_ENDPOINT = process.env.PADDLE_OCR_ENDPOINT;
  const ORIGINAL_FETCH = global.fetch;

  afterEach(() => {
    process.env.PADDLE_OCR_ENDPOINT = ORIGINAL_ENDPOINT;
    global.fetch = ORIGINAL_FETCH;
    jest.clearAllMocks();
  });

  it('isPaddleConfigured reflects PADDLE_OCR_ENDPOINT', () => {
    process.env.PADDLE_OCR_ENDPOINT = '';
    expect(isPaddleConfigured()).toBe(false);
    process.env.PADDLE_OCR_ENDPOINT = 'http://127.0.0.1:8001';
    expect(isPaddleConfigured()).toBe(true);
  });

  it('POSTs the image to /ocr and returns text + confidence', async () => {
    process.env.PADDLE_OCR_ENDPOINT = 'http://svc:8001/';
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: 'MERCHANT\nTotal  100', avgConfidence: 0.97 }),
    });
    (global as any).fetch = fetchMock;

    const res = await extractTextWithPaddle(Buffer.from('img'), 'image/png');
    expect(res.text).toContain('Total  100');
    expect(res.confidence).toBe(0.97);
    // trailing slash on the endpoint is normalised
    expect(fetchMock).toHaveBeenCalledWith('http://svc:8001/ocr', expect.objectContaining({ method: 'POST' }));
  });

  it('throws on a non-ok response and on empty text', async () => {
    process.env.PADDLE_OCR_ENDPOINT = 'http://svc:8001';
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' });
    await expect(extractTextWithPaddle(Buffer.from('x'))).rejects.toThrow(/500/);

    (global as any).fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ text: '   ' }) });
    await expect(extractTextWithPaddle(Buffer.from('x'))).rejects.toThrow(/empty/i);
  });

  it('extractRawText prefers PaddleOCR when configured', async () => {
    process.env.PADDLE_OCR_ENDPOINT = 'http://svc:8001';
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: 'PADDLE ROWS', avgConfidence: 0.9 }),
    });
    const res = await extractRawText(Buffer.from('x'));
    expect(res.engine).toBe('paddleocr');
    expect(res.text).toBe('PADDLE ROWS');
  });

  it('falls back to Tesseract when the Paddle service errors', async () => {
    process.env.PADDLE_OCR_ENDPOINT = 'http://svc:8001';
    (global as any).fetch = jest.fn().mockRejectedValue(new Error('connection refused'));
    const res = await extractRawText(Buffer.from('x'));
    expect(res.engine).toBe('tesseract');
    expect(res.text).toBe('TESSERACT FALLBACK TEXT');
  });

  it('uses Tesseract directly when Paddle is unconfigured', async () => {
    process.env.PADDLE_OCR_ENDPOINT = '';
    const res = await extractRawText(Buffer.from('x'));
    expect(res.engine).toBe('tesseract');
  });
});
