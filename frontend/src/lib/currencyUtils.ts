const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  INR: '₹',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  AUD: 'A$',
  CAD: 'C$',
  SGD: 'S$',
  CHF: 'CHF',
};

const SYMBOL_TO_CODE: Record<string, string> = {
  '$': 'USD',
  '₹': 'INR',
  '€': 'EUR',
  '£': 'GBP',
  '¥': 'JPY',
  'A$': 'AUD',
  'C$': 'CAD',
  'S$': 'SGD',
  'CHF': 'CHF',
};

type QuoteLike = {
  lastPrice: number;
} | null;

export function normalizeCurrencyCode(value?: string, fallback = 'INR') {
  const trimmed = (value || '').trim();
  if (!trimmed) {
    return fallback;
  }

  const upper = trimmed.toUpperCase();
  if (CURRENCY_SYMBOLS[upper]) {
    return upper;
  }

  if (SYMBOL_TO_CODE[trimmed]) {
    return SYMBOL_TO_CODE[trimmed];
  }

  return fallback;
}

/**
 * Resolves a currency code or symbol to its display symbol.
 *
 * The fallback is INR, matching `normalizeCurrencyCode` above and
 * `DEFAULT_APP_CURRENCY` in lib/userPreferences.ts. It previously defaulted to USD
 * while its own sibling defaulted to INR — so any caller passing an empty or
 * undefined currency rendered `$` on an India-first app. That is what put dollar
 * signs on investments: `investmentUtils.getCurrencySymbol(assetCurrency)` hits
 * this path for any holding stored before `assetCurrency` existed, and
 * `WealthVaultDashboard` hits it on first paint before preferences have loaded.
 *
 * Pass an explicit fallback where a non-INR default is genuinely wanted; nothing
 * in the app currently does.
 */
export function getCurrencySymbol(codeOrSymbol?: string, fallback = 'INR') {
  const code = normalizeCurrencyCode(codeOrSymbol, fallback);
  return CURRENCY_SYMBOLS[code] ?? code;
}

export function getCurrencyLocale(currencyCode?: string) {
  switch (normalizeCurrencyCode(currencyCode)) {
    case 'INR':
      return 'en-IN';
    case 'EUR':
      return 'de-DE';
    case 'GBP':
      return 'en-GB';
    case 'JPY':
      return 'ja-JP';
    default:
      return 'en-US';
  }
}

export function formatCurrencyAmount(
  amount: number,
  currencyCode?: string,
  options?: Intl.NumberFormatOptions,
) {
  const code = normalizeCurrencyCode(currencyCode);
  try {
    return new Intl.NumberFormat(getCurrencyLocale(code), {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      ...options,
    }).format(Number.isFinite(amount) ? amount : 0);
  } catch {
    return `${getCurrencySymbol(code)}${(Number.isFinite(amount) ? amount : 0).toFixed(2)}`;
  }
}

export function formatNativeMoney(amount: number, currencyCode?: string) {
  const code = normalizeCurrencyCode(currencyCode);
  return `${getCurrencySymbol(code)}${new Intl.NumberFormat(getCurrencyLocale(code), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0)}`;
}

export function buildFxSymbol(fromCurrency?: string, toCurrency?: string) {
  const from = normalizeCurrencyCode(fromCurrency);
  const to = normalizeCurrencyCode(toCurrency);

  if (!from || !to || from === to) {
    return null;
  }

  return `${from}${to}=X`;
}

