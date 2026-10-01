import { Response } from 'express';
import { timingSafeEqual, createHmac, randomBytes } from 'crypto';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { prisma } from '../../db/prisma';
import { logger } from '../../config/logger';
import { handleProviderWebhook, reconcileOrder } from '../wallet/coinPurchase.service';
import { paytmProvider } from './providers/paytm.provider';
import {
  autoSubmitPage,
  isOrderId,
  messagePage,
  purchaseReturnUrl,
  verifyLaunchToken,
} from './providers/redirectCheckout';

/**
 * Constant-time string comparison to prevent timing attacks on secret/token
 * checks. Returns false on any length mismatch without leaking position.
 */
const safeEqual = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
};

const ALLOWED_PAYMENT_METHODS = new Set([
  'bank_transfer',
  'cash',
  'credit_card',
  'debit_card',
  'paypal',
  'razorpay',
  'stripe',
  'upi',
]);

const PAYMENT_TRANSITIONS: Record<string, string[]> = {
  pending: ['completed', 'failed'],
  processing: ['completed', 'failed'],
  completed: ['refunded'],
  failed: [],
  refunded: [],
};

const isAdmin = (req: AuthRequest) => req.user?.role === 'admin';

/** Never echo internal error text (Prisma, driver) to a client. */
const failure = (res: Response, error: unknown, message: string) => {
  logger.error(`[payments] ${message}`, { error });
  return res.status(500).json({ error: message });
};

const normalizePaymentMethod = (paymentMethod: unknown) => {
  if (typeof paymentMethod !== 'string') return null;
  const normalized = paymentMethod.trim().toLowerCase();
  return ALLOWED_PAYMENT_METHODS.has(normalized) ? normalized : null;
};

const canTransitionPayment = (currentStatus: string, nextStatus: string) =>
  PAYMENT_TRANSITIONS[currentStatus]?.includes(nextStatus) ?? false;

/**
 * Verify an HMAC-SHA256 signature computed over the exact raw request body.
 * Accepts the signature as a bare hex digest or a "sha256=<hex>" prefixed value
 * (the convention used by Razorpay/Stripe-style providers). Returns false if no
 * raw body was captured or the header is malformed.
 */
const verifyWebhookSignature = (req: AuthRequest | any, secret: string): boolean => {
  const sigHeader = req.headers?.['x-webhook-signature'] ?? req.headers?.['x-payment-signature'];
  const provided = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;
  if (typeof provided !== 'string' || !provided) return false;

  const raw = (req as any).rawBody;
  const body: Buffer = Buffer.isBuffer(raw)
    ? raw
    : Buffer.from(typeof raw === 'string' ? raw : JSON.stringify(req.body ?? {}), 'utf8');

  const expected = createHmac('sha256', secret).update(body).digest('hex');
  const normalized = provided.startsWith('sha256=') ? provided.slice(7) : provided;
  return safeEqual(normalized, expected);
};

const requireWebhookSecret = (req: AuthRequest | any) => {
  const webhookSecret = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return {
      ok: false as const,
      status: 503,
      error: 'Payment webhook secret is not configured',
    };
  }

  // Preferred: HMAC signature over the raw body. If a signature header is
  // present we require it to be valid (no silent fallthrough to the weaker
  // shared-secret check).
  const hasSignature = Boolean(req.headers?.['x-webhook-signature'] ?? req.headers?.['x-payment-signature']);
  if (hasSignature) {
    if (verifyWebhookSignature(req, webhookSecret)) {
      return { ok: true as const };
    }
    return { ok: false as const, status: 401, error: 'Invalid webhook signature' };
  }

  // Fallback (backward compatible): shared-secret header, compared in
  // constant time. Used by integrations that don't sign the payload.
  const headerValue = req.headers?.['x-payment-webhook-secret'] ?? req.headers?.['x-webhook-secret'];
  const providedSecret = Array.isArray(headerValue) ? headerValue[0] : headerValue;

  if (typeof providedSecret !== 'string' || !safeEqual(providedSecret, webhookSecret)) {
    return {
      ok: false as const,
      status: 401,
      error: 'Invalid webhook signature',
    };
  }

  return { ok: true as const };
};

const loadPayment = async (paymentId: string) =>
  prisma.payment.findUnique({
    where: { id: paymentId },
  });

