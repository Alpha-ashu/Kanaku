import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { getSystemIntegrity } from './integrity.controller';

const router = Router();

router.use(authMiddleware);

// System-wide ledger audit + operational health (worker/DB/cache/memory).
// Admin-only: exposes cross-tenant aggregate state, not a per-user view.
router.get('/integrity', requireRole('admin'), getSystemIntegrity);

export { router as systemRoutes };
