import { Response } from 'express';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { sessionJoinUrl, videoRoomsUseTokens } from './videoRoom';
import { prisma } from '../../db/prisma';
import { getSocketManager } from '../../sockets';
import { logger } from '../../config/logger';
import { encryptMessageBody, decryptMessageRow, MessageEncryptionUnavailableError } from './message.crypto';
import { notify } from '../notifications/notify';
import { asClientRequestId } from '../../utils/idempotentCreate';
import { validateBillUpload, makeStoragePath } from '../../utils/uploadPolicy';
import { uploadBuffer, createSignedUrl } from '../../utils/storage';
import { audit } from '../../utils/auditLogger';
import { checkTransition, failureHttpStatus } from '../bookings/booking.stateMachine';
import {
  cancelBookingWithRefund,
  chatAllowed,
  completeSessionWithRelease,
  deriveLifecycle,
  describeBookingState,
  sessionAccess,
} from '../wallet/sessionPayment.service';
import { isWalletError } from '../wallet/wallet.errors';

/** Chat is locked while the session is unpaid, and after it ends. */
const chatLockedResponse = (res: Response, lifecycle: string) =>
  res.status(423).json({
    error: lifecycle === 'AWAITING_PAYMENT' || lifecycle === 'PAYMENT_DUE'
      ? 'Chat unlocks once the session is paid.'
      : 'This conversation is closed.',
    code: 'SESSION_LOCKED',
    lifecycle,
  });

const MESSAGE_SELECT = {
  id: true,
  sessionId: true,
  senderId: true,
  message: true,
  timestamp: true,
  readAt: true,
  attachmentName: true,
  attachmentType: true,
  attachmentSize: true,
  sender: { select: { id: true, name: true } },
} as const;

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
        // Names only: contact happens through the session chat, so neither side
        // needs the other's email from this route.
        advisor: { select: { id: true, name: true } },
        client: { select: { id: true, name: true } },
        // Explicit select — `include` returned attachmentPath, a private storage key.
        chatMessages: { orderBy: { timestamp: 'asc' }, select: MESSAGE_SELECT },
      },
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Verify user is involved in this session
    if (session.advisorId !== userId && session.clientId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { booking, ...rest } = session;
    // This route embeds the whole thread, so it needs the same decryption the
    // dedicated messages route does — otherwise the chat renders as base64.
    res.json({
      ...rest,
      booking: { id: booking.id, status: booking.status, duration: booking.duration, sessionType: booking.sessionType },
      paymentState: describeBookingState(booking, { id: session.id, status: session.status }, userId, new Date()),
      chatMessages: session.chatMessages.map(decryptMessageRow),
    });
  } catch (error: any) {
    logger.error('[Sessions] Failed to fetch session', { error });
    res.status(500).json({ error: 'Failed to fetch session' });
  }
};

/** Whether the caller may enter the session right now — decided on the server clock. */
export const getSessionAccess = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const access = await sessionAccess(req.params.id, userId);
    if (!access) return res.status(404).json({ error: 'Session not found' });
    if (!access.state.canJoin) {
      audit({ event: 'session.access_denied', userId, resource: 'AdvisorSession', resourceId: req.params.id, meta: { lifecycle: access.state.lifecycle } });
    }
    let joinUrl: string | undefined;
    if (access.state.canJoin) {
      // With a token-authenticated Jitsi the link carries a room-scoped token
      // for this participant, valid until the join window closes (videoRoom.ts).
      const me = videoRoomsUseTokens()
        ? await prisma.user.findUnique({ where: { id: userId }, select: { name: true } })
        : null;
      joinUrl = sessionJoinUrl(
        req.params.id,
        { id: userId, name: me?.name, moderator: access.role === 'advisor' },
        (access.state as { joinClosesAt?: string | null }).joinClosesAt ?? null,
      );
    }
    return res.json({
      success: true,
      data: { ...access.state, role: access.role, ...(joinUrl ? { joinUrl } : {}) },
    });
  } catch (error) {
    logger.error('[Sessions] access check failed', { sessionId: req.params?.id, error });
    return res.status(500).json({ error: 'Failed to check session access' });
  }
};

