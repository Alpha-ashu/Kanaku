/**
 * Heuristic receipt parser: raw OCR text -> structured receipt JSON.
 *
 * This is the fallback that runs whenever the LLM structuring pass is
 * unavailable or fails, so it is on the hot path far more often than its name
 * suggests — every degraded scan lands here. It is deliberately dependency-free
 * and pure so it can be unit-tested against real OCR dumps.
 *
 * The rules encoded below come from failures observed on real Indian thermal
 * receipts:
 *
 *  - A number glued to letters is an identifier, not money. "GSTIN :
 *    33ADPFS7571Q1Z1" OCRs as "...Q121" and a trailing-number match read that
 *    as a GST charge of 121.00 on a 475 rupee bill. Money now has to be
 *    preceded by a separator, so identifier tails can never become amounts.
 *  - Item names carry digits and brackets ("Phulka (3 Pcs)", "Chappathi (2
 *    Pcs)"). A letters-only name pattern silently dropped two of three lines.
 *  - Wrapped item names continue on the following lines ("Phulka (3 Pcs) With"
 *    / "Paneer Butter" / "Masala") and belong to the row above them.
 *  - Summary labels share a line with other columns ("Total Qty: 5   Sub Total
 *    452.30"), so anchoring on ^sub total misses the subtotal and ^total
 *    misreads the quantity row as the bill total.
 */

export interface ParsedReceiptItem {
  name: string;
  quantity: number | null;
  rate: number | null;
  amount: number;
}

export interface ParsedReceiptTax {
  name: string;
  rate: number | null;
  amount: number;
}

export interface ParsedReceipt extends Record<string, unknown> {
  merchantName: string | null;
  netAmount?: number;
  preTaxSubtotal?: number;
  totalTaxAmount?: number;
  discountAmount?: number;
  taxBreakdown?: ParsedReceiptTax[];
  gstin: string | null;
  items?: ParsedReceiptItem[];
  date: string | null;
  time: string | null;
  invoiceNumber: string | null;
  paymentMethod: string | null;
  currency: string;
  category?: string;
  description?: string;
  confidence: number;
  validationResult?: { isValid: boolean; calculated: number; detected: number };
}

/** Labels that start a summary/footer line — never an item, never a merchant. */
const LABEL_PATTERN =
  /^(sub|net|dis|tax|cgst|sgst|igst|utgst|gst|total|grand|amount|round|invoice|bill|date|time|phone|tel|mob|gstin|table|token|cashier|server|captain|rs\.?|inr|qty|rate|mrp|item|particulars|description|sl|sr|s\.?no|thank|visit|fssai)\b/i;

/**
 * Lines whose digits are identifiers (GST numbers, licences, phone numbers,
 * bill/token numbers). No amount is ever read off these.
 */
const IDENTIFIER_LINE =
  /\b(?:gstin|gst\s*(?:no|in|reg)|vat\s*tin|\btin\b|\bpan\b|\bcin\b|fssai|lic(?:ence|ense)?\.?\s*no|reg\.?\s*no|mob(?:ile)?|phone|tel|contact|bill\s*no|invoice\s*no|token\s*no|table\s*no|order\s*no|receipt\s*no)\b/i;

/** Where the item table ends and the summary block begins. */
const SUMMARY_BOUNDARY =
  /(sub\s*total|grand\s*total|net\s*total|food\s*total|item\s*total|total\s*qty|taxable\s*value|amount\s*payable|net\s*payable|round\s*off|\bcgst\b|\bsgst\b|\bigst\b|\butgst\b|\bvat\b|service\s*(?:tax|charge)|thank\s*you|visit\s*again|fssai)/i;

const TAX_LABEL =
  /^\s*(CGST|SGST|IGST|UTGST|GST|VAT|CESS|Service\s*Tax|Service\s*Charge|Swachh\s*Bharat|Krishi\s*Kalyan)\b/i;

const GRAND_TOTAL_LABEL =
  /(grand\s*total|amount\s*payable|net\s*payable|total\s*payable|bill\s*total|total\s*amount\s*due|total\s*due)/i;

const SUBTOTAL_LABEL = /(sub\s*total|subtotal|item\s*total|food\s*total)/i;

const NET_TOTAL_LABEL = /(net\s*total|taxable\s*value|net\s*amt|net\s*amount)/i;

