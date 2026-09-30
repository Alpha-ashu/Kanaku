import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { getSystemIntegrity } from './integrity.controller';

const router = Router();

router.use(authMiddleware);

// System-wide ledger audit + operational health (worker/DB/cache/memory).
// Admin-only: exposes cross-tenant aggregate state, not a per-user view.
router.get('/integrity', requireRole('admin'), getSystemIntegrity);

// Server clock. Session countdowns and payment deadlines are rendered from the
// offset between this and the device clock — never from the device clock alone.
router.get('/time', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ success: true, data: { serverNow: new Date().toISOString() } });
});

export { router as systemRoutes };
