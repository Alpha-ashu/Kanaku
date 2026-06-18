import { Response } from 'express';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { prisma } from '../../db/prisma';
import { logger } from '../../config/logger';
import { isDatabaseUnavailableError } from '../../utils/databaseAvailability';
import { uploadBuffer, createSignedUrl } from '../../utils/storage';
import { sendRoleAssignedEmail } from '../../emails';

// ─── Public ───────────────────────────────────────────────────────────────────

export const listAdvisors = async (req: AuthRequest, res: Response) => {
  try {
    const advisors = await prisma.user.findMany({
      where: { role: 'advisor', isApproved: true },
      select: {
        id: true,
        name: true,
        email: true,
        advisorStatus: true,
        advisorAvailability: true,
        advisorApplication: { select: { expertise: true, experienceYears: true, bio: true, organizationName: true } },
        sessionsAsAdvisor: { where: { status: 'completed' }, select: { rating: true } },
      },
    });
    const enriched = advisors.map((a) => {
      const { sessionsAsAdvisor, ...rest } = a;
      const ratings = sessionsAsAdvisor.map((s: any) => s.rating).filter(Boolean);
      const averageRating = ratings.length > 0 ? ratings.reduce((x: number, y: number) => x + y, 0) / ratings.length : 0;
      const availability = rest.advisorAvailability.some((slot: any) => slot.isActive);
      return { ...rest, averageRating, reviewCount: ratings.length, availability };
    });
    res.json(enriched);
  } catch (error: any) {
    if (isDatabaseUnavailableError(error)) {
      return res.status(503).json({ error: 'Database is temporarily offline', code: 'DB_OFFLINE' });
    }
    res.status(500).json({ error: 'Failed to fetch advisors' });
  }
};

export const getAdvisor = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const advisor = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true, name: true, email: true, role: true, isApproved: true,
        advisorStatus: true,
        advisorAvailability: true,
        advisorApplication: { select: { expertise: true, experienceYears: true, bio: true, organizationName: true } },
        sessionsAsAdvisor: { where: { status: 'completed' }, select: { rating: true } },
      },
    });
    if (!advisor || advisor.role !== 'advisor') {
      return res.status(404).json({ error: 'Advisor not found' });
    }
    const ratings = advisor.sessionsAsAdvisor.map((s: any) => s.rating).filter(Boolean);
    const averageRating = ratings.length > 0 ? ratings.reduce((a: number, b: number) => a + b) / ratings.length : 0;
    const availability = advisor.advisorAvailability.some((slot: any) => slot.isActive);
    res.json({ ...advisor, averageRating, reviewCount: ratings.length, availability });
  } catch {
    res.status(500).json({ error: 'Failed to fetch advisor' });
  }
};

// ─── Advisor Availability (time slots) ────────────────────────────────────────

export const setAvailability = async (req: AuthRequest, res: Response) => {
  try {
    const advisorId = getUserId(req);
    const { dayOfWeek, startTime, endTime, isActive } = req.body;
    if (dayOfWeek === undefined || !startTime || !endTime) {
      return res.status(400).json({ error: 'Missing required fields: dayOfWeek, startTime, endTime' });
    }
    if (dayOfWeek < 0 || dayOfWeek > 6) {
      return res.status(400).json({ error: 'Invalid dayOfWeek (0-6)' });
    }
    const existing = await prisma.advisorAvailability.findFirst({ where: { advisorId, dayOfWeek } });
    let availability;
    if (existing) {
      availability = await prisma.advisorAvailability.update({
        where: { id: existing.id },
        data: { startTime, endTime, isActive: isActive !== false },
      });
    } else {
      availability = await prisma.advisorAvailability.create({
        data: { advisorId, dayOfWeek, startTime, endTime, isActive: true },
      });
    }
    res.json(availability);
  } catch {
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
    const existingSlots = await prisma.advisorAvailability.findMany({ where: { advisorId }, orderBy: { dayOfWeek: 'asc' } });
    if (!available) {
      await prisma.advisorAvailability.updateMany({ where: { advisorId }, data: { isActive: false } });
    } else if (existingSlots.length === 0) {
      await prisma.advisorAvailability.createMany({
        data: [1, 2, 3, 4, 5].map((dayOfWeek) => ({ advisorId, dayOfWeek, startTime: '09:00', endTime: '17:00', isActive: true })),
      });
    } else {
      await prisma.advisorAvailability.updateMany({ where: { advisorId }, data: { isActive: true } });
    }
    const slots = await prisma.advisorAvailability.findMany({ where: { advisorId }, orderBy: { dayOfWeek: 'asc' } });
    res.json({ advisorId, availability: slots.some((slot) => slot.isActive), slots });
  } catch {
    res.status(500).json({ error: 'Failed to update advisor availability status' });
  }
};

