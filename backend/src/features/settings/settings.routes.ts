import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import * as SettingsController from './settings.controller';
import { updateSettingsSchema } from './settings.validation';

const router = Router();

router.use(authMiddleware);

router.get('/', SettingsController.getSettings);
router.put('/', validateBody(updateSettingsSchema), SettingsController.updateSettings);

export { router as settingsRoutes };
