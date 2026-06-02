import { getConversionRateFromQuotes } from '@/lib/currencyUtils';
import type { StockQuote } from '@/lib/stockApi';

export type FlashAssetKind = 'local' | 'global' | 'commodity' | 'forex' | 'crypto';
export type FlashTone = 'bullish' | 'bearish' | 'local' | 'global' | 'commodity' | 'forex' | 'crypto';

export interface FlashAsset {
  symbol: string;
  label: string;
  kind: FlashAssetKind;
}

export interface FlashItem {
  id: string;
  badge: string;
  label: string;
  displayLabel?: string;
  symbol: string;
  kind: FlashAssetKind;
  tone: FlashTone;
  quote: StockQuote;
  displayPriceText?: string;
}

interface CountryFlashProfile {
  label: string;
  localAssets: FlashAsset[];
  supportAssets?: FlashAsset[];
}

const GLOBAL_ASSETS: FlashAsset[] = [
  { symbol: 'AAPL.US', label: 'Apple', kind: 'global' },
  { symbol: 'MSFT.US', label: 'Microsoft', kind: 'global' },
  { symbol: 'NVDA.US', label: 'NVIDIA', kind: 'global' },
  { symbol: 'AMZN.US', label: 'Amazon', kind: 'global' },
];

const COMMODITY_ASSETS: FlashAsset[] = [
  { symbol: 'GC=F', label: 'Gold', kind: 'commodity' },
  { symbol: 'SI=F', label: 'Silver', kind: 'commodity' },
  { symbol: 'CL=F', label: 'Oil', kind: 'commodity' },
];

const CRYPTO_ASSETS: FlashAsset[] = [
  { symbol: 'BTC-USD', label: 'Bitcoin', kind: 'crypto' },
  { symbol: 'ETH-USD', label: 'Ethereum', kind: 'crypto' },
];

const COUNTRY_ALIASES: Record<string, string> = {
  usa: 'united states',
  us: 'united states',
  uk: 'united kingdom',
  england: 'united kingdom',
  bharat: 'india',
};

const COUNTRY_FLASH_PROFILES: Record<string, CountryFlashProfile> = {
  india: {
    label: 'India',
    localAssets: [
      { symbol: '^BSESN', label: 'SENSEX', kind: 'local' },
      { symbol: '^NSEI', label: 'NIFTY 50', kind: 'local' },
      { symbol: 'RELIANCE.NS', label: 'Reliance', kind: 'local' },
      { symbol: 'TCS.NS', label: 'TCS', kind: 'local' },
      { symbol: 'INFY.NS', label: 'Infosys', kind: 'local' },
      { symbol: 'HDFCBANK.NS', label: 'HDFC Bank', kind: 'local' },
      { symbol: 'RELIANCE.BO', label: 'Reliance BSE', kind: 'local' },
    ],
    supportAssets: [
      { symbol: 'USDINR=X', label: 'USD/INR', kind: 'forex' },
      { symbol: 'PETROL', label: 'Petrol', kind: 'commodity' },
      { symbol: 'DIESEL', label: 'Diesel', kind: 'commodity' },
      { symbol: 'LPG', label: 'LPG', kind: 'commodity' },
    ],
  },
  'united states': {
    label: 'US',
    localAssets: [
      { symbol: 'AAPL.US', label: 'Apple', kind: 'local' },
      { symbol: 'MSFT.US', label: 'Microsoft', kind: 'local' },
      { symbol: 'NVDA.US', label: 'NVIDIA', kind: 'local' },
      { symbol: 'TSLA.US', label: 'Tesla', kind: 'local' },
      { symbol: 'AMZN.US', label: 'Amazon', kind: 'local' },
    ],
  },
  'united kingdom': {
    label: 'UK',
    localAssets: [
      { symbol: 'SHEL.L', label: 'Shell', kind: 'local' },
      { symbol: 'HSBA.L', label: 'HSBC', kind: 'local' },
      { symbol: 'AZN.L', label: 'AstraZeneca', kind: 'local' },
      { symbol: 'BP.L', label: 'BP', kind: 'local' },
      { symbol: 'VOD.L', label: 'Vodafone', kind: 'local' },
    ],
  },
  canada: {
    label: 'Canada',
    localAssets: [
      { symbol: 'SHOP.TO', label: 'Shopify', kind: 'local' },
      { symbol: 'RY.TO', label: 'Royal Bank', kind: 'local' },
      { symbol: 'TD.TO', label: 'TD Bank', kind: 'local' },
      { symbol: 'ENB.TO', label: 'Enbridge', kind: 'local' },
      { symbol: 'BNS.TO', label: 'Scotiabank', kind: 'local' },
    ],
  },
  australia: {
    label: 'Australia',
    localAssets: [
      { symbol: 'CBA.AX', label: 'CBA', kind: 'local' },
      { symbol: 'BHP.AX', label: 'BHP', kind: 'local' },
      { symbol: 'CSL.AX', label: 'CSL', kind: 'local' },
      { symbol: 'WBC.AX', label: 'Westpac', kind: 'local' },
      { symbol: 'NAB.AX', label: 'NAB', kind: 'local' },
    ],
  },
  germany: {
    label: 'Germany',
    localAssets: [
      { symbol: 'SAP.DE', label: 'SAP', kind: 'local' },
      { symbol: 'SIE.DE', label: 'Siemens', kind: 'local' },
      { symbol: 'BMW.DE', label: 'BMW', kind: 'local' },
      { symbol: 'MBG.DE', label: 'Mercedes', kind: 'local' },
      { symbol: 'ALV.DE', label: 'Allianz', kind: 'local' },
    ],
  },
  singapore: {
    label: 'Singapore',
    localAssets: [
      { symbol: 'D05.SI', label: 'DBS', kind: 'local' },
      { symbol: 'O39.SI', label: 'OCBC', kind: 'local' },
      { symbol: 'U11.SI', label: 'UOB', kind: 'local' },
      { symbol: 'Z74.SI', label: 'Singtel', kind: 'local' },
      { symbol: 'C6L.SI', label: 'SIA', kind: 'local' },
    ],
  },
};

