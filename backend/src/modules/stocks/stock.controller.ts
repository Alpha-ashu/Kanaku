import { Request, Response, NextFunction } from 'express';
import { AppError } from '../../utils/AppError';
import { logger } from '../../config/logger';

// In-memory cache to reduce API calls and avoid Yahoo Finance rate limits
const cache = new Map<string, { data: any; expiry: number }>();
const CACHE_TTL_MS = 60 * 1000; // 1 minute cache for faster updates

//  Market category definitions 
type MarketCategory = 'nse' | 'bse' | 'us' | 'forex' | 'crypto';

const MARKET_DEFAULTS: Record<MarketCategory, string[]> = {
  nse: ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 'WIPRO', 'SBIN', 'BAJFINANCE', 'AXISBANK', 'MARUTI'],
  bse: ['RELIANCE.BO', 'TCS.BO', 'INFY.BO', 'HDFCBANK.BO', 'ICICIBANK.BO'],
  us: ['AAPL', 'TSLA', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'NFLX'],
  forex: ['INR=X', 'EURUSD=X', 'GBPUSD=X', 'USDJPY=X'],
  crypto: ['BTC-USD', 'ETH-USD', 'SOL-USD', 'BNB-USD', 'XRP-USD', 'ADA-USD'],
};

/** Map a symbol to the correct Yahoo Finance symbol */
function toYahooSymbol(symbol: string, market?: string): string {
  if (symbol.includes('.') || symbol.includes('=') || symbol.includes('^') || symbol.includes('-')) {
    return symbol;
  }
  if (market === 'bse') return `${symbol}.BO`;
  if (market === 'nse') return `${symbol}.NS`;
  if (market === 'us' || market === 'forex' || market === 'crypto') return symbol;
  if (!market) return symbol;
  return `${symbol}.NS`;
}

/** Detect exchange from Yahoo Finance metadata */
function detectExchange(meta: any, symbol: string): string {
  const eName = (meta.exchangeName || '').toUpperCase();
  if (eName.includes('BSE') || symbol.endsWith('.BO')) return 'BSE';
  if (eName.includes('NSE') || eName.includes('NSI') || symbol.endsWith('.NS')) return 'NSE';
  if (
    eName.includes('NAS') ||
    eName.includes('NYS') ||
    eName.includes('NYSE') ||
    eName.includes('NASDAQ') ||
    eName === 'NMS' ||
    eName === 'NGM' ||
    eName === 'NYQ' ||
    eName === 'PCX'
  ) return 'US';
  if (eName.includes('CCY') || symbol.includes('=X')) return 'FOREX';
  if (eName.includes('CCC') || symbol.includes('-USD')) return 'CRYPTO';
  return eName || 'NSE';
}

function getMarketState(meta: any): string {
  if (!meta.currentTradingPeriod?.regular) {
    return 'unknown';
  }
  const nowSec = Math.floor(Date.now() / 1000);
  const start = meta.currentTradingPeriod.regular.start;
  const end = meta.currentTradingPeriod.regular.end;
  return nowSec >= start && nowSec <= end ? 'open' : 'closed';
}

function currencySymbol(exchange: string): string {
  if (exchange === 'US' || exchange === 'CRYPTO' || exchange === 'FOREX') return '$';
  return '';
}

function getMockCommodityChart(ySymbol: string) {
  const sym = ySymbol.toUpperCase();
  if (sym === 'PETROL' || sym === 'DIESEL' || sym === 'LPG') {
    let price = 102.12;
    let name = 'Petrol Rate India';
    if (sym === 'DIESEL') {
      price = 95.20;
      name = 'Diesel Rate India';
    } else if (sym === 'LPG') {
      price = 913.00;
      name = 'LPG Cylinder Rate India';
    }

    const seed = new Date().getDate();
    const fluctuationPercent = (Math.sin(seed) * 0.1) / 100;
    const prevClose = price / (1 + fluctuationPercent);
    const lastPrice = price;

    return {
      meta: {
        regularMarketPrice: lastPrice,
        chartPreviousClose: prevClose,
        previousClose: prevClose,
        longName: name,
        shortName: name,
        regularMarketOpen: prevClose,
        regularMarketDayHigh: Math.max(lastPrice, prevClose) * 1.002,
        regularMarketDayLow: Math.min(lastPrice, prevClose) * 0.998,
        regularMarketVolume: 1000,
        currency: 'INR',
        exchangeName: 'MCX',
      },
      ySymbol,
    };
  }
  return null;
}

