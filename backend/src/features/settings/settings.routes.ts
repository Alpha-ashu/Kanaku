import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import { idempotency } from '../../middleware/idempotency';
import { rateLimit } from '../../middleware/rateLimit';
import * as SettingsController from './settings.controller';
import * as GdprController from './settings.gdpr.controller';
import { updateSettingsSchema } from './settings.validation';

const router = Router();

router.use(authMiddleware);

router.get('/', SettingsController.getSettings);
router.put('/', validateBody(updateSettingsSchema), SettingsController.updateSettings);

/**
 * GDPR / DPDP endpoints.
 *
 * Data export is rate-limited (5 / hour) because each call materializes
 * the entire user dataset. Deletion is idempotent (so a network retry
 * cannot accidentally re-trigger the audit + token revoke twice).
 */
router.get(
  '/export',
  rateLimit({ windowMs: 60 * 60 * 1000, max: 5, scope: 'settings.export', message: 'Too many export requests. Try again in an hour.' }),
  GdprController.exportUserData,
);
router.delete(
  '/account',
  idempotency({ scope: 'settings.delete-account' }),
  GdprController.deleteAccount,
);
router.post(
  '/account/cancel-deletion',
  GdprController.cancelAccountDeletion,
);

export { router as settingsRoutes };
