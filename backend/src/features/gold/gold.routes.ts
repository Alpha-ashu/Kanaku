import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { pinGate } from '../../middleware/pinGate';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate';
import * as GoldController from './gold.controller';
import {
  goldCreateSchema,
  goldUpdateSchema,
  goldIdParamSchema,
  goldQuerySchema,
} from './gold.validation';

const router = Router();

router.use(authMiddleware);
router.use(pinGate); // financial data requires a live PIN unlock

router.get('/', validateQuery(goldQuerySchema), GoldController.getGoldAssets);
router.post('/', validateBody(goldCreateSchema), GoldController.createGoldAsset);
router.get('/:id', validateParams(goldIdParamSchema), GoldController.getGoldAsset);
router.put('/:id', validateParams(goldIdParamSchema), validateBody(goldUpdateSchema), GoldController.updateGoldAsset);
router.delete('/:id', validateParams(goldIdParamSchema), GoldController.deleteGoldAsset);

export { router as goldRoutes };