/** Fetch a single chart from Yahoo Finance. Returns result.meta or null. */
async function fetchYahooChart(ySymbol: string): Promise<{ meta: any, ySymbol: string } | null> {
  const mock = getMockCommodityChart(ySymbol);
  if (mock) return mock;
  try {
    const yhUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ySymbol)}?interval=1d&range=1d&_=${Date.now()}`;
    const up = await fetch(yhUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!up.ok) return null;
    const data = await up.json();
    const result = data?.chart?.result?.[0];
    if (!result?.meta || !result.meta.regularMarketPrice) return null;
    return { meta: result.meta, ySymbol };
  } catch {
    return null;
  }
}

export const getMarkets = (req: Request, res: Response) => {
  const market = ((req.query.market as string) || 'nse').toLowerCase() as MarketCategory;
  const symbols = MARKET_DEFAULTS[market] || MARKET_DEFAULTS.nse;
  res.json({ success: true, status: 'success', market, symbols });
};

export const searchStocks = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = (req.query.q as string) || '';
    const market = (req.query.market as string) || '';
    if (!query) {
      return res.json({ success: true, results: [] });
    }

    const cacheKey = `search_${query.toLowerCase()}_${market}`;
    const now = Date.now();

    if (cache.has(cacheKey)) {
      const cached = cache.get(cacheKey)!;
      if (now < cached.expiry) {
        return res.json(cached.data);
      }
    }

    const yhUrl = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=15`;
    const up = await fetch(yhUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000),
    });

    if (!up.ok) throw AppError.internal('Upstream search failed', 'UPSTREAM_ERROR');

    const data = await up.json();
    const quotes = data.quotes || [];

    const results = quotes
      .filter((q: any) => {
        if (!market) return true;
        const ex = (q.exchange || '').toUpperCase();
        const sym = (q.symbol || '').toUpperCase();
        switch (market.toLowerCase()) {
          case 'nse': return ex === 'NSI' || ex === 'NSE' || sym.endsWith('.NS');
          case 'bse': return ex === 'BSE' || sym.endsWith('.BO');
          case 'us': return ex === 'NMS' || ex === 'NYQ' || ex === 'NYS' || ex === 'NAS' || ex === 'NASDAQ' || ex === 'NYSE';
          case 'forex': return ex === 'CCY' || sym.includes('=X');
          case 'crypto': return ex === 'CCC' || sym.includes('-USD');
          default: return true;
        }
      })
      .slice(0, 10)
      .map((q: any) => ({
        symbol: market.toLowerCase() === 'nse'
          ? String(q.symbol).replace(/\.NS$/, '')
          : String(q.symbol),
        company_name: q.shortname || q.longname || q.symbol,
        exchange: q.exchange || '',
      }));

    const responseData = { success: true, status: 'success', results };
    cache.set(cacheKey, { data: responseData, expiry: now + CACHE_TTL_MS * 5 });

    res.json(responseData);
  } catch (error) {
    next(error);
  }
};

