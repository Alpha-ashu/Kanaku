import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import {
  getManagerUsers,
  submitApprovalRequest,
  getMyApprovalRequests,
  requestDemoStatusChange,
} from './manager.controller';

const router = Router();

// Manager endpoints require authentication and manager (or admin) role
router.use(authMiddleware);
router.use(requireRole('manager'));

router.get('/users', getManagerUsers);
router.post('/requests', submitApprovalRequest);
router.get('/requests', getMyApprovalRequests);
router.post('/demo-accounts/:userId/status', requestDemoStatusChange);

export { router as managerRoutes };
