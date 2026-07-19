/**
 * Speech-to-Text providers for POST /voice/process-audio.
 *
 * Provider chain (config-driven via aiConfig voice.provider, then fallback):
 *   gemini  — Gemini multimodal transcription (GOOGLE_API_KEY)
 *   whisper — OpenAI Whisper REST API (OPENAI_API_KEY); called directly with
 *             fetch + FormData so no SDK dependency or temp files are needed
 *   webkit  — server declines and the client uses the browser Web Speech API
 *
 * Every provider failure is non-fatal: the caller falls through to the next
 * provider and finally to the Web Speech fallback flag.
 */
import { logger } from '../../config/logger';

export interface SttResult {
  transcript: string;
  provider: 'gemini' | 'whisper';
  /** BCP-47-ish language hint when the provider reports one */
  language?: string;
}

const MAX_AUDIO_BYTES = Number(process.env.VOICE_AUDIO_MAX_BYTES || 15 * 1024 * 1024);

const ALLOWED_AUDIO_MIME = new Set([
  'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp3', 'audio/mp4',
  'audio/wav', 'audio/x-wav', 'audio/flac', 'audio/aac', 'audio/m4a', 'audio/x-m4a',
]);

export const validateAudioUpload = (file: { buffer: Buffer; mimetype?: string; size?: number }): string | null => {
  const size = file.size ?? file.buffer.length;
  if (size > MAX_AUDIO_BYTES) {
    return `Audio exceeds ${Math.round(MAX_AUDIO_BYTES / (1024 * 1024))}MB limit`;
  }
  const mime = (file.mimetype || '').split(';')[0].trim().toLowerCase();
  if (mime && !ALLOWED_AUDIO_MIME.has(mime)) {
    return `Unsupported audio type '${mime}'. Supported: webm, ogg, mp3, mp4, wav, flac, aac, m4a`;
  }
  return null;
};

export const transcribeWithGemini = async (
  buffer: Buffer,
  mimeType: string,
  modelName: string,
): Promise<SttResult> => {
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
  const model = genAI.getGenerativeModel({ model: modelName });

  const result = await model.generateContent([
    {
      inlineData: {
        data: buffer.toString('base64'),
        mimeType: mimeType || 'audio/webm',
      },
    },
    'Transcribe this audio verbatim in its original language. Return ONLY the transcription text — no commentary, no translation, no quotes.',
  ]);

  const transcript = result.response.text().trim();
  if (!transcript) throw new Error('Gemini returned an empty transcription');
  return { transcript, provider: 'gemini' };
};

/**
 * OpenAI Whisper via the plain REST API. Uses the Node 18+ global FormData/Blob
 * so no `openai` SDK or temp files are required.
 */
export const transcribeWithWhisper = async (
  buffer: Buffer,
  mimeType: string,
  originalName?: string,
): Promise<SttResult> => {
  const apiKey = process.env.OPENAI_API_KEY!;
  const model = process.env.OPENAI_STT_MODEL || 'whisper-1';

  const form = new FormData();
  const ext = (originalName?.split('.').pop() || mimeType.split('/')[1] || 'webm').replace(/[^a-z0-9]/gi, '') || 'webm';
  form.append('file', new Blob([new Uint8Array(buffer)], { type: mimeType || 'audio/webm' }), `voice.${ext}`);
  form.append('model', model);
  form.append('response_format', 'verbose_json');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Whisper API error ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as { text?: string; language?: string };
  const transcript = (data.text || '').trim();
  if (!transcript) throw new Error('Whisper returned an empty transcription');
  return { transcript, provider: 'whisper', language: data.language };
};

/**
 * Run the configured STT provider first, then the other as fallback.
 * Returns null when no provider is configured/available — the caller then
 * instructs the client to use the browser Web Speech API.
 */
export const transcribeAudio = async (
  file: { buffer: Buffer; mimetype?: string; originalname?: string },
  preferredProvider: string,
  geminiModel: string,
): Promise<SttResult | null> => {
  type Provider = { name: 'gemini' | 'whisper'; available: boolean; run: () => Promise<SttResult> };
  const gemini: Provider = {
    name: 'gemini',
    available: Boolean(process.env.GOOGLE_API_KEY),
    run: () => transcribeWithGemini(file.buffer, file.mimetype || 'audio/webm', geminiModel),
  };
  const whisper: Provider = {
    name: 'whisper',
    available: Boolean(process.env.OPENAI_API_KEY),
    run: () => transcribeWithWhisper(file.buffer, file.mimetype || 'audio/webm', file.originalname),
  };

  const order = preferredProvider === 'whisper' ? [whisper, gemini] : [gemini, whisper];

  for (const provider of order) {
    if (!provider.available) continue;
    try {
      const result = await provider.run();
      logger.info(`Voice STT: transcribed via ${provider.name}`, {
        chars: result.transcript.length,
        language: result.language,
      });
      return result;
    } catch (err: any) {
      logger.warn(`Voice STT: ${provider.name} failed, trying next`, { error: err.message });
    }
  }
  return null;
};