/** "Total Qty: 5" is a count, not money. */
const COUNT_LABEL = /total\s*(?:qty|quantity|items?|nos?|pcs?)\b/i;

const DISCOUNT_LABEL = /(^|\s)(dis\b|discount|less\b|promo|coupon|offer)/i;

/**
 * A money value at the end of a line.
 *
 * The leading boundary is the whole point: without it the trailing digits of an
 * alphanumeric identifier parse as an amount (see the GSTIN case above). A
 * digit here must follow start-of-line, whitespace, or a separator/currency
 * mark — never a letter.
 */
const TRAILING_MONEY =
  /(?:^|[\s:;=|*()\[\]])(?:(?:rs|inr)\.?\s*)?[₹$€£]?\s*(-?\d[\d,]*(?:\.\d{1,2})?)\s*$/i;

const PERCENT_RATE = /@?\s*(\d{1,2}(?:\.\d{1,2})?)\s*%/;

const GSTIN_PATTERN = /\b[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/;

const CATEGORY_HINTS: Array<{ category: string; pattern: RegExp }> = [
  {
    category: 'Food & Dining',
    pattern:
      /restaurant|restro|cafe|coffee|kitchen|bakery|dosa|idli|biryani|thali|paneer|pizza|burger|chappathi|chapati|phulka|roti|meals|tiffin|bhavan|fssai|food/i,
  },
  { category: 'Groceries', pattern: /supermarket|super\s*market|grocery|grocer|kirana|provision|vegetable|fruits?|dairy|mart\b/i },
  { category: 'Transport', pattern: /petrol|diesel|fuel|hp\s*petro|indian\s*oil|bharat\s*petro|toll|parking|cab|taxi/i },
  { category: 'Healthcare', pattern: /pharmac|medical|chemist|clinic|hospital|diagnost|lab\b/i },
  { category: 'Shopping', pattern: /apparel|fashion|clothing|footwear|electronics|mall|retail|store/i },
];

const round2 = (value: number) => Number(value.toFixed(2));

const toNumber = (token: string): number | undefined => {
  const parsed = Number.parseFloat(token.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : undefined;
};

/**
 * Money at the end of a line, or undefined when the line carries no amount.
 * Identifier lines always return undefined.
 */
export const extractLineAmount = (line: string): number | undefined => {
  if (IDENTIFIER_LINE.test(line)) return undefined;
  const match = line.match(TRAILING_MONEY);
  if (!match) return undefined;
  const value = toNumber(match[1]);
  return value !== undefined && value > 0 ? value : undefined;
};

const hasEnoughLetters = (value: string) => {
  const tokens = value.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  const letters = value.match(/[a-z]/gi)?.length ?? 0;
  if (letters < 3) return false;
  // OCR noise fragments into short tokens ("VRS ta tn amo"); a genuine name has
  // at least one substantial word.
  const hasSubstantialToken = tokens.some((token) => (token.match(/[a-z]/gi)?.length ?? 0) >= 4);
  const shortTokens = tokens.filter((token) => token.replace(/[^a-z]/gi, '').length <= 2).length;
  return hasSubstantialToken && shortTokens / tokens.length < 0.5;
};

const cleanName = (value: string) =>
  value
    .replace(/[|_]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[^A-Za-z0-9(]+/, '')
    .replace(/[\s.:;,-]+$/, '')
    .trim();

//  Merchant

/**
 * The merchant is the most prominent non-metadata line in the header block.
 * Scored rather than "first line that isn't a label", because the first lines of
 * a photographed receipt are frequently a stamp or logo that OCRs to noise.
 */
const extractMerchant = (lines: string[]): string | null => {
  const scored = lines.slice(0, 8).map((line, index) => {
    const name = cleanName(line);
    let score = 0;

    if (!hasEnoughLetters(name)) score -= 5;
    if (IDENTIFIER_LINE.test(line) || LABEL_PATTERN.test(line)) score -= 5;
    if (/\d/.test(name)) score -= 1;
    if (name.length >= 6 && name.length <= 45) score += 1;
    // The trading name is printed first, above the address block.
    score += index === 0 ? 1.5 : index <= 2 ? 1 : 0;

    const letters = name.match(/[a-z]/gi)?.length ?? 0;
    const uppercase = name.match(/[A-Z]/g)?.length ?? 0;
    if (letters > 0 && uppercase / letters >= 0.6) score += 1;

    return { name, score };
  });

  const best = scored.filter((c) => c.score > 0).sort((a, b) => b.score - a.score)[0];
  return best ? best.name : null;
};

//  Date

const isPlausibleReceiptDate = (year: number, month: number, day: number) => {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return false;
  if (date.getMonth() !== month - 1 || date.getDate() !== day) return false;

  const now = new Date();
  const oldest = new Date(now.getFullYear() - 15, now.getMonth(), now.getDate());
  const newest = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);
  return date >= oldest && date <= newest;
};

const normalizeYear = (token: string) => {
  const value = Number(token);
  if (token.length !== 2) return value;
  const candidate = 2000 + value;
  return candidate <= new Date().getFullYear() + 1 ? candidate : candidate - 100;
};

const asIsoDate = (year: number, month: number, day: number) =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

/**
 * Date of the transaction. Lines carrying a date label win over any other
 * numeric run, and every candidate is range-checked — an unvalidated match
 * happily produced "2089-91-89" from a phone number.
 */
const extractDate = (lines: string[]): string | null => {
  const labelled = lines.filter((line) => /\b(?:date|dt|dated|invoice\s*date|bill\s*date)\b/i.test(line));
  const ordered = [...labelled, ...lines];

  for (const line of ordered) {
    const iso = line.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
    if (iso) {
      const [, y, m, d] = iso;
      if (isPlausibleReceiptDate(Number(y), Number(m), Number(d))) {
        return asIsoDate(Number(y), Number(m), Number(d));
      }
    }

    const dmy = line.match(/\b(\d{1,2})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{2,4})\b/);
    if (dmy) {
      const day = Number(dmy[1]);
      const month = Number(dmy[2]);
      const year = normalizeYear(dmy[3]);
      if (isPlausibleReceiptDate(year, month, day)) return asIsoDate(year, month, day);
      // Fall back to US ordering only when day/month cannot be read the Indian way.
      if (isPlausibleReceiptDate(year, day, month)) return asIsoDate(year, day, month);
    }
  }

  return null;
};

//  Items

const isItemName = (value: string) => {
  if (value.length < 3) return false;
  if (LABEL_PATTERN.test(value)) return false;
  if (IDENTIFIER_LINE.test(value)) return false;
  return hasEnoughLetters(value);
};

const ITEM_ROW_FULL = /^(.{2,48}?)\s+(\d{1,3})\s+(\d[\d,]*(?:\.\d{1,2})?)\s+(\d[\d,]*(?:\.\d{1,2})?)\s*$/;
const ITEM_ROW_SHORT = /^(.{2,48}?)\s+(\d{1,3})\s+(\d[\d,]*(?:\.\d{1,2})?)\s*$/;
const NUMBERS_ONLY_ROW = /^\s*(\d{1,3})\s+(\d[\d,]*(?:\.\d{1,2})?)(?:\s+(\d[\d,]*(?:\.\d{1,2})?))?\s*$/;

/**
 * Item table rows. Handles three layouts seen in the wild: everything on one
 * line, the name on its own line with the numbers below it, and a name that
 * wraps onto the lines *after* its own numeric row.
 */
const extractItems = (lines: string[]): ParsedReceiptItem[] => {
  const items: ParsedReceiptItem[] = [];
  let continuationsForLast = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    // The summary block starts here; nothing below it is an item.
    if (SUMMARY_BOUNDARY.test(line)) break;
    if (LABEL_PATTERN.test(line) || IDENTIFIER_LINE.test(line)) continue;

    const full = line.match(ITEM_ROW_FULL);
    const short = full ? null : line.match(ITEM_ROW_SHORT);
    const row = full || short;

    if (row) {
      const name = cleanName(row[1]);
      const quantity = Number.parseInt(row[2], 10);
      const first = toNumber(row[3]);
      const second = row[4] ? toNumber(row[4]) : undefined;

      if (isItemName(name) && first !== undefined) {
        const rate = second !== undefined ? first : null;
        const amount = second !== undefined ? second : first;
        items.push({ name, quantity, rate, amount: round2(amount) });
        continuationsForLast = 0;
        continue;
      }
    }

    // Name on this line, numbers on the next.
    const next = lines[i + 1];
    if (next && !/\d/.test(line) && isItemName(cleanName(line)) && !SUMMARY_BOUNDARY.test(next)) {
      const numbers = next.match(NUMBERS_ONLY_ROW);
      if (numbers) {
        const quantity = Number.parseInt(numbers[1], 10);
        const first = toNumber(numbers[2]);
        const second = numbers[3] ? toNumber(numbers[3]) : undefined;
        if (first !== undefined) {
          items.push({
            name: cleanName(line),
            quantity,
            rate: second !== undefined ? first : null,
            amount: round2(second !== undefined ? second : first),
          });
          continuationsForLast = 0;
          i += 1;
          continue;
        }
      }
    }

    // A wrapped name continues below its own row ("Phulka (3 Pcs) With" /
    // "Paneer Butter" / "Masala"). Digit-free, so it can never be a new row.
    if (
      items.length > 0
      && continuationsForLast < 3
      && !/\d/.test(line)
      && line.length >= 3
      && /[a-z]{3,}/i.test(line)
    ) {
      const last = items[items.length - 1];
      last.name = cleanName(`${last.name} ${cleanName(line)}`);
      continuationsForLast += 1;
    }
  }

  return items;
};

