import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { getDashboardSummary, getCashflow } from './dashboard.controller';

const router = Router();

router.get('/summary', authMiddleware, getDashboardSummary);
router.get('/cashflow', authMiddleware, getCashflow);

export { router as dashboardRoutes };
