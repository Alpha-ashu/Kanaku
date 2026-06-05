import { Response } from 'express';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { requireRole, requireApproved } from '../../middleware/rbac';
import { prisma } from '../../db/prisma';
import { logger } from '../../config/logger';
import { isDatabaseUnavailableError } from '../../utils/databaseAvailability';

// List all approved advisors
export const listAdvisors = async (req: AuthRequest, res: Response) => {
  try {
    const advisors = await prisma.user.findMany({
      where: {
        role: 'advisor',
        isApproved: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        advisorAvailability: true,
      },
    });

    res.json(advisors);
  } catch (error: any) {
    if (isDatabaseUnavailableError(error)) {
      return res.status(503).json({ error: 'Database is temporarily offline', code: 'DB_OFFLINE' });
    }
    res.status(500).json({ error: 'Failed to fetch advisors' });
  }
};

// Get advisor profile
export const getAdvisor = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const advisor = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isApproved: true,
        advisorAvailability: true,
        sessionsAsAdvisor: {
          where: { status: 'completed' },
          select: { rating: true },
        },
      },
    });

    if (!advisor || advisor.role !== 'advisor') {
      return res.status(404).json({ error: 'Advisor not found' });
    }

    // Calculate average rating
    const ratings = advisor.sessionsAsAdvisor.map((s: any) => s.rating).filter(Boolean);
    const averageRating = ratings.length > 0 ? ratings.reduce((a: number, b: number) => a + b) / ratings.length : 0;
    const availability = advisor.advisorAvailability.some((slot: any) => slot.isActive);

    res.json({
      ...advisor,
      averageRating,
      reviewCount: ratings.length,
      availability,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch advisor' });
  }
};

// Update advisor availability
export const setAvailability = async (req: AuthRequest, res: Response) => {
  try {
    const advisorId = getUserId(req);
    const { dayOfWeek, startTime, endTime, isActive } = req.body;

    // Validate
    if (dayOfWeek === undefined || !startTime || !endTime) {
      return res.status(400).json({ error: 'Missing required fields: dayOfWeek, startTime, endTime' });
    }

    if (dayOfWeek < 0 || dayOfWeek > 6) {
      return res.status(400).json({ error: 'Invalid dayOfWeek (0-6)' });
    }

    // Check if availability exists for this day
    const existing = await prisma.advisorAvailability.findFirst({
      where: { advisorId, dayOfWeek },
    });

    let availability;
    if (existing) {
      availability = await prisma.advisorAvailability.update({
        where: { id: existing.id },
        data: { startTime, endTime, isActive: isActive !== false },
      });
    } else {
      availability = await prisma.advisorAvailability.create({
        data: {
          advisorId,
          dayOfWeek,
          startTime,
          endTime,
          isActive: true,
        },
      });
    }

    res.json(availability);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to set availability' });
  }
};

export const setAvailabilityStatus = async (req: AuthRequest, res: Response) => {
  try {
    const advisorId = getUserId(req);
    const { available } = req.body;

    if (typeof available !== 'boolean') {
      return res.status(400).json({ error: 'available must be a boolean' });
    }

    const existingSlots = await prisma.advisorAvailability.findMany({
      where: { advisorId },
      orderBy: { dayOfWeek: 'asc' },
    });

    if (!available) {
      await prisma.advisorAvailability.updateMany({
        where: { advisorId },
        data: { isActive: false },
      });
    } else if (existingSlots.length === 0) {
      await prisma.advisorAvailability.createMany({
        data: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
          advisorId,
          dayOfWeek,
          startTime: '09:00',
          endTime: '17:00',
          isActive: true,
        })),
      });
    } else {
      await prisma.advisorAvailability.updateMany({
        where: { advisorId },
        data: { isActive: true },
      });
    }

    const slots = await prisma.advisorAvailability.findMany({
      where: { advisorId },
      orderBy: { dayOfWeek: 'asc' },
    });

    res.json({
      advisorId,
      availability: slots.some((slot) => slot.isActive),
      slots,
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to update advisor availability status' });
  }
};

// Get advisor's availability
export const getAvailability = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const availability = await prisma.advisorAvailability.findMany({
      where: { advisorId: id },
      orderBy: { dayOfWeek: 'asc' },
    });

    res.json(availability);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch availability' });
  }
};

