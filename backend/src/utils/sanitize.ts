/**
 * Input sanitisation utilities.
 * Covers XSS prevention, AI/OCR prompt-injection detection,
 * and LLM output validation for fintech-grade safety.
 */

const HTML_TAG_REGEX = /<[^>]*>/g;
const SCRIPT_CONTENT_REGEX = /<script[\s\S]*?<\/script>/gi;
const EVENT_HANDLER_RE = /\bon\w+\s*=\s*["'][^"']*["']/gi;
const DATA_URI_RE = /data:[^,]*;base64,[\w+/=]+/gi;

/** Max characters we ever feed into an LLM prompt. */
export const MAX_AI_INPUT_LENGTH = 10_000;

/** Max characters accepted from an LLM response before truncation. */
export const MAX_AI_OUTPUT_LENGTH = 20_000;

/**
 * Common prompt-injection markers that should never appear in genuine
 * receipt / financial text.
 */
const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+(instructions?|prompts?)/i,
  /you\s+are\s+now\s+(a\s+)?/i,
  /system\s*:\s*/i,
  /\[INST\]/i,
  /<<SYS>>/i,
  /\bdo\s+not\s+follow\s+.*?instructions/i,
  /override\s+(the\s+)?(system|instructions)/i,
  /disregard\s+(all\s+)?(previous|above)/i,
  /new\s+instructions?\s*:/i,
  /pretend\s+you\s+are/i,
  /act\s+as\s+(if\s+you\s+are|a)\s+/i,
  /forget\s+(everything|all|your)\s+/i,
];

//  Core XSS sanitizer (existing) 

/**
 * Strip all HTML tags from a string to prevent stored/reflected XSS.
 */
export function sanitize(input: string): string {
  if (typeof input !== 'string') return input;
  return input
    .replace(SCRIPT_CONTENT_REGEX, '')
    .replace(EVENT_HANDLER_RE, '')
    .replace(DATA_URI_RE, '')
    .replace(HTML_TAG_REGEX, '')
    .trim();
}

//  SQL-injection guard

/**
 * Signatures that should never appear in a legitimate name, location,
 * bank/account label, or other short free-text field. Prisma already
 * parameterises every query (so these are not executable), but we reject
 * them at the edge to keep stored data clean and defend against any future
 * raw-SQL path. Tuned to avoid false positives on ordinary text.
 */
const SQL_INJECTION_PATTERNS: RegExp[] = [
  /\b(?:select|insert|update|delete|drop|alter|truncate|create|exec(?:ute)?|union)\b[\s\S]*\b(?:from|into|table|database|where|select)\b/i,
  /\bunion\b\s+\bselect\b/i,
  /\bor\b\s+\d+\s*=\s*\d+/i, // classic " OR 1=1"
  /--\s|\/\*|\*\//, // SQL comment markers
  /;\s*(?:drop|delete|update|insert|select|alter|truncate)\b/i,
  /\bxp_cmdshell\b/i,
];

/**
 * Returns `true` when the text contains a likely SQL-injection attempt.
 */
export const containsSqlInjection = (text: string): boolean => {
  if (typeof text !== 'string' || text.length === 0) return false;
  return SQL_INJECTION_PATTERNS.some((re) => re.test(text));
};

//  AI / OCR specific

/**
 * Returns `true` when the text contains a likely prompt-injection
 * attempt.  Callers should log the event and reject or flag it.
 */
export const containsPromptInjection = (text: string): boolean =>
  PROMPT_INJECTION_PATTERNS.some(re => re.test(text));

/**
 * Prepare raw text for the AI pipeline:
 *  1. Enforce length limit.
 *  2. Strip potentially dangerous content.
 *  3. Flag prompt injection.
 */
export const sanitizeAIInput = (
  raw: string,
): { sanitized: string; flagged: boolean } => {
  const truncated =
    raw.length > MAX_AI_INPUT_LENGTH ? raw.slice(0, MAX_AI_INPUT_LENGTH) : raw;

  const cleaned = sanitize(truncated);
  const flagged = containsPromptInjection(cleaned);
  return { sanitized: cleaned, flagged };
};

/**
 * Validate and clamp an AI model response before consumers parse it.
 */
export const sanitizeAIOutput = (raw: string): string => {
  if (raw.length > MAX_AI_OUTPUT_LENGTH) {
    return raw.slice(0, MAX_AI_OUTPUT_LENGTH);
  }
  return raw;
};

/**
 * Validate that a parsed OCR result looks reasonable (no NaN/Infinity,
 * amounts within sane bounds for a single receipt, etc.).
 */
export const validateOcrResult = (
  parsed: Record<string, unknown>,
): { valid: boolean; reason?: string } => {
  const amount = parsed.netAmount ?? parsed.amount;
  if (typeof amount === 'number') {
    if (!Number.isFinite(amount))
      return { valid: false, reason: 'Amount is not finite' };
    if (amount < 0) return { valid: false, reason: 'Negative amount' };
    if (amount > 10_000_000)
      return { valid: false, reason: 'Amount exceeds sanity limit' };
  }

  const items = parsed.items;
  if (Array.isArray(items) && items.length > 500) {
    return { valid: false, reason: 'Unreasonable item count' };
  }

  return { valid: true };
};
