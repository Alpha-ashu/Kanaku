import { z } from '../../middleware/validate';

export const bookingCreateSchema = z.object({
  advisorId: z.string().trim().min(1, 'advisorId is required'),
  sessionType: z.string().trim().min(1, 'sessionType is required').max(60),
  description: z.string().trim().max(1000).optional(),
  proposedDate: z.string().trim().min(1, 'proposedDate is required'),
  proposedTime: z.string().trim().min(1, 'proposedTime is required'),
  duration: z.coerce.number().int().min(1).max(600),
  amount: z.coerce.number().min(0),
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
