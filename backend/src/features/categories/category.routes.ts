import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { pinGate } from '../../middleware/pinGate';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate';
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

// No requireFeature gate: categories are core taxonomy that transactions,
// budgets and the importer all depend on, not an optional module.
router.get('/', validateQuery(categoryQuerySchema), CategoryController.getCategories);
router.post('/', validateBody(categoryCreateSchema), CategoryController.createCategory);
router.post('/bulk', validateBody(categoryBulkCreateSchema), CategoryController.bulkCreateCategories);
router.put(
  '/:id',
  validateParams(categoryIdParamSchema),
  validateBody(categoryUpdateSchema),
  CategoryController.updateCategory,
);
router.delete('/:id', validateParams(categoryIdParamSchema), CategoryController.deleteCategory);

export { router as categoryRoutes };
