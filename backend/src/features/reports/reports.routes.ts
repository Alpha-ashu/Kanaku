import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { pinGate } from '../../middleware/pinGate';
import { requireFeature } from '../../middleware/featureGate';
import * as ReportsController from './reports.controller';

const router = Router();

router.use(authMiddleware);
router.use(pinGate); // financial data requires a live PIN unlock

router.get('/export/pdf', requireFeature('reports', 'pdfExport'), ReportsController.exportPDF);
router.get('/export/excel', requireFeature('reports', 'excelExport'), ReportsController.exportExcel);
router.get('/export/csv', requireFeature('reports', 'csvExport'), ReportsController.exportCSV);
router.get('/ai-insights', requireFeature('reports', 'aiInsightsReport'), ReportsController.getAIInsights);
router.get('/forecast', requireFeature('reports', 'forecasting'), ReportsController.getForecast);

export { router as reportsRoutes };
