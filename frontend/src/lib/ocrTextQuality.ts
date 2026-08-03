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

const VOWELS = /[aeiouy]/i;
/** Consonant run inside a single word. Measured per token, never across the
 *  whole string: concatenating "PVT LTD" into "PVTLTD" makes a perfectly normal
 *  company suffix look like noise. */
const CONSONANT_RUN = /[bcdfghjklmnpqrstvwxz]{5,}/i;
/**
 * Q without a following U. Essentially non-existent in English and in the
 * romanisation of Indian business names, and a reliable fingerprint of OCR
 * scrambling ("GQWRI", "SHREGQWRICKI").
 */
const ORPHAN_Q = /q(?![u])/i;

/**
 * Vowel-free words that are ordinary on a bill. Without these, every
 * "PVT LTD" and "MFG" reads as garbage.
 */
const KNOWN_ABBREVIATIONS = new Set([
  'PVT', 'LTD', 'LLP', 'INC', 'CO', 'CORP', 'MFG', 'DIST', 'MKT', 'BLDG',
  'GST', 'CGST', 'SGST', 'IGST', 'VAT', 'TIN', 'PAN', 'HSN', 'SAC',
  'NO', 'SL', 'SR', 'PH', 'MRP', 'QTY', 'AMT', 'RS', 'INR', 'KG', 'ML', 'PC', 'PCS',
]);

/** Case switches after the first character: "McDonald" has 1, noise has many. */
const caseSwitches = (token: string): number => {
  const letters = token.replace(/[^a-z]/gi, '');
  let switches = 0;
  for (let i = 2; i < letters.length; i += 1) {
    const wasUpper = letters[i - 1] === letters[i - 1].toUpperCase();
    const isUpper = letters[i] === letters[i].toUpperCase();
    if (wasUpper !== isUpper) switches += 1;
  }
  return switches;
};

/**
 * True when a string looks like OCR noise rather than language.
 *
 * Judged on letter statistics per word rather than against a blocklist, because
 * the failure is open-ended — every bad scan invents new nonsense. The rules are
 * calibrated against the real transcripts in quality/smaple_files/bills: they
 * must reject "SHREGQWRICKI" and "VRS ta tn amo" while accepting
 * "V&RO HOSPITALITY PVT LTD" and "SHRI GOWRI KRISHNAA".
 */
export const looksGarbled = (value?: string | null): boolean => {
  if (!value) return true;

  const letters = value.replace(/[^a-z]/gi, '');
  if (letters.length < 3) return true;

  const tokens = value.trim().split(/\s+/).filter((token) => /[a-z]/i.test(token));
  if (tokens.length === 0) return true;
  // A four-digit run in a "merchant name" is a pincode or a phone fragment that
  // bled in from the address block ("CHEANAT-600016"), not part of the name.
  if (/\d{4,}/.test(value)) return true;

  let vowelless = 0;
  let tiny = 0;

  for (const token of tokens) {
    const word = token.replace(/[^a-z]/gi, '');
    if (!word) continue;

    // Strong, standalone signals — one is enough.
    if (ORPHAN_Q.test(word)) return true;
    if (CONSONANT_RUN.test(word)) return true;
    // Jumbled capitalisation inside a word ("PrAVaRCy"): real names are
    // lowercase, UPPERCASE or Title Case, none of which switch repeatedly.
    if (word.length >= 5 && caseSwitches(word) >= 3) return true;

    // Weak signals — only meaningful if they dominate the string.
    // A single letter is never an abbreviation worth excusing — a string of
    // them is letter-spacing damage ("S H R I G").
    const isAbbreviation = word.length > 1
      && (KNOWN_ABBREVIATIONS.has(word.toUpperCase())
        || (word.length <= 4 && word === word.toUpperCase()));
    if (!VOWELS.test(word) && !isAbbreviation) vowelless += 1;
    if (word.length <= 2 && !isAbbreviation) tiny += 1;
  }

  // A name made mostly of vowel-free or two-letter fragments is not a name.
  if (vowelless / tokens.length >= 0.5) return true;
  if (tokens.length >= 3 && tiny / tokens.length >= 0.5) return true;

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
  if (!scan) {
    return { score: 0, reasons: ['no result'], shouldEscalate: true };
  }

  const reasons: string[] = [];
  /**
   * Faults that make a reading unfit to present on their own, whatever else
   * went right. Each has been seen producing a confident-looking but wrong
   * expense record, so they force the better engine rather than contributing
   * to a score that another good field could offset.
   */
  const disqualifying: string[] = [];
  let score = 1;

  if (!scan.amount || scan.amount <= 0) {
    score -= 0.5;
    disqualifying.push('no total');
  }

  if (!scan.merchantName || looksGarbled(scan.merchantName)) {
    // The merchant comes from the same transcript as the amounts. Garbage here
    // means the transcript is bad, which makes every number off it suspect.
    score -= 0.35;
    disqualifying.push('merchant unreadable');
  }

  if (scan.validationResult && !scan.validationResult.isValid) {
    score -= 0.3;
    disqualifying.push('totals do not reconcile');
  }

  if (!scan.items || scan.items.length === 0) {
    score -= 0.15;
    disqualifying.push('no line items');
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
    reasons: [...disqualifying, ...reasons],
    // A clean local read stays local — that is the privacy-preserving default.
    shouldEscalate: disqualifying.length > 0 || clamped < 0.7,
  };
};
