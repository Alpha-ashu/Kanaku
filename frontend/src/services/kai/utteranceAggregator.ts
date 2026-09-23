/**
 * Speech chunks → one spoken request.
 *
 * The speech engines finalise on silence, so one request reaches us in pieces:
 *
 *   "We spent 4,396 rupees on dinner" / "G Joe" / "Arun" / "Amala" / "Preeti"
 *
 * Each piece used to be understood and saved on its own, turning one dinner
 * into eight records. A pause in speech is not the end of a request, so pieces
 * are buffered here and only released when the sentence looks finished AND the
 * speaker has been quiet for `pauseMs`. A sentence still hanging ("…dinner
 * with") is given the longer `continuationMs` instead, and nothing is ever held
 * past `maxHoldMs`.
 *
 * This layer decides only WHERE one request ends. What the request means — one
 * expense or two, who the participants are — stays with the model.
 */

/** Trailing word that promises more speech: "dinner with", "4,396 and". */
const DANGLING_TAIL = /(?:\b(?:and|or|plus|with|for|to|from|by|of|on|at|in|about|into|toward|towards|between|aur|ke|ko|se)\b|[,&])\s*$/i;

/** Spending/earning verbs, including the common Hinglish ones. */
const MONEY_VERB = /\b(?:spent|spend|spending|paid|pay|paying|bought|buy|cost|costs|borrow|borrowed|lent|lend|gave|give|sent|send|receiv(?:e|ed)|earn|earned|got|split|share[ds]?|sav(?:e|ed|ing)|invest|invested|transfer|transferred|withdrew|withdraw|deposit|deposited|budget|remind|add|create|set|kharch|diya|liya|bhej)\b/i;

/** Any number, or an Indian magnitude word that implies one. */
const HAS_AMOUNT = /\d|\b(?:lakh|lakhs|crore|crores|thousand|hundred|hazaar|hazar|k)\b/i;

/** What the money was for: "on dinner", "for petrol", "to Arun", "with Amala". */
const HAS_OBJECT = /\b(?:on|for|to|from|with|at|in|toward|towards|per|ko|se|ke\s+liye)\b/i;

/** A piece that opens mid-sentence: it continues the words before it. */
const CONTINUES_CLAUSE = /^(?:and|aur|or|plus|also|with|on|for|to|from|at|in|toward|towards|ko|se)\b/i;

/** Answers that must not wait for the continuation window — they finish a turn. */
const SHORT_ANSWER = /^(?:yes|yeah|yep|yup|ya|correct|right|confirm(?:ed)?|save(?: it)?|ok(?:ay)?|sure|haan|ha|theek hai|no|nope|nah|cancel|discard|stop|wrong|nahi|nahin)\b[\s.!]*$/i;

export interface AggregatorOptions {
  /** Quiet time after a finished-looking sentence before it is processed. */
  pauseMs?: number;
  /** Quiet time allowed while the sentence is still hanging or is a bare fragment. */
  continuationMs?: number;
  /** Nothing is buffered longer than this, however the speaker pauses. */
  maxHoldMs?: number;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (handle: ReturnType<typeof setTimeout>) => void;
}

export const DEFAULT_AGGREGATOR_OPTIONS = {
  pauseMs: 1400,
  continuationMs: 3500,
  maxHoldMs: 15000,
} as const;

/** The sentence ends on a word that promises more. */
export const isDangling = (text: string): boolean => DANGLING_TAIL.test(text.trim());

/**
 * A piece that cannot stand as a request on its own: a name, a list of names,
 * a bare amount. These are the pieces that used to become their own expenses.
 */
export const isFragment = (text: string): boolean => {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (SHORT_ANSWER.test(trimmed)) return false;
  if (/[?]/.test(trimmed)) return false;
  if (MONEY_VERB.test(trimmed)) return false;
  // "and Sandeep", "with Preeti" — continuations of the list before them.
  if (/^(?:and|aur|with|plus|also|,)\b/i.test(trimmed)) return true;
  const words = trimmed.split(/\s+/);
  if (HAS_AMOUNT.test(trimmed)) return words.length <= 4;
  // A short phrase with no verb and no amount is a name or a noun, not a request.
  return words.length <= 6;
};