const markPaymentCompleted = async (paymentId: string, transactionId?: string, paymentMethod?: string) => {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
    });
    if (!payment) {
      throw new Error('PAYMENT_NOT_FOUND');
    }

    if (payment.status === 'completed') {
      return payment;
    }

    if (!canTransitionPayment(payment.status, 'completed')) {
      throw new Error('INVALID_PAYMENT_STATE');
    }

    const updated = await tx.payment.update({
      where: { id: paymentId },
      data: {
        status: 'completed',
        completedAt: new Date(),
        transactionId: transactionId || payment.transactionId,
        ...(paymentMethod ? { paymentMethod } : {}),
      },
    });

    await tx.notification.create({
      data: {
        userId: payment.advisorId,
        title: 'Payment Received',
        message: `You received a payment of ${payment.amount} ${payment.currency}`,
        category: 'payment',
        deepLink: '/advisor-panel',
      },
    });

    return updated;
  });
};

const markPaymentFailed = async (paymentId: string, reason?: string) => {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
    });
    if (!payment) {
      throw new Error('PAYMENT_NOT_FOUND');
    }

    if (payment.status === 'failed') {
      return payment;
    }

    if (!canTransitionPayment(payment.status, 'failed')) {
      throw new Error('INVALID_PAYMENT_STATE');
    }

    const updated = await tx.payment.update({
      where: { id: paymentId },
      // The reason used to live only in the notification text, so the row could
      // not say why the payment failed.
      data: { status: 'failed', failureReason: reason ?? null },
    });

    await tx.notification.create({
      data: {
        userId: payment.clientId,
        title: 'Payment Failed',
        message: `Your payment of ${payment.amount} ${payment.currency} failed${reason ? `: ${reason}` : ''}. Please try again.`,
        category: 'payment',
        deepLink: '/book-advisor',
      },
    });

    return updated;
  });
};

const markPaymentRefunded = async (paymentId: string, reason?: string) => {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
    });
    if (!payment) {
      throw new Error('PAYMENT_NOT_FOUND');
    }

    if (payment.status === 'refunded') {
      return payment;
    }

    if (!canTransitionPayment(payment.status, 'refunded')) {
      throw new Error('INVALID_PAYMENT_STATE');
    }

    const updated = await tx.payment.update({
      where: { id: paymentId },
      // refundedAt / refundReason exist so the row itself is the audit record.
      // Previously the only trace of why money went back was the wording of a
      // notification, which nothing queries and the user can delete.
      data: { status: 'refunded', refundedAt: new Date(), refundReason: reason ?? null },
    });

    await tx.notification.createMany({
      data: [
        {
          userId: payment.clientId,
          title: 'Payment Refunded',
          message: `Your payment of ${payment.amount} ${payment.currency} has been refunded${reason ? `: ${reason}` : ''}`,
          category: 'payment',
        },
        {
          userId: payment.advisorId,
          title: 'Payment Refunded',
          message: `A payment of ${payment.amount} ${payment.currency} was refunded${reason ? `: ${reason}` : ''}`,
          category: 'payment',
        },
      ],
    });

    return updated;
  });
};

// Get payments for user
export const getPayments = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const { type } = req.query; // 'sent' for advisor, 'received' for client

    let query: any = {
      OR: [
        { clientId: userId },
        { advisorId: userId },
      ],
    };

    if (type === 'sent') {
      query = { clientId: userId };
    } else if (type === 'received') {
      query = { advisorId: userId };
    }

    const payments = await prisma.payment.findMany({
      where: query,
      include: {
        client: {
          select: { id: true, name: true, email: true },
        },
        advisor: {
          select: { id: true, name: true, email: true },
        },
        session: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(payments);
  } catch (error: any) {
    failure(res, error, 'Failed to fetch payments');
  }
};

// Get specific payment
export const getPayment = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        client: {
          select: { id: true, name: true, email: true },
        },
        advisor: {
          select: { id: true, name: true, email: true },
        },
        session: true,
      },
    });

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    if (payment.clientId !== userId && payment.advisorId !== userId && !isAdmin(req)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(payment);
  } catch (error: any) {
    failure(res, error, 'Failed to fetch payment');
  }
};

