/**
 * The canonical shape of an extracted bill, and the reconciliation logic that
 * decides whether we believe it.
 *
 * Every extraction path — Gemini vision, Gemini over OCR text, and the offline
 * heuristic parser — funnels through `normalizeExtractedReceipt` here, so the
 * API contract does not depend on which engine happened to answer. The engines
 * differ in how well they read a bill; they must not differ in what a bill
 * *is*.
 *
 * The two jobs this module does that a text extractor cannot:
 *
 *  1. **Decide the tax model.** A bill that prints "Amount Incl of All Taxes
 *     749.00" over a "SUB TOTAL 635.10" is quoting an inclusive total, while
 *     one that prints "Sub Total 452.30 / CGST 11.31 / Grand Total 475.00" is
 *     exclusive. Storing the same number as "subtotal" in both cases silently
 *     misstates the expense, so the model is inferred from the arithmetic and
 *     from the wording, and the subtotal is back-computed when it is inclusive.
 *
 *  2. **Reconcile the arithmetic.** subtotal − discount + charges + tax must
 *     equal the printed total. When it does not, the reading is wrong somewhere,
 *     and a wrong number written into someone's ledger is worse than no number
 *     at all — so the result is flagged for review rather than trusted.
 */

export type TaxModel = 'exclusive' | 'inclusive' | 'unknown';

export interface ExtractedTax {
  /** Canonical label: CGST, SGST, IGST, UTGST, GST, VAT, SERVICE_TAX, CESS… */
  type: string;
  /** Percentage as printed (9, 2.5, 18). Null when the bill shows only money. */
  rate: number | null;
  amount: number;
}

/**
 * Anything added to the bill that is not tax: service charge, packaging,
 * delivery, convenience/handling fees, tips. Kept as a list rather than named
 * columns because aggregators keep inventing new ones.
 */
export interface ExtractedCharge {
  /** SERVICE, PACKAGING, DELIVERY, CONVENIENCE, HANDLING, TIP, OTHER */
  type: string;
  /** Label exactly as printed, for display. */
  label: string;
  amount: number;
  rate: number | null;
}

export interface ExtractedLineItem {
  name: string;
  quantity: number | null;
  unitPrice: number | null;
  amount: number;
}

export interface ExtractedMerchant {
  name: string | null;
  brand?: string | null;
  address?: string | null;
  gstin?: string | null;
  phone?: string | null;
}

export interface ReceiptValidation {
  /** Did subtotal − discount + charges + tax land on the printed total? */
  isValid: boolean;
  /** What the components add up to. */
  calculated: number;
  /** What the bill printed. */
  detected: number;
  /** calculated − detected, rounded. */
  difference: number;
  /** True when the gap is big enough that a human should look. */
  requiresReview: boolean;
  /** Human-readable reasons, surfaced in the review card. */
  issues: string[];
}

export interface ExtractedReceipt {
  merchant: ExtractedMerchant;
  billNumber: string | null;
  date: string | null;
  time: string | null;
  currency: string;

  subtotal: number | null;
  discount: number | null;
  discountPercent: number | null;
  taxes: ExtractedTax[];
  totalTax: number | null;
  additionalCharges: ExtractedCharge[];
  totalCharges: number | null;
  roundOff: number | null;
  total: number | null;

  taxModel: TaxModel;
  items: ExtractedLineItem[];
  paymentMethod: string | null;
  category: string | null;
  description: string | null;

  /** 0-100. What the pipeline thinks of its own reading. */
  confidence: number;
  validation: ReceiptValidation | null;
  /** Which engine produced this: gemini-vision | gemini-text | ocr-heuristic */
  engine: string;
}

// ─── Taxonomy ────────────────────────────────────────────────────────────────

const TAX_ALIASES: Array<{ pattern: RegExp; type: string }> = [
  { pattern: /\bc\.?\s?gst\b|central\s*g\.?s\.?t/i, type: 'CGST' },
  { pattern: /\bs\.?\s?gst\b|state\s*g\.?s\.?t/i, type: 'SGST' },
  { pattern: /\bi\.?\s?gst\b|integrated\s*g\.?s\.?t/i, type: 'IGST' },
  { pattern: /\butgst\b|union\s*territory/i, type: 'UTGST' },
  { pattern: /krishi\s*kalyan/i, type: 'KRISHI_KALYAN_CESS' },
  { pattern: /swach|swachh\s*bharat/i, type: 'SWACHH_BHARAT_CESS' },
  { pattern: /\bcess\b/i, type: 'CESS' },
  { pattern: /service\s*tax|\bstx\b/i, type: 'SERVICE_TAX' },
  { pattern: /\bvat\b|value\s*added/i, type: 'VAT' },
  { pattern: /sales\s*tax/i, type: 'SALES_TAX' },
  { pattern: /municipal|local\s*(body\s*)?tax|\blbt\b|octroi/i, type: 'LOCAL_TAX' },
  { pattern: /\bgst\b/i, type: 'GST' },
  { pattern: /\btax\b/i, type: 'TAX' },
];

