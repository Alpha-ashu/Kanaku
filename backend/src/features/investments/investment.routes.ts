import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { pinGate } from '../../middleware/pinGate';
import { validateBody, validateParams } from '../../middleware/validate';
import * as InvestmentController from './investment.controller';
import { investmentCreateSchema, investmentIdParamSchema, investmentUpdateSchema } from './investment.validation';

const router = Router();

router.use(authMiddleware);
router.use(pinGate); // financial data requires a live PIN unlock

router.get('/', InvestmentController.getInvestments);
router.get('/:id', validateParams(investmentIdParamSchema), InvestmentController.getInvestment);
router.post('/', validateBody(investmentCreateSchema), InvestmentController.createInvestment);
router.put('/:id', validateParams(investmentIdParamSchema), validateBody(investmentUpdateSchema), InvestmentController.updateInvestment);
router.delete('/:id', validateParams(investmentIdParamSchema), InvestmentController.deleteInvestment);

export { router as investmentRoutes };
