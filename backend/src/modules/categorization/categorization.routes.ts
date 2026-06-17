import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import * as CategorizationController from './categorization.controller';
import { categorizeSchema, learnSchema } from './categorization.validation';

const router = Router();
const learnRouter = Router();

router.use(authMiddleware);
learnRouter.use(authMiddleware);

router.post('/', validateBody(categorizeSchema), CategorizationController.categorize);
learnRouter.post('/', validateBody(learnSchema), CategorizationController.learn);

export { router as categorizationRoutes, learnRouter };
