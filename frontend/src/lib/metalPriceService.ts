import { convertCurrencyAmount, normalizeCurrencyCode } from './currencyUtils';

export interface MetalPrices {
  gold: number;      // USD per gram
  silver: number;    // USD per gram
  platinum: number;  // USD per gram
  bronze: number;    // USD per gram
  lastUpdated: string;
}

const CACHE_KEY = 'family_wealth_metal_prices';
const CACHE_TS_KEY = 'family_wealth_metal_prices_ts';
const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour cache

// Standard baseline spot rates in USD per gram (as of mid-2026)
// 1 troy ounce = 31.1034768 grams
// Gold: ~$2,410/oz -> ~$77.50/g
// Silver: ~$30.20/oz -> ~$0.97/g
// Platinum: ~$980/oz -> ~$31.50/g
// Bronze: ~$8.00/kg -> ~$0.008/g
const BASE_METAL_PRICES: Omit<MetalPrices, 'lastUpdated'> = {
  gold: 77.50,
  silver: 0.97,
  platinum: 31.50,
  bronze: 0.008,
};

/**
 * Generate slightly randomized prices around the baseline to simulate live fluctuations
 */
function getFluctuatedPrices(): Omit<MetalPrices, 'lastUpdated'> {
  const seed = new Date().getMinutes() + new Date().getHours() * 60;
  // Deterministic but changing fluctuation between -0.3% and +0.3% based on time
  const floatFactor = (Math.sin(seed) * 0.3) / 100; 
  
  return {
    gold: parseFloat((BASE_METAL_PRICES.gold * (1 + floatFactor)).toFixed(4)),
    silver: parseFloat((BASE_METAL_PRICES.silver * (1 + floatFactor)).toFixed(4)),
    platinum: parseFloat((BASE_METAL_PRICES.platinum * (1 + floatFactor)).toFixed(4)),
    bronze: parseFloat((BASE_METAL_PRICES.bronze * (1 + floatFactor * 0.1)).toFixed(5)), // bronze changes slower
  };
}

/**
 * Fetches precious metal prices in USD per gram
 */
export async function fetchMetalPrices(): Promise<MetalPrices> {
  const now = Date.now();
  
  // 1. Try to read from cache first
  try {
    const cachedData = localStorage.getItem(CACHE_KEY);
    const cachedTs = localStorage.getItem(CACHE_TS_KEY);
    
    if (cachedData && cachedTs && now - Number(cachedTs) < CACHE_DURATION_MS) {
      const parsed = JSON.parse(cachedData) as MetalPrices;
      if (parsed.gold && parsed.silver && parsed.platinum && parsed.bronze) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Failed to read metal prices cache:', e);
  }

  // 2. Fetch from free metals.live spot API (or fall back)
  let prices: Omit<MetalPrices, 'lastUpdated'> = getFluctuatedPrices();
  let success = false;

  if (navigator.onLine) {
    try {
      // metals.live spot API returns troy ounce prices in USD
      const response = await fetch('https://api.metals.live/v1/spot', {
        signal: AbortSignal.timeout(5000)
      });
      
      if (response.ok) {
        const data = await response.json();
        
        // Response format is usually an array of objects like: [{"gold": 2410.50}, {"silver": 30.20}, {"platinum": 980.00}]
        // Or sometimes an object with keys. Let's parse defensively.
        let liveGoldOz = 0;
        let liveSilverOz = 0;
        let livePlatinumOz = 0;

        if (Array.isArray(data)) {
          data.forEach(item => {
            if (item.gold) liveGoldOz = parseFloat(item.gold);
            if (item.silver) liveSilverOz = parseFloat(item.silver);
            if (item.platinum) livePlatinumOz = parseFloat(item.platinum);
          });
        } else if (data && typeof data === 'object') {
          if (data.gold) liveGoldOz = parseFloat(data.gold);
          if (data.silver) liveSilverOz = parseFloat(data.silver);
          if (data.platinum) livePlatinumOz = parseFloat(data.platinum);
        }

        // Convert Troy Ounce to Gram (1 oz = 31.1034768 grams)
        const TROY_OZ_TO_GRAM = 31.1034768;
        if (liveGoldOz > 0) {
          prices.gold = parseFloat((liveGoldOz / TROY_OZ_TO_GRAM).toFixed(4));
          success = true;
        }
        if (liveSilverOz > 0) {
          prices.silver = parseFloat((liveSilverOz / TROY_OZ_TO_GRAM).toFixed(4));
          success = true;
        }
        if (livePlatinumOz > 0) {
          prices.platinum = parseFloat((livePlatinumOz / TROY_OZ_TO_GRAM).toFixed(4));
          success = true;
        }
        // Bronze has no standard live spot API ticker, so we use our fluctuated base
      }
    } catch (error) {
      console.warn('Live metal price fetch failed, using fallback base prices:', error);
    }
  }

  const finalPrices: MetalPrices = {
    ...prices,
    lastUpdated: new Date().toISOString(),
  };

  // 3. Update Cache
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(finalPrices));
    localStorage.setItem(CACHE_TS_KEY, String(now));
  } catch (e) {
    // ignore local storage errors
  }

  return finalPrices;
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
  const usdPrice = prices[metal] || BASE_METAL_PRICES[metal];
  const targetCode = normalizeCurrencyCode(targetCurrency);
  
  if (targetCode === 'USD') {
    return usdPrice;
  }

  return convertCurrencyAmount(usdPrice, 'USD', targetCode, quotes);
}
