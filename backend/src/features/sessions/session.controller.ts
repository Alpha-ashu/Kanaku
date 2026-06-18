import { Response } from 'express';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { prisma } from '../../db/prisma';

// Get session details
export const getSession = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const session = await prisma.advisorSession.findFirst({
      where: {
        id,
        OR: [
          { advisorId: userId },
          { clientId: userId },
        ],
      },
      include: {
        booking: true,
        advisor: {
          select: { id: true, name: true, email: true },
        },
        client: {
          select: { id: true, name: true, email: true },
        },
        chatMessages: {
          orderBy: { timestamp: 'asc' },
          include: {
            sender: {
              select: { id: true, name: true },
            },
          },
        },
        payment: true,
      },
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Verify user is involved in this session
    if (session.advisorId !== userId && session.clientId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(session);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch session' });
  }
};

// Send chat message
export const sendMessage = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const { id: sessionId } = req.params;
    const { message } = req.body;

    if (!message || message.trim() === '') {
      return res.status(400).json({ error: 'Message cannot be empty' });
    }

    const session = await prisma.advisorSession.findFirst({
      where: {
        id: sessionId,
        OR: [
          { advisorId: userId },
          { clientId: userId },
        ],
      },
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Session must be in progress
    if (session.status !== 'in-progress' && session.status !== 'scheduled') {
      return res.status(400).json({ error: 'Cannot send messages in a ended session' });
    }

    const chatMessage = await prisma.chatMessage.create({
      data: {
        sessionId,
        senderId: userId,
        message: message.trim(),
      },
      include: {
        sender: {
          select: { id: true, name: true },
        },
      },
    });

    // Notify the other party
    const otherUserId = session.advisorId === userId ? session.clientId : session.advisorId;
    const senderName = req.user?.name || 'User';

    // TODO: Implement WebSocket notification for real-time delivery
    // For now, create a notification
    await prisma.notification.create({
      data: {
        userId: otherUserId,
        title: 'New Message',
        message: `${senderName}: ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}`,
        category: 'session',
        deepLink: `/sessions/${sessionId}`,
      },
    });

    res.status(201).json(chatMessage);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to send message' });
  }
};

// Get session messages
export const getMessages = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const { id: sessionId } = req.params;

    const session = await prisma.advisorSession.findFirst({
      where: {
        id: sessionId,
        OR: [
          { advisorId: userId },
          { clientId: userId },
        ],
      },
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Verify user is involved
    if (session.advisorId !== userId && session.clientId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const messages = await prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { timestamp: 'asc' },
      include: {
        sender: {
          select: { id: true, name: true },
        },
      },
    });

    res.json(messages);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch messages' });
  }
};

// Start session (move from scheduled to in-progress)
export const startSession = async (req: AuthRequest, res: Response) => {
  try {
    const advisorId = getUserId(req);
    const { id } = req.params;

    const session = await prisma.advisorSession.findFirst({
      where: { id, advisorId },
    });

    if (!session) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (session.status !== 'scheduled') {
      return res.status(400).json({ error: 'Session is not in scheduled status' });
    }

    const updated = await prisma.advisorSession.update({
      where: { id },
      data: {
        status: 'in-progress',
        startTime: new Date(),
      },
    });

    // Notify client
    await prisma.notification.create({
      data: {
        userId: session.clientId,
        title: 'Session Started',
        message: 'Your advisor has started the session',
        category: 'session',
        deepLink: `/sessions/${id}`,
      },
    });

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to start session' });
  }
};

// Complete session (move from in-progress to completed)
export const completeSession = async (req: AuthRequest, res: Response) => {
  try {
    const advisorId = getUserId(req);
    const { id } = req.params;
    const { notes } = req.body;

    const session = await prisma.advisorSession.findFirst({
      where: { id, advisorId },
    });

    if (!session) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (session.status !== 'in-progress') {
      return res.status(400).json({ error: 'Session is not in progress' });
    }

    const updated = await prisma.advisorSession.update({
      where: { id },
      data: {
        status: 'completed',
        endTime: new Date(),
        notes: notes || '',
      },
    });

    // Try to process payment automatically (if not already done)
    const existingPayment = await prisma.payment.findUnique({
      where: { sessionId: id },
    });

    if (!existingPayment) {
      const booking = await prisma.bookingRequest.findUnique({
        where: { id: session.bookingId },
      });

      if (booking) {
        await prisma.payment.create({
          data: {
            sessionId: id,
            clientId: session.clientId,
            advisorId: advisorId,
            amount: booking.amount,
            currency: 'USD',
            status: 'pending',
            description: `Payment for ${session.sessionType} session`,
          },
        });
      }
    }

    // Notify client to rate the session
    await prisma.notification.create({
      data: {
        userId: session.clientId,
        title: 'Session Completed',
        message: 'The session has been completed. Please rate your experience.',
        category: 'session',
        deepLink: `/sessions/${id}/rate`,
      },
    });

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to complete session' });
  }
};

// Cancel session
export const cancelSession = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const { reason } = req.body;

    const session = await prisma.advisorSession.findFirst({
      where: {
        id,
        OR: [
          { advisorId: userId },
          { clientId: userId },
        ],
      },
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Either advisor or client can cancel
    if (session.advisorId !== userId && session.clientId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (session.status === 'completed' || session.status === 'cancelled') {
      return res.status(400).json({ error: 'Cannot cancel a completed or already cancelled session' });
    }

    const updated = await prisma.advisorSession.update({
      where: { id },
      data: { status: 'cancelled' },
    });

    // Refund payment if completed
    const payment = await prisma.payment.findUnique({
      where: { sessionId: id },
    });

    if (payment && payment.status === 'completed') {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'refunded' },
      });
    }

    // Notify both parties
    const otherUserId = session.advisorId === userId ? session.clientId : session.advisorId;
    const canceller = session.advisorId === userId ? 'Advisor' : 'Client';

    await prisma.notification.create({
      data: {
        userId: otherUserId,
        title: 'Session Cancelled',
        message: `${canceller} has cancelled the session${reason ? ': ' + reason : ''}`,
        category: 'session',
      },
    });

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to cancel session' });
  }
};
