import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { adminPlatformGate } from '../../middleware/adminPlatformGate';
import { requireRole, requireApproved } from '../../middleware/rbac';
import { requireFeature } from '../../middleware/featureGate';
import { uploadFields } from '../../middleware/upload';
import { validateBody, validateParams } from '../../middleware/validate';
import * as AdvisorController from './advisor.controller';
import * as PostController from './post.controller';
import {
  advisorIdParamSchema,
  documentParamSchema,
  setAvailabilitySchema,
  availabilityStatusSchema,
  onlineStatusSchema,
  roleModeSchema,
  rateSessionSchema,
  rejectApplicationSchema,
  createPostSchema,
} from './advisor.validation';

const router = Router();

// Marketplace browse — gated by the admin feature flag `bookAdvisor`. Anonymous
// callers are treated as role `user`; when admin disables the module this 403s
// (it is therefore no longer unconditionally public).
router.get('/', requireFeature('bookAdvisor'), AdvisorController.listAdvisors);

// Protected routes
router.use(authMiddleware);

// Any authenticated user: apply / check own application
// IMPORTANT: These specific paths MUST be defined BEFORE the /:id catch-all
router.get('/application/my', AdvisorController.getMyApplication);
router.get('/application/:id/document/:docType', validateParams(documentParamSchema), AdvisorController.getApplicationDocument);
router.post(
  '/apply',
  uploadFields([
    { name: 'panDocument', maxCount: 1 },
    { name: 'aadhaarDocument', maxCount: 1 },
    { name: 'certDocument', maxCount: 1 },
  ]),
  AdvisorController.applyAsAdvisor,
);

// Approved advisor only
router.put('/online-status', requireRole('advisor'), requireApproved, validateBody(onlineStatusSchema), AdvisorController.setOnlineStatus);
router.put('/role-mode', requireRole(['advisor', 'admin', 'manager']), validateBody(roleModeSchema), AdvisorController.switchRoleMode);

// Availability slots (approved advisors)
router.post('/availability', requireRole('advisor'), requireApproved, validateBody(setAvailabilitySchema), AdvisorController.setAvailability);
router.put('/availability/status', requireRole('advisor'), requireApproved, validateBody(availabilityStatusSchema), AdvisorController.setAvailabilityStatus);
router.get('/:id/availability', requireFeature('bookAdvisor'), validateParams(advisorIdParamSchema), AdvisorController.getAvailability);
router.delete('/availability/:id', requireRole('advisor'), requireApproved, validateParams(advisorIdParamSchema), AdvisorController.deleteAvailability);
router.get('/me/sessions', requireRole('advisor'), requireApproved, AdvisorController.getSessions);

// Client only
router.put('/sessions/:id/rate', validateParams(advisorIdParamSchema), validateBody(rateSessionSchema), AdvisorController.rateSession);

// ─── Advisor feed & follow graph ─────────────────────────────────────────────
// Registered before the /:id catch-all below, or "posts" and "following" would
// be read as advisor ids.
router.get('/posts', requireFeature('bookAdvisor'), PostController.listPosts);
router.post('/posts', requireRole('advisor'), requireApproved, validateBody(createPostSchema), PostController.createPost);
router.delete('/posts/:id', requireRole('advisor'), requireApproved, validateParams(advisorIdParamSchema), PostController.deletePost);
router.post('/posts/:id/like', requireFeature('bookAdvisor'), validateParams(advisorIdParamSchema), PostController.likePost);
router.delete('/posts/:id/like', requireFeature('bookAdvisor'), validateParams(advisorIdParamSchema), PostController.unlikePost);

router.get('/following', requireFeature('bookAdvisor'), PostController.listFollowing);
router.post('/:id/follow', requireFeature('bookAdvisor'), validateParams(advisorIdParamSchema), PostController.followAdvisor);
router.delete('/:id/follow', requireFeature('bookAdvisor'), validateParams(advisorIdParamSchema), PostController.unfollowAdvisor);

// Admin / Manager — the verification queue is part of the Admin/Manager
// platform, so it is also origin-gated (no-op until ADMIN_UI_HOSTS is set).
router.get('/admin/applications', adminPlatformGate, requireRole(['admin', 'manager']), AdvisorController.listPendingAdvisors);
router.put('/admin/:id/approve', adminPlatformGate, requireRole(['admin', 'manager']), validateParams(advisorIdParamSchema), AdvisorController.approveAdvisor);
router.put('/admin/:id/reject', adminPlatformGate, requireRole(['admin', 'manager']), validateParams(advisorIdParamSchema), validateBody(rejectApplicationSchema), AdvisorController.rejectAdvisor);

// Single advisor lookup (catch-all /:id MUST be last to avoid shadowing specific routes).
// NOT feature-gated: this path also resolves self-profile lookups (e.g. /advisors/me),
// so gating it on `bookAdvisor` would block advisors from viewing their own profile.
router.get('/:id', validateParams(advisorIdParamSchema), AdvisorController.getAdvisor);

export { router as advisorRoutes };
