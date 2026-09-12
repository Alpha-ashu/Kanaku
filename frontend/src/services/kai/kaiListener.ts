/**
 * Continuous listening for a Kai session.
 *
 * The platform speech engines end a recognition cycle on their own (Chrome
 * after a few seconds of silence, the native engines after a pause). The
 * listener restarts a new cycle from `onEnd` for as long as the session is
 * active, so the user can keep talking across sentences and pauses and only a
 * second tap on the orb stops it.
 *
 * Final transcripts are de-duplicated with a short ring buffer because engines
 * occasionally finalise the same utterance twice (Chrome) or flush the last
 * partial as a final on stop (native).
 */
import {
  startSpeechRecognition,
  type SpeechCallbacks,
  type SpeechErrorReason,
  type SpeechSession,
} from '@/services/speechRecognitionAdapter';

export type StartRecognition = (callbacks: SpeechCallbacks, language?: string) => Promise<SpeechSession>;

export interface KaiListenerCallbacks {
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  /** true while an engine cycle is actually running */
  onEngineState: (listening: boolean) => void;
  /** the session had to end (permission denied, unsupported, repeated failures) */
  onFatal: (reason: SpeechErrorReason, message: string) => void;
}

export interface KaiListenerOptions {
  language?: string;
  restartDelayMs?: number;
  maxConsecutiveErrors?: number;
  start?: StartRecognition;
  now?: () => number;
}

/** Normalise a transcript so re-transcriptions of the same speech compare equal. */
export function fingerprint(text: string): string {
  return text
    .toLowerCase()
    .replace(/(\d),(?=\d)/g, '$1')
    .replace(/₹|\brupees?\b|\brs\.?\b|\binr\b/g, ' ')
    .replace(/[.,!?;:'"()[\]{}\-–—/\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const IDENTICAL_WINDOW_MS = 4000;
const PREFIX_WINDOW_MS = 2000;
const RING_SIZE = 6;

export class FinalDeduper {
  private ring: Array<{ fp: string; ts: number }> = [];

  /** Returns true when the text is new enough to process. */
  accept(text: string, now = Date.now()): boolean {
    const fp = fingerprint(text);
    if (!fp) return false;
    for (const entry of this.ring) {
      const age = now - entry.ts;
      if (entry.fp === fp && age < IDENTICAL_WINDOW_MS) return false;
      // A shorter re-finalisation of something we already processed.
      if (age < PREFIX_WINDOW_MS && entry.fp.startsWith(fp) && entry.fp !== fp) return false;
    }
    this.ring.push({ fp, ts: now });
    if (this.ring.length > RING_SIZE) this.ring.shift();
    return true;
  }

  reset(): void {
    this.ring = [];
  }
}

export class KaiListener {
  private active = false;
  private paused = false;
  private session: SpeechSession | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private consecutiveErrors = 0;
  private cycle = 0;
  private readonly deduper = new FinalDeduper();
  private readonly start: StartRecognition;
  private readonly language: string;
  private readonly restartDelayMs: number;
  private readonly maxConsecutiveErrors: number;
  private readonly now: () => number;

  constructor(private readonly callbacks: KaiListenerCallbacks, options: KaiListenerOptions = {}) {
    this.start = options.start ?? startSpeechRecognition;
    this.language = options.language ?? 'en-IN';
    this.restartDelayMs = options.restartDelayMs ?? 250;
    this.maxConsecutiveErrors = options.maxConsecutiveErrors ?? 5;
    this.now = options.now ?? (() => Date.now());
  }

  get isActive(): boolean {
    return this.active;
  }

  async begin(): Promise<void> {
    if (this.active) return;
    this.active = true;
    this.paused = false;
    this.consecutiveErrors = 0;
    this.deduper.reset();
    await this.startCycle();
  }

  async end(): Promise<void> {
    this.active = false;
    this.clearRestart();
    const session = this.session;
    this.session = null;
    if (session) await session.stop().catch(() => undefined);
    this.callbacks.onEngineState(false);
  }

  /** Temporarily stop the engine (e.g. while Kai speaks) without ending the session. */
  async pause(): Promise<void> {
    if (!this.active || this.paused) return;
    this.paused = true;
    this.clearRestart();
    const session = this.session;
    this.session = null;
    if (session) await session.stop().catch(() => undefined);
  }

  async resume(): Promise<void> {
    if (!this.active || !this.paused) return;
    this.paused = false;
    await this.startCycle();
  }

  private clearRestart(): void {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
  }

  private scheduleRestart(): void {
    if (!this.active || this.paused || this.restartTimer) return;
    const backoff = Math.min(3000, this.restartDelayMs * (1 + this.consecutiveErrors * 2));
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      void this.startCycle();
    }, backoff);
  }

  private async startCycle(): Promise<void> {
    if (!this.active || this.paused || this.session) return;
    const cycle = ++this.cycle;
    let sawSpeech = false;

    const session = await this.start({
      onPartial: (text) => {
        if (cycle !== this.cycle) return;
        sawSpeech = true;
        this.consecutiveErrors = 0;
        this.callbacks.onPartial(text);
      },
      onFinal: (text) => {
        if (cycle !== this.cycle) return;
        sawSpeech = true;
        this.consecutiveErrors = 0;
        if (this.deduper.accept(text, this.now())) this.callbacks.onFinal(text);
      },
      onEnd: () => {
        if (cycle !== this.cycle) return;
        this.session = null;
        this.callbacks.onEngineState(false);
        if (!sawSpeech) this.consecutiveErrors += 1;
        if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
          this.active = false;
          this.callbacks.onFatal('unknown', "I couldn't hear anything — tap the orb to try again.");
          return;
        }
        this.scheduleRestart();
      },
      onError: (reason, message) => {
        if (cycle !== this.cycle) return;
        if (reason === 'denied' || reason === 'not-supported') {
          this.active = false;
          this.clearRestart();
          this.callbacks.onFatal(reason, message);
          return;
        }
        // no-speech / network / unknown: the adapter fires onEnd next, which restarts with backoff.
        if (reason !== 'no-speech') this.consecutiveErrors += 1;
      },
    }, this.language);

    if (cycle !== this.cycle || !this.active || this.paused) {
      await session.stop().catch(() => undefined);
      return;
    }
    this.session = session;
    this.callbacks.onEngineState(true);
  }
}