export function getConversionRateFromQuotes(
  fromCurrency: string | undefined,
  toCurrency: string | undefined,
  quotes: Record<string, QuoteLike>,
): number {
  const from = normalizeCurrencyCode(fromCurrency);
  const to = normalizeCurrencyCode(toCurrency);

  if (from === to) {
    return 1;
  }

  const directSymbol = buildFxSymbol(from, to);
  const directRate = directSymbol ? quotes[directSymbol]?.lastPrice : undefined;
  if (directRate && Number.isFinite(directRate) && directRate > 0) {
    return directRate;
  }

  const inverseSymbol = buildFxSymbol(to, from);
  const inverseRate = inverseSymbol ? quotes[inverseSymbol]?.lastPrice : undefined;
  if (inverseRate && Number.isFinite(inverseRate) && inverseRate > 0) {
    return 1 / inverseRate;
  }

  if (from !== 'USD' && to !== 'USD') {
    const fromToUsd = getConversionRateFromQuotes(from, 'USD', quotes);
    const usdToTarget = getConversionRateFromQuotes('USD', to, quotes);
    if (fromToUsd > 0 && usdToTarget > 0) {
      return fromToUsd * usdToTarget;
    }
  }

  return 1;
}

export function convertCurrencyAmount(
  amount: number,
  fromCurrency: string | undefined,
  toCurrency: string | undefined,
  quotes: Record<string, QuoteLike>,
) {
  return amount * getConversionRateFromQuotes(fromCurrency, toCurrency, quotes);
}

// ─── Compact / Smart Formatting ─────────────────────────────────────────────

/**
 * Format a number in Indian crore/lakh compact notation for INR,
 * or standard Intl compact notation for other currencies.
 * Returned string does NOT include the currency symbol.
 *
 * Examples (INR):
 *   125000          → "1.25L"
 *   12500000        → "1.25Cr"
 *   1234567890      → "12.35Cr"
 *   999999999999    → "9,999.99Cr"
 */
export function formatAmountCompact(amount: number, currencyCode?: string): string {
  const code = normalizeCurrencyCode(currencyCode);
  const absVal = Math.abs(amount);

  if (code === 'INR') {
    if (absVal >= 1_00_00_00_000) {
      const cr = absVal / 1_00_00_000;
      return (cr >= 1000 ? cr.toFixed(0) : cr >= 100 ? cr.toFixed(1) : cr.toFixed(2)) + 'Cr';
    }
    if (absVal >= 1_00_00_000) {
      const cr = absVal / 1_00_00_000;
      return (cr >= 10 ? cr.toFixed(1) : cr.toFixed(2)) + 'Cr';
    }
    if (absVal >= 1_00_000) {
      const l = absVal / 1_00_000;
      return (l >= 10 ? l.toFixed(1) : l.toFixed(2)) + 'L';
    }
    // Below 1L: use Indian grouping
    return new Intl.NumberFormat('en-IN', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(absVal);
  }

  // Non-INR: Intl compact
  try {
    return new Intl.NumberFormat(getCurrencyLocale(code), {
      notation: 'compact',
      maximumSignificantDigits: 3,
    }).format(absVal);
  } catch {
    return absVal.toFixed(0);
  }
}

/**
 * Returns a short formatted amount string including the currency symbol.
 * Suitable for badges, pills, and space-constrained displays.
 *
 * Examples:
 *   formatAmountShort(125000, 'INR')  → "₹1.25L"
 *   formatAmountShort(-5000, 'INR')   → "-₹5,000"
 */
export function formatAmountShort(amount: number, currencyCode?: string): string {
  const code = normalizeCurrencyCode(currencyCode);
  const symbol = getCurrencySymbol(code);
  const prefix = amount < 0 ? '-' : '';
  return `${prefix}${symbol}${formatAmountCompact(amount, code)}`;
}

/**
 * Determine the appropriate FinancialAmount size tier based on number length.
 * Useful when you need the tier value outside of the React component.
 */
export function getFinancialDisplaySize(
  amount: number,
  containerWidth?: number,
): 'xl' | 'lg' | 'md' | 'sm' | 'xs' | '2xs' {
  const w = containerWidth ?? 300;
  const numLen = Math.abs(amount).toFixed(0).length;

  if (numLen <= 7 && w >= 280) return 'xl';
  if (numLen <= 9 && w >= 200) return 'lg';
  if (numLen <= 11 && w >= 160) return 'md';
  if (numLen <= 12 && w >= 120) return 'sm';
  if (numLen <= 13) return 'xs';
  return '2xs';
}