const CHARGE_ALIASES: Array<{ pattern: RegExp; type: string }> = [
  { pattern: /service\s*(charge|chrg|fee)|\bserc\b|\bsc\b(?!\w)/i, type: 'SERVICE' },
  { pattern: /packag|packing|\bpkg\b|container/i, type: 'PACKAGING' },
  { pattern: /deliver|shipping|freight|courier/i, type: 'DELIVERY' },
  { pattern: /convenien/i, type: 'CONVENIENCE' },
  { pattern: /handling/i, type: 'HANDLING' },
  { pattern: /\btip\b|gratuity/i, type: 'TIP' },
];

/** Highest GST slab in India; a component above this is a misread, not a tax. */
export const MAX_PLAUSIBLE_TAX_RATE = 28;

export const canonicalTaxType = (label: string): string => {
  const match = TAX_ALIASES.find((alias) => alias.pattern.test(label));
  return match ? match.type : label.trim().toUpperCase().replace(/\s+/g, '_').slice(0, 30) || 'TAX';
};

export const canonicalChargeType = (label: string): string => {
  const match = CHARGE_ALIASES.find((alias) => alias.pattern.test(label));
  return match ? match.type : 'OTHER';
};

/** True when a label names a charge rather than a tax or a total. */
export const looksLikeCharge = (label: string): boolean =>
  CHARGE_ALIASES.some((alias) => alias.pattern.test(label));

// ─── Numeric helpers ─────────────────────────────────────────────────────────

export const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

export const toFiniteNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value).replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};

const positiveOrNull = (value: number | null): number | null =>
  value !== null && value > 0 ? round2(value) : null;

// ─── Tax model ───────────────────────────────────────────────────────────────

/** Wording that states the total already contains the tax. */
const INCLUSIVE_WORDING = /incl(?:usive|\.|uding)?\s*(?:of\s*)?(?:all\s*)?tax|tax\s*incl|inclusive\s*of\s*gst|price[s]?\s*incl/i;
const EXCLUSIVE_WORDING = /excl(?:usive|\.|uding)?\s*(?:of\s*)?tax|plus\s*tax|tax\s*extra/i;

/**
 * Work out whether the printed total already contains the tax.
 *
 * Arithmetic decides it when the numbers are present, because a bill's own sums
 * are stronger evidence than its wording: if subtotal + tax lands on the total
 * it is exclusive; if the subtotal alone lands on the total while a tax is
 * still itemised, the tax was already inside it. Wording is the tiebreaker for
 * bills that print too few numbers to tell.
 */
export const detectTaxModel = (input: {
  subtotal: number | null;
  totalTax: number | null;
  totalCharges: number | null;
  discount: number | null;
  total: number | null;
  rawText?: string;
}): TaxModel => {
  const { subtotal, total } = input;
  const tax = input.totalTax ?? 0;
  const charges = input.totalCharges ?? 0;
  const discount = input.discount ?? 0;

  if (subtotal !== null && total !== null && tax > 0) {
    const exclusiveTotal = subtotal - discount + charges + tax;
    const inclusiveTotal = subtotal - discount + charges;
    const exclusiveGap = Math.abs(exclusiveTotal - total);
    const inclusiveGap = Math.abs(inclusiveTotal - total);
    // A rupee of slack absorbs the round-off line most bills carry.
    const tolerance = Math.max(1, total * 0.01);

    if (exclusiveGap <= tolerance && inclusiveGap > tolerance) return 'exclusive';
    if (inclusiveGap <= tolerance && exclusiveGap > tolerance) return 'inclusive';
    if (exclusiveGap <= tolerance && inclusiveGap <= tolerance) {
      // Both fit only when the tax is negligible; trust the wording if any.
      return INCLUSIVE_WORDING.test(input.rawText ?? '') ? 'inclusive' : 'exclusive';
    }
  }

  if (input.rawText) {
    if (INCLUSIVE_WORDING.test(input.rawText)) return 'inclusive';
    if (EXCLUSIVE_WORDING.test(input.rawText)) return 'exclusive';
  }

  // Indian retail defaults to tax-exclusive printing on the subtotal line.
  return tax > 0 && subtotal !== null && total !== null ? 'exclusive' : 'unknown';
};

