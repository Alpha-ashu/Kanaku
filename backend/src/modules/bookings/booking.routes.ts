import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { requireFeature, requireRole, requireApproved } from '../../middleware/rbac';
import { validateBody, validateParams } from '../../middleware/validate';
import * as BookingController from './booking.controller';
import {
  bookingCreateSchema,
  bookingIdParamSchema,
  rescheduleSchema,
  cancelBookingSchema,
} from './booking.validation';

const router = Router();

// All booking routes require authentication
router.use(authMiddleware);

// Create booking (users only)
router.post(
  '/',
  requireFeature('bookAdvisor'),
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

router.put(
  '/:id/reschedule',
  requireRole('advisor'),
  requireApproved,
  validateParams(bookingIdParamSchema),
  validateBody(rescheduleSchema),
  BookingController.rescheduleBooking
);

// Cancel booking (client only - but any authenticated user can call)
router.put(
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

export { router as bookingRoutes };
