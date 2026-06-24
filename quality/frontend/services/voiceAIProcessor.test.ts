import { describe, expect, it, vi } from 'vitest';

vi.mock('./KANAKUIntelligenceEngine', () => ({
  KANAKUAI: {
    extractExpenseData: vi.fn(async () => ({
      amount: undefined,
      category: undefined,
      confidence: 0.62,
      merchant: undefined,
      date: undefined,
    })),
    learnFromFeedback: vi.fn(async () => undefined),
  },
}));

import { createVoiceAIProcessor } from './voiceAIProcessor';

describe('VoiceAIProcessor', () => {
  it('parses transcript files instead of silently returning an empty result', async () => {
    const processor = createVoiceAIProcessor('user-voice');
    const transcriptFile = new File(
      [JSON.stringify({ transcript: 'salary 50000 and taxi 200' })],
      'voice-transcript.json',
      { type: 'application/json' },
    );

    const results = await processor.processVoiceInput(transcriptFile);

    expect(results).toHaveLength(2);
    expect(results[0]?.amount).toBe(50000);
    expect(results[0]?.category).toBe('Salary');
    expect(results[1]?.amount).toBe(200);
    expect(results[1]?.category).toBe('Transportation');
  });

  it('fails clearly for unsupported offline audio blobs', async () => {
    const processor = createVoiceAIProcessor('user-voice');
    const audioFile = new File(['fake-audio'], 'note.wav', { type: 'audio/wav' });

    await expect(processor.processVoiceInput(audioFile)).rejects.toThrow('Offline audio transcription is not available yet');
  });
});