export const getStockQuote = async (req: Request, res: Response, next: NextFunction) => {
  try {
    let symbol = (req.query.symbol as string) || '';
    const market = (req.query.market as string) || '';
    if (!symbol) throw AppError.badRequest('Symbol is required', 'SYMBOL_REQUIRED');

    const ySymbol = toYahooSymbol(symbol, market);
    const cacheKey = `quote_${ySymbol}`;
    const now = Date.now();

    if (cache.has(cacheKey)) {
      const cached = cache.get(cacheKey)!;
      if (now < cached.expiry) {
        return res.json(cached.data);
      }
    }

    let chartResult = await fetchYahooChart(ySymbol);

    if (!chartResult && !market && !symbol.includes('.') && !symbol.includes('=') && !symbol.includes('^') && !symbol.includes('-')) {
      chartResult = await fetchYahooChart(`${symbol}.NS`);
    }

    if (!chartResult) throw AppError.notFound('Stock symbol');

    const m = chartResult.meta;
    const lastPrice = m.regularMarketPrice ?? 0;
    const prevClose = m.chartPreviousClose ?? m.previousClose ?? lastPrice;
    const change = lastPrice - prevClose;
    const percentChange = prevClose ? (change / prevClose) * 100 : 0;
    const exchange = detectExchange(m, chartResult.ySymbol);

    const responseData = {
      success: true,
      status: 'success',
      symbol,
      exchange,
      currency: currencySymbol(exchange),
      marketState: getMarketState(m),
      data: {
        company_name: m.longName || m.shortName || symbol,
        last_price: lastPrice,
        change,
        percent_change: percentChange,
        previous_close: prevClose,
        open: m.regularMarketOpen ?? 0,
        day_high: m.regularMarketDayHigh ?? 0,
        day_low: m.regularMarketDayLow ?? 0,
        year_high: m.fiftyTwoWeekHigh ?? 0,
        year_low: m.fiftyTwoWeekLow ?? 0,
        volume: m.regularMarketVolume ?? 0,
        last_update: new Date().toISOString(),
      },
    };

    cache.set(cacheKey, { data: responseData, expiry: now + CACHE_TTL_MS });
    res.json(responseData);
  } catch (error) {
    next(error);
  }
};

export const getBatchQuotes = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const symbolsParam = (req.query.symbols as string) || '';
    const market = (req.query.market as string) || '';
    if (!symbolsParam) throw AppError.badRequest('Symbols are required', 'SYMBOLS_REQUIRED');

    const symbols = symbolsParam.split(',').map(s => s.trim()).filter(Boolean).slice(0, 20);
    const results: Record<string, any> = {};

    await Promise.allSettled(
      symbols.map(async (symbol) => {
        const ySymbol = toYahooSymbol(symbol, market);
        const cacheKey = `quote_${ySymbol}`;
        const now = Date.now();

        if (cache.has(cacheKey)) {
          const cached = cache.get(cacheKey)!;
          if (now < cached.expiry) {
            results[symbol] = cached.data;
            return;
          }
        }

        const chartResult = await fetchYahooChart(ySymbol) || 
          (!market && !symbol.includes('.') ? await fetchYahooChart(`${symbol}.NS`) : null);

        if (!chartResult) {
          results[symbol] = null;
          return;
        }

        const m = chartResult.meta;
        const lastPrice = m.regularMarketPrice ?? 0;
        const prevClose = m.chartPreviousClose ?? m.previousClose ?? lastPrice;
        const exchange = detectExchange(m, chartResult.ySymbol);

        const responseData = {
          success: true,
          status: 'success',
          symbol,
          exchange,
          currency: currencySymbol(exchange),
          marketState: getMarketState(m),
          data: {
            company_name: m.longName || m.shortName || symbol,
            last_price: lastPrice,
            change: lastPrice - prevClose,
            percent_change: prevClose ? ((lastPrice - prevClose) / prevClose) * 100 : 0,
            previous_close: prevClose,
            open: m.regularMarketOpen ?? 0,
            day_high: m.regularMarketDayHigh ?? 0,
            day_low: m.regularMarketDayLow ?? 0,
            volume: m.regularMarketVolume ?? 0,
            last_update: new Date().toISOString(),
          },
        };

        cache.set(cacheKey, { data: responseData, expiry: now + CACHE_TTL_MS });
        results[symbol] = responseData;
      })
    );

    res.json({ success: true, status: 'success', results });
  } catch (error) {
    next(error);
  }
};