/**
 * An amount that has not been spent on anything yet — "I spent 4,396 rupees".
 * Recording it the moment the speaker draws breath is how "…on dinner with
 * Arun and Amala" became a second entry, so it waits for the longer window.
 */
const awaitsObject = (text: string): boolean =>
  MONEY_VERB.test(text) && HAS_AMOUNT.test(text) && !HAS_OBJECT.test(text) && !/[?]/.test(text);

/** Ready to be understood: says something, and does not trail off. */
export const looksComplete = (text: string): boolean => {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (SHORT_ANSWER.test(trimmed)) return true;
  return !isDangling(trimmed) && !isFragment(trimmed) && !awaitsObject(trimmed);
};

/** Join a new piece to the buffer, keeping name lists readable for the model. */
export const joinChunks = (buffered: string, next: string): string => {
  const left = buffered.trim();
  const right = next.trim();
  if (!left) return right;
  if (!right) return left;
  if (/[.?!,]$/.test(left)) return `${left} ${right}`;
  // A piece that opens with a connector continues the clause: "I spent 4,396"
  // + "on dinner" must not gain a comma.
  if (CONTINUES_CLAUSE.test(right)) return `${left} ${right}`;
  // "…on dinner" + "Arun" reads as one list once comma-joined; without the
  // comma the model sees "dinner Arun" and can fold the name into the description.
  if (isFragment(right)) return `${left}, ${right}`;
  return `${left} ${right}`;
};

/**
 * Buffers final speech chunks and emits whole requests.
 *
 * `push` is called for every final the engine produces; `onUtterance` fires
 * once the buffer looks like a finished request and the speaker has paused.
 */
export class UtteranceAggregator {
  private buffer = '';
  private firstPushAt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly pauseMs: number;
  private readonly continuationMs: number;
  private readonly maxHoldMs: number;
  private readonly now: () => number;
  private readonly setTimer: NonNullable<AggregatorOptions['setTimer']>;
  private readonly clearTimer: NonNullable<AggregatorOptions['clearTimer']>;

  constructor(
    private readonly onUtterance: (text: string) => void,
    options: AggregatorOptions = {},
  ) {
    this.pauseMs = options.pauseMs ?? DEFAULT_AGGREGATOR_OPTIONS.pauseMs;
    this.continuationMs = options.continuationMs ?? DEFAULT_AGGREGATOR_OPTIONS.continuationMs;
    this.maxHoldMs = options.maxHoldMs ?? DEFAULT_AGGREGATOR_OPTIONS.maxHoldMs;
    this.now = options.now ?? (() => Date.now());
    this.setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle));
  }

  /** What is waiting to be understood — shown under the live transcript. */
  get buffered(): string {
    return this.buffer;
  }

  push(text: string): void {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (!this.buffer) this.firstPushAt = this.now();
    this.buffer = joinChunks(this.buffer, trimmed);
    this.schedule();
  }

  /** Release whatever is buffered now: the orb was tapped, or text was typed. */
  flush(): void {
    this.cancelTimer();
    const text = this.buffer.trim();
    this.buffer = '';
    this.firstPushAt = 0;
    if (text) this.onUtterance(text);
  }

  /** Drop the buffer without emitting (session cleared, account switched). */
  reset(): void {
    this.cancelTimer();
    this.buffer = '';
    this.firstPushAt = 0;
  }

  private schedule(): void {
    this.cancelTimer();
    const wait = looksComplete(this.buffer) ? this.pauseMs : this.continuationMs;
    const heldFor = this.now() - this.firstPushAt;
    const remainingHold = Math.max(0, this.maxHoldMs - heldFor);
    this.timer = this.setTimer(() => {
      this.timer = null;
      this.flush();
    }, Math.min(wait, remainingHold));
  }

  private cancelTimer(): void {
    if (this.timer !== null) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
  }
}
