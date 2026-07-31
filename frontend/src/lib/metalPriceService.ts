import { convertCurrencyAmount, normalizeCurrencyCode } from './currencyUtils';
import { fetchMultipleQuotes } from './stockApi';

/** Where a set of metal prices came from. Never guess — the UI shows this. */
export type MetalPriceSource = 'live' | 'cached' | 'unavailable';

export interface MetalPrices {
  gold: number;      // USD per gram
  silver: number;    // USD per gram
  platinum: number;  // USD per gram
  bronze: number;    // USD per gram
  lastUpdated: string;
  /** 'unavailable' means these are reference figures, NOT a market price. */
  source: MetalPriceSource;
}

const CACHE_KEY = 'family_wealth_metal_prices';
const CACHE_TS_KEY = 'family_wealth_metal_prices_ts';
const CACHE_DURATION_MS = 15 * 60 * 1000; // 15 minutes — metals move intraday

const TROY_OZ_TO_GRAM = 31.1034768;

/**
 * Yahoo futures symbols for the metals we price. These go through the app's own
 * `/api/stocks` proxy — the same path that already serves every equity quote, so
 * metals now ride on infrastructure that is proven to work rather than a separate
 * third-party API.
 */
const METAL_FUTURES_SYMBOLS = {
  gold: 'GC=F',
  silver: 'SI=F',
  platinum: 'PL=F',
} as const;

/**
 * Last-resort reference figures in USD per gram. These are NOT a price.
 *
 * They exist only so the UI has a non-zero number to render while it tells the user
 * the live price is unavailable; any result carrying them is tagged
 * `source: 'unavailable'` and must be labelled as such.
 *
 * Previously this file did something much worse: a hardcoded baseline of $77.50/g
 * for gold was passed through a `Math.sin()` "fluctuation" to fake intraday
 * movement, stamped with `lastUpdated: new Date()`, and cached for an hour — so
 * fabricated data was presented as a live quote. Gold traded at ~$131.77/g when this
 * was found, meaning holdings were valued ~41% under the real market with no
 * indication anything was wrong. Do not reintroduce synthetic prices.
 */
const REFERENCE_METAL_PRICES: Record<'gold' | 'silver' | 'platinum' | 'bronze', number> = {
  gold: 131.77,
  silver: 1.63,
  platinum: 51.40,
  bronze: 0.008,
};

/** Sanity band per gram (USD), to reject a mis-parsed or mis-scaled upstream value. */
const PLAUSIBLE_RANGE: Record<'gold' | 'silver' | 'platinum', [number, number]> = {
  gold: [20, 1000],
  silver: [0.1, 20],
  platinum: [10, 500],
};

const isPlausible = (metal: keyof typeof PLAUSIBLE_RANGE, perGram: number) => {
  const [min, max] = PLAUSIBLE_RANGE[metal];
  return Number.isFinite(perGram) && perGram >= min && perGram <= max;
};

/**
 * Fetches precious metal spot prices in USD per gram.
 *
 * Source order:
 *   1. cache (< 15 min)
 *   2. the app's own /api/stocks proxy, using Yahoo metal futures (keyless)
 *   3. GoldAPI.io / MetalpriceAPI, if a key happens to be configured
 *   4. stale cache of any age — clearly marked
 *   5. reference figures — clearly marked as NOT a market price
 *
 * Steps 4 and 5 return `source` set to 'cached'/'unavailable' so callers can label
 * them. This function never invents a price and never claims data is fresh when it
 * is not: `lastUpdated` reflects when the numbers were actually obtained.
 */
