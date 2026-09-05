import { Response } from 'express';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { prisma } from '../../db/prisma';
import { isDatabaseUnavailableError } from '../../utils/databaseAvailability';

// Create a new booking request
export const createBooking = async (req: AuthRequest, res: Response) => {
  try {
    const clientId = getUserId(req);
    const { advisorId, sessionType, description, proposedDate, proposedTime, duration, amount } = req.body;

    // Validate required fields — note: amount can legitimately be 0 (free session)
    if (!advisorId || !sessionType || !proposedDate || !proposedTime || !duration || amount === undefined || amount === null) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Verify advisor exists and is approved.
    // The declared type is needed: `let advisor = null` infers `null`, so the
    // role/isApproved reads below fail to compile.
    let advisor: { id: string; role: string; isApproved: boolean } | null = null;
    try {
      advisor = await prisma.user.findUnique({
        where: { id: advisorId },
        select: { id: true, role: true, isApproved: true },
      });
    } catch {
      return res.status(404).json({ error: 'Advisor not found or not approved' });
    }

    if (!advisor || advisor.role !== 'advisor' || !advisor.isApproved) {
      return res.status(404).json({ error: 'Advisor not found or not approved' });
    }


    // Check advisor availability
    const proposedDateTime = new Date(`${proposedDate}T${proposedTime}`);
    const dayOfWeek = proposedDateTime.getDay();

    const availability = await prisma.advisorAvailability.findFirst({
      where: {
        advisorId,
        dayOfWeek,
        isActive: true,
      },
    });

    // Check advisor availability (soft check — advisor may not have configured slots yet)
    if (!availability) {
      // Log a warning but allow the booking; advisor will accept/reject
      console.warn(`No availability slot for advisor ${advisorId} on dayOfWeek ${dayOfWeek}. Proceeding with booking.`);
    }

    // Prevent duplicate booking requests — a double-submit (or retry) for the
    // same advisor/slot must not create a second pending request.
    const duplicate = await prisma.bookingRequest.findFirst({
      where: {
        clientId,
        advisorId,
        sessionType,
        proposedDate: proposedDateTime,
        proposedTime,
        status: { in: ['pending', 'accepted'] },
      },
    });

    if (duplicate) {
      return res.status(200).json(duplicate);
    }

    // Create booking request
    const booking = await prisma.bookingRequest.create({
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

    // Create notification for advisor. The message must name the CLIENT who
    // booked (req.user), not the advisor themselves — the advisor is the
    // recipient. (Previously used advisor.name, so advisors saw their own name.)
    const clientName = req.user?.name || 'A client';
    await prisma.notification.create({
      data: {
        userId: advisorId,
        title: 'New Booking Request',
        message: `${clientName} has requested a ${sessionType} session`,
        category: 'booking',
        // '/bookings' is not a registered frontend route (see App.tsx's page
        // switch) — falls through to the Dashboard default case. Recipient is
        // the ADVISOR; requests live under advisor-panel (advisor-only).
        deepLink: '/advisor-panel',
      },
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

    // Update booking status
    const updated = await prisma.bookingRequest.update({
      where: { id },
      data: { status: 'accepted' },
    });

    // Create advisor session
    const session = await prisma.advisorSession.create({
      data: {
        bookingId: id,
        advisorId,
        clientId: booking.clientId,
        startTime: booking.proposedDate,
        sessionType: booking.sessionType,
        status: 'scheduled',
      },
    });

    // Notify client
    await prisma.notification.create({
      data: {
        userId: booking.clientId,
        title: 'Booking Accepted',
        message: 'Your advisor has accepted your booking request',
        category: 'booking',
        // '/sessions/:id' is not a registered frontend route — falls through
        // to the Dashboard default case. Recipient is the CLIENT; bookings
        // live under book-advisor's "My Bookings" tab.
        deepLink: '/book-advisor',
      },
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

    const updated = await prisma.bookingRequest.update({
      where: { id },
      data: {
        status: 'rejected',
        rejectionReason: reason || '',
      },
    });

    // Notify client
    await prisma.notification.create({
      data: {
        userId: booking.clientId,
        title: 'Booking Rejected',
        message: `Your advisor rejected your booking request${reason ? `: ${reason}` : ''}`,
        category: 'booking',
      },
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

    // '/bookings/:id' is not a registered frontend route — recipient is the
    // CLIENT; bookings live under book-advisor's "My Bookings" tab.
    await prisma.notification.create({
      data: {
        userId: booking.clientId,
        title: 'Booking Reschedule Requested',
        message: `Your advisor proposed a new time: ${proposedDate} ${proposedTime}${reason ? ` (${reason})` : ''}`,
        category: 'booking',
        deepLink: '/book-advisor',
      },
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

    // Notify advisor
    await prisma.notification.create({
      data: {
        userId: booking.advisorId,
        title: 'Booking Cancelled',
        message: 'A client has cancelled their booking request',
        category: 'booking',
      },
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

