import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
import { validateQuery } from '../../middleware/validate';
import * as AdminController from './admin.controller';
import { adminCacheMetricsQuerySchema } from './admin.validation';
import {
	getAdminAIAccuracy,
	getAdminAIInsights,
	getAdminAIOverview,
	getAdminAIPatterns,
	getAdminAIRawUserData,
	getAdminAIUsers,
	runAdminFeatureRefresh,
	runAdminPredictionRefresh,
} from '../ai/ai.controller';
import { validateBody, validateParams } from '../../middleware/validate';
import { aiLimitQuerySchema, aiRunBodySchema, aiUserParamsSchema } from '../ai/ai.validation';

const router = Router();

// All admin routes require authentication and admin role
router.use(authMiddleware);
router.use(requireRole('admin'));

// User management
router.get('/users', AdminController.getAllUsers);
router.get('/users/pending', AdminController.getPendingAdvisors);
router.post('/users/:advisorId/approve', AdminController.approveAdvisor);
router.post('/users/:advisorId/reject', AdminController.rejectAdvisor);
router.get('/users/activity', AdminController.getUserActivity);
router.post('/users/:userId/status', AdminController.toggleUserStatus);
router.post('/users/:userId/role', AdminController.updateUserRole);

// Statistics
router.get('/stats', AdminController.getPlatformStats);
router.get('/cache/metrics', validateQuery(adminCacheMetricsQuerySchema), AdminController.getCacheMetrics);

// Feature flags
router.get('/features', AdminController.getFeatureFlags);
router.post('/features/toggle', AdminController.toggleFeatureFlag);

// Reports
router.get('/reports/users', AdminController.getUsersReport);
router.get('/reports/revenue', AdminController.getRevenueReport);

// AI intelligence (admin only)
router.get('/ai/overview', getAdminAIOverview);
router.get('/ai/users', validateQuery(aiLimitQuerySchema), getAdminAIUsers);
router.get('/ai/insights', validateQuery(aiLimitQuerySchema), getAdminAIInsights);
router.get('/ai/patterns', getAdminAIPatterns);
router.get('/ai/accuracy', getAdminAIAccuracy);
router.get('/ai/raw/:userId', validateParams(aiUserParamsSchema), getAdminAIRawUserData);
router.post('/ai/run/features', validateBody(aiRunBodySchema), runAdminFeatureRefresh);
router.post('/ai/run/predictions', validateBody(aiRunBodySchema), runAdminPredictionRefresh);

export { router as adminRoutes };
