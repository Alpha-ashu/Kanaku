import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate';
import * as TaxController from './tax.controller';
import {
  taxCalcCreateSchema,
  taxCalcUpdateSchema,
  taxCalcIdParamSchema,
  taxCalcQuerySchema,
} from './tax.validation';

const router = Router();

router.use(authMiddleware);

router.get('/', validateQuery(taxCalcQuerySchema), TaxController.getTaxCalculations);
router.post('/', validateBody(taxCalcCreateSchema), TaxController.createTaxCalculation);
router.get('/:id', validateParams(taxCalcIdParamSchema), TaxController.getTaxCalculation);
router.put('/:id', validateParams(taxCalcIdParamSchema), validateBody(taxCalcUpdateSchema), TaxController.updateTaxCalculation);
router.delete('/:id', validateParams(taxCalcIdParamSchema), TaxController.deleteTaxCalculation);

export { router as taxRoutes };