/**
 * For an inclusive bill the printed "subtotal" already contains the tax, so the
 * pre-tax base has to be derived. Returns the taxable base.
 */
export const deriveInclusiveBase = (grossAmount: number, totalTax: number): number =>
  round2(grossAmount - totalTax);

// ─── Reconciliation ──────────────────────────────────────────────────────────

/**
 * Check the bill's own arithmetic and decide whether a human needs to look.
 *
 * The tolerance is deliberately tight (₹1 or 0.5%, whichever is larger): a
 * genuine round-off line moves the total by a few paise, while a misread digit
 * moves it by tens or hundreds. Anything outside that is flagged rather than
 * silently accepted, because this number becomes a ledger entry.
 */
export const validateReceiptMath = (receipt: {
  subtotal: number | null;
  discount: number | null;
  totalTax: number | null;
  totalCharges: number | null;
  roundOff: number | null;
  total: number | null;
  taxModel: TaxModel;
  items: ExtractedLineItem[];
}): ReceiptValidation | null => {
  const { total } = receipt;
  if (total === null || total <= 0) return null;

  const issues: string[] = [];
  const subtotal = receipt.subtotal;
  const discount = receipt.discount ?? 0;
  const tax = receipt.totalTax ?? 0;
  const charges = receipt.totalCharges ?? 0;
  const roundOff = receipt.roundOff ?? 0;

  if (subtotal === null) {
    // Nothing to reconcile against — not an error, just an incomplete read.
    return {
      isValid: true,
      calculated: round2(total),
      detected: round2(total),
      difference: 0,
      requiresReview: false,
      issues: [],
    };
  }

  // An inclusive bill's tax is already inside the subtotal, so adding it again
  // would double-count.
  const calculated = receipt.taxModel === 'inclusive'
    ? round2(subtotal - discount + charges + roundOff)
    : round2(subtotal - discount + charges + tax + roundOff);

  const difference = round2(calculated - total);
  const tolerance = Math.max(1, total * 0.005);
  const isValid = Math.abs(difference) <= tolerance;

  if (!isValid) {
    issues.push(
      `Components add up to ${calculated.toFixed(2)} but the bill prints ${total.toFixed(2)} `
      + `(off by ${Math.abs(difference).toFixed(2)}).`,
    );
  }

  const itemsTotal = receipt.items.length > 0
    ? round2(receipt.items.reduce((sum, item) => sum + item.amount, 0))
    : null;
  if (itemsTotal !== null && subtotal > 0 && Math.abs(itemsTotal - subtotal) > Math.max(1, subtotal * 0.05)) {
    issues.push(`Line items total ${itemsTotal.toFixed(2)}, which does not match the subtotal ${subtotal.toFixed(2)}.`);
  }

  if (tax > 0 && total > 0 && tax > total * 0.4) {
    issues.push(`Tax of ${tax.toFixed(2)} is implausibly large for a total of ${total.toFixed(2)}.`);
  }

  return {
    isValid,
    calculated,
    detected: round2(total),
    difference,
    requiresReview: !isValid || issues.length > 0,
    issues,
  };
};

// ─── Confidence ──────────────────────────────────────────────────────────────

const ENGINE_CEILING: Record<string, number> = {
  'gemini-vision': 98,
  'gemini-text': 92,
  'ocr-heuristic': 70,
};

/**
 * A single score the review card can act on. Built from what was actually
 * extracted and whether it adds up — not from the model's own opinion, which
 * has no way to know it misread a digit.
 *
 * Capped per engine: the offline heuristic reading a corrupted Tesseract dump
 * can be internally consistent and still be wrong, so it never presents as
 * "trust this without looking".
 */
