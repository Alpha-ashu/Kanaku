import { Router } from 'express';
import * as stockController from './stock.controller';
import { authMiddleware } from '../../middleware/auth';
import { validateQuery, z } from '../../middleware/validate';

const router = Router();

const MARKETS = ['nse', 'bse', 'us', 'forex', 'crypto', 'commodities'] as const;

// Symbols/tickers are conservative: letters, digits and the few chars Yahoo
// Finance uses (. = exchange suffix, - = crypto pair, = ^ for indices).
// Length caps + character whitelist defuse any path/query injection upstream.
const symbolRegex = /^[A-Za-z0-9.\-=^]+$/;
const searchRegex = /^[A-Za-z0-9 .\-=^&]+$/;

const marketsQuery = z.object({
  market: z.enum(MARKETS).optional(),
});

const searchQuery = z.object({
  q: z.string().min(1).max(64).regex(searchRegex, 'invalid search query').optional(),
  market: z.enum(MARKETS).optional(),
});

const stockQuery = z.object({
  symbol: z.string().min(1).max(20).regex(symbolRegex, 'invalid symbol'),
  market: z.enum(MARKETS).optional(),
});

const batchQuery = z.object({
  symbols: z.string()
    .min(1)
    .max(500)
    // Comma-separated list of symbols (≤ 20, enforced again in controller).
    .regex(/^[A-Za-z0-9.\-=^,\s]+$/, 'invalid symbols list'),
  market: z.enum(MARKETS).optional(),
});

// Market data routes (public or semi-public)
router.get('/markets', validateQuery(marketsQuery), stockController.getMarkets);
router.get('/search', validateQuery(searchQuery), stockController.searchStocks);
router.get('/stock', validateQuery(stockQuery), stockController.getStockQuote);
router.get('/batch', validateQuery(batchQuery), stockController.getBatchQuotes);

export { router as stockRoutes };
