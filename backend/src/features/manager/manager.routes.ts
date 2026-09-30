import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { requirePermission } from '../../security/permissions';
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

router.get('/users', getManagerUsers);
router.post('/requests', submitApprovalRequest);
router.get('/requests', getMyApprovalRequests);
router.post('/demo-accounts/:userId/status', requestDemoStatusChange);

// Team scope: only the users/advisors an admin assigned to this manager.
router.get('/team', requirePermission('team.read'), getTeam);
router.get('/team/bookings', requirePermission('team.bookings.read'), getTeamBookings);
router.get('/team/performance', requirePermission('team.read'), getTeamPerformance);

export { router as managerRoutes };
