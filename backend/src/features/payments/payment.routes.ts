import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth';
import { pinGate } from '../../middleware/pinGate';
import { requireFeature } from '../../middleware/featureGate';
import { validateBody } from '../../middleware/validate';
import { rateLimit, authenticatedRateLimit } from '../../middleware/rateLimit';
import { idempotency } from '../../middleware/idempotency';
import { requirePermission } from '../../security/permissions';
import * as PaymentController from './payment.controller';
import {
  initiatePaymentSchema,
  completePaymentSchema,
  failPaymentSchema,
  refundPaymentSchema,
} from './payment.validation';

const router = Router();

// Webhook endpoint (public, no auth). Unauthenticated + DB-backed, so it is the
// prime DoS target — rate-limit per source IP (provider settlement traffic is
// low-volume, so a generous cap won't impede legitimate callers).
router.post(
  '/webhook',
  rateLimit({ windowMs: 60_000, max: 120, scope: 'payment-webhook' }),
  PaymentController.handleWebhook,
);

// Coin-purchase gateways (Razorpay, sandbox…). Public by necessity; trust comes
// from each provider's signature over the RAW body, checked in the adapter.
// Duplicate deliveries are recognised by (provider, event id) and ignored.
router.post(
  '/webhooks/:provider',
  rateLimit({ windowMs: 60_000, max: 240, scope: 'payment-provider-webhook' }),
  PaymentController.handleProviderWebhookRoute,
);

// Protected routes
router.use(authMiddleware);

// Per-user rate limit across all authenticated payment operations (abuse/DoS guard).
router.use(authenticatedRateLimit({ windowMs: 60_000, max: 60, scope: 'payment' }));

// Whole module is governed by the admin feature flag `payments`. When the admin
// has it disabled (the default — Phase 4 is deferred), every authenticated
// payment endpoint returns 403, not just the UI being hidden. The public webhook
// above is intentionally exempt so providers can still post settlement events.
router.use(requireFeature('payments'));

// Payment history and initiation are financial operations — require a live PIN
// unlock. Mounted after the public webhook above, which stays exempt so providers
// can still post settlement events.
router.use(pinGate);

// Get payments
router.get('/', PaymentController.getPayments);

// Get specific payment
router.get('/:id', PaymentController.getPayment);

// Initiate payment
router.post(
  '/initiate',
  idempotency({ scope: 'payments.initiate' }),
  validateBody(initiatePaymentSchema),
  PaymentController.initiatePayment,
);

// Legacy session-payment records. /complete used to be callable by the CLIENT
// on their own payment — the browser could declare itself paid. Marking a
// payment completed, failed or refunded is now a finance-staff action only;
// coin purchases are confirmed by the provider (see /webhooks/:provider).
router.post(
  '/complete',
  requirePermission('finance.reconcile'),
  idempotency({ scope: 'payments.complete' }),
  validateBody(completePaymentSchema),
  PaymentController.completePayment,
);

router.post('/fail', requirePermission('finance.reconcile'), validateBody(failPaymentSchema), PaymentController.failPayment);

router.post(
  '/refund',
  requirePermission('finance.refund'),
  idempotency({ scope: 'payments.refund' }),
  validateBody(refundPaymentSchema),
  PaymentController.refundPayment,
);

export { router as paymentRoutes };

