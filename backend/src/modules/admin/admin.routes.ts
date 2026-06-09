import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { requireRole } from '../../middleware/rbac';
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
	getAdminAIConfig,
	updateAdminAIConfig,
} from '../ai/ai.controller';
import { validateBody, validateParams, validateQuery } from '../../middleware/validate';
import { aiLimitQuerySchema, aiRunBodySchema, aiUserParamsSchema } from '../ai/ai.validation';

const router = Router();

// All admin routes require authentication
router.use(authMiddleware);

// Feature flags (readable by authenticated users — returns role-filtered view for non-admins)
// BUG-04 FIX: Non-admin users get only their own role's enabled features, not the full RBAC matrix
router.get('/features', AdminController.getFeatureFlags);
router.get('/ai-features', AdminController.getAIFeatureFlags);

// All other admin routes require admin role
router.use(requireRole('admin'));

// User management
router.get('/users', AdminController.getAllUsers);
router.get('/users/pending', AdminController.getPendingAdvisors);
router.post('/users/:advisorId/approve', AdminController.approveAdvisor);
router.post('/users/:advisorId/reject', AdminController.rejectAdvisor);
router.get('/users/activity', AdminController.getUserActivity);
router.post('/users/:userId/status', AdminController.toggleUserStatus);
router.post('/users/:userId/role', AdminController.updateUserRole);
router.delete('/users/:userId', AdminController.deleteUser);
router.get('/users/:userId/storage', AdminController.getUserStorageStats);

// Statistics
router.get('/stats', AdminController.getPlatformStats);
router.get('/cache/metrics', validateQuery(adminCacheMetricsQuerySchema), AdminController.getCacheMetrics);

// Feature flags toggle (admin only)
router.post('/features/toggle', AdminController.toggleFeatureFlag);
router.post('/ai-features/toggle', AdminController.toggleAIFeatureFlags);

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
router.get('/ai/config', getAdminAIConfig);
router.post('/ai/config', updateAdminAIConfig);

export { router as adminRoutes };
