import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { requireRole, requireApproved } from '../../middleware/rbac';
// Panel-backed feature gate (admin_global_feature_settings), NOT the static
// role check in rbac.ts — so disabling `bookAdvisor` in the admin panel actually
// blocks new bookings at the API layer.
import { requireFeature } from '../../middleware/featureGate';
import { idempotency } from '../../middleware/idempotency';
import { validateBody, validateParams } from '../../middleware/validate';
import * as BookingController from './booking.controller';
import {
  bookingCreateSchema,
  bookingIdParamSchema,
  rescheduleSchema,
  cancelBookingSchema,
  rescheduleDecisionSchema,
} from './booking.validation';

const router = Router();

// All booking routes require authentication
router.use(authMiddleware);

// Create booking (users only)
router.post(
  '/',
  idempotency({ scope: 'bookings.create' }),
  requireFeature('bookAdvisor', 'createBooking'),
  validateBody(bookingCreateSchema),
  BookingController.createBooking
);

// Get bookings (both client and advisor)
router.get('/', BookingController.getBookings);

// Get specific booking
router.get('/:id', BookingController.getBooking);

// Accept booking (advisor only)
router.put(
  '/:id/accept',
  requireRole('advisor'),
  requireApproved,
  BookingController.acceptBooking
);

// Reject booking (advisor only)
router.put(
  '/:id/reject',
  requireRole('advisor'),
  requireApproved,
  BookingController.rejectBooking
);

// Propose a new time. No longer advisor-only: the brief's flow lets the client
// counter-propose, and the state machine is what decides whose turn it is (the
// party who proposed the outstanding time cannot propose again).
router.put(
  '/:id/reschedule',
  validateParams(bookingIdParamSchema),
  validateBody(rescheduleSchema),
  BookingController.rescheduleBooking
);

// Answer an outstanding proposal. These two are the exit that did not exist:
// a booking in `reschedule` could previously only be cancelled, so the advisor
// proposing a new time stranded the request.
router.put(
  '/:id/reschedule/accept',
  validateParams(bookingIdParamSchema),
  validateBody(rescheduleDecisionSchema),
  BookingController.acceptReschedule
);
router.put(
  '/:id/reschedule/decline',
  validateParams(bookingIdParamSchema),
  validateBody(rescheduleDecisionSchema),
  BookingController.declineReschedule
);

// Cancel booking (client only - but any authenticated user can call)
router.put(
  '/:id/cancel',
  validateParams(bookingIdParamSchema),
  validateBody(cancelBookingSchema),
  BookingController.cancelBooking
);
router.post(
  '/:id/cancel',
  validateParams(bookingIdParamSchema),
  validateBody(cancelBookingSchema),
  BookingController.cancelBooking
);

// Advisor workspace: list all clients
router.get(
  '/workspace/clients',
  requireRole('advisor'),
  requireApproved,
  BookingController.getAdvisorClients
);

// Mark session fee as paid (advisor only)
router.post(
  '/:bookingId/fee/pay',
  requireRole('advisor'),
  requireApproved,
  BookingController.markFeePaid
);

// Submit Session Review (client only)
router.post(
  '/sessions/:sessionId/review',
  requireFeature('bookAdvisor', 'reviews'),
  BookingController.submitSessionReview
);

export { router as bookingRoutes };