//  Taxes

const normalizeTaxName = (label: string) => label.toUpperCase().replace(/\s+/g, '_');

/**
 * Tax component lines. Only a line that *starts* with a tax label counts, and
 * identifier lines are excluded outright — "GSTIN : ..." must never register as
 * a GST charge.
 */
const extractTaxes = (lines: string[]): ParsedReceiptTax[] => {
  const taxes: ParsedReceiptTax[] = [];

  for (const line of lines) {
    if (IDENTIFIER_LINE.test(line)) continue;
    const label = line.match(TAX_LABEL);
    if (!label) continue;

    const amount = extractLineAmount(line);
    if (amount === undefined) continue;

    const rateMatch = line.match(PERCENT_RATE);
    const rate = rateMatch ? Number.parseFloat(rateMatch[1]) : null;

    taxes.push({
      name: normalizeTaxName(label[1]),
      // 28% is the highest GST slab; anything above it is an OCR misread.
      rate: rate !== null && rate > 0 && rate <= 28 ? rate : null,
      amount: round2(amount),
    });
  }

  // CGST and SGST are always equal halves. When both are present with the same
  // amount but different rates, one rate was misread — trust the valid one.
  const cgst = taxes.find((t) => t.name === 'CGST');
  const sgst = taxes.find((t) => t.name === 'SGST');
  if (cgst && sgst && cgst.amount === sgst.amount && cgst.rate !== sgst.rate) {
    const rate = cgst.rate ?? sgst.rate;
    cgst.rate = rate;
    sgst.rate = rate;
  }

  return taxes;
};

