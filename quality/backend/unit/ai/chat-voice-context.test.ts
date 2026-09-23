/**
 * Chat: the voice session's context travels with a handed-over question.
 *
 * The client sends what Kai just recorded so "was that too much?" asked in chat
 * resolves against it. That text comes from the request body, so it is bounded
 * and sanitised exactly like the message itself before it reaches a prompt.
 */
jest.mock('../../../../backend/src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../../../backend/src/db/prisma', () => ({ prisma: {} }));

import { voiceContextLines } from '../../../../backend/src/features/ai/chat.controller';

describe('voiceContextLines', () => {
  it('keeps the spoken cards, newest last', () => {
    expect(voiceContextLines(['Dinner ₹4,396 (saved)', 'Petrol ₹300 (saved)'])).toEqual([
      'Dinner ₹4,396 (saved)',
      'Petrol ₹300 (saved)',
    ]);
  });

  it('ignores anything that is not a usable line', () => {
    expect(voiceContextLines(undefined)).toEqual([]);
    expect(voiceContextLines('Dinner ₹4,396')).toEqual([]);
    expect(voiceContextLines([null, 42, '   ', { summary: 'Dinner' }])).toEqual([]);
  });

  it('caps the number of lines and the length of each', () => {
    const lines = voiceContextLines(Array.from({ length: 12 }, (_, i) => `Entry ${i} ${'x'.repeat(400)}`));
    expect(lines).toHaveLength(5);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(120);
    expect(lines[0].startsWith('Entry 0')).toBe(true);
  });

  it('runs each line through the prompt sanitiser', () => {
    const [line] = voiceContextLines(['<script>alert(1)</script> Dinner ₹4,396 (saved)']);
    expect(line).not.toContain('<script>');
    expect(line).toContain('Dinner');
  });
});
