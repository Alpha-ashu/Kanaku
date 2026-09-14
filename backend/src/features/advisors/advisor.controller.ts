import { Response } from 'express';
import { AuthRequest, getUserId } from '../../middleware/auth';
import { prisma } from '../../db/prisma';
import { logger } from '../../config/logger';
import { isDatabaseUnavailableError } from '../../utils/databaseAvailability';
import { uploadBuffer, createSignedUrl, removeObject } from '../../utils/storage';
import { approveAdvisorApplication, rejectAdvisorApplication } from './advisorReview.service';

const STAFF_ROLES = ['admin', 'manager'];

/**
 * Serialise writes that must not interleave for one key (per-advisor schedule,
 * per-user application) inside the caller's transaction. Postgres releases the
 * lock at commit/rollback, so it holds across pgBouncer transaction pooling.
 */
const lockKey = (tx: { $executeRaw: typeof prisma.$executeRaw }, key: string) =>
  tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;

// ─── Public ───────────────────────────────────────────────────────────────────

export const listAdvisors = async (req: AuthRequest, res: Response) => {
  try {
    const advisors = await prisma.user.findMany({
      where: { role: 'advisor', isApproved: true },
      // No email: this listing is reachable anonymously and the booking screen
      // never needs it — contact goes through bookings and session chat.
      select: {
        id: true,
        name: true,
        avatarId: true,
        advisorStatus: true,
        advisorAvailability: true,
        advisorApplication: {
          select: { expertise: true, experienceYears: true, bio: true, organizationName: true, hourlyRate: true },
        },
        sessionsAsAdvisor: { where: { status: 'completed' }, select: { rating: true } },
        _count: { select: { advisorFollowers: true } },
      },
    });

    // The follow graph is per-caller; anonymous browsing simply has none.
    const viewerId = req.user?.id;
    const followedIds = viewerId
      ? new Set(
        (await prisma.advisorFollow.findMany({
          where: { followerId: viewerId },
          select: { advisorId: true },
        })).map((follow) => follow.advisorId),
      )
      : new Set<string>();

    const enriched = advisors.map((a) => {
      const { sessionsAsAdvisor, ...rest } = a;
      const ratings = sessionsAsAdvisor.map((s: any) => s.rating).filter(Boolean);
      const averageRating = ratings.length > 0 ? ratings.reduce((x: number, y: number) => x + y, 0) / ratings.length : 0;
      const availability = rest.advisorAvailability.some((slot: any) => slot.isActive);
      return {
        ...rest,
        averageRating,
        reviewCount: ratings.length,
        availability,
        // Decimal serialises as a string over JSON; the booking screen needs a
        // number to compute the session amount.
        hourlyRate: rest.advisorApplication?.hourlyRate != null
          ? Number(rest.advisorApplication.hourlyRate)
          : null,
        followersCount: rest._count.advisorFollowers,
        isFollowing: followedIds.has(rest.id),
      };
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
        avatarId: true,
        advisorStatus: true,
        advisorAvailability: true,
        advisorApplication: {
          select: { expertise: true, experienceYears: true, bio: true, organizationName: true, hourlyRate: true },
        },
        sessionsAsAdvisor: { where: { status: 'completed' }, select: { rating: true } },
      },
    });
    // Unapproved advisor rows and contact details are visible only to the advisor
    // themself and to reviewers.
    const ownerOrStaff = req.user?.id === id || STAFF_ROLES.includes(req.user?.role ?? '');
    if (!advisor || advisor.role !== 'advisor' || (!advisor.isApproved && !ownerOrStaff)) {
      return res.status(404).json({ error: 'Advisor not found' });
    }
    const { email, ...profile } = advisor;
    const ratings = advisor.sessionsAsAdvisor.map((s: any) => s.rating).filter(Boolean);
    const averageRating = ratings.length > 0 ? ratings.reduce((a: number, b: number) => a + b) / ratings.length : 0;
    const availability = advisor.advisorAvailability.some((slot: any) => slot.isActive);
    res.json({
      ...profile,
      ...(ownerOrStaff ? { email } : {}),
      averageRating,
      reviewCount: ratings.length,
      availability,
      hourlyRate: advisor.advisorApplication?.hourlyRate != null
        ? Number(advisor.advisorApplication.hourlyRate)
        : null,
    });
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
    // One row per weekday. Without the lock, two saves racing past findFirst both
    // inserted, and the booking screen then listed the day twice.
    const availability = await prisma.$transaction(async (tx) => {
      await lockKey(tx, `advisor-availability:${advisorId}`);
      const existing = await tx.advisorAvailability.findFirst({ where: { advisorId, dayOfWeek } });
      if (existing) {
        return tx.advisorAvailability.update({
          where: { id: existing.id },
          data: { startTime, endTime, isActive: isActive !== false },
        });
      }
      return tx.advisorAvailability.create({
        data: { advisorId, dayOfWeek, startTime, endTime, isActive: isActive !== false },
      });
    });
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
    const slots = await prisma.$transaction(async (tx) => {
      await lockKey(tx, `advisor-availability:${advisorId}`);
      const existingSlots = await tx.advisorAvailability.count({ where: { advisorId } });
      if (!available) {
        await tx.advisorAvailability.updateMany({ where: { advisorId }, data: { isActive: false } });
      } else if (existingSlots === 0) {
        await tx.advisorAvailability.createMany({
          data: [1, 2, 3, 4, 5].map((dayOfWeek) => ({ advisorId, dayOfWeek, startTime: '09:00', endTime: '17:00', isActive: true })),
        });
      } else {
        await tx.advisorAvailability.updateMany({ where: { advisorId }, data: { isActive: true } });
      }
      return tx.advisorAvailability.findMany({ where: { advisorId }, orderBy: { dayOfWeek: 'asc' } });
    });
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
      include: {
        client: { select: { id: true, name: true, email: true } },
        chatMessages: true,
        payment: true,
        booking: { select: { id: true, amount: true, description: true } },
      },
      orderBy: { startTime: 'desc' },
    });
    const clientIds = sessions.map((s) => s.client?.id).filter(Boolean) as string[];
    const clientProfiles = await prisma.profiles.findMany({ where: { id: { in: clientIds } }, select: { id: true, phone: true } });
    const phoneMap = new Map<string, string | null>();
    clientProfiles.forEach((p) => phoneMap.set(p.id, p.phone));
    const enrichedSessions = sessions.map((session) => {
      const clientWithPhone = session.client ? { ...session.client, phone: phoneMap.get(session.client.id) || null } : session.client;
      const amount = session.payment?.amount != null
        ? Number(session.payment.amount)
        : (session.booking?.amount != null ? Number(session.booking.amount) : 0);
      return {
        ...session,
        client: clientWithPhone,
        amount,
      };
    });
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
      // '/sessions/:id' is not a registered frontend route (see App.tsx's page
      // switch) — falls through to the Dashboard default case. Recipient is
      // the ADVISOR; sessions live under advisor-panel (AdvisorWorkspace.tsx,
      // advisor-only).
      data: { userId: session.advisorId, title: 'New Session Rating', message: `You received a ${rating} star rating`, category: 'session', deepLink: '/advisor-panel' },
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
    // Approval assigns role 'advisor', which would silently strip a staff role.
    if (STAFF_ROLES.includes(user.role)) {
      return res.status(403).json({ error: 'Admin and manager accounts cannot apply as advisors', code: 'STAFF_ACCOUNT' });
    }

    // Check for an existing pending application
    const existing = await prisma.advisorApplication.findUnique({ where: { userId } });
    if (existing && existing.status === 'PENDING') {
      return res.status(400).json({ error: 'You already have a pending application' });
    }

    const { fullName, phone, experienceYears, expertise, organizationName, bio, hourlyRate } = req.body;
    if (!fullName || !phone || !experienceYears || !expertise || !bio) {
      return res.status(400).json({ error: 'Missing required fields: fullName, phone, experienceYears, expertise, bio' });
    }

    // Optional: multipart sends everything as a string, and an empty field must
    // stay null rather than becoming 0 — a free consultation and an unstated
    // rate are different things on the booking screen.
    const parsedHourlyRate = hourlyRate === undefined || hourlyRate === null || `${hourlyRate}`.trim() === ''
      ? null
      : Number(hourlyRate);
    if (parsedHourlyRate !== null && (!Number.isFinite(parsedHourlyRate) || parsedHourlyRate < 0 || parsedHourlyRate > 1_000_000)) {
      return res.status(400).json({ error: 'hourlyRate must be a positive amount' });
    }

    const files = (req as any).files as Record<string, Express.Multer.File[]> | undefined;

    // Validate mandatory documents
    if (!files?.panDocument?.[0]) return res.status(400).json({ error: 'PAN Card document is required' });
    if (!files?.aadhaarDocument?.[0]) return res.status(400).json({ error: 'Aadhaar Card document is required' });

    const uploadDoc = async (file: Express.Multer.File, label: string) => {
      if (!ALLOWED_DOC_TYPES.includes(file.mimetype)) {
        throw Object.assign(new Error(`${label}: only JPEG, PNG, WEBP, or PDF allowed`), { statusCode: 400 });
      }
      // `originalname` is attacker-controlled. Taking the raw substring after the
      // last dot let it carry path separators straight into the storage key, so
      // it is reduced to a plain alphanumeric extension here.
      const rawExt = file.originalname.split('.').pop() || '';
      const ext = /^[A-Za-z0-9]{1,8}$/.test(rawExt) ? rawExt.toLowerCase() : 'bin';
      const path = `advisor-docs/${userId}/${label}-${Date.now()}.${ext}`;
      await uploadBuffer(path, file.buffer, file.mimetype);
      return path;
    };

    const uploaded: string[] = [];
    let panPath: string, aadhaarPath: string, certPath: string | null = null;
    try {
      panPath = await uploadDoc(files.panDocument[0], 'pan');
      uploaded.push(panPath);
      aadhaarPath = await uploadDoc(files.aadhaarDocument[0], 'aadhaar');
      uploaded.push(aadhaarPath);
      if (files?.certDocument?.[0]) {
        certPath = await uploadDoc(files.certDocument[0], 'cert');
        uploaded.push(certPath);
      }
    } catch (err: any) {
      await Promise.all(uploaded.map((p) => removeObject(p)));
      return res.status(err.statusCode ?? 500).json({ error: err.message || 'Document upload failed' });
    }

    // Upsert AdvisorApplication (allow resubmission after rejection). The pending
    // check above runs before the slow uploads, so a double-tap passes it twice;
    // re-check under a per-user lock so exactly one submission wins.
    const result = await prisma.$transaction(async (tx) => {
      await lockKey(tx, `advisor-apply:${userId}`);
      const current = await tx.advisorApplication.findUnique({ where: { userId }, select: { status: true } });
      if (current && current.status !== 'REJECTED') return { blockedBy: current.status };
      const saved = await tx.advisorApplication.upsert({
        where: { userId },
        create: {
          userId, fullName, email: user.email, phone,
          experienceYears: Number(experienceYears), expertise,
          organizationName: organizationName || null, bio,
          hourlyRate: parsedHourlyRate,
          panDocumentPath: panPath, aadhaarDocumentPath: aadhaarPath,
          certDocumentPath: certPath, status: 'PENDING',
        },
        update: {
          fullName, phone, experienceYears: Number(experienceYears), expertise,
          organizationName: organizationName || null, bio,
          hourlyRate: parsedHourlyRate,
          panDocumentPath: panPath, aadhaarDocumentPath: aadhaarPath,
          certDocumentPath: certPath, status: 'PENDING',
          rejectionReason: null, reviewedBy: null, reviewedAt: null,
          submittedAt: new Date(),
        },
      });
      return { saved };
    });
    const application = result.saved;
    if (!application) {
      await Promise.all(uploaded.map((p) => removeObject(p)));
      return res.status(400).json({
        error: result.blockedBy === 'PENDING'
          ? 'You already have a pending application'
          : 'Your advisor application has already been approved',
      });
    }

    // The role is NOT changed here. A pending applicant stays a 'user' (keeps
    // booking access, gains nothing); approval assigns 'advisor' + isApproved.

    // Notify BOTH admins and managers — the advisor-verification queue is
    // reviewable/approvable by either role (requireRole(['admin','manager']) on
    // /advisors/admin/*), so both must see incoming applications. Each gets a
    // deep link to their own verification surface.
    const reviewers = await prisma.user.findMany({
      where: { role: { in: ['admin', 'manager'] } },
      select: { id: true, role: true },
    });
    if (reviewers.length > 0) {
      await prisma.notification.createMany({
        data: reviewers.map((r) => ({
          userId: r.id,
          title: 'New Advisor Application',
          message: `${fullName} has applied to become an advisor. Review required.`,
          category: 'system',
          deepLink: r.role === 'manager' ? '/manager-advisor-verification' : '/admin-advisor-verification',
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
      // Advisor approval, not the account flag: regular users are created with
      // User.isApproved = true, which says nothing about an advisor application.
      isApproved: user?.role === 'advisor' && user.isApproved === true,
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

    const application = await prisma.advisorApplication.findFirst({
      where: {
        OR: [{ id }, { userId: id }],
      },
    });
    if (!application) return res.status(404).json({ error: 'Application not found' });
    if (!isAdmin && application.userId !== userId) return res.status(403).json({ error: 'Access denied' });

    const pathMap: Record<string, string | null | undefined> = {
      pan: application.panDocumentPath,
      aadhaar: application.aadhaarDocumentPath,
      cert: application.certDocumentPath,
    };
    const docPath = pathMap[docType];

    let url: string | null = null;
    if (docPath) {
      try {
        url = await createSignedUrl(docPath, 300);
      } catch {
        url = null;
      }
    }

    res.json({
      success: true,
      url,
      docType,
      applicationId: application.id,
      userId: application.userId,
      fullName: application.fullName,
      status: application.status,
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Failed to generate document URL' });
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
      hourlyRate: app.hourlyRate != null ? Number(app.hourlyRate) : null,
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
    const outcome = await approveAdvisorApplication(req.params.id, getUserId(req)); // :id is the applicant's userId
    if ('error' in outcome) return res.status(outcome.status).json({ error: outcome.error, code: outcome.code });
    return res.json({ success: true });
  } catch (error: any) {
    if (isDatabaseUnavailableError(error)) {
      return res.status(503).json({ error: 'Database is temporarily offline', code: 'DB_OFFLINE' });
    }
    logger.error('Advisor approval error', { error });
    return res.status(500).json({ error: 'Failed to approve advisor' });
  }
};

export const rejectAdvisor = async (req: AuthRequest, res: Response) => {
  try {
    const outcome = await rejectAdvisorApplication(req.params.id, getUserId(req), req.body?.reason);
    if ('error' in outcome) return res.status(outcome.status).json({ error: outcome.error, code: outcome.code });
    return res.json({ success: true });
  } catch (error: any) {
    if (isDatabaseUnavailableError(error)) {
      return res.status(503).json({ error: 'Database is temporarily offline', code: 'DB_OFFLINE' });
    }
    logger.error('Advisor rejection error', { error });
    return res.status(500).json({ error: 'Failed to reject advisor application' });
  }
};