export async function fetchMetalPrices(): Promise<MetalPrices> {
  const now = Date.now();

  const readCache = (): { value: MetalPrices; ageMs: number } | null => {
    try {
      const cachedData = localStorage.getItem(CACHE_KEY);
      const cachedTs = localStorage.getItem(CACHE_TS_KEY);
      if (!cachedData || !cachedTs) return null;

      const parsed = JSON.parse(cachedData) as MetalPrices;
      if (!parsed?.gold || !parsed.silver || !parsed.platinum) return null;

      return { value: parsed, ageMs: now - Number(cachedTs) };
    } catch (error) {
      console.warn('[Metals] Could not read price cache:', error);
      return null;
    }
  };

  const cached = readCache();
  // Only serve the cache when it was a real quote. A cached 'unavailable' result is
  // a placeholder, so keep trying for a live price instead of pinning the fallback.
  if (cached && cached.ageMs < CACHE_DURATION_MS && cached.value.source !== 'unavailable') {
    return { ...cached.value, source: 'cached' };
  }

  const prices: Record<'gold' | 'silver' | 'platinum' | 'bronze', number> = {
    ...REFERENCE_METAL_PRICES,
  };
  let gotLive = false;

  if (navigator.onLine) {
    // 1. Yahoo metal futures through the app's own stock proxy.
    //
    // This is the primary source because it is keyless and rides the same
    // infrastructure that already serves every equity quote. The previous primary,
    // api.metals.live, has been shut down — it times out rather than erroring, so
    // the old code waited 4s and then silently used fabricated numbers.
    try {
      const quotes = await fetchMultipleQuotes(Object.values(METAL_FUTURES_SYMBOLS));

      for (const [metal, symbol] of Object.entries(METAL_FUTURES_SYMBOLS) as Array<
        [keyof typeof METAL_FUTURES_SYMBOLS, string]
      >) {
        const perOunce = quotes?.[symbol]?.lastPrice;
        if (typeof perOunce !== 'number' || perOunce <= 0) continue;

        const perGram = Number((perOunce / TROY_OZ_TO_GRAM).toFixed(4));
        if (isPlausible(metal, perGram)) {
          prices[metal] = perGram;
          gotLive = true;
        } else {
          console.warn(`[Metals] Rejected implausible ${metal} price: ${perGram}/g from ${perOunce}/oz`);
        }
      }
    } catch (error) {
      console.warn('[Metals] Futures quote lookup failed:', error);
    }

    // 2. GoldAPI.io — optional upgrade when a key is configured (gold only).
    if (!gotLive) {
      const goldApiKey = import.meta.env.VITE_GOLD_API_KEY;
      if (goldApiKey) {
        try {
          const response = await fetch('https://www.goldapi.io/api/XAU/USD', {
            headers: { 'x-access-token': goldApiKey },
            signal: AbortSignal.timeout(5000),
          });
          if (response.ok) {
            const data = await response.json();
            const perGram = Number.parseFloat(data?.price_gram_24k);
            if (isPlausible('gold', perGram)) {
              prices.gold = perGram;
              gotLive = true;
            }
          }
        } catch (error) {
          console.warn('[Metals] GoldAPI lookup failed:', error);
        }
      }
    }

    // 3. MetalpriceAPI — optional, covers all three when a key is configured.
    if (!gotLive) {
      const metalPriceApiKey = import.meta.env.VITE_METALPRICE_API_KEY;
      if (metalPriceApiKey) {
        try {
          const response = await fetch(
            `https://api.metalpriceapi.com/v1/latest?api_key=${metalPriceApiKey}&base=USD&currencies=XAU,XAG,XPT`,
            { signal: AbortSignal.timeout(5000) },
          );
          if (response.ok) {
            const data = await response.json();
            // Rates are metal-per-USD, so invert to get USD per ounce.
            const fromRate = (rate?: number) =>
              typeof rate === 'number' && rate > 0
                ? Number(((1 / rate) / TROY_OZ_TO_GRAM).toFixed(4))
                : Number.NaN;

            const goldPerGram = fromRate(data?.rates?.XAU);
            const silverPerGram = fromRate(data?.rates?.XAG);
            const platinumPerGram = fromRate(data?.rates?.XPT);

            if (isPlausible('gold', goldPerGram)) { prices.gold = goldPerGram; gotLive = true; }
            if (isPlausible('silver', silverPerGram)) { prices.silver = silverPerGram; gotLive = true; }
            if (isPlausible('platinum', platinumPerGram)) { prices.platinum = platinumPerGram; gotLive = true; }
          }
        } catch (error) {
          console.warn('[Metals] MetalpriceAPI lookup failed:', error);
        }
      }
    }
  }

  if (gotLive) {
    const live: MetalPrices = { ...prices, lastUpdated: new Date().toISOString(), source: 'live' };
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(live));
      localStorage.setItem(CACHE_TS_KEY, String(now));
    } catch {
      // Storage unavailable (private mode) — the price is still correct for this session.
    }
    return live;
  }

  // Nothing live. Prefer a stale real quote over reference figures, but say so —
  // `lastUpdated` keeps the ORIGINAL fetch time so the UI can show its true age.
  if (cached?.value && cached.value.source !== 'unavailable') {
    return { ...cached.value, source: 'cached' };
  }

  console.warn('[Metals] No live price available — returning reference figures, not a market quote.');
  return { ...prices, lastUpdated: new Date(0).toISOString(), source: 'unavailable' };
}

/**
 * Gets metal price per gram converted to active currency
 * @param metal 'gold' | 'silver' | 'platinum' | 'bronze'
 * @param prices Metal prices in USD per gram
 * @param targetCurrency e.g. 'INR', 'EUR', 'USD'
 * @param quotes Stock and currency quotes dictionary for conversion
 */
export function getConvertedMetalPrice(
  metal: 'gold' | 'silver' | 'platinum' | 'bronze',
  prices: MetalPrices,
  targetCurrency: string,
  quotes: Record<string, any>
): number {
  const usdPrice = prices[metal] || REFERENCE_METAL_PRICES[metal];
  
  const targetCode = normalizeCurrencyCode(targetCurrency);
  
  if (targetCode === 'USD') {
    return usdPrice;
  }

  return convertCurrencyAmount(usdPrice, 'USD', targetCode, quotes);
}
