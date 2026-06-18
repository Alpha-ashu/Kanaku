import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
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
