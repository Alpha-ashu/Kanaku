/**
 * Deciding whether an OCR reading is trustworthy enough to show the user.
 *
 * On-device OCR of a thermal receipt does not fail cleanly — it succeeds at
 * producing *something*. "SHRI GOWRI KRISHNAA" comes back as "SHRLEGQWRIKRISHNAA",
 * and a total that could not be read gets quietly replaced by the sum of the
 * parts. Both look like data. Neither is.
 *
 * So "did we get a value" is the wrong question, and using it as a fallback
 * gate means the better engine never runs. These helpers answer the question
 * that actually matters: is this reading good enough to keep?
 */

const VOWELS = /[aeiou]/gi;
const CONSONANT_RUN = /[bcdfghjklmnpqrstvwxz]{5,}/i;
/**
 * Q without a following U. Essentially non-existent in English and in the
 * romanisation of Indian business names, and a reliable fingerprint of OCR
 * scrambling ("GQWRI", "SHREGQWRICKI").
 */
const ORPHAN_Q = /q(?![u])/i;

/**
 * True when a string looks like OCR noise rather than language.
 *
 * Judged on letter statistics rather than a blocklist, because the failure is
 * open-ended: every bad scan invents new nonsense.
 */
export const looksGarbled = (value?: string | null): boolean => {
  if (!value) return true;

  const letters = value.replace(/[^a-z]/gi, '');
  if (letters.length < 3) return true;

  // A word with no vowels at all, or almost none, is not a name.
  const vowelCount = (letters.match(VOWELS) || []).length;
  if (vowelCount / letters.length < 0.15) return true;

  if (ORPHAN_Q.test(letters)) return true;
  if (CONSONANT_RUN.test(letters)) return true;

  // A run of single characters separated by spaces ("S H R I G") is a
  // letter-spacing artefact, not a word.
  const tokens = value.trim().split(/\s+/);
  const singles = tokens.filter((token) => token.replace(/[^a-z]/gi, '').length === 1).length;
  if (tokens.length >= 4 && singles / tokens.length > 0.5) return true;

  return false;
};

export interface ScanQuality {
  /** 0-1. How much of the reading we believe. */
  score: number;
  /** Why it scored what it did — surfaced in logs, not to the user. */
  reasons: string[];
  /** True when a better engine should be tried before showing this. */
  shouldEscalate: boolean;
}

interface AssessableScan {
  amount?: number;
  merchantName?: string;
  subtotal?: number;
  taxAmount?: number;
  items?: Array<{ name: string; amount: number }>;
  confidence?: number;
  validationResult?: { isValid: boolean; calculated: number; detected: number };
  date?: Date;
}

/**
 * Judge an on-device reading, and decide whether it is worth asking the cloud.
 *
 * The escalation rules exist because each of these has been observed producing
 * a confident-looking but wrong expense record:
 *   - no total at all — nothing to save;
 *   - a garbled merchant means the OCR text itself is unreliable, so the
 *     numbers read from the same text are suspect too;
 *   - a total that does not reconcile with the parts;
 *   - no line items on a bill that clearly had them.
 */
export const assessScanQuality = (scan: AssessableScan | null | undefined): ScanQuality => {
  const reasons: string[] = [];
  if (!scan) {
    return { score: 0, reasons: ['no result'], shouldEscalate: true };
  }

  let score = 1;

  if (!scan.amount || scan.amount <= 0) {
    score -= 0.5;
    reasons.push('no total');
  }

  if (!scan.merchantName || looksGarbled(scan.merchantName)) {
    // The merchant comes from the same transcript as the amounts. Garbage here
    // means the transcript is bad, which makes every number off it suspect.
    score -= 0.35;
    reasons.push('merchant unreadable');
  }

  if (scan.validationResult && !scan.validationResult.isValid) {
    score -= 0.3;
    reasons.push('totals do not reconcile');
  }

  if (!scan.items || scan.items.length === 0) {
    score -= 0.15;
    reasons.push('no line items');
  }

  if (scan.items?.some((item) => looksGarbled(item.name))) {
    score -= 0.15;
    reasons.push('item names unreadable');
  }

  if (!scan.date) {
    score -= 0.05;
    reasons.push('no date');
  }

  if (typeof scan.confidence === 'number' && scan.confidence < 0.5) {
    score -= 0.1;
    reasons.push('low engine confidence');
  }

  const clamped = Math.max(0, Math.min(1, Number(score.toFixed(2))));
  return {
    score: clamped,
    reasons,
    // 0.7 keeps a clean local read local (the privacy-preserving default) while
    // sending anything visibly degraded to the engine that can read it.
    shouldEscalate: clamped < 0.7,
  };
};