/**
 * Drop tax components that cannot be real. No single Indian GST component
 * exceeds 14% of the taxable value (28% split across CGST/SGST), so a component
 * worth a quarter of the bill is a misparse, not a charge.
 */
const dropImplausibleTaxes = (taxes: ParsedReceiptTax[], total?: number) => {
  if (!total || total <= 0) return taxes;
  return taxes.filter((tax) => tax.amount <= total * 0.25);
};

//  Category

const deriveCategory = (rawText: string): string | undefined =>
  CATEGORY_HINTS.find((hint) => hint.pattern.test(rawText))?.category;

//  Entry point

export const parseReceiptFromText = (rawText: string): ParsedReceipt => {
  const lines = rawText
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const merchantName = extractMerchant(lines);
  const date = extractDate(lines);

  let time: string | null = null;
  for (const line of lines) {
    const match = line.match(/\b(\d{1,2}:\d{2}(?::\d{2})?)\s*(am|pm)?/i);
    if (match) {
      time = match[1];
      break;
    }
  }

  let invoiceNumber: string | null = null;
  for (const line of lines) {
    const match = line.match(/\b(?:bill|invoice|token|receipt|order)\s*(?:no\.?|#|number)?\s*[:.\s]\s*([A-Za-z0-9-]{2,})/i);
    if (match) {
      invoiceNumber = match[1];
      break;
    }
  }

  let gstin: string | null = null;
  for (const line of lines) {
    const match = line.match(GSTIN_PATTERN);
    if (match) {
      gstin = match[0];
      break;
    }
  }

  let paymentMethod: string | null = null;
  for (const line of lines) {
    const match = line.match(/\b(upi|cash|card|gpay|paytm|phonepe|bhim|credit|debit|neft|imps|netbanking)\b/i);
    if (match) {
      paymentMethod = match[1].toUpperCase();
      break;
    }
  }

  const items = extractItems(lines);
  const taxes = extractTaxes(lines);

  let subtotal: number | undefined;
  let netTotal: number | undefined;
  let discount: number | undefined;
  let grandTotal: number | undefined;
  let plainTotal: number | undefined;

  for (const line of lines) {
    const amount = extractLineAmount(line);
    if (amount === undefined) continue;

    // Order matters: the most specific label on the line wins, and a line can
    // hold two labels ("Total Qty: 5   Sub Total 452.30").
    if (GRAND_TOTAL_LABEL.test(line)) {
      grandTotal = amount;
    } else if (SUBTOTAL_LABEL.test(line)) {
      subtotal = amount;
    } else if (NET_TOTAL_LABEL.test(line)) {
      netTotal = amount;
    } else if (DISCOUNT_LABEL.test(line) && !TAX_LABEL.test(line)) {
      discount = Math.abs(amount);
    } else if (/^total\b/i.test(line) && !COUNT_LABEL.test(line) && !TAX_LABEL.test(line)) {
      plainTotal = amount;
    }
  }

  if (grandTotal === undefined) grandTotal = plainTotal;

  const taxBreakdown = dropImplausibleTaxes(taxes, grandTotal);
  const taxTotal = taxBreakdown.length > 0
    ? round2(taxBreakdown.reduce((sum, tax) => sum + tax.amount, 0))
    : undefined;

  const itemsTotal = items.length > 0 ? round2(items.reduce((sum, item) => sum + item.amount, 0)) : undefined;
  if (subtotal === undefined && netTotal !== undefined) subtotal = netTotal;
  if (subtotal === undefined && itemsTotal !== undefined) subtotal = itemsTotal;

  if (grandTotal === undefined && subtotal !== undefined) {
    grandTotal = round2(subtotal - (discount || 0) + (taxTotal || 0));
  }

  // Math check against the printed subtotal. A failure here is the strongest
  // signal we have that a number was misread, so it drives the confidence score.
  let validationResult: ParsedReceipt['validationResult'];
  if (grandTotal !== undefined && subtotal !== undefined) {
    const calculated = round2(subtotal - (discount || 0) + (taxTotal || 0));
    validationResult = {
      isValid: Math.abs(calculated - grandTotal) <= Math.max(2, grandTotal * 0.02),
      calculated,
      detected: grandTotal,
    };
  }

  // Honest scoring. This parser is a degraded fallback, so it is capped below
  // the "trust it" threshold even when everything lines up: a high score here
  // would tell the user a heuristic reading is as good as an AI one.
  let confidence = 0.2;
  if (grandTotal !== undefined) confidence += 0.15;
  if (items.length > 0) confidence += 0.1;
  if (subtotal !== undefined) confidence += 0.05;
  if (taxBreakdown.length > 0) confidence += 0.05;
  if (date) confidence += 0.05;
  if (merchantName) confidence += 0.05;
  if (validationResult?.isValid) confidence += 0.1;
  if (validationResult && !validationResult.isValid) confidence -= 0.15;
  confidence = Math.max(0.1, Math.min(0.65, Number(confidence.toFixed(2))));

  const description = items.length > 0
    ? items.slice(0, 3).map((item) => item.name).join(', ')
    : undefined;

  return {
    merchantName,
    netAmount: grandTotal,
    preTaxSubtotal: subtotal,
    totalTaxAmount: taxTotal,
    discountAmount: discount,
    taxBreakdown: taxBreakdown.length > 0 ? taxBreakdown : undefined,
    gstin,
    items: items.length > 0 ? items : undefined,
    date,
    time,
    invoiceNumber,
    paymentMethod,
    currency: 'INR',
    category: deriveCategory(rawText),
    description,
    confidence,
    validationResult,
    _rawOcrText: rawText,
    _source: 'ocr-heuristic',
  };
};
