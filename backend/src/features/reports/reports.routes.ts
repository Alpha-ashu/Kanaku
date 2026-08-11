import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { pinGate } from '../../middleware/pinGate';
import { requireFeature } from '../../middleware/featureGate';
import * as ReportsController from './reports.controller';

const router = Router();

router.use(authMiddleware);
router.use(pinGate); // financial data requires a live PIN unlock

// /export/pdf and /export/excel are gone — they returned mock file contents.
// See the note at the top of reports.controller.ts.
router.get('/export/csv', requireFeature('reports', 'csvExport'), ReportsController.exportCSV);
router.get('/ai-insights', requireFeature('reports', 'aiInsightsReport'), ReportsController.getAIInsights);
router.get('/forecast', requireFeature('reports', 'forecasting'), ReportsController.getForecast);

export { router as reportsRoutes };
