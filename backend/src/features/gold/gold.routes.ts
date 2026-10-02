import { Router } from 'express';
import { authMiddleware, requireVerifiedForWrites } from '../../middleware/auth';
import { pinGate } from '../../middleware/pinGate';
import { requireFeature } from '../../middleware/featureGate';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate';
import { idempotency } from '../../middleware/idempotency';
import { duplicateSubmitGuard } from '../../middleware/duplicateSubmitGuard';
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
router.use(requireVerifiedForWrites); // View-Only Mode: reads only
router.use(requireFeature('investments')); // the web app gates Add Gold under Investments

router.get('/', validateQuery(goldQuerySchema), GoldController.getGoldAssets);
router.post(
  '/',
  idempotency({ scope: 'gold.create' }),
  validateBody(goldCreateSchema),
  duplicateSubmitGuard({ scope: 'gold.create' }),
  GoldController.createGoldAsset,
);
router.get('/:id', validateParams(goldIdParamSchema), GoldController.getGoldAsset);
router.put(
  '/:id',
  idempotency({ scope: 'gold.update' }),
  validateParams(goldIdParamSchema),
  validateBody(goldUpdateSchema),
  GoldController.updateGoldAsset,
);
router.delete('/:id', validateParams(goldIdParamSchema), GoldController.deleteGoldAsset);

export { router as goldRoutes };