// Delete availability slot
export const deleteAvailability = async (req: AuthRequest, res: Response) => {
  try {
    const advisorId = getUserId(req);
    const { id } = req.params;

    const availability = await prisma.advisorAvailability.findUnique({
      where: { id },
    });

    if (!availability || availability.advisorId !== advisorId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await prisma.advisorAvailability.delete({
      where: { id },
    });

    res.json({ message: 'Availability deleted' });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to delete availability' });
  }
};

// Get advisor's sessions
export const getSessions = async (req: AuthRequest, res: Response) => {
  try {
    const advisorId = getUserId(req);

    const sessions = await prisma.advisorSession.findMany({
      where: { advisorId },
      include: {
        client: {
          select: { id: true, name: true, email: true, salary: true },
        },
        chatMessages: true,
        payment: true,
      },
      orderBy: { startTime: 'desc' },
    });

    const clientIds = sessions.map(s => s.client?.id).filter(Boolean);
    const clientProfiles = await prisma.profiles.findMany({
      where: { id: { in: clientIds } },
      select: { id: true, phone: true }
    });

    const phoneMap = new Map<string, string | null>();
    clientProfiles.forEach(p => {
      phoneMap.set(p.id, p.phone);
    });

    const enrichedSessions = sessions.map(session => {
      if (session.client) {
        return {
          ...session,
          client: {
            ...session.client,
            phone: phoneMap.get(session.client.id) || null
          }
        };
      }
      return session;
    });

    res.json(enrichedSessions);
  } catch (error: any) {
    logger.error('Failed to fetch sessions', { error });
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
};

// Rate a session (client only)
export const rateSession = async (req: AuthRequest, res: Response) => {
  try {
    const clientId = getUserId(req);
    const { id } = req.params;
    const { rating, feedback } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    const session = await prisma.advisorSession.findUnique({
      where: { id },
    });

    if (!session || session.clientId !== clientId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (session.status !== 'completed') {
      return res.status(400).json({ error: 'Can only rate completed sessions' });
    }

    const updated = await prisma.advisorSession.update({
      where: { id },
      data: { rating, feedback: feedback || '' },
    });

    // Notify advisor about the rating
    await prisma.notification.create({
      data: {
        userId: session.advisorId,
        title: 'New Session Rating',
        message: `You received a ${rating} star rating`,
        category: 'session',
        deepLink: `/sessions/${id}`,
      },
    });

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to rate session' });
  }
};

//  ADMIN: Apply to become advisor 

export const applyAsAdvisor = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const { bio, specializations, feePerSession, experienceYears, languages } = req.body;

    // Update user role to 'advisor' but mark as NOT approved (pending admin review)
    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        role: 'advisor',
        isApproved: false,
        // Store extra info in profile metadata
      },
      select: { id: true, name: true, email: true, role: true, isApproved: true },
    });

    logger.info('Advisor application submitted', { userId });
    return res.json({ success: true, message: 'Application submitted. Awaiting admin approval.', user: updated });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to submit advisor application' });
  }
};

//  ADMIN: List all pending advisor applications 

export const listPendingAdvisors = async (req: AuthRequest, res: Response) => {
  try {
    const pending = await prisma.user.findMany({
      where: { role: 'advisor', isApproved: false },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isApproved: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const all = await prisma.user.findMany({
      where: { role: 'advisor' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isApproved: true,
        createdAt: true,
        advisorAvailability: { select: { isActive: true } },
        sessionsAsAdvisor: { select: { id: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({
      pending,
      all: all.map(a => ({
        ...a,
        sessionCount: a.sessionsAsAdvisor.length,
        isAvailable: a.advisorAvailability.some(av => av.isActive),
      })),
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch advisor applications' });
  }
};

//  ADMIN: Approve an advisor application 

export const approveAdvisor = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role !== 'advisor') return res.status(400).json({ error: 'User is not an advisor applicant' });

    const updated = await prisma.user.update({
      where: { id },
      data: { isApproved: true },
      select: { id: true, name: true, email: true, role: true, isApproved: true },
    });

    // Notify the advisor
    await prisma.notification.create({
      data: {
        userId: id,
        title: ' Advisor Application Approved!',
        message: 'Congratulations! Your advisor application has been approved. You can now accept client bookings.',
        category: 'system',
      },
    });

    logger.info('Advisor approved', { advisorId: id });
    return res.json({ success: true, advisor: updated });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to approve advisor' });
  }
};

//  ADMIN: Reject / revoke an advisor 

export const rejectAdvisor = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Revert to regular user role
    const updated = await prisma.user.update({
      where: { id },
      data: { role: 'user', isApproved: false },
      select: { id: true, name: true, email: true, role: true, isApproved: true },
    });

    await prisma.notification.create({
      data: {
        userId: id,
        title: 'Advisor Application Update',
        message: reason
          ? `Your advisor application was not approved: ${reason}`
          : 'Your advisor application was not approved at this time. Please contact support for more details.',
        category: 'system',
      },
    });

    logger.info('Advisor rejected', { advisorId: id, reason });
    return res.json({ success: true, user: updated });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to reject advisor application' });
  }
};

