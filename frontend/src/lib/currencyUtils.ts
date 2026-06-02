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

export function normalizeCurrencyCode(value?: string, fallback = 'USD') {
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

export function getCurrencySymbol(codeOrSymbol?: string, fallback = 'USD') {
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
