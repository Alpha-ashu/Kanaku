import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { requireFeature } from '../../middleware/featureGate';
import { validateBody } from '../../middleware/validate';
import * as PaymentController from './payment.controller';
import {
  initiatePaymentSchema,
  completePaymentSchema,
  failPaymentSchema,
  refundPaymentSchema,
} from './payment.validation';

const router = Router();

// Webhook endpoint (public, no auth)
router.post('/webhook', PaymentController.handleWebhook);

// Protected routes
router.use(authMiddleware);

// Whole module is governed by the admin feature flag `payments`. When the admin
// has it disabled (the default — Phase 4 is deferred), every authenticated
// payment endpoint returns 403, not just the UI being hidden. The public webhook
// above is intentionally exempt so providers can still post settlement events.
router.use(requireFeature('payments'));

// Get payments
router.get('/', PaymentController.getPayments);

// Get specific payment
router.get('/:id', PaymentController.getPayment);

// Initiate payment
router.post('/initiate', validateBody(initiatePaymentSchema), PaymentController.initiatePayment);

// Complete payment
router.post('/complete', validateBody(completePaymentSchema), PaymentController.completePayment);

// Handle payment failure
router.post('/fail', validateBody(failPaymentSchema), PaymentController.failPayment);

// Refund payment
router.post('/refund', validateBody(refundPaymentSchema), PaymentController.refundPayment);

export { router as paymentRoutes };