/** Mark the other participant's messages in this session as read. */
export const markMessagesRead = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const { id: sessionId } = req.params;
    const session = await prisma.advisorSession.findFirst({
      where: { id: sessionId, OR: [{ advisorId: userId }, { clientId: userId }] },
      select: { id: true, advisorId: true, clientId: true },
    });
    if (!session) return res.status(404).json({ error: 'Session not found' });
    const now = new Date();
    const { count } = await prisma.chatMessage.updateMany({
      where: { sessionId, senderId: { not: userId }, readAt: null, timestamp: { lte: now } },
      data: { readAt: now },
    });
    if (count > 0) {
      const otherUserId = session.advisorId === userId ? session.clientId : session.advisorId;
      try {
        getSocketManager().notifyUser(otherUserId, 'messages_read', { sessionId, readAt: now.toISOString(), readerId: userId });
      } catch {
        // best-effort; the reader's state is already saved
      }
    }
    return res.json({ success: true, data: { marked: count, readAt: now.toISOString() } });
  } catch (error) {
    logger.error('[Sessions] mark read failed', { sessionId: req.params?.id, error });
    return res.status(500).json({ error: 'Failed to update read state' });
  }
};

/** Unread message counts across the caller's sessions. */
export const getUnreadCounts = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const rows = await prisma.chatMessage.groupBy({
      by: ['sessionId'],
      where: {
        readAt: null,
        senderId: { not: userId },
        session: { OR: [{ advisorId: userId }, { clientId: userId }] },
      },
      _count: { _all: true },
    });
    const counts = Object.fromEntries(rows.map((r) => [r.sessionId, r._count._all]));
    return res.json({ success: true, data: { counts, total: rows.reduce((sum, r) => sum + r._count._all, 0) } });
  } catch (error) {
    logger.error('[Sessions] unread counts failed', { error });
    return res.status(500).json({ error: 'Failed to load unread counts' });
  }
};