export const scoreConfidence = (receipt: ExtractedReceipt, modelConfidence?: number | null): number => {
  let score = 35;

  if (receipt.total !== null && receipt.total > 0) score += 20;
  if (receipt.merchant.name) score += 10;
  if (receipt.subtotal !== null) score += 8;
  if (receipt.taxes.length > 0) score += 7;
  if (receipt.date) score += 5;
  if (receipt.items.length > 0) score += Math.min(8, receipt.items.length * 2);
  if (receipt.billNumber) score += 3;
  if (receipt.merchant.gstin) score += 4;

  if (receipt.validation) {
    if (receipt.validation.isValid) score += 10;
    else score -= 30;
    score -= Math.min(15, receipt.validation.issues.length * 5);
  }

  // The model's self-reported confidence nudges, never dominates.
  if (typeof modelConfidence === 'number' && Number.isFinite(modelConfidence)) {
    const normalized = modelConfidence <= 1 ? modelConfidence * 100 : modelConfidence;
    score = score * 0.85 + normalized * 0.15;
  }

  const ceiling = ENGINE_CEILING[receipt.engine] ?? 80;
  return Math.max(5, Math.min(ceiling, Math.round(score)));
};

// ─── Normalisation ───────────────────────────────────────────────────────────

const cleanString = (value: unknown, maxLength = 200): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (!trimmed || /^(null|n\/?a|unknown|none|-)$/i.test(trimmed)) return null;
  return trimmed.slice(0, maxLength);
};

const GSTIN_PATTERN = /\b[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/;

const normalizeTaxes = (raw: unknown): ExtractedTax[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const row = entry as Record<string, unknown>;
      const amount = toFiniteNumber(row.amount ?? row.value);
      if (amount === null || amount <= 0) return null;
      const label = cleanString(row.type ?? row.name ?? row.label) ?? 'Tax';
      const rate = toFiniteNumber(row.rate ?? row.percent ?? row.percentage);
      return {
        type: canonicalTaxType(label),
        // A "rate" outside 0-28% is a misread of the amount column.
        rate: rate !== null && rate > 0 && rate <= MAX_PLAUSIBLE_TAX_RATE ? rate : null,
        amount: round2(amount),
      };
    })
    .filter((tax): tax is ExtractedTax => tax !== null);
};

const normalizeCharges = (raw: unknown): ExtractedCharge[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const row = entry as Record<string, unknown>;
      const amount = toFiniteNumber(row.amount ?? row.value);
      if (amount === null || amount === 0) return null;
      const label = cleanString(row.label ?? row.type ?? row.name) ?? 'Other charge';
      const rate = toFiniteNumber(row.rate ?? row.percent);
      return {
        type: canonicalChargeType(label),
        label,
        amount: round2(amount),
        rate: rate !== null && rate > 0 && rate <= 100 ? rate : null,
      };
    })
    .filter((charge): charge is ExtractedCharge => charge !== null);
};

const normalizeItems = (raw: unknown): ExtractedLineItem[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const row = entry as Record<string, unknown>;
      const name = cleanString(row.name ?? row.description ?? row.item, 120);
      const amount = toFiniteNumber(row.amount ?? row.total ?? row.value);
      if (!name || name.length < 2 || amount === null || amount <= 0) return null;
      const quantity = toFiniteNumber(row.quantity ?? row.qty);
      const unitPrice = toFiniteNumber(row.unitPrice ?? row.rate ?? row.price);
      return {
        name,
        quantity: quantity !== null && quantity > 0 && quantity <= 10000 ? quantity : null,
        unitPrice: unitPrice !== null && unitPrice > 0 ? round2(unitPrice) : null,
        amount: round2(amount),
      };
    })
    .filter((item): item is ExtractedLineItem => item !== null)
    .slice(0, 100);
};

