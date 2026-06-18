import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { validateQuery, z } from '../../middleware/validate';
import { getDashboardSummary, getCashflow } from './dashboard.controller';

const router = Router();

// month must be a real YYYY-MM string; months is bounded 1..24.
const summaryQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'month must be YYYY-MM').optional(),
});

const cashflowQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(24).optional(),
});

router.get('/summary', authMiddleware, validateQuery(summaryQuerySchema), getDashboardSummary);
router.get('/cashflow', authMiddleware, validateQuery(cashflowQuerySchema), getCashflow);

export { router as dashboardRoutes };
