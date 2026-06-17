import { Response } from 'express';
import { timingSafeEqual } from 'crypto';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { prisma } from '../../db/prisma';

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

const normalizePaymentMethod = (paymentMethod: unknown) => {
  if (typeof paymentMethod !== 'string') return null;
  const normalized = paymentMethod.trim().toLowerCase();
  return ALLOWED_PAYMENT_METHODS.has(normalized) ? normalized : null;
};

const canTransitionPayment = (currentStatus: string, nextStatus: string) =>
  PAYMENT_TRANSITIONS[currentStatus]?.includes(nextStatus) ?? false;

const requireWebhookSecret = (req: AuthRequest | any) => {
  const webhookSecret = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return {
      ok: false as const,
      status: 503,
      error: 'Payment webhook secret is not configured',
    };
  }

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

const markPaymentCompleted = async (paymentId: string, transactionId?: string) => {
  const payment = await loadPayment(paymentId);
  if (!payment) {
    throw new Error('PAYMENT_NOT_FOUND');
  }

  if (payment.status === 'completed') {
    return payment;
  }

  if (!canTransitionPayment(payment.status, 'completed')) {
    throw new Error('INVALID_PAYMENT_STATE');
  }

  const updated = await prisma.payment.update({
    where: { id: paymentId },
    data: {
      status: 'completed',
      transactionId: transactionId || payment.transactionId,
    },
  });

  await prisma.notification.create({
    data: {
      userId: payment.advisorId,
      title: 'Payment Received',
      message: `You received a payment of ${payment.amount} ${payment.currency}`,
      category: 'payment',
      deepLink: `/payments/${paymentId}`,
    },
  });

  return updated;
};

const markPaymentFailed = async (paymentId: string, reason?: string) => {
  const payment = await loadPayment(paymentId);
  if (!payment) {
    throw new Error('PAYMENT_NOT_FOUND');
  }

  if (payment.status === 'failed') {
    return payment;
  }

  if (!canTransitionPayment(payment.status, 'failed')) {
    throw new Error('INVALID_PAYMENT_STATE');
  }

  const updated = await prisma.payment.update({
    where: { id: paymentId },
    data: { status: 'failed' },
  });

  await prisma.notification.create({
    data: {
      userId: payment.clientId,
      title: 'Payment Failed',
      message: `Your payment of ${payment.amount} ${payment.currency} failed${reason ? `: ${reason}` : ''}. Please try again.`,
      category: 'payment',
      deepLink: `/sessions/${payment.sessionId}`,
    },
  });

  return updated;
};

const markPaymentRefunded = async (paymentId: string, reason?: string) => {
  const payment = await loadPayment(paymentId);
  if (!payment) {
    throw new Error('PAYMENT_NOT_FOUND');
  }

  if (payment.status === 'refunded') {
    return payment;
  }

  if (!canTransitionPayment(payment.status, 'refunded')) {
    throw new Error('INVALID_PAYMENT_STATE');
  }

  const updated = await prisma.payment.update({
    where: { id: paymentId },
    data: { status: 'refunded' },
  });

  await prisma.notification.createMany({
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
    res.status(500).json({ error: error.message || 'Failed to fetch payments' });
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
    res.status(500).json({ error: error.message || 'Failed to fetch payment' });
  }
};

// Initiate payment
export const initiatePayment = async (req: AuthRequest, res: Response) => {
  try {
    const clientId = getUserId(req);
    const { sessionId, description } = req.body;
    const paymentMethod = normalizePaymentMethod(req.body.paymentMethod);

    if (!sessionId || !paymentMethod) {
      return res.status(400).json({
        error: 'Missing or invalid fields: sessionId, paymentMethod',
      });
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
        currency: 'USD',
        status: 'pending',
        paymentMethod,
        description: typeof description === 'string' && description.trim()
          ? description.trim()
          : `Payment for ${session.sessionType} session`,
      },
    });

    res.status(201).json({ payment });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to initiate payment' });
  }
};

// Confirm payment completion (called by webhook or frontend)
export const completePayment = async (req: AuthRequest, res: Response) => {
  try {
    const actorId = getUserId(req);
    const { paymentId, transactionId } = req.body;

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

    const updated = await markPaymentCompleted(paymentId, transactionId);
    res.json(updated);
  } catch (error: any) {
    if (error.message === 'INVALID_PAYMENT_STATE') {
      return res.status(400).json({ error: 'Invalid payment state transition' });
    }
    if (error.message === 'PAYMENT_NOT_FOUND') {
      return res.status(404).json({ error: 'Payment not found' });
    }
    res.status(500).json({ error: error.message || 'Failed to complete payment' });
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
    res.status(500).json({ error: error.message || 'Failed to handle payment failure' });
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
    res.status(500).json({ error: error.message || 'Failed to refund payment' });
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
    console.error('Webhook error:', error);
    res.status(500).json({ error: error.message || 'Webhook processing failed' });
  }
};