const normalizeDate = (raw: unknown): string | null => {
  const value = cleanString(raw, 40);
  if (!value) return null;

  const iso = value.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  const dmy = value.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);

  let year: number, month: number, day: number;
  if (iso) {
    [, year, month, day] = [0, Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else if (dmy) {
    day = Number(dmy[1]);
    month = Number(dmy[2]);
    year = Number(dmy[3]);
    if (year < 100) year += 2000;
  } else {
    return null;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime()) || date.getMonth() !== month - 1) return null;

  // A bill from the future, or from before smartphones, is a misread year.
  const now = new Date();
  if (year < now.getFullYear() - 20 || date.getTime() > now.getTime() + 2 * 86400000) return null;

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

/**
 * Turn whatever an engine produced into the canonical shape, then run tax-model
 * detection, reconciliation and scoring over it. This is the only place those
 * three decisions are made, so every engine is judged the same way.
 */
export const normalizeExtractedReceipt = (
  raw: Record<string, unknown>,
  options: { engine: string; rawText?: string },
): ExtractedReceipt => {
  const merchantRaw = (raw.merchant ?? {}) as Record<string, unknown>;
  const merchantName = cleanString(
    typeof raw.merchant === 'string' ? raw.merchant : merchantRaw.name ?? raw.merchantName ?? raw.vendor,
    120,
  );

  const gstinCandidate = cleanString(merchantRaw.gstin ?? raw.gstin ?? raw.gstNo, 20);
  const gstin = gstinCandidate && GSTIN_PATTERN.test(gstinCandidate.toUpperCase())
    ? gstinCandidate.toUpperCase()
    : (options.rawText?.toUpperCase().match(GSTIN_PATTERN)?.[0] ?? null);

  const taxes = normalizeTaxes(raw.taxes ?? raw.taxBreakdown);
  const additionalCharges = normalizeCharges(raw.additionalCharges ?? raw.charges);
  const items = normalizeItems(raw.items ?? raw.lineItems);

  const totalTax = taxes.length > 0
    ? round2(taxes.reduce((sum, tax) => sum + tax.amount, 0))
    : positiveOrNull(toFiniteNumber(raw.totalTax ?? raw.taxAmount ?? raw.totalTaxAmount));

  const totalCharges = additionalCharges.length > 0
    ? round2(additionalCharges.reduce((sum, charge) => sum + charge.amount, 0))
    : null;

  const total = positiveOrNull(toFiniteNumber(raw.total ?? raw.netAmount ?? raw.grandTotal ?? raw.amount));
  let subtotal = positiveOrNull(toFiniteNumber(raw.subtotal ?? raw.preTaxSubtotal ?? raw.itemTotal));
  const discount = positiveOrNull(toFiniteNumber(raw.discount ?? raw.discountAmount));
  const discountPercentRaw = toFiniteNumber(raw.discountPercent ?? raw.discountPercentage);
  const roundOffRaw = toFiniteNumber(raw.roundOff ?? raw.rounding);

  const declaredModel = cleanString(raw.taxModel, 20)?.toLowerCase();
  const taxModel: TaxModel = declaredModel === 'inclusive' || declaredModel === 'exclusive'
    ? declaredModel
    : detectTaxModel({ subtotal, totalTax, totalCharges, discount, total, rawText: options.rawText });

  // An inclusive bill with no printed pre-tax line: derive the base so the
  // stored subtotal means the same thing on every receipt.
  if (subtotal === null && taxModel === 'inclusive' && total !== null && totalTax !== null) {
    subtotal = deriveInclusiveBase(total - (totalCharges ?? 0) + (discount ?? 0), totalTax);
  }

  const receipt: ExtractedReceipt = {
    merchant: {
      name: merchantName,
      brand: cleanString(merchantRaw.brand ?? raw.brand, 80),
      address: cleanString(merchantRaw.address ?? raw.address, 250),
      gstin,
      phone: cleanString(merchantRaw.phone ?? raw.phone, 30),
    },
    billNumber: cleanString(raw.billNumber ?? raw.invoiceNumber ?? raw.billNo, 60),
    date: normalizeDate(raw.date ?? raw.billDate ?? raw.invoiceDate),
    time: cleanString(raw.time, 12),
    currency: cleanString(raw.currency, 8)?.toUpperCase() ?? 'INR',

    subtotal,
    discount,
    discountPercent: discountPercentRaw !== null && discountPercentRaw > 0 && discountPercentRaw <= 100
      ? round2(discountPercentRaw)
      : null,
    taxes,
    totalTax,
    additionalCharges,
    totalCharges,
    roundOff: roundOffRaw !== null && Math.abs(roundOffRaw) <= 10 ? round2(roundOffRaw) : null,
    total,

    taxModel,
    items,
    paymentMethod: cleanString(raw.paymentMethod, 30)?.toUpperCase() ?? null,
    category: cleanString(raw.category, 40),
    description: cleanString(raw.description, 300)
      ?? (items.length > 0 ? items.slice(0, 3).map((item) => item.name).join(', ') : null),

    confidence: 0,
    validation: null,
    engine: options.engine,
  };

  receipt.validation = validateReceiptMath(receipt);
  receipt.confidence = scoreConfidence(receipt, toFiniteNumber(raw.confidence));

  return receipt;
};
