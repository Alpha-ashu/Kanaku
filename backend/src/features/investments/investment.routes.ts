import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { pinGate } from '../../middleware/pinGate';
import { validateBody, validateParams } from '../../middleware/validate';
import { requireFeature } from '../../middleware/featureGate';
import { idempotency } from '../../middleware/idempotency';
import * as InvestmentController from './investment.controller';
import { investmentCreateSchema, investmentIdParamSchema, investmentUpdateSchema } from './investment.validation';

const router = Router();

router.use(authMiddleware);
router.use(pinGate); // financial data requires a live PIN unlock
router.use(requireFeature('investments'));

// Core CRUD
router.get('/', InvestmentController.getInvestments);
router.get('/:id', validateParams(investmentIdParamSchema), InvestmentController.getInvestment);
router.post(
  '/',
  idempotency({ scope: 'investments.create' }),
  requireFeature('investments', 'addInvestment'),
  validateBody(investmentCreateSchema),
  InvestmentController.createInvestment,
);
router.put(
  '/:id',
  idempotency({ scope: 'investments.update' }),
  requireFeature('investments', 'addInvestment'),
  validateParams(investmentIdParamSchema),
  validateBody(investmentUpdateSchema),
  InvestmentController.updateInvestment,
);
router.delete('/:id', requireFeature('investments', 'addInvestment'), validateParams(investmentIdParamSchema), InvestmentController.deleteInvestment);

// Portfolio Analytics — aggregated metrics, P&L, allocation breakdown
router.get('/analytics/portfolio', requireFeature('investments', 'portfolioAnalytics'), InvestmentController.getPortfolioAnalytics);

// SIP Tracking — systematic investment plan positions
router.get('/sip/list', requireFeature('investments', 'sipTracking'), InvestmentController.getSIPInvestments);

// Group Investments — investments linked to a group
router.get('/group/list', requireFeature('investments', 'groupInvestments'), InvestmentController.getGroupInvestments);

export { router as investmentRoutes };