// Initiate payment
export const initiatePayment = async (req: AuthRequest, res: Response) => {
  try {
    const clientId = getUserId(req);
    const { sessionId, description, clientRequestId } = req.body;
    const paymentMethod = normalizePaymentMethod(req.body.paymentMethod);

    if (!sessionId || !paymentMethod) {
      return res.status(400).json({
        error: 'Missing or invalid fields: sessionId, paymentMethod',
      });
    }

    // Idempotent replay. Without a key on the row, a retried initiate could only
    // be caught by the sessionId unique — which answered "already initiated",
    // an error, for what was the same request arriving twice.
    if (clientRequestId && typeof clientRequestId === 'string') {
      const replay = await prisma.payment.findFirst({
        where: { clientId, clientRequestId },
      });
      if (replay) {
        return res.status(200).json({ payment: replay });
      }
    }

    const session = await prisma.advisorSession.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.clientId !== clientId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const existingPayment = await prisma.payment.findUnique({
      where: { sessionId },
    });

    if (existingPayment) {
      return res.status(400).json({ error: 'Payment already initiated for this session' });
    }

    const booking = await prisma.bookingRequest.findUnique({
      where: { id: session.bookingId },
    });

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const payment = await prisma.payment.create({
      data: {
        sessionId,
        clientId,
        advisorId: session.advisorId,
        amount: booking.amount,
        currency: 'INR',
        status: 'pending',
        paymentMethod,
        clientRequestId: typeof clientRequestId === 'string' ? clientRequestId : null,
        description: typeof description === 'string' && description.trim()
          ? description.trim()
          : `Payment for ${session.sessionType} session`,
      },
    });

    res.status(201).json({ payment });
  } catch (error: any) {
    failure(res, error, 'Failed to initiate payment');
  }
};

