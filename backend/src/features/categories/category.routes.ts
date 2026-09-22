import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { pinGate } from '../../middleware/pinGate';
import { announceChange } from '../../middleware/announceChange';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate';
import { idempotency } from '../../middleware/idempotency';
import { duplicateSubmitGuard } from '../../middleware/duplicateSubmitGuard';
import * as CategoryController from './category.controller';
import {
  categoryCreateSchema,
  categoryUpdateSchema,
  categoryIdParamSchema,
  categoryQuerySchema,
  categoryBulkCreateSchema,
} from './category.validation';

const router = Router();

router.use(authMiddleware);
// A user's category list is a map of what they spend on — same sensitivity as
// the financial routers, so it sits behind the same live-PIN unlock.
router.use(pinGate);

// Mirrored into Dexie by featureSyncService rather than the sync engine, so a
// second device has no other way to learn about this change until it reloads.
router.use(announceChange('categories_updated'));

// No requireFeature gate: categories are core taxonomy that transactions,
// budgets and the importer all depend on, not an optional module.
router.get('/', validateQuery(categoryQuerySchema), CategoryController.getCategories);
router.post(
  '/',
  idempotency({ scope: 'categories.create' }),
  validateBody(categoryCreateSchema),
  duplicateSubmitGuard({ scope: 'categories.create' }),
  CategoryController.createCategory,
);
router.post(
  '/bulk',
  idempotency({ scope: 'categories.bulk' }),
  validateBody(categoryBulkCreateSchema),
  CategoryController.bulkCreateCategories,
);
router.put(
  '/:id',
  idempotency({ scope: 'categories.update' }),
  validateParams(categoryIdParamSchema),
  validateBody(categoryUpdateSchema),
  CategoryController.updateCategory,
);
router.delete('/:id', validateParams(categoryIdParamSchema), CategoryController.deleteCategory);

export { router as categoryRoutes };

