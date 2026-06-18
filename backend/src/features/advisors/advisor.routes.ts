import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { requireRole, requireApproved } from '../../middleware/rbac';
import { uploadFields } from '../../middleware/upload';
import { validateBody, validateParams } from '../../middleware/validate';
import * as AdvisorController from './advisor.controller';
import {
  advisorIdParamSchema,
  documentParamSchema,
  setAvailabilitySchema,
  availabilityStatusSchema,
  onlineStatusSchema,
  roleModeSchema,
  rateSessionSchema,
  rejectApplicationSchema,
} from './advisor.validation';

const router = Router();

// Public routes (no auth required)
router.get('/', AdvisorController.listAdvisors);

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
router.get('/:id/availability', validateParams(advisorIdParamSchema), AdvisorController.getAvailability);
router.delete('/availability/:id', requireRole('advisor'), requireApproved, validateParams(advisorIdParamSchema), AdvisorController.deleteAvailability);
router.get('/me/sessions', requireRole('advisor'), requireApproved, AdvisorController.getSessions);

// Client only
router.put('/sessions/:id/rate', validateParams(advisorIdParamSchema), validateBody(rateSessionSchema), AdvisorController.rateSession);

// Admin / Manager
router.get('/admin/applications', requireRole(['admin', 'manager']), AdvisorController.listPendingAdvisors);
router.put('/admin/:id/approve', requireRole(['admin', 'manager']), validateParams(advisorIdParamSchema), AdvisorController.approveAdvisor);
router.put('/admin/:id/reject', requireRole(['admin', 'manager']), validateParams(advisorIdParamSchema), validateBody(rejectApplicationSchema), AdvisorController.rejectAdvisor);

// Single advisor lookup (catch-all /:id MUST be last to avoid shadowing specific routes)
router.get('/:id', validateParams(advisorIdParamSchema), AdvisorController.getAdvisor);

export { router as advisorRoutes };
