import { Response } from 'express';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { prisma } from '../../db/prisma';
import { isDatabaseUnavailableError } from '../../utils/databaseAvailability';
import { dispatchNotification } from '../notifications/notification.dispatcher';

// Create a new booking request
export const createBooking = async (req: AuthRequest, res: Response) => {
  try {
    const clientId = getUserId(req);
    const { advisorId, sessionType, description, proposedDate, proposedTime, duration, amount } = req.body;

    // Validate required fields — note: amount can legitimately be 0 (free session)
    if (!advisorId || !sessionType || !proposedDate || !proposedTime || !duration || amount === undefined || amount === null) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (advisorId === clientId) {
      return res.status(400).json({ error: 'You cannot book a consultation with yourself', code: 'SELF_BOOKING' });
    }

    const advisor = await prisma.user.findUnique({
      where: { id: advisorId },
      select: { id: true, name: true, role: true, isApproved: true },
    }).catch(() => null);

    if (!advisor || advisor.role !== 'advisor' || !advisor.isApproved) {
      return res.status(404).json({ error: 'Advisor not found or not approved' });
    }

    // proposedDate/proposedTime are the client's local wall-clock values with no
    // offset. Compare calendar dates against the earliest date currently in effect
    // anywhere (UTC-12) so no timezone ever sees a same-day booking refused, while a
    // day that has already ended everywhere is.
    const earliestToday = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString().slice(0, 10);
    if (proposedDate < earliestToday) {
      return res.status(400).json({ error: 'Please choose a date that has not already passed', code: 'BOOKING_IN_PAST' });
    }

    // Enforce the advisor's weekly schedule once they have one. An advisor with no
    // slots configured is still bookable (the request waits for accept/decline).
    const slots = await prisma.advisorAvailability.findMany({ where: { advisorId }, orderBy: { dayOfWeek: 'asc' } });
    if (slots.length > 0) {
      const dayOfWeek = new Date(`${proposedDate}T00:00:00Z`).getUTCDay();
      const toMinutes = (hhmm: string) => {
        const [h, m] = hhmm.split(':').map(Number);
        return h * 60 + m;
      };
      const start = toMinutes(proposedTime);
      const fits = slots.some((slot) => slot.isActive
        && slot.dayOfWeek === dayOfWeek
        && start >= toMinutes(slot.startTime)
        && start + Number(duration) <= toMinutes(slot.endTime));
      if (!fits) {
        const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const hours = slots.filter((slot) => slot.isActive)
          .map((slot) => `${DAYS[slot.dayOfWeek]} ${slot.startTime}-${slot.endTime}`)
          .join(', ');
        return res.status(400).json({
          error: hours
            ? `${advisor.name} is not available then. Available: ${hours}`
            : `${advisor.name} is not taking bookings right now`,
          code: 'ADVISOR_UNAVAILABLE',
        });
      }
    }

    const proposedDateTime = new Date(`${proposedDate}T${proposedTime}`);

    // One active request per client, advisor and slot. The Idempotency-Key only
    // dedupes exact replays — the web client mints a fresh key per click — so a
    // double-tap is serialised here: the lock makes the duplicate check and the
    // insert atomic.
    const { booking, created } = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`booking:${clientId}:${advisorId}:${proposedDate}:${proposedTime}`}))`;
      const duplicate = await tx.bookingRequest.findFirst({
        where: {
          clientId,
          advisorId,
          proposedDate: proposedDateTime,
          proposedTime,
          status: { in: ['pending', 'accepted', 'reschedule'] },
        },
      });
      if (duplicate) return { booking: duplicate, created: false };
      const row = await tx.bookingRequest.create({
        data: {
          clientId,
          advisorId,
          sessionType,
          description: description || '',
          proposedDate: proposedDateTime,
          proposedTime,
          duration,
          amount,
          status: 'pending',
        },
      });
      return { booking: row, created: true };
    });

    if (!created) {
      return res.status(200).json(booking);
    }

    // Create multi-channel notification for advisor (app, email, push).
    const clientName = req.user?.name || 'A client';
    await dispatchNotification({
      userId: advisorId,
      sourceUserId: clientId,
      title: 'New Booking Request',
      message: `${clientName} requested a ${sessionType} consultation on ${proposedDate} at ${proposedTime}`,
      type: 'booking_request',
      category: 'booking',
      deepLink: '/advisor-panel',
      priority: 'high',
      channels: ['app', 'email', 'push'],
    });

    res.status(201).json(booking);
  } catch (error: any) {
    console.error('Create booking error:', error);
    if (isDatabaseUnavailableError(error)) {
      return res.status(503).json({ error: 'Service temporarily unavailable', code: 'DB_OFFLINE' });
    }
    res.status(500).json({ error: 'Failed to create booking' });
  }
};

// Get user's bookings (as client or advisor)
export const getBookings = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const { role } = req.query;

    if (role === 'advisor') {
      // Get bookings where user is the advisor
      const bookings = await prisma.bookingRequest.findMany({
        where: { advisorId: userId },
        include: {
          client: {
            select: { id: true, name: true, email: true },
          },
          session: {
            select: {
              id: true,
              status: true,
              startTime: true,
              payment: {
                select: { id: true, status: true, amount: true, currency: true, paymentMethod: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
      return res.json(bookings);
    } else {
      // Get bookings where user is the client
      const bookings = await prisma.bookingRequest.findMany({
        where: { clientId: userId },
        include: {
          advisor: {
            select: { id: true, name: true, email: true },
          },
          // Accepting a booking creates the session that carries the chat
          // thread. Without it the client has no way to reach its own
          // conversation — /sessions/:id/messages is keyed by session id and
          // there is no "list my sessions" route for the client role.
          session: {
            select: {
              id: true,
              status: true,
              startTime: true,
              payment: {
                select: { id: true, status: true, amount: true, currency: true, paymentMethod: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
      return res.json(bookings);
    }
  } catch (error: any) {
    if (isDatabaseUnavailableError(error)) {
      return res.status(503).json({ error: 'Database is temporarily offline', code: 'DB_OFFLINE' });
    }
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
};

// Get specific booking
export const getBooking = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    const booking = await prisma.bookingRequest.findFirst({
      where: {
        id,
        OR: [
          { clientId: userId },
          { advisorId: userId },
        ],
      },
      include: {
        client: {
          select: { id: true, name: true, email: true },
        },
        advisor: {
          select: { id: true, name: true, email: true },
        },
        session: {
          select: {
            id: true,
            status: true,
            startTime: true,
            payment: {
              select: { id: true, status: true, amount: true, currency: true, paymentMethod: true },
            },
          },
        },
      },
    });

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Verify user is involved in this booking
    if (booking.clientId !== userId && booking.advisorId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(booking);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch booking' });
  }
};

// Accept booking (advisor only)
export const acceptBooking = async (req: AuthRequest, res: Response) => {
  try {
    const advisorId = getUserId(req);
    const { id } = req.params;

    const booking = await prisma.bookingRequest.findFirst({
      where: { id, advisorId },
    });

    if (!booking) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Conditional transition + session upsert in one transaction. A second tap
    // used to hit the unique AdvisorSession.bookingId and answer 500 (and could
    // re-open a cancelled booking); now it returns the accepted booking as-is.
    const outcome = await prisma.$transaction(async (tx) => {
      const { count } = await tx.bookingRequest.updateMany({
        where: { id, advisorId, status: { in: ['pending', 'reschedule'] } },
        data: { status: 'accepted' },
      });
      const current = await tx.bookingRequest.findUniqueOrThrow({ where: { id } });
      if (count === 0 && current.status !== 'accepted') {
        return { conflict: current.status };
      }
      const session = await tx.advisorSession.upsert({
        where: { bookingId: id },
        update: {},
        create: {
          bookingId: id,
          advisorId,
          clientId: current.clientId,
          startTime: current.proposedDate,
          sessionType: current.sessionType,
          status: 'scheduled',
        },
      });
      return { updated: current, session, transitioned: count === 1 };
    });

    if ('conflict' in outcome) {
      return res.status(409).json({ error: `This booking is already ${outcome.conflict} and cannot be accepted`, code: 'BOOKING_NOT_ACCEPTABLE' });
    }
    const { updated, session } = outcome;
    if (!outcome.transitioned) {
      return res.json({ booking: updated, session });
    }

    // Notify client via multi-channel delivery (app, email, push)
    await dispatchNotification({
      userId: booking.clientId,
      sourceUserId: advisorId,
      title: 'Booking Accepted',
      message: `Your advisor has accepted your ${booking.sessionType} consultation on ${booking.proposedDate}`,
      type: 'booking_accepted',
      category: 'booking',
      deepLink: '/book-advisor',
      priority: 'high',
      channels: ['app', 'email', 'push'],
    });

    res.json({ booking: updated, session });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to accept booking' });
  }
};

// Reject booking (advisor only)
export const rejectBooking = async (req: AuthRequest, res: Response) => {
  try {
    const advisorId = getUserId(req);
    const { id } = req.params;
    const { reason } = req.body;

    const booking = await prisma.bookingRequest.findFirst({
      where: { id, advisorId },
    });

    if (!booking) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Only an open request can be declined; a repeat tap must not re-notify the client.
    const { count } = await prisma.bookingRequest.updateMany({
      where: { id, advisorId, status: { in: ['pending', 'reschedule'] } },
      data: {
        status: 'rejected',
        rejectionReason: reason || '',
      },
    });
    const updated = await prisma.bookingRequest.findUniqueOrThrow({ where: { id } });
    if (count === 0) {
      if (updated.status === 'rejected') return res.json(updated);
      return res.status(409).json({ error: `This booking is already ${updated.status} and cannot be declined`, code: 'BOOKING_NOT_DECLINABLE' });
    }

    // Notify client via multi-channel delivery (app, email, push)
    await dispatchNotification({
      userId: booking.clientId,
      sourceUserId: advisorId,
      title: 'Booking Declined',
      message: `Your advisor declined your booking request${reason ? `: ${reason}` : ''}`,
      type: 'booking_rejected',
      category: 'booking',
      deepLink: '/book-advisor',
      priority: 'normal',
      channels: ['app', 'email', 'push'],
    });

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to reject booking' });
  }
};

export const rescheduleBooking = async (req: AuthRequest, res: Response) => {
  try {
    const advisorId = getUserId(req);
    const { id } = req.params;
    const { proposedDate, proposedTime, reason } = req.body;

    if (!proposedDate || !proposedTime) {
      return res.status(400).json({ error: 'proposedDate and proposedTime are required' });
    }

    const booking = await prisma.bookingRequest.findFirst({
      where: { id, advisorId },
    });

    if (!booking) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const nextDate = new Date(`${proposedDate}T${proposedTime}`);
    if (Number.isNaN(nextDate.getTime())) {
      return res.status(400).json({ error: 'Invalid proposed date/time' });
    }

    const updated = await prisma.bookingRequest.update({
      where: { id },
      data: {
        status: 'reschedule',
        proposedDate: nextDate,
        proposedTime,
        rejectionReason: reason || '',
      },
    });

    // Notify client via multi-channel delivery (app, email, push)
    await dispatchNotification({
      userId: booking.clientId,
      sourceUserId: advisorId,
      title: 'Booking Reschedule Requested',
      message: `Your advisor proposed a new time: ${proposedDate} ${proposedTime}${reason ? ` (${reason})` : ''}`,
      type: 'booking_rescheduled',
      category: 'booking',
      deepLink: '/book-advisor',
      priority: 'high',
      channels: ['app', 'email', 'push'],
    });

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to reschedule booking' });
  }
};

// Cancel booking (client only)
export const cancelBooking = async (req: AuthRequest, res: Response) => {
  try {
    const clientId = getUserId(req);
    const { id } = req.params;

    const booking = await prisma.bookingRequest.findFirst({
      where: { id, clientId },
    });

    if (!booking) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (booking.status === 'completed' || booking.status === 'cancelled') {
      return res.status(400).json({ error: 'Cannot cancel this booking' });
    }

    const updated = await prisma.bookingRequest.update({
      where: { id },
      data: { status: 'cancelled' },
    });

    // Notify advisor via multi-channel delivery (app, email, push)
    await dispatchNotification({
      userId: booking.advisorId,
      sourceUserId: clientId,
      title: 'Booking Cancelled',
      message: 'A client has cancelled their booking request.',
      type: 'booking_cancelled',
      category: 'booking',
      deepLink: '/advisor-panel',
      priority: 'normal',
      channels: ['app', 'email', 'push'],
    });

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to cancel booking' });
  }
};

// Get advisor workspace: list clients with financial summaries
export const getAdvisorClients = async (req: AuthRequest, res: Response) => {
  try {
    const advisorId = getUserId(req);

    const sessions = await prisma.advisorSession.findMany({
      where: { advisorId },
      include: {
        client: {
          select: { id: true, name: true, email: true, createdAt: true },
        },
      },
      orderBy: { startTime: 'desc' },
    });

    // Deduplicate clients
    const clientsMap = new Map<string, typeof sessions[0]['client']>();
    sessions.forEach(s => { if (s.client) clientsMap.set(s.clientId, s.client); });
    const clients = Array.from(clientsMap.values());

    return res.json({ clients, totalClients: clients.length });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch clients' });
  }
};

// Mark session fee as paid
export const markFeePaid = async (req: AuthRequest, res: Response) => {
  try {
    const advisorId = getUserId(req);
    const { bookingId } = req.params;
    const { amount, paymentMethod, paymentReference } = req.body;

    const booking = await prisma.bookingRequest.findFirst({ where: { id: bookingId, advisorId } });
    if (!booking) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Create payment record if the model exists
    let payment: any = null;
    try {
      payment = await (prisma as any).payment?.create({
        data: {
          bookingId,
          clientId: booking.clientId,
          advisorId,
          amount: amount ?? booking.amount,
          currency: 'INR',
          status: 'paid',
          paymentMethod: paymentMethod ?? 'manual',
          transactionId: paymentReference ?? `manual_${Date.now()}`,
          paidAt: new Date(),
        },
      });
    } catch { /* Model may vary */ }

    await prisma.notification.create({
      data: {
        userId: booking.clientId,
        title: 'Payment Received',
        message: `Your consultation fee of ${amount ?? booking.amount} has been recorded`,
        category: 'payment',
      },
    });

    return res.json({ success: true, payment });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to mark fee as paid' });
  }
};

// ── Submit Session Review (reviews sub-feature) ──────────────────────────────
// Clients can rate their advisor sessions and leave feedback.
// Gated by the `reviews` sub-feature under `bookAdvisor`.
export const submitSessionReview = async (req: AuthRequest, res: Response) => {
  try {
    const clientId = getUserId(req);
    const { sessionId } = req.params;
    const { rating, feedback } = req.body;

    if (rating === undefined || rating === null) {
      return res.status(400).json({ error: 'Rating is required' });
    }

    const numRating = Number(rating);
    if (isNaN(numRating) || numRating < 1 || numRating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    const session = await prisma.advisorSession.findFirst({
      where: { id: sessionId, clientId },
    });

    if (!session) {
      return res.status(404).json({ error: 'Advisor session not found or you do not have permission to review it' });
    }

    const updatedSession = await prisma.advisorSession.update({
      where: { id: sessionId },
      data: {
        rating: numRating,
        feedback: feedback ? String(feedback) : null,
      },
    });

    res.json({ success: true, data: updatedSession });
  } catch (error: any) {
    console.error('Submit review error:', error);
    res.status(500).json({ error: 'Failed to submit review' });
  }
};

