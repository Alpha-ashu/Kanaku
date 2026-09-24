import { z } from '../../middleware/validate';

export const bookingCreateSchema = z.object({
  advisorId: z.string().trim().min(1, 'advisorId is required'),
  sessionType: z.string().trim().min(1, 'sessionType is required').max(60),
  description: z.string().trim().max(1000).optional(),
  // Calendar date + wall-clock time as picked in the booking form (<input type=date|time>).
  // Anything else used to reach `new Date()` as an Invalid Date and surface as a 500.
  proposedDate: z.string().trim().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'proposedDate must be YYYY-MM-DD'),
  proposedTime: z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'proposedTime must be HH:MM (24h)'),
  duration: z.coerce.number().int().min(1).max(600),
  amount: z.coerce.number().min(0),
  // Declared so Zod does not strip it: the controller's replay check and the
  // DB's per-owner unique index both key off this.
  clientRequestId: z.string().trim().max(200).optional(),
});

export const bookingIdParamSchema = z.object({
  id: z.string().trim().min(1, 'Booking ID is required'),
});

export const rescheduleSchema = z.object({
  proposedDate: z.string().trim().min(1).optional(),
  proposedTime: z.string().trim().min(1).optional(),
  newDate: z.string().trim().min(1).optional(),
  newTime: z.string().trim().min(1).optional(),
  reason: z.string().trim().max(500).optional(),
}).passthrough();

export const cancelBookingSchema = z.object({
  reason: z.string().trim().max(500).optional(),
}).passthrough();

/**
 * Answering a reschedule proposal. The decision itself is in the route, so the
 * body carries only an optional note — a declining party explaining why, which
 * the other side sees in the notification.
 */
export const rescheduleDecisionSchema = z.object({
  reason: z.string().trim().max(500).optional(),
}).passthrough();