// Confirm payment completion (called by webhook or frontend)
export const completePayment = async (req: AuthRequest, res: Response) => {
  try {
    const actorId = getUserId(req);
    const { paymentId, transactionId } = req.body;
    const paymentMethod = normalizePaymentMethod(req.body.paymentMethod);

    if (!paymentId) {
      return res.status(400).json({ error: 'Missing paymentId' });
    }

    const payment = await loadPayment(paymentId);
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    if (payment.clientId !== actorId && !isAdmin(req)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updated = await markPaymentCompleted(paymentId, transactionId, paymentMethod || undefined);
    res.json(updated);
  } catch (error: any) {
    if (error.message === 'INVALID_PAYMENT_STATE') {
      return res.status(400).json({ error: 'Invalid payment state transition' });
    }
    if (error.message === 'PAYMENT_NOT_FOUND') {
      return res.status(404).json({ error: 'Payment not found' });
    }
    failure(res, error, 'Failed to complete payment');
  }
};

// Handle payment failure
export const failPayment = async (req: AuthRequest, res: Response) => {
  try {
    const actorId = getUserId(req);
    const { paymentId, reason } = req.body;

    if (!paymentId) {
      return res.status(400).json({ error: 'Missing paymentId' });
    }

    const payment = await loadPayment(paymentId);
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    if (payment.clientId !== actorId && !isAdmin(req)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updated = await markPaymentFailed(paymentId, typeof reason === 'string' ? reason : undefined);
    res.json(updated);
  } catch (error: any) {
    if (error.message === 'INVALID_PAYMENT_STATE') {
      return res.status(400).json({ error: 'Invalid payment state transition' });
    }
    if (error.message === 'PAYMENT_NOT_FOUND') {
      return res.status(404).json({ error: 'Payment not found' });
    }
    failure(res, error, 'Failed to handle payment failure');
  }
};

// Refund payment
export const refundPayment = async (req: AuthRequest, res: Response) => {
  try {
    const actorId = getUserId(req);
    const { paymentId, reason } = req.body;

    if (!paymentId) {
      return res.status(400).json({ error: 'Missing paymentId' });
    }

    const payment = await loadPayment(paymentId);
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    if (payment.advisorId !== actorId && !isAdmin(req)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updated = await markPaymentRefunded(paymentId, typeof reason === 'string' ? reason : undefined);
    res.json(updated);
  } catch (error: any) {
    if (error.message === 'INVALID_PAYMENT_STATE') {
      return res.status(400).json({ error: 'Can only refund completed payments' });
    }
    if (error.message === 'PAYMENT_NOT_FOUND') {
      return res.status(404).json({ error: 'Payment not found' });
    }
    failure(res, error, 'Failed to refund payment');
  }
};

// Webhook handler for payment gateway
export const handleWebhook = async (req: AuthRequest | any, res: Response) => {
  try {
    const webhookCheck = requireWebhookSecret(req);
    if (!webhookCheck.ok) {
      return res.status(webhookCheck.status).json({ error: webhookCheck.error });
    }

    const { paymentId, transactionId, status } = req.body;

    if (!paymentId || typeof status !== 'string') {
      return res.status(400).json({ error: 'Missing paymentId or status' });
    }

    if (status === 'success' || status === 'completed') {
      const updated = await markPaymentCompleted(paymentId, transactionId);
      return res.json({ success: true, payment: updated });
    }

    if (status === 'failed') {
      const updated = await markPaymentFailed(paymentId, 'Payment processing failed');
      return res.json({ success: true, payment: updated });
    }

    res.status(400).json({ error: 'Unknown webhook status' });
  } catch (error: any) {
    if (error.message === 'INVALID_PAYMENT_STATE') {
      return res.status(400).json({ error: 'Invalid payment state transition' });
    }
    if (error.message === 'PAYMENT_NOT_FOUND') {
      return res.status(404).json({ error: 'Payment not found' });
    }
    failure(res, error, 'Webhook processing failed');
  }
};

/**
 * Signed webhook from a coin-purchase gateway. The signature is computed over
 * the exact bytes received, so the raw body captured by express.json's
 * `verify` hook is what is checked — never the parsed (and sanitised) object.
 */
export const handleProviderWebhookRoute = async (req: AuthRequest & { rawBody?: unknown }, res: Response) => {
  const raw: Buffer | undefined = Buffer.isBuffer(req.rawBody) ? req.rawBody : undefined;
  if (!raw) return res.status(400).json({ error: 'Expected a JSON body' });
  try {
    const outcome = await handleProviderWebhook(String(req.params.provider || ''), raw, req.headers);
    return res.status(outcome.httpStatus).json(outcome.body);
  } catch (error) {
    return failure(res, error, 'Webhook processing failed');
  }
};

/**
 * GET /payments/launch/paytm/:orderId?t=<signed>
 *
 * Paytm's payment page must be opened with a form POST; a link (or the system
 * browser the native app hands off to) can only GET. This serves a page that
 * posts mid + orderId + txnToken to Paytm on load. The link is signed for one
 * order and expires; the order must still be open.
 */
export const launchPaytm = async (req: AuthRequest, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  const orderId = String(req.params.orderId || '');
  const token = typeof req.query.t === 'string' ? req.query.t : undefined;
  if (!isOrderId(orderId) || !verifyLaunchToken(orderId, token)) {
    return res.status(403).type('html').send(messagePage('Link expired', 'This payment link is no longer valid. Go back to KANAKU and start the purchase again.'));
  }
  const order = await prisma.paymentOrder.findUnique({ where: { id: orderId }, select: { provider: true, status: true } });
  if (!order || order.provider !== 'paytm' || order.status !== 'CREATED') {
    return res.status(409).type('html').send(messagePage('Purchase closed', 'This purchase is no longer open. Go back to KANAKU to check its status or buy again.'));
  }
  const form = paytmProvider.launchForm(orderId);
  if (!form) {
    return res.status(410).type('html').send(messagePage('Link expired', 'This payment link has expired. Go back to KANAKU and start the purchase again.'));
  }
  const nonce = randomBytes(16).toString('base64');
  // Replaces the API-wide policy for this one page: its only script is the
  // nonce'd auto-submit, and its only form may post to Paytm.
  res.setHeader(
    'Content-Security-Policy',
    `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; form-action ${new URL(form.action).origin}; base-uri 'none'; frame-ancestors 'none'`,
  );
  return res.type('html').send(autoSubmitPage(form.action, form.fields, nonce));
};

/**
 * GET|POST /payments/return/:provider
 *
 * Where a gateway sends the user's browser after paying (Paytm posts its
 * result here). It proves nothing — anyone can post to it — so it only asks
 * the provider for the order's real status (crediting if the PROVIDER says
 * paid) and sends the browser on to the wallet page to watch the order.
 */
export const handleProviderReturn = async (req: AuthRequest & { rawBody?: unknown }, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  const providerId = String(req.params.provider || '');
  let orderId: string | undefined;
  if (providerId === 'paytm') {
    const raw = Buffer.isBuffer(req.rawBody)
      ? req.rawBody
      : Buffer.from(new URLSearchParams(Object.entries(req.query).map(([k, v]) => [k, String(v)])).toString());
    orderId = paytmProvider.verifyReturn(raw).orderId;
  } else {
    const fromQuery = req.query.purchase ?? req.query.orderId;
    orderId = typeof fromQuery === 'string' ? fromQuery : undefined;
  }

  if (isOrderId(orderId)) {
    const order = await prisma.paymentOrder.findUnique({ where: { id: orderId }, select: { provider: true, creditedAt: true } });
    if (order && order.provider === providerId && !order.creditedAt) {
      // Settle from the provider's own answer; never block the redirect on it.
      void reconcileOrder(orderId, 'callback').catch((error) => logger.warn('[payments] return reconcile failed', { orderId, error }));
    }
    const target = purchaseReturnUrl(orderId);
    if (target) return res.redirect(303, target);
  }
  return res.type('html').send(messagePage('Payment submitted', 'You can close this page and return to KANAKU. Your coins appear as soon as the payment is confirmed.'));
};