// Send chat message
export const sendMessage = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const { id: sessionId } = req.params;
    const { message } = req.body;
    const messageRequestKey = asClientRequestId(req.body?.clientRequestId);

    if (!message || message.trim() === '') {
      return res.status(400).json({ error: 'Message cannot be empty' });
    }

    // Idempotent replay — a retried send must not post the message twice into
    // the thread. Returns the stored row with its plaintext restored.
    if (messageRequestKey) {
      const replay = await prisma.chatMessage.findFirst({
        where: { senderId: userId, clientRequestId: messageRequestKey },
        include: { sender: { select: { id: true, name: true } } },
      });
      if (replay) return res.status(200).json(decryptMessageRow(replay));
    }

    const session = await prisma.advisorSession.findFirst({
      where: {
        id: sessionId,
        OR: [
          { advisorId: userId },
          { clientId: userId },
        ],
      },
      include: { booking: true },
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Session must be in progress
    if (session.status !== 'in-progress' && session.status !== 'scheduled') {
      return res.status(400).json({ error: 'Cannot send messages in a ended session' });
    }

    const lifecycle = deriveLifecycle(session.booking, session.status, new Date());
    if (!chatAllowed(lifecycle)) return chatLockedResponse(res, lifecycle);

    const plaintext = message.trim();

    const storedMessage = await prisma.chatMessage.create({
      data: {
        sessionId,
        senderId: userId,
        // Encrypted at rest (AES-256-GCM, per-sender DEK, AAD = sessionId).
        // Consultations previously sat in the database as readable text.
        message: encryptMessageBody(userId, sessionId, plaintext),
        clientRequestId: messageRequestKey,
      },
      include: {
        sender: {
          select: { id: true, name: true },
        },
      },
    });

    // Everything downstream — the response, the socket push — must carry the
    // plaintext the sender typed, not the ciphertext that was stored.
    const chatMessage = { ...storedMessage, message: plaintext };

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
    await notify({
      userId: otherUserId,
      sourceUserId: userId,
      topic: 'session',
      type: 'session_message',
      title: 'New Message',
      message: `${senderName}: ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}`,
      deepLink: otherUserId === session.advisorId ? '/advisor-panel' : '/book-advisor',
      // A back-and-forth is many messages in a short window. Without
      // coalescing each one becomes its own row and its own push.
      coalesce: {
        withinMs: 5 * 60_000,
        summarize: (count: number) => ({
          title: 'New Messages',
          message: `${count} new messages from ${senderName}`,
        }),
      },
    });

    res.status(201).json(chatMessage);
  } catch (error: any) {
    // Encryption unavailable ⇒ nothing was written. Say so as an outage rather
    // than a generic 500, so the client can offer "try again" instead of
    // leaving the user unsure whether their message was delivered.
    if (error instanceof MessageEncryptionUnavailableError) {
      return res.status(503).json({ error: error.message, code: error.code });
    }
    // Never echo `error.message` — it can carry Prisma/driver internals.
    logger.error('[Sessions] Failed to send message', {
      sessionId: req.params?.id,
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: 'Failed to send message', code: 'MESSAGE_SEND_FAILED' });
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
      include: { booking: true },
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.status !== 'in-progress' && session.status !== 'scheduled') {
      return res.status(400).json({ error: 'Cannot share files in an ended session' });
    }

    const attachLifecycle = deriveLifecycle(session.booking, session.status, new Date());
    if (!chatAllowed(attachLifecycle)) return chatLockedResponse(res, attachLifecycle);

    let validated;
    try {
      validated = await validateBillUpload(file);
    } catch (err: any) {
      return res.status(400).json({ error: err?.message || 'Unsupported file type' });
    }

    const caption = typeof req.body?.message === 'string' ? req.body.message.trim().slice(0, 1000) : '';

    // Encrypt BEFORE the upload, not after. Encryption can now fail closed, and
    // a failure after `uploadBuffer` would strand the object in the bucket with
    // no row pointing at it. Encrypting first is free to abandon.
    // An empty caption stays empty rather than becoming a ciphertext blob that
    // renders as noise.
    const storedCaption = caption ? encryptMessageBody(userId, sessionId, caption) : caption;

    const storagePath = makeStoragePath(userId, validated.extension, `session-${sessionId}`);
    await uploadBuffer(storagePath, validated.buffer, validated.contentType);

    const storedShare = await prisma.chatMessage.create({
      data: {
        sessionId,
        senderId: userId,
        message: storedCaption,
        attachmentPath: storagePath,
        attachmentName: validated.originalName,
        attachmentType: validated.contentType,
        attachmentSize: validated.buffer.length,
      },
      include: { sender: { select: { id: true, name: true } } },
    });
    const chatMessage = { ...storedShare, message: caption };

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
    await notify({
      userId: otherUserId,
      sourceUserId: userId,
      topic: 'session',
      type: 'session_document',
      title: 'New Document',
      message: `${senderName} shared ${validated.originalName}`,
      deepLink: otherUserId === session.advisorId ? '/advisor-panel' : '/book-advisor',
    });

    // The storage key never leaves the server.
    const { attachmentPath, ...safe } = chatMessage;
    res.status(201).json({ ...safe, hasAttachment: true });
  } catch (error: any) {
    if (error instanceof MessageEncryptionUnavailableError) {
      return res.status(503).json({ error: error.message, code: error.code });
    }
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
      select: MESSAGE_SELECT,
    });

    // Rows written before encryption existed carry no marker and pass through
    // untouched, so old threads keep rendering without a backfill.
    res.json(messages.map(decryptMessageRow));
  } catch (error: any) {
    logger.error('[Sessions] Failed to fetch messages', { sessionId: req.params?.id, error });
    res.status(500).json({ error: 'Failed to fetch messages' });
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

    // Paid (or free) AND inside the join window, on the server clock.
    const access = await sessionAccess(id, advisorId);
    if (!access || access.state.lifecycle !== 'READY') {
      const lifecycle = access?.state.lifecycle ?? 'UNKNOWN';
      audit({ event: 'session.access_denied', userId: advisorId, resource: 'AdvisorSession', resourceId: id, meta: { lifecycle, action: 'start' } });
      return res.status(423).json({
        error: lifecycle === 'AWAITING_PAYMENT' || lifecycle === 'PAYMENT_DUE'
          ? 'This session has not been paid yet.'
          : lifecycle === 'UPCOMING'
            ? 'This session cannot be started yet.'
            : 'This session can no longer be started.',
        code: 'SESSION_LOCKED',
        lifecycle,
        state: access?.state,
      });
    }

    // Conditional: two taps (or advisor + auto-cancel) cannot both move it.
    const { count } = await prisma.advisorSession.updateMany({
      where: { id, status: 'scheduled' },
      data: { status: 'in-progress', startTime: new Date() },
    });
    if (count === 0) {
      return res.status(409).json({ error: 'Session is no longer scheduled', code: 'SESSION_CONFLICT' });
    }
    const updated = await prisma.advisorSession.findUniqueOrThrow({ where: { id } });
    audit({ event: 'session.unlocked', userId: advisorId, resource: 'AdvisorSession', resourceId: id, meta: { bookingId: session.bookingId } });

    // Notify client. '/sessions/:id' is not a registered frontend route —
    // client sessions live under book-advisor's "My Bookings" tab.
    await notify({
      userId: session.clientId,
      topic: 'session',
      type: 'session_started',
      title: 'Session Started',
      message: 'Your advisor has started the session',
      deepLink: '/book-advisor',
      priority: 'high',
    });

    res.json(updated);
  } catch (error: any) {
    logger.error('[Sessions] Failed to start session', { sessionId: req.params?.id, error });
    res.status(500).json({ error: 'Failed to start session' });
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

    // Completion, the booking's status and the release of the advisor's held
    // earnings are one transaction.
    const completion = await completeSessionWithRelease(id, { kind: 'advisor', userId: advisorId }, notes || '');
    const updated = completion.session;

    // Legacy record-keeping for sessions booked before coin payments (free /
    // off-platform fees): unchanged. Coin-paid sessions are fully described by
    // the wallet ledger and get no legacy Payment row.
    const existingPayment = await prisma.payment.findUnique({
      where: { sessionId: id },
    });

    if (!existingPayment) {
      const booking = await prisma.bookingRequest.findUnique({
        where: { id: session.bookingId },
      });

      if (booking && booking.paymentStatus === 'NOT_REQUIRED' && Number(booking.amount) > 0) {
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
    await notify({
      userId: session.clientId,
      topic: 'session',
      type: 'session_completed',
      title: 'Session Completed',
      message: 'The session has been completed. Please rate your experience.',
      deepLink: '/book-advisor',
    });

    res.json(updated);
  } catch (error: any) {
    if (isWalletError(error)) return res.status(error.status).json({ error: error.message, code: error.code });
    logger.error('[Sessions] Failed to complete session', { sessionId: req.params?.id, error });
    res.status(500).json({ error: 'Failed to complete session' });
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

    const actor = session.advisorId === userId ? 'advisor' as const : 'client' as const;
    const booking = await prisma.bookingRequest.findUnique({ where: { id: session.bookingId } });
    if (booking) {
      const failure = checkTransition({ from: booking.status, to: 'cancelled', actor, actorId: userId, proposedBy: booking.rescheduleProposedBy, rescheduleCount: booking.rescheduleCount });
      if (failure) return res.status(failureHttpStatus(failure)).json({ error: failure.message, code: failure.code });
    }

    // Session, booking and any coin refund change together. This route used to
    // cancel the session but leave the booking 'accepted', and marked the legacy
    // payment 'refunded' without returning anything.
    const outcome = await cancelBookingWithRefund(session.bookingId, { actor, actorId: userId, reason: reason ?? null });
    if (!outcome.changed) {
      // Lost a race (the other party, or the session clock, moved it first):
      // say so instead of reporting a cancellation and notifying for nothing.
      return res.status(409).json({ error: 'This session changed while you were cancelling it. Reload and try again.', code: 'BOOKING_CONFLICT' });
    }
    const updated = await prisma.advisorSession.findUniqueOrThrow({ where: { id } });

    // Notify both parties
    const otherUserId = session.advisorId === userId ? session.clientId : session.advisorId;
    const canceller = session.advisorId === userId ? 'Advisor' : 'Client';

    await notify({
      userId: otherUserId,
      topic: 'session',
      type: 'session_cancelled',
      title: 'Session Cancelled',
      message: `${canceller} has cancelled the session${reason ? ': ' + reason : ''}`,
      deepLink: '/book-advisor',
      priority: 'high',
    });

    res.json(updated);
  } catch (error: any) {
    if (isWalletError(error)) return res.status(error.status).json({ error: error.message, code: error.code });
    logger.error('[Sessions] Failed to cancel session', { sessionId: req.params?.id, error });
    res.status(500).json({ error: 'Failed to cancel session' });
  }
};
