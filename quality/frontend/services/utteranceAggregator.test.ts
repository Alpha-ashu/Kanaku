/**
 * Speech chunks → one request.
 *
 * The bug this covers: "We spent 4,396 rupees on dinner" followed by each
 * participant's name arrived as eight engine finals and became eight expenses.
 * A pause is not the end of a request, so the aggregator holds chunks until the
 * sentence is finished and the speaker has stopped.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
  UtteranceAggregator,
  isDangling,
  isFragment,
  joinChunks,
  looksComplete,
} from '@/services/kai/utteranceAggregator';

const OPTIONS = { pauseMs: 1000, continuationMs: 3000, maxHoldMs: 10_000 };

describe('completeness heuristics', () => {
  it('treats names, bare amounts and list continuations as fragments', () => {
    for (const fragment of ['G Joe', 'Arun', 'Amala, Preeti', 'and Sandeep', '4,396 rupees', 'with Preeti']) {
      expect(isFragment(fragment), fragment).toBe(true);
      expect(looksComplete(fragment), fragment).toBe(false);
    }
  });

  it('treats a spoken request as complete', () => {
    for (const request of [
      'We spent 4,396 rupees on dinner',
      'I spent 2,000 on dinner with Arun, Amala, Preeti and Rajesh',
      'I spent 2000 on dinner and 500 on coffee',
      'How much did I spend last month?',
    ]) {
      expect(looksComplete(request), request).toBe(true);
    }
  });

  it('keeps waiting while the sentence trails off', () => {
    expect(isDangling('I spent 4,396 rupees on dinner with')).toBe(true);
    expect(isDangling('dinner with Arun and')).toBe(true);
    expect(looksComplete('I spent 4,396 rupees on dinner with')).toBe(false);
    expect(isDangling('I spent 4,396 rupees on dinner')).toBe(false);
  });

  it('answers finish a turn rather than waiting for more', () => {
    for (const answer of ['yes', 'Yes.', 'no', 'cancel', 'haan']) {
      expect(looksComplete(answer), answer).toBe(true);
    }
  });

  it('comma-joins names so they cannot be read as part of the description', () => {
    expect(joinChunks('We spent 4396 on dinner', 'G Joe')).toBe('We spent 4396 on dinner, G Joe');
    expect(joinChunks('We spent 4396 on dinner, G Joe', 'and Sandeep')).toBe('We spent 4396 on dinner, G Joe and Sandeep');
    expect(joinChunks('I paid for dinner.', 'Arun came too')).toBe('I paid for dinner. Arun came too');
  });
});

describe('UtteranceAggregator', () => {
  let emitted: string[];
  let aggregator: UtteranceAggregator;

  beforeEach(() => {
    vi.useFakeTimers();
    emitted = [];
    aggregator = new UtteranceAggregator((text) => emitted.push(text), OPTIONS);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('Test 2 — a request plus a list of names is one utterance', () => {
    aggregator.push('We spent 4,396 rupees on dinner');
    for (const name of ['G Joe', 'Arun', 'Amala', 'Preeti', 'Prijit', 'Rajesh', 'and Sandeep']) {
      vi.advanceTimersByTime(700);
      aggregator.push(name);
    }
    expect(emitted).toEqual([]);

    vi.advanceTimersByTime(OPTIONS.pauseMs);
    expect(emitted).toEqual([
      'We spent 4,396 rupees on dinner, G Joe, Arun, Amala, Preeti, Prijit, Rajesh and Sandeep',
    ]);
  });

  it('Test 1 — a pause inside one sentence does not split it', () => {
    aggregator.push('I spent 4,396 rupees');
    // Held past the ordinary pause because the sentence is not a request yet.
    vi.advanceTimersByTime(OPTIONS.pauseMs + 500);
    expect(emitted).toEqual([]);

    aggregator.push('on dinner with Arun and Amala');
    vi.advanceTimersByTime(OPTIONS.pauseMs);
    expect(emitted).toEqual(['I spent 4,396 rupees on dinner with Arun and Amala']);
  });

  it('Test 10 — a finished sentence is released after the ordinary pause', () => {
    aggregator.push('I spent 2,000 on dinner and 500 on coffee');
    vi.advanceTimersByTime(OPTIONS.pauseMs - 1);
    expect(emitted).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(emitted).toEqual(['I spent 2,000 on dinner and 500 on coffee']);
  });

  it('never holds speech past maxHoldMs, even while it still trails off', () => {
    aggregator.push('I spent 4,396 rupees');
    // Keeps trailing off, so the pause window never fires — the cap must.
    for (let i = 0; i < 8; i += 1) {
      vi.advanceTimersByTime(900);
      aggregator.push('and');
      expect(emitted).toEqual([]);
    }
    vi.advanceTimersByTime(OPTIONS.maxHoldMs);
    expect(emitted).toHaveLength(1);
    expect(emitted[0].startsWith('I spent 4,396 rupees and')).toBe(true);
  });

  it('flush releases what is buffered and empties it; reset drops it', () => {
    aggregator.push('I spent 250 on lunch');
    aggregator.flush();
    expect(emitted).toEqual(['I spent 250 on lunch']);
    expect(aggregator.buffered).toBe('');

    aggregator.push('Arun');
    aggregator.reset();
    vi.advanceTimersByTime(OPTIONS.maxHoldMs);
    expect(emitted).toHaveLength(1);
    expect(aggregator.buffered).toBe('');
  });
});
