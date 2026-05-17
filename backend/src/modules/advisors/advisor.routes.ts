import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { requireRole, requireApproved } from '../../middleware/rbac';
import * as AdvisorController from './advisor.controller';

const router = Router();

// Public routes (no auth needed)
router.get('/', AdvisorController.listAdvisors);
router.get('/:id', AdvisorController.getAdvisor);

// Protected routes (require authentication)
router.use(authMiddleware);

// Any authenticated user: apply to become advisor
router.post('/apply', AdvisorController.applyAsAdvisor);

// Advisor-only routes
router.post('/availability', requireRole('advisor'), requireApproved, AdvisorController.setAvailability);
router.put('/availability/status', requireRole('advisor'), requireApproved, AdvisorController.setAvailabilityStatus);
router.get('/:id/availability', AdvisorController.getAvailability);
router.delete('/availability/:id', requireRole('advisor'), requireApproved, AdvisorController.deleteAvailability);
router.get('/me/sessions', requireRole('advisor'), requireApproved, AdvisorController.getSessions);

// Client-only routes
router.put('/sessions/:id/rate', AdvisorController.rateSession);

//  ADMIN / MANAGER ONLY 
router.get('/admin/applications', requireRole(['admin', 'manager']), AdvisorController.listPendingAdvisors);
router.put('/admin/:id/approve', requireRole(['admin', 'manager']), AdvisorController.approveAdvisor);
router.put('/admin/:id/reject', requireRole(['admin', 'manager']), AdvisorController.rejectAdvisor);

export { router as advisorRoutes };


