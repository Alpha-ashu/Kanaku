import { Response } from 'express';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { prisma } from '../../db/prisma';
import { getSocketManager } from '../../sockets';
import { logger } from '../../config/logger';
import { validateBillUpload, makeStoragePath } from '../../utils/uploadPolicy';
import { uploadBuffer, createSignedUrl } from '../../utils/storage';

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

    // Real-time delivery: push the message straight to the recipient's socket
    // room so an open chat updates instantly. Best-effort — a disconnected
    // recipient still gets the durable DB notification below and sees the
    // message on next fetch. Never let a socket hiccup fail the send.
    try {
      getSocketManager().notifyUser(otherUserId, 'new_message', {
        sessionId,
        message: chatMessage,
      });
    } catch (emitErr) {
      logger.warn('[Sessions] Real-time message emit failed (non-fatal)', {
        sessionId,
        error: emitErr instanceof Error ? emitErr.message : String(emitErr),
      });
    }

    // Durable fallback notification (covers offline recipients).
    // '/sessions/:id' is not a registered frontend route (see App.tsx's page
    // switch) — falls through to the Dashboard default case. `otherUserId` can
    // be either party depending on who sent the message, so the destination
    // has to follow: sessions live under advisor-panel for the advisor
    // (advisor-only) and under book-advisor's "My Bookings" for the client.
    await prisma.notification.create({
      data: {
        userId: otherUserId,
        title: 'New Message',
        message: `${senderName}: ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}`,
        category: 'session',
        deepLink: otherUserId === session.advisorId ? '/advisor-panel' : '/book-advisor',
      },
    });

    res.status(201).json(chatMessage);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to send message' });
  }
};

/**
 * Share a document inside a consultation thread.
 *
 * Kept separate from sendMessage rather than turning that route multipart: the
 * JSON path is what the chat input uses on every keystroke-send, and mixing the
 * two would make every plain message pay for multipart parsing.
 *
 * The file is validated by content (magic bytes), not by the name or the
 * client-declared type — an .exe renamed to .pdf is rejected — and is stored
 * under a private key. Only a short-lived signed URL is ever handed out.
 */
export const uploadMessageAttachment = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const { id: sessionId } = req.params;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'A file is required' });
    }

    const session = await prisma.advisorSession.findFirst({
      where: {
        id: sessionId,
        OR: [{ advisorId: userId }, { clientId: userId }],
      },
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.status !== 'in-progress' && session.status !== 'scheduled') {
      return res.status(400).json({ error: 'Cannot share files in an ended session' });
    }

    let validated;
    try {
      validated = await validateBillUpload(file);
    } catch (err: any) {
      return res.status(400).json({ error: err?.message || 'Unsupported file type' });
    }

    const storagePath = makeStoragePath(userId, validated.extension, `session-${sessionId}`);
    await uploadBuffer(storagePath, validated.buffer, validated.contentType);

    const caption = typeof req.body?.message === 'string' ? req.body.message.trim().slice(0, 1000) : '';

    const chatMessage = await prisma.chatMessage.create({
      data: {
        sessionId,
        senderId: userId,
        message: caption,
        attachmentPath: storagePath,
        attachmentName: validated.originalName,
        attachmentType: validated.contentType,
        attachmentSize: validated.buffer.length,
      },
      include: { sender: { select: { id: true, name: true } } },
    });

    const otherUserId = session.advisorId === userId ? session.clientId : session.advisorId;
    const senderName = req.user?.name || 'User';

    try {
      getSocketManager().notifyUser(otherUserId, 'new_message', { sessionId, message: chatMessage });
    } catch (emitErr) {
      logger.warn('[Sessions] Real-time attachment emit failed (non-fatal)', {
        sessionId,
        error: emitErr instanceof Error ? emitErr.message : String(emitErr),
      });
    }

    // See the New Message notification above for why this deepLink is
    // conditional rather than the (unregistered) '/sessions/:id' route.
    await prisma.notification.create({
      data: {
        userId: otherUserId,
        title: 'New Document',
        message: `${senderName} shared ${validated.originalName}`,
        category: 'session',
        deepLink: otherUserId === session.advisorId ? '/advisor-panel' : '/book-advisor',
      },
    });

    // The storage key never leaves the server.
    const { attachmentPath, ...safe } = chatMessage;
    res.status(201).json({ ...safe, hasAttachment: true });
  } catch (error: any) {
    logger.error('Failed to attach file to session message', { error: error.message });
    res.status(500).json({ error: 'Failed to share the document' });
  }
};

/**
 * Issue a short-lived signed URL for an attachment. Both parties to the session
 * can read it; nobody else can, and the URL expires on its own.
 */
export const getMessageAttachment = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const { id: sessionId, messageId } = req.params;

    const message = await prisma.chatMessage.findFirst({
      where: {
        id: messageId,
        sessionId,
        session: {
          OR: [{ advisorId: userId }, { clientId: userId }],
        },
      },
      select: { attachmentPath: true, attachmentName: true, attachmentType: true },
    });

    if (!message?.attachmentPath) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    const url = await createSignedUrl(message.attachmentPath);
    if (!url) {
      return res.status(503).json({ error: 'Attachment storage is unavailable' });
    }

    res.json({ url, name: message.attachmentName, contentType: message.attachmentType });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to open the attachment' });
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
      // Explicit select: attachmentPath is a private storage key and must not
      // travel to the client. Attachments are opened through the signed-URL
      // route instead.
      select: {
        id: true,
        sessionId: true,
        senderId: true,
        message: true,
        timestamp: true,
        attachmentName: true,
        attachmentType: true,
        attachmentSize: true,
        sender: { select: { id: true, name: true } },
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

    // Notify client. '/sessions/:id' is not a registered frontend route —
    // client sessions live under book-advisor's "My Bookings" tab.
    await prisma.notification.create({
      data: {
        userId: session.clientId,
        title: 'Session Started',
        message: 'Your advisor has started the session',
        category: 'session',
        deepLink: '/book-advisor',
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
            currency: 'INR',
            status: 'pending',
            description: `Payment for ${session.sessionType} session`,
          },
        });
      }
    }

    // Notify client to rate the session. '/sessions/:id/rate' is not a
    // registered frontend route — client sessions live under book-advisor's
    // "My Bookings" tab.
    await prisma.notification.create({
      data: {
        userId: session.clientId,
        title: 'Session Completed',
        message: 'The session has been completed. Please rate your experience.',
        category: 'session',
        deepLink: '/book-advisor',
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
