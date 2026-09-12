import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FinalDeduper, KaiListener, fingerprint, type StartRecognition } from '@/services/kai/kaiListener';
import type { SpeechCallbacks } from '@/services/speechRecognitionAdapter';

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' } }));
vi.mock('@capacitor-community/speech-recognition', () => ({ SpeechRecognition: {} }));

describe('fingerprint', () => {
  it('ignores casing, punctuation and currency words', () => {
    expect(fingerprint('I spent 2,000 rupees on petrol.')).toBe(fingerprint('i spent 2000 Rs on petrol'));
    expect(fingerprint('₹500 chai')).toBe('500 chai');
  });
});

describe('FinalDeduper', () => {
  it('drops an identical final within 4 s and accepts it later', () => {
    const d = new FinalDeduper();
    expect(d.accept('spent 2000 on petrol', 1000)).toBe(true);
    expect(d.accept('Spent 2,000 on petrol.', 2500)).toBe(false);
    expect(d.accept('spent 2000 on petrol', 6000)).toBe(true);
  });

  it('drops a shorter re-finalisation of a just-processed utterance', () => {
    const d = new FinalDeduper();
    expect(d.accept('dinner with Arun and Jijo for 4000', 1000)).toBe(true);
    expect(d.accept('dinner with Arun and Jijo', 1500)).toBe(false);
    expect(d.accept('dinner with Arun and Jijo', 4000)).toBe(true);
  });

  it('accepts genuinely different sentences back to back', () => {
    const d = new FinalDeduper();
    expect(d.accept('spent 2000 on petrol', 1000)).toBe(true);
    expect(d.accept('borrowed 3000 from Arun', 1100)).toBe(true);
    expect(d.accept('spent 2000 on petrol again', 1200)).toBe(true);
  });
});

describe('KaiListener', () => {
  const cycles: Array<{ callbacks: SpeechCallbacks; stop: ReturnType<typeof vi.fn> }> = [];
  const start: StartRecognition = vi.fn(async (callbacks) => {
    const stop = vi.fn(async () => { callbacks.onEnd(); });
    cycles.push({ callbacks, stop });
    return { stop };
  });
  const callbacks = {
    onPartial: vi.fn(),
    onFinal: vi.fn(),
    onEngineState: vi.fn(),
    onFatal: vi.fn(),
  };
  let now = 1000;

  beforeEach(() => {
    vi.useFakeTimers();
    cycles.length = 0;
    now = 1000;
    Object.values(callbacks).forEach((fn) => fn.mockClear());
    (start as ReturnType<typeof vi.fn>).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const make = () => new KaiListener(callbacks, { start, restartDelayMs: 250, now: () => now });

  it('restarts a new engine cycle when the previous one ends, until ended', async () => {
    const listener = make();
    await listener.begin();
    expect(start).toHaveBeenCalledTimes(1);
    expect(callbacks.onEngineState).toHaveBeenLastCalledWith(true);

    cycles[0].callbacks.onFinal('spent 2000 on petrol');
    cycles[0].callbacks.onEnd();
    expect(callbacks.onEngineState).toHaveBeenLastCalledWith(false);

    await vi.advanceTimersByTimeAsync(300);
    expect(start).toHaveBeenCalledTimes(2);
    expect(listener.isActive).toBe(true);

    await listener.end();
    cycles[1].callbacks.onEnd();
    await vi.advanceTimersByTimeAsync(1000);
    expect(start).toHaveBeenCalledTimes(2);
    expect(listener.isActive).toBe(false);
  });

  it('forwards each final once even when the engine repeats it', async () => {
    const listener = make();
    await listener.begin();
    cycles[0].callbacks.onFinal('spent 2000 on petrol');
    now += 500;
    cycles[0].callbacks.onFinal('spent 2000 on petrol');
    cycles[0].callbacks.onEnd();
    await vi.advanceTimersByTimeAsync(300);
    now += 100;
    cycles[1].callbacks.onFinal('Spent 2,000 on petrol.');
    expect(callbacks.onFinal).toHaveBeenCalledTimes(1);
    await listener.end();
  });

  it('ends the session on a permission denial and does not restart', async () => {
    const listener = make();
    await listener.begin();
    cycles[0].callbacks.onError('denied', 'Microphone access denied.');
    cycles[0].callbacks.onEnd();
    await vi.advanceTimersByTimeAsync(1000);
    expect(callbacks.onFatal).toHaveBeenCalledWith('denied', 'Microphone access denied.');
    expect(start).toHaveBeenCalledTimes(1);
    expect(listener.isActive).toBe(false);
  });

  it('gives up after repeated silent cycles', async () => {
    const listener = new KaiListener(callbacks, { start, restartDelayMs: 10, maxConsecutiveErrors: 3, now: () => now });
    await listener.begin();
    for (let i = 0; i < 3; i += 1) {
      cycles[i].callbacks.onEnd();
      await vi.advanceTimersByTimeAsync(200);
    }
    expect(callbacks.onFatal).toHaveBeenCalledTimes(1);
    expect(listener.isActive).toBe(false);
  });

  it('pauses and resumes around spoken output without ending the session', async () => {
    const listener = make();
    await listener.begin();
    await listener.pause();
    expect(cycles[0].stop).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(start).toHaveBeenCalledTimes(1);
    await listener.resume();
    expect(start).toHaveBeenCalledTimes(2);
    expect(listener.isActive).toBe(true);
    await listener.end();
  });
});