const FX_BY_CURRENCY: Record<string, FlashAsset> = {
  INR: { symbol: 'USDINR=X', label: 'USD/INR', kind: 'forex' },
  USD: { symbol: 'EURUSD=X', label: 'EUR/USD', kind: 'forex' },
  GBP: { symbol: 'GBPUSD=X', label: 'GBP/USD', kind: 'forex' },
  EUR: { symbol: 'EURUSD=X', label: 'EUR/USD', kind: 'forex' },
  JPY: { symbol: 'USDJPY=X', label: 'USD/JPY', kind: 'forex' },
  AUD: { symbol: 'AUDUSD=X', label: 'AUD/USD', kind: 'forex' },
  CAD: { symbol: 'USDCAD=X', label: 'USD/CAD', kind: 'forex' },
  SGD: { symbol: 'USDSGD=X', label: 'USD/SGD', kind: 'forex' },
  CHF: { symbol: 'USDCHF=X', label: 'USD/CHF', kind: 'forex' },
};

function normalizeCountry(country?: string | null) {
  const normalized = (country || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

  return COUNTRY_ALIASES[normalized] || normalized;
}

export function inferCountryFromCurrency(currency: string) {
  switch ((currency || '').toUpperCase()) {
    case 'INR':
      return 'India';
    case 'USD':
      return 'United States';
    case 'GBP':
      return 'United Kingdom';
    case 'CAD':
      return 'Canada';
    case 'AUD':
      return 'Australia';
    case 'EUR':
      return 'Germany';
    case 'SGD':
      return 'Singapore';
    default:
      return 'Global';
  }
}

export function getFlashAssets(country: string | undefined, currency: string) {
  const countryKey = normalizeCountry(country);
  const profile = COUNTRY_FLASH_PROFILES[countryKey];
  const fxAsset = FX_BY_CURRENCY[(currency || '').toUpperCase()] || FX_BY_CURRENCY.USD;

  return {
    countryLabel: profile?.label || inferCountryFromCurrency(currency),
    assets: [
      ...(profile?.localAssets || []),
      ...(profile?.supportAssets || []),
      ...GLOBAL_ASSETS,
      ...COMMODITY_ASSETS,
      fxAsset,
      ...CRYPTO_ASSETS,
    ],
  };
}

function getToneForKind(kind: FlashAssetKind): FlashTone {
  switch (kind) {
    case 'commodity':
      return 'commodity';
    case 'forex':
      return 'forex';
    case 'crypto':
      return 'crypto';
    case 'global':
      return 'global';
    default:
      return 'local';
  }
}

function dedupeBySymbol(items: FlashAsset[]) {
  const seen = new Set<string>();

  return items.filter(item => {
    if (seen.has(item.symbol)) {
      return false;
    }

    seen.add(item.symbol);
    return true;
  });
}

const TROY_OUNCE_TO_GRAMS = 31.1034768;
const GOLD_22K_PURITY_FACTOR = 22 / 24;
const INDIA_GOLD_MARKUP_FACTOR = 1.1195; // Customs + GST + Premium (₹14,320/gm)
const INDIA_SILVER_MARKUP_FACTOR = 1.192; // Customs + GST + Premium (₹2,80,000/kg)

function formatIndianCommodityPrice(amount: number, unit: string) {
  return `INR${new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: amount >= 1000 ? 0 : 2,
  }).format(amount)}/${unit}`;
}

function getCommodityDisplayOverrides(
  asset: FlashAsset,
  quote: StockQuote,
  quotes: Record<string, StockQuote | null>,
  countryLabel: string,
) {
  if (asset.symbol === 'PETROL') {
    return {
      displayLabel: 'Petrol',
      displayPriceText: `INR${quote.lastPrice.toFixed(2)}/L`,
    };
  }

  if (asset.symbol === 'DIESEL') {
    return {
      displayLabel: 'Diesel',
      displayPriceText: `INR${quote.lastPrice.toFixed(2)}/L`,
    };
  }

  if (asset.symbol === 'LPG') {
    return {
      displayLabel: 'LPG',
      displayPriceText: `INR${Math.round(quote.lastPrice)}/cyl`,
    };
  }

  if (countryLabel === 'India') {
    const usdInr = getConversionRateFromQuotes('USD', 'INR', quotes);
    if (usdInr > 0) {
      if (asset.label === 'Gold') {
        const inrPerGram22k = (quote.lastPrice * usdInr / TROY_OUNCE_TO_GRAMS) * GOLD_22K_PURITY_FACTOR * INDIA_GOLD_MARKUP_FACTOR;
        return {
          displayLabel: '22k Gold',
          displayPriceText: formatIndianCommodityPrice(inrPerGram22k, 'gm'),
        };
      }

      if (asset.label === 'Silver') {
        const inrPerKg = (quote.lastPrice * usdInr / TROY_OUNCE_TO_GRAMS) * 1000 * INDIA_SILVER_MARKUP_FACTOR;
        return {
          displayLabel: 'Silver',
          displayPriceText: formatIndianCommodityPrice(inrPerKg, 'kg'),
        };
      }
    }
  }

  if (asset.label === 'Oil') {
    return {
      displayLabel: 'Crude Oil',
    };
  }

  return {};
}

export function buildFlashItems(
  quotes: Record<string, StockQuote | null>,
  assets: FlashAsset[],
  countryLabel: string,
): FlashItem[] {
  const available = dedupeBySymbol(assets)
    .map(asset => {
      const quote = quotes[asset.symbol];
      return quote && Number.isFinite(quote.lastPrice) && quote.lastPrice > 0
        ? { ...asset, quote }
        : null;
    })
    .filter((item): item is FlashAsset & { quote: StockQuote } => Boolean(item));

  const stocks = available.filter(item => item.kind === 'local' || item.kind === 'global');
  const locals = available.filter(item => item.kind === 'local');
  const globals = available.filter(item => item.kind === 'global');
  const commodities = available.filter(item => item.kind === 'commodity');
  const forex = available.find(item => item.kind === 'forex');
  const crypto = available.filter(item => item.kind === 'crypto');

  const byBest = <T extends { quote: StockQuote }>(items: T[]) =>
    [...items].sort((a, b) => b.quote.percentChange - a.quote.percentChange);
  const byWorst = <T extends { quote: StockQuote }>(items: T[]) =>
    [...items].sort((a, b) => a.quote.percentChange - b.quote.percentChange);

  const usedSymbols = new Set<string>();
  const output: FlashItem[] = [];

  const pushItem = (
    source: (FlashAsset & { quote: StockQuote }) | undefined,
    badge: string,
    tone: FlashTone,
  ) => {
    if (!source || usedSymbols.has(source.symbol)) {
      return;
    }

    usedSymbols.add(source.symbol);
    const displayOverrides = getCommodityDisplayOverrides(source, source.quote, quotes, countryLabel);
    output.push({
      id: `${badge}-${source.symbol}`,
      badge,
      label: source.label,
      displayLabel: displayOverrides.displayLabel,
      symbol: source.symbol,
      kind: source.kind,
      tone,
      quote: source.quote,
      displayPriceText: displayOverrides.displayPriceText,
    });
  };

  const topBullish = byBest(stocks)[0];
  const topBearish = byWorst(stocks)[0];
  const localLeader = byBest(locals)[0];
  const globalLeader = byBest(globals)[0];
  const cryptoLeader = byBest(crypto)[0];

  pushItem(topBullish, 'Top Bullish', topBullish?.quote.percentChange >= 0 ? 'bullish' : 'local');
  pushItem(topBearish, 'Top Bearish', 'bearish');
  pushItem(localLeader, `${countryLabel} Lead`, localLeader?.quote.percentChange >= 0 ? 'local' : 'bearish');
  pushItem(globalLeader, 'Global Lead', globalLeader?.quote.percentChange >= 0 ? 'global' : 'bearish');

  const commodityPriority = ['Gold', 'Silver', 'Oil'];
  for (const commodityLabel of commodityPriority) {
    pushItem(
      commodities.find(item => item.label === commodityLabel),
      'Commodity',
      'commodity',
    );
  }

  pushItem(forex, 'FX Pulse', 'forex');
  pushItem(cryptoLeader, 'Crypto Pulse', 'crypto');

  if (output.length < 7) {
    for (const fallback of byBest(available)) {
      pushItem(fallback, 'Live', getToneForKind(fallback.kind));
      if (output.length >= 8) {
        break;
      }
    }
  }

  return output;
}

export function formatFlashPrice(item: FlashItem) {
  if (item.displayPriceText) {
    return item.displayPriceText;
  }

  if (item.kind === 'forex') {
    const value = item.quote.lastPrice;
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: value >= 100 ? 2 : 4,
      maximumFractionDigits: value >= 100 ? 2 : 4,
    }).format(value);
  }

  const currency = item.quote.currency || '$';
  const locale = currency === 'INR' ? 'en-IN' : 'en-US';
  return `${currency}${new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(item.quote.lastPrice)}`;
}
