import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// vi.mock is hoisted above the module body, so the stub has to be created inside
// vi.hoisted() rather than as a plain top-level const.
const { fetchMultipleQuotes } = vi.hoisted(() => ({ fetchMultipleQuotes: vi.fn() }));
vi.mock('@/lib/stockApi', () => ({ fetchMultipleQuotes }));

import { fetchMetalPrices } from '@/lib/metalPriceService';

const TROY_OZ = 31.1034768;

/**
 * Metal pricing must never fabricate a number and present it as a quote.
 *
 * The original implementation held a hardcoded $77.50/g gold baseline, ran it
 * through `Math.sin()` to fake intraday movement, stamped `lastUpdated` with the
 * current time, and cached it for an hour. Gold was trading near $131.77/g, so
 * holdings were valued ~41% under the market with a "Live spot rates" label on
 * screen and no way for a user to tell. Its only keyless upstream, api.metals.live,
 * had been shut down — it times out rather than failing fast, so the fabricated
 * path was the normal path.
 */
/**
 * In-memory localStorage.
 *
 * Node 26 ships a built-in `localStorage` that is disabled without
 * `--localstorage-file`, and it shadows the jsdom one — so `localStorage` is
 * genuinely `undefined` under this suite. The service tolerates that (every access
 * is wrapped), but the cache behaviour below cannot be exercised without a real
 * store, so provide one.
 */
const createMemoryStorage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, String(value)); },
    removeItem: (key: string) => { data.delete(key); },
    clear: () => { data.clear(); },
    key: (index: number) => [...data.keys()][index] ?? null,
    get length() { return data.size; },
  } as Storage;
};

describe('metal price service', () => {
  beforeEach(() => {
    fetchMultipleQuotes.mockReset();
    vi.stubGlobal('localStorage', createMemoryStorage());
    vi.stubGlobal('navigator', { onLine: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('converts live futures quotes from per-ounce to per-gram', async () => {
    fetchMultipleQuotes.mockResolvedValue({
      'GC=F': { lastPrice: 4098.6 },
      'SI=F': { lastPrice: 50.7 },
      'PL=F': { lastPrice: 1600 },
    });

    const prices = await fetchMetalPrices();

    expect(prices.source).toBe('live');
    expect(prices.gold).toBeCloseTo(4098.6 / TROY_OZ, 2);
    expect(prices.silver).toBeCloseTo(50.7 / TROY_OZ, 2);
    expect(prices.platinum).toBeCloseTo(1600 / TROY_OZ, 2);
  });

  it('reports unavailable rather than inventing a price when every source fails', async () => {
    fetchMultipleQuotes.mockRejectedValue(new Error('proxy down'));

    const prices = await fetchMetalPrices();

    expect(prices.source).toBe('unavailable');
    // The old code returned a fresh timestamp on fabricated data, which is what made
    // the fallback indistinguishable from a real quote.
    expect(new Date(prices.lastUpdated).getTime()).toBe(0);
  });

  it('never returns the old fabricated baseline as a live price', async () => {
    fetchMultipleQuotes.mockResolvedValue({});

    const prices = await fetchMetalPrices();

    expect(prices.source).not.toBe('live');
    expect(prices.gold).not.toBeCloseTo(77.5, 1);
  });

  it('rejects an implausible upstream value instead of trusting it', async () => {
    // A mis-scaled feed (per-kilo, or a decimal slip) must not silently reprice a
    // portfolio. 4.09 USD/oz would imply ~0.13 USD/g of gold.
    fetchMultipleQuotes.mockResolvedValue({ 'GC=F': { lastPrice: 4.0986 } });

    const prices = await fetchMetalPrices();

    expect(prices.source).toBe('unavailable');
  });

  it('serves a fresh cache without refetching, marked as cached', async () => {
    fetchMultipleQuotes.mockResolvedValue({ 'GC=F': { lastPrice: 4098.6 } });
    const first = await fetchMetalPrices();
    expect(first.source).toBe('live');

    fetchMultipleQuotes.mockClear();
    const second = await fetchMetalPrices();

    expect(fetchMultipleQuotes).not.toHaveBeenCalled();
    expect(second.source).toBe('cached');
    expect(second.gold).toBeCloseTo(first.gold, 4);
  });

  it('prefers a stale real quote over reference figures when offline', async () => {
    fetchMultipleQuotes.mockResolvedValue({ 'GC=F': { lastPrice: 4098.6 } });
    const live = await fetchMetalPrices();

    // Age the cache past its window, then go offline.
    localStorage.setItem('family_wealth_metal_prices_ts', String(Date.now() - 60 * 60 * 1000));
    vi.stubGlobal('navigator', { onLine: false });

    const stale = await fetchMetalPrices();

    expect(stale.source).toBe('cached');
    expect(stale.gold).toBeCloseTo(live.gold, 4);
    // The original fetch time is preserved so the UI can show the true age.
    expect(stale.lastUpdated).toBe(live.lastUpdated);
  });
});
