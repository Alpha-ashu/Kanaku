/**
 * How much to trust a receipt scan, as a tier rather than a raw number.
 *
 * Kept as a pure module so the thresholds are testable without mounting a
 * component — the app's test suite is logic-only and has no React testing library.
 *
 * The UI previously split confidence in two at 0.8, which meant a 79% scan and a
 * 25% scan produced the same mild "please review" note. Those warrant different
 * responses: the first is probably right and worth a glance, the second is probably
 * wrong and should stop the user before they save it. A silently mis-read total is
 * the expensive failure for an expense tracker — it is accepted without question
 * and only surfaces later as a balance that has drifted.
 */

export type ReceiptConfidenceTier = 'high' | 'medium' | 'low';

/** Below this, the scan is treated as unreliable and needs manual verification. */
export const LOW_CONFIDENCE_THRESHOLD = 0.6;
/** At or above this, the scan is trusted enough to save without field-by-field review. */
export const HIGH_CONFIDENCE_THRESHOLD = 0.8;

/**
 * Maps a 0-1 confidence to its tier. A missing or non-finite score is treated as
 * `low`: an unknown reading is not a good one, and defaulting to optimism here
 * would hide exactly the scans that most need checking.
 */
export const resolveConfidenceTier = (confidence?: number): ReceiptConfidenceTier => {
  if (typeof confidence !== 'number' || !Number.isFinite(confidence)) return 'low';
  if (confidence >= HIGH_CONFIDENCE_THRESHOLD) return 'high';
  if (confidence >= LOW_CONFIDENCE_THRESHOLD) return 'medium';
  return 'low';
};

export const CONFIDENCE_TITLES: Record<ReceiptConfidenceTier, string> = {
  high: 'High confidence scan',
  medium: 'Please review the extracted data',
  low: 'Manual verification needed',
};

export const describeConfidence = (
  tier: ReceiptConfidenceTier,
  confidence?: number,
): string => {
  const pct = typeof confidence === 'number' && Number.isFinite(confidence)
    ? `${(confidence * 100).toFixed(0)}%`
    : 'unknown';

  return tier === 'low'
    ? `Confidence: ${pct} - this scan is unreliable. Check every field against the receipt before saving.`
    : `Confidence: ${pct} - edit any field if needed`;
};