export const getAvailability = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const availability = await prisma.advisorAvailability.findMany({ where: { advisorId: id }, orderBy: { dayOfWeek: 'asc' } });
    res.json(availability);
  } catch {
    res.status(500).json({ error: 'Failed to fetch availability' });
  }
};

export const deleteAvailability = async (req: AuthRequest, res: Response) => {
  try {
    const advisorId = getUserId(req);
    const { id } = req.params;
    const availability = await prisma.advisorAvailability.findUnique({ where: { id } });
    if (!availability || availability.advisorId !== advisorId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    await prisma.advisorAvailability.delete({ where: { id } });
    res.json({ message: 'Availability deleted' });
  } catch {
    res.status(500).json({ error: 'Failed to delete availability' });
  }
};

// ─── Advisor Online Status ─────────────────────────────────────────────────────

export const setOnlineStatus = async (req: AuthRequest, res: Response) => {
  try {
    const advisorId = getUserId(req);
    const { status } = req.body;
    const valid = ['AVAILABLE', 'BUSY', 'NOT_AVAILABLE'];
    if (!valid.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${valid.join(', ')}` });
    }
    await prisma.user.update({ where: { id: advisorId }, data: { advisorStatus: status } });
    res.json({ advisorStatus: status });
  } catch {
    res.status(500).json({ error: 'Failed to update online status' });
  }
};

// ─── Role Mode (user ↔ advisor) ───────────────────────────────────────────────

export const switchRoleMode = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const { mode } = req.body;
    if (!['user', 'advisor'].includes(mode)) {
      return res.status(400).json({ error: 'mode must be "user" or "advisor"' });
    }
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, isApproved: true } });
    if (!user || user.role !== 'advisor' || !user.isApproved) {
      return res.status(403).json({ error: 'Only approved advisors can switch role mode' });
    }
    await prisma.user.update({ where: { id: userId }, data: { roleMode: mode } });
    res.json({ roleMode: mode });
  } catch {
    res.status(500).json({ error: 'Failed to switch role mode' });
  }
};

// ─── Sessions ─────────────────────────────────────────────────────────────────

export const getSessions = async (req: AuthRequest, res: Response) => {
  try {
    const advisorId = getUserId(req);
    const sessions = await prisma.advisorSession.findMany({
      where: { advisorId },
      include: { client: { select: { id: true, name: true, email: true, salary: true } }, chatMessages: true, payment: true },
      orderBy: { startTime: 'desc' },
    });
    const clientIds = sessions.map((s) => s.client?.id).filter(Boolean) as string[];
    const clientProfiles = await prisma.profiles.findMany({ where: { id: { in: clientIds } }, select: { id: true, phone: true } });
    const phoneMap = new Map<string, string | null>();
    clientProfiles.forEach((p) => phoneMap.set(p.id, p.phone));
    const enrichedSessions = sessions.map((session) =>
      session.client ? { ...session, client: { ...session.client, phone: phoneMap.get(session.client.id) || null } } : session,
    );
    res.json(enrichedSessions);
  } catch (error: any) {
    logger.error('Failed to fetch sessions', { error });
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
};

export const rateSession = async (req: AuthRequest, res: Response) => {
  try {
    const clientId = getUserId(req);
    const { id } = req.params;
    const { rating, feedback } = req.body;
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }
    const session = await prisma.advisorSession.findUnique({ where: { id } });
    if (!session || session.clientId !== clientId) return res.status(403).json({ error: 'Access denied' });
    if (session.status !== 'completed') return res.status(400).json({ error: 'Can only rate completed sessions' });
    const updated = await prisma.advisorSession.update({ where: { id }, data: { rating, feedback: feedback || '' } });
    await prisma.notification.create({
      data: { userId: session.advisorId, title: 'New Session Rating', message: `You received a ${rating} star rating`, category: 'session', deepLink: `/sessions/${id}` },
    });
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Failed to rate session' });
  }
};

// ─── Advisor Application ───────────────────────────────────────────────────────

const ALLOWED_DOC_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

export const applyAsAdvisor = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);

    // Block re-application if already approved
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, isApproved: true, name: true, email: true } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role === 'advisor' && user.isApproved) {
      return res.status(400).json({ error: 'You are already an approved advisor' });
    }

    // Check for an existing pending application
    const existing = await prisma.advisorApplication.findUnique({ where: { userId } });
    if (existing && existing.status === 'PENDING') {
      return res.status(400).json({ error: 'You already have a pending application' });
    }

    const { fullName, phone, experienceYears, expertise, organizationName, bio } = req.body;
    if (!fullName || !phone || !experienceYears || !expertise || !bio) {
      return res.status(400).json({ error: 'Missing required fields: fullName, phone, experienceYears, expertise, bio' });
    }

    const files = (req as any).files as Record<string, Express.Multer.File[]> | undefined;

    // Validate mandatory documents
    if (!files?.panDocument?.[0]) return res.status(400).json({ error: 'PAN Card document is required' });
    if (!files?.aadhaarDocument?.[0]) return res.status(400).json({ error: 'Aadhaar Card document is required' });

    const uploadDoc = async (file: Express.Multer.File, label: string) => {
      if (!ALLOWED_DOC_TYPES.includes(file.mimetype)) {
        throw Object.assign(new Error(`${label}: only JPEG, PNG, WEBP, or PDF allowed`), { statusCode: 400 });
      }
      const ext = file.originalname.split('.').pop() || 'bin';
      const path = `advisor-docs/${userId}/${label}-${Date.now()}.${ext}`;
      await uploadBuffer(path, file.buffer, file.mimetype);
      return path;
    };

    let panPath: string, aadhaarPath: string, certPath: string | null = null;
    try {
      panPath = await uploadDoc(files.panDocument[0], 'pan');
      aadhaarPath = await uploadDoc(files.aadhaarDocument[0], 'aadhaar');
      if (files?.certDocument?.[0]) {
        certPath = await uploadDoc(files.certDocument[0], 'cert');
      }
    } catch (err: any) {
      return res.status(err.statusCode ?? 500).json({ error: err.message || 'Document upload failed' });
    }

    // Upsert AdvisorApplication (allow resubmission after rejection)
    const application = await prisma.advisorApplication.upsert({
      where: { userId },
      create: {
        userId, fullName, email: user.email, phone,
        experienceYears: Number(experienceYears), expertise,
        organizationName: organizationName || null, bio,
        panDocumentPath: panPath, aadhaarDocumentPath: aadhaarPath,
        certDocumentPath: certPath, status: 'PENDING',
      },
      update: {
        fullName, phone, experienceYears: Number(experienceYears), expertise,
        organizationName: organizationName || null, bio,
        panDocumentPath: panPath, aadhaarDocumentPath: aadhaarPath,
        certDocumentPath: certPath, status: 'PENDING',
        rejectionReason: null, reviewedBy: null, reviewedAt: null,
        submittedAt: new Date(),
      },
    });

    // Mark user as pending advisor
    await prisma.user.update({ where: { id: userId }, data: { role: 'advisor', isApproved: false } });

    // Notify admins
    const admins = await prisma.user.findMany({ where: { role: 'admin' }, select: { id: true } });
    if (admins.length > 0) {
      await prisma.notification.createMany({
        data: admins.map((a) => ({
          userId: a.id,
          title: 'New Advisor Application',
          message: `${fullName} has applied to become an advisor. Review required.`,
          category: 'system',
          deepLink: '/admin/advisor-verification',
        })),
      });
    }

    logger.info('Advisor application submitted', { userId, applicationId: application.id });
    return res.json({ success: true, message: 'Application submitted. Awaiting review.', application });
  } catch (error: any) {
    if (isDatabaseUnavailableError(error)) {
      return res.status(503).json({ error: 'Database is temporarily offline', code: 'DB_OFFLINE' });
    }
    logger.error('Advisor application error', { error });
    return res.status(500).json({ error: 'Failed to submit advisor application' });
  }
};

export const getMyApplication = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const [application, user] = await Promise.all([
      prisma.advisorApplication.findUnique({
        where: { userId },
        select: {
          id: true, fullName: true, email: true, phone: true,
          experienceYears: true, expertise: true, organizationName: true, bio: true,
          status: true, rejectionReason: true, submittedAt: true, reviewedAt: true,
        },
      }),
      prisma.user.findUnique({ where: { id: userId }, select: { role: true, isApproved: true, roleMode: true, advisorStatus: true } }),
    ]);
    res.json({
      application: application || null,
      isApproved: user?.isApproved ?? false,
      roleMode: user?.roleMode ?? 'user',
      advisorStatus: user?.advisorStatus ?? 'NOT_AVAILABLE',
    });
  } catch {
    res.status(500).json({ error: 'Failed to fetch application status' });
  }
};

export const getApplicationDocument = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserId(req);
    const { id, docType } = req.params;
    const requestingUser = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    const isAdmin = requestingUser && ['admin', 'manager'].includes(requestingUser.role);

    const application = await prisma.advisorApplication.findUnique({ where: { id } });
    if (!application) return res.status(404).json({ error: 'Application not found' });
    if (!isAdmin && application.userId !== userId) return res.status(403).json({ error: 'Access denied' });

    const pathMap: Record<string, string | null | undefined> = {
      pan: application.panDocumentPath,
      aadhaar: application.aadhaarDocumentPath,
      cert: application.certDocumentPath,
    };
    const docPath = pathMap[docType];
    if (!docPath) return res.status(404).json({ error: 'Document not found' });

    const url = await createSignedUrl(docPath, 300);
    res.json({ url });
  } catch {
    res.status(500).json({ error: 'Failed to generate document URL' });
  }
};

// ─── Admin / Manager ──────────────────────────────────────────────────────────

export const listPendingAdvisors = async (req: AuthRequest, res: Response) => {
  try {
    const applications = await prisma.advisorApplication.findMany({
      orderBy: { submittedAt: 'desc' },
      include: {
        user: {
          select: {
            id: true, name: true, email: true, role: true, isApproved: true, createdAt: true,
            advisorAvailability: { select: { isActive: true } },
            sessionsAsAdvisor: { select: { id: true } },
          },
        },
      },
    });

    const enriched = applications.map((app) => ({
      applicationId: app.id,
      userId: app.userId,
      fullName: app.fullName,
      email: app.email,
      phone: app.phone,
      experienceYears: app.experienceYears,
      expertise: app.expertise,
      organizationName: app.organizationName,
      bio: app.bio,
      status: app.status,
      rejectionReason: app.rejectionReason,
      submittedAt: app.submittedAt,
      reviewedAt: app.reviewedAt,
      hasPan: !!app.panDocumentPath,
      hasAadhaar: !!app.aadhaarDocumentPath,
      hasCert: !!app.certDocumentPath,
      user: app.user ? {
        id: app.user.id,
        name: app.user.name,
        email: app.user.email,
        role: app.user.role,
        isApproved: app.user.isApproved,
        createdAt: app.user.createdAt,
        sessionCount: app.user.sessionsAsAdvisor.length,
        isAvailable: app.user.advisorAvailability.some((av) => av.isActive),
      } : null,
    }));

    const pending = enriched.filter((a) => a.status === 'PENDING');
    const approved = enriched.filter((a) => a.status === 'APPROVED');
    const rejected = enriched.filter((a) => a.status === 'REJECTED');

    return res.json({ pending, approved, rejected, all: enriched });
  } catch (error: any) {
    if (isDatabaseUnavailableError(error)) {
      return res.status(503).json({ error: 'Database is temporarily offline', code: 'DB_OFFLINE' });
    }
    return res.status(500).json({ error: 'Failed to fetch advisor applications' });
  }
};

export const approveAdvisor = async (req: AuthRequest, res: Response) => {
  try {
    const reviewerId = getUserId(req);
    const { id } = req.params; // userId

    const user = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true, email: true, role: true } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const application = await prisma.advisorApplication.findUnique({ where: { userId: id } });
    if (!application) return res.status(404).json({ error: 'No application found for this user' });

    await prisma.$transaction([
      prisma.user.update({ where: { id }, data: { role: 'advisor', isApproved: true, roleMode: 'advisor' } }),
      prisma.advisorApplication.update({
        where: { userId: id },
        data: { status: 'APPROVED', reviewedBy: reviewerId, reviewedAt: new Date() },
      }),
    ]);

    await prisma.notification.create({
      data: {
        userId: id,
        title: 'Advisor Application Approved!',
        message: 'Congratulations! Your advisor application has been approved. You can now accept client bookings.',
        category: 'system',
      },
    });

    logger.info('Advisor approved', { advisorId: id, reviewerId });

    // Best-effort role-assigned email (no-op if SendGrid is unconfigured).
    if (user.email) {
      void sendRoleAssignedEmail(user.email, 'advisor', user.name || undefined).catch(() => {});
    }

    return res.json({ success: true });
  } catch (error: any) {
    if (isDatabaseUnavailableError(error)) {
      return res.status(503).json({ error: 'Database is temporarily offline', code: 'DB_OFFLINE' });
    }
    return res.status(500).json({ error: 'Failed to approve advisor' });
  }
};

export const rejectAdvisor = async (req: AuthRequest, res: Response) => {
  try {
    const reviewerId = getUserId(req);
    const { id } = req.params; // userId
    const { reason } = req.body;

    const user = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    await prisma.$transaction([
      prisma.user.update({ where: { id }, data: { role: 'user', isApproved: false } }),
      prisma.advisorApplication.updateMany({
        where: { userId: id, status: 'PENDING' },
        data: { status: 'REJECTED', rejectionReason: reason || null, reviewedBy: reviewerId, reviewedAt: new Date() },
      }),
    ]);

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

    logger.info('Advisor rejected', { advisorId: id, reviewerId, reason });
    return res.json({ success: true });
  } catch (error: any) {
    if (isDatabaseUnavailableError(error)) {
      return res.status(503).json({ error: 'Database is temporarily offline', code: 'DB_OFFLINE' });
    }
    return res.status(500).json({ error: 'Failed to reject advisor application' });
  }
};
