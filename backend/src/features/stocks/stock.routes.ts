import { Router } from 'express';
import * as stockController from './stock.controller';
import { authMiddleware } from '../../middleware/auth';

const router = Router();

// Market data routes (public or semi-public)
router.get('/markets', stockController.getMarkets);
router.get('/search', stockController.searchStocks);
router.get('/stock', stockController.getStockQuote);
router.get('/batch', stockController.getBatchQuotes);

export { router as stockRoutes };
