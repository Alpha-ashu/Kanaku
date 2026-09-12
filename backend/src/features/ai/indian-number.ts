/**
 * Spoken-amount parsing for Indian English: digits with separators, unit
 * suffixes ("2k", "5 hazaar", "1.5 lakh", "2 cr") and number words
 * ("one lakh fifty thousand", "two thousand five hundred").
 */

const UNIT_MULTIPLIERS: Record<string, number> = {
  k: 1000,
  thousand: 1000,
  hazaar: 1000,
  hazar: 1000,
  lakh: 100000,
  lakhs: 100000,
  lac: 100000,
  lacs: 100000,
  cr: 10000000,
  crore: 10000000,
  crores: 10000000,
};

const WORD_VALUES: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  // Hindi numerals that don't collide with English words ("do", "teen", "char",
  // "das" are left out on purpose — "how much do I owe" is not "2").
  ek: 1, paanch: 5, panch: 5, chhe: 6, saat: 7, aath: 8, nau: 9,
  sau: 100,
  // "dedh" = one-and-a-half: "dedh sau" → 150, "dedh hazaar" → 1500, "dedh lakh" → 1,50,000
  dedh: 1.5,
  adhai: 2.5,
};

const DIGIT_TOKEN = /^\d[\d,]*(?:\.\d+)?$/;
const STRIP_TOKEN = /^(?:rupees?|rs\.?|inr|₹|and|a|an|of)$/i;

interface Parsed {
  value: number;
  /** [start, end) character range of the matched phrase in the original text */
  range: [number, number];
}

/**
 * Finds every spoken amount in `text`, in order. A phrase is a run of number
 * words / digits / unit words; "rupees", "and", "a" are transparent inside it.
 */
export function extractIndianAmounts(text: string): Parsed[] {
  const results: Parsed[] = [];
  const tokenRe = /[^\s]+/g;
  let m: RegExpExecArray | null;

  let phraseStart = -1;
  let phraseEnd = -1;
  let total = 0;
  let current = 0;
  let sawValue = false;
  let lastUnit = 0;

  const flush = () => {
    if (sawValue) {
      let value = total + current;
      // "one lakh fifty" → 1,50,000: a bare tens value after lakh/crore is thousands.
      if (lastUnit >= 100000 && current > 0 && current < 100) {
        value = total + current * 1000;
      }
      if (value > 0) results.push({ value, range: [phraseStart, phraseEnd] });
    }
    phraseStart = -1;
    phraseEnd = -1;
    total = 0;
    current = 0;
    sawValue = false;
    lastUnit = 0;
  };

  while ((m = tokenRe.exec(text)) !== null) {
    const raw = m[0].replace(/[.,!?;:]+$/, '');
    const token = raw.toLowerCase().replace(/^₹/, '');
    const start = m.index;
    const end = m.index + m[0].length;

    if (STRIP_TOKEN.test(token) || token === '') {
      if (sawValue) phraseEnd = end;
      continue;
    }

    // "2k", "5lakh", "1.5cr" written without a space
    const glued = token.match(/^(\d[\d,]*(?:\.\d+)?)(k|thousand|hazaar|hazar|lakh|lakhs|lac|lacs|cr|crore|crores)$/);
    const parts: string[] = glued ? [glued[1], glued[2]] : [token];

    let consumed = false;
    for (const part of parts) {
      if (DIGIT_TOKEN.test(part)) {
        const n = parseFloat(part.replace(/,/g, ''));
        if (!Number.isFinite(n)) continue;
        if (sawValue && current > 0 && !glued) {
          // "2000 3000" — two separate amounts
          flush();
        }
        if (phraseStart === -1) phraseStart = start;
        current += n;
        sawValue = true;
        consumed = true;
        continue;
      }
      if (part in UNIT_MULTIPLIERS) {
        const mult = UNIT_MULTIPLIERS[part];
        if (phraseStart === -1) phraseStart = start;
        total += (current || 1) * mult;
        current = 0;
        sawValue = true;
        lastUnit = mult;
        consumed = true;
        continue;
      }
      if (part === 'hundred') {
        if (phraseStart === -1) phraseStart = start;
        current = (current || 1) * 100;
        sawValue = true;
        consumed = true;
        continue;
      }
      if (part in WORD_VALUES) {
        const v = WORD_VALUES[part];
        if (phraseStart === -1) phraseStart = start;
        if (part === 'sau') current = (current || 1) * 100;
        else current += v;
        sawValue = true;
        consumed = true;
        continue;
      }
    }

    if (consumed) {
      phraseEnd = end;
    } else {
      flush();
    }
  }
  flush();
  return results;
}

/** First spoken amount in the text, or undefined. */
export function parseIndianAmount(text: string): number | undefined {
  return extractIndianAmounts(text)[0]?.value;
}

/** The text with every spoken amount phrase removed (for title extraction). */
export function stripIndianAmounts(text: string): string {
  const found = extractIndianAmounts(text);
  if (found.length === 0) return text;
  let out = '';
  let cursor = 0;
  for (const f of found) {
    out += text.slice(cursor, f.range[0]);
    cursor = f.range[1];
  }
  out += text.slice(cursor);
  return out.replace(/\s+/g, ' ').trim();
}
