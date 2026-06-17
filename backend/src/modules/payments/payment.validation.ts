import { z } from '../../middleware/validate';

// The controller performs the strict payment-method normalization and
// state-transition checks; these schemas guarantee required fields/types.

export const initiatePaymentSchema = z.object({
  sessionId: z.string().trim().min(1, 'sessionId is required'),
  paymentMethod: z.string().trim().min(1, 'paymentMethod is required'),
  description: z.string().trim().max(500).optional(),
});

export const completePaymentSchema = z.object({
  paymentId: z.string().trim().min(1, 'paymentId is required'),
  transactionId: z.string().trim().max(255).optional(),
});

export const failPaymentSchema = z.object({
  paymentId: z.string().trim().min(1, 'paymentId is required'),
  reason: z.string().trim().max(500).optional(),
});

export const refundPaymentSchema = z.object({
  paymentId: z.string().trim().min(1, 'paymentId is required'),
  reason: z.string().trim().max(500).optional(),
});
