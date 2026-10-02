import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { getEffectivePermissions, requirePermission } from '../../security/permissions';
import type { AuthRequest } from '../../middleware/auth';
import {
  getManagerUsers,
  submitApprovalRequest,
  getMyApprovalRequests,
  requestDemoStatusChange,
  getTeam,
  getTeamBookings,
  getTeamPerformance,
} from './manager.controller';

const router = Router();

// Manager endpoints require authentication and manager (or admin) role
router.use(authMiddleware);
router.use(requireRole('manager'));

// The caller's own effective permissions (defaults + admin grants), so the app
// can leave out staff pages the manager cannot use yet. Read-only, self only.
router.get('/permissions', async (req, res, next) => {
  try {
    const { userId, user } = req as AuthRequest;
    const permissions = await getEffectivePermissions(String(userId), user?.role);
    res.json({ success: true, data: { permissions: [...permissions] } });
  } catch (error) {
    next(error);
  }
});

router.get('/users', getManagerUsers);
router.post('/requests', submitApprovalRequest);
router.get('/requests', getMyApprovalRequests);
router.post('/demo-accounts/:userId/status', requestDemoStatusChange);

// Team scope: only the users/advisors an admin assigned to this manager.
router.get('/team', requirePermission('team.read'), getTeam);
router.get('/team/bookings', requirePermission('team.bookings.read'), getTeamBookings);
router.get('/team/performance', requirePermission('team.read'), getTeamPerformance);

export { router as managerRoutes };
