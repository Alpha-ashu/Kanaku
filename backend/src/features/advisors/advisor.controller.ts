import { NextFunction, Response } from 'express';
import { AuthRequest, getUserId } from '../../middleware/auth';
import type { TimeoutRequest } from '../../middleware/timeout';
import { prisma } from '../../db/prisma';
import { logger } from '../../config/logger';
import { SessionReviewError, submitSessionReview } from './sessionReview.service';
import { AppError } from '../../utils/AppError';
import { auditFromRequest } from '../../utils/auditLogger';
import { isDatabaseUnavailableError } from '../../utils/databaseAvailability';
import { approveAdvisorApplication, rejectAdvisorApplication } from './advisorReview.service';
import { decryptMessageRow } from '../sessions/message.crypto';
import { notify } from '../notifications/notify';
import {
  AdvisorDocType,
  readAdvisorDocument,
  removeAdvisorDocuments,
  storeAdvisorDocuments,
  validateAdvisorDocument,
} from './advisorDocuments';
import type { ApplyAdvisorInput } from './advisor.validation';

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
        // Explicit select, mirroring GET /sessions/:id/messages: `true` also
        // returned attachmentPath, which is a private storage key and must not
        // reach a client — attachments are opened via the signed-URL route.
        chatMessages: {
          select: {
            id: true,
            sessionId: true,
            senderId: true,
            message: true,
            timestamp: true,
            attachmentName: true,
            attachmentType: true,
            attachmentSize: true,
          },
          orderBy: { timestamp: 'asc' },
        },
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
        // Messages are encrypted at rest; this endpoint embeds the thread, so
        // it must decrypt like the dedicated messages route does.
        chatMessages: session.chatMessages.map(decryptMessageRow),
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

// Older route for the same action as POST /bookings/sessions/:id/review — one
// implementation (sessionReview.service) so the two can no longer disagree.
export const rateSession = async (req: AuthRequest, res: Response) => {
  try {
    res.json(await submitSessionReview(getUserId(req), req.params.id, req.body ?? {}));
  } catch (error) {
    if (error instanceof SessionReviewError) {
      return res.status(error.status).json({ error: error.message, code: error.code });
    }
    logger.error('[advisors] rate session failed', { sessionId: req.params?.id, error });
    res.status(500).json({ error: 'Failed to rate session' });
  }
};

// ─── Advisor Application ───────────────────────────────────────────────────────

type ApplicationFiles = Partial<Record<'panDocument' | 'aadhaarDocument' | 'certDocument', Express.Multer.File[]>>;
type Applicant = { email: string };

const requestIdOf = (req: AuthRequest) => (req as unknown as { id?: string }).id;

/**
 * Who may apply — checked BEFORE multer reads the body (see advisor.routes.ts).
 *
 * Refusing an ineligible caller after the upload made them wait out up to 30 MB
 * of documents only to be told they already had a pending application, and made
 * the server buffer every one of those bytes for nothing. The transaction in
 * applyAsAdvisor re-checks under a lock, so this is a fast path, not the guard.
 */
export const checkAdvisorEligibility = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const [user, existing] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { role: true, isApproved: true, email: true } }),
      prisma.advisorApplication.findUnique({ where: { userId }, select: { status: true } }),
    ]);
    if (!user) return res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
    if (user.role === 'advisor' && user.isApproved) {
      return res.status(400).json({ error: 'You are already an approved advisor', code: 'ALREADY_ADVISOR' });
    }
    // Approval assigns role 'advisor', which would silently strip a staff role.
    if (STAFF_ROLES.includes(user.role)) {
      return res.status(403).json({ error: 'Admin and manager accounts cannot apply as advisors', code: 'STAFF_ACCOUNT' });
    }
    if (existing?.status === 'PENDING') {
      return res.status(400).json({ error: 'You already have a pending application', code: 'APPLICATION_PENDING' });
    }
    if (existing?.status === 'APPROVED') {
      return res.status(400).json({ error: 'Your advisor application has already been approved', code: 'APPLICATION_APPROVED' });
    }
    res.locals.applicant = { email: user.email } satisfies Applicant;
    return next();
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return res.status(503).json({ error: 'Database is temporarily offline', code: 'DB_OFFLINE' });
    }
    return next(error);
  }
};

export const applyAsAdvisor = async (req: AuthRequest, res: Response) => {
  // Declared outside the try so every failure path — including the outer catch —
  // can roll the uploaded objects back: a failure between the uploads and the
  // saved row used to leave the documents stranded in the bucket with nothing
  // pointing at them. Once the row IS saved it owns those paths, so the flag
  // below stops a later failure (the reviewer notification) from deleting the
  // documents of a perfectly good application.
  let uploadedDocs: string[] = [];
  let applicationPersisted = false;
  const requestId = requestIdOf(req);

  try {
    // The body took longer than the route's budget and the client has already
    // been told the request failed: saving the application now would create
    // one the applicant believes does not exist.
    if ((req as TimeoutRequest).timedOut) return undefined;

    const userId = getUserId(req);
    const applicant = res.locals.applicant as Applicant | undefined;
    if (!applicant) throw new Error('checkAdvisorEligibility must run before applyAsAdvisor');
    // Parsed, trimmed and sanitised by validateAdvisorApplication.
    const input = req.body as ApplyAdvisorInput;
    const files = (req as AuthRequest & { files?: ApplicationFiles }).files;

    if (!files?.panDocument?.[0]) {
      return res.status(400).json({ error: 'PAN Card document is required', code: 'DOCUMENT_REQUIRED', field: 'panDocument' });
    }
    if (!files?.aadhaarDocument?.[0]) {
      return res.status(400).json({ error: 'Aadhaar Card document is required', code: 'DOCUMENT_REQUIRED', field: 'aadhaarDocument' });
    }

    // Every document is checked before any is uploaded, so a bad last file
    // costs no uploads and no rollback.
    let documents;
    try {
      documents = await Promise.all([
        validateAdvisorDocument(files.panDocument[0], 'pan'),
        validateAdvisorDocument(files.aadhaarDocument[0], 'aadhaar'),
        ...(files.certDocument?.[0] ? [validateAdvisorDocument(files.certDocument[0], 'cert')] : []),
      ]);
    } catch (err) {
      if (err instanceof AppError) return res.status(err.statusCode).json({ error: err.message, code: err.code });
      throw err;
    }

    let paths: Record<AdvisorDocType, string | null>;
    try {
      paths = await storeAdvisorDocuments(userId, documents);
    } catch (err: any) {
      // storeAdvisorDocuments has already removed whatever did land. The bucket
      // being unreachable is an outage on our side, not a bad submission, so it
      // must not be reported as a 4xx the user can "fix" — and the raw storage
      // error is for the log, not the applicant.
      const storageDown = /cloud storage unavailable|not configured/i.test(String(err?.message ?? ''));
      logger.error('Advisor application document upload failed', { userId, requestId, error: err });
      return storageDown
        ? res.status(503).json({ error: 'Document storage is unavailable right now. Please try again shortly.', code: 'STORAGE_UNAVAILABLE', requestId })
        : res.status(500).json({ error: 'Your documents could not be uploaded. Please try again.', code: 'DOCUMENT_UPLOAD_FAILED', requestId });
    }
    uploadedDocs = [paths.pan, paths.aadhaar, paths.cert].filter((p): p is string => Boolean(p));

    // Upsert AdvisorApplication (allow resubmission after rejection). The
    // eligibility check runs before the slow uploads, so a double-tap passes it
    // twice; re-check under a per-user lock so exactly one submission wins.
    const result = await prisma.$transaction(async (tx) => {
      await lockKey(tx, `advisor-apply:${userId}`);
      const current = await tx.advisorApplication.findUnique({
        where: { userId },
        select: { status: true, panDocumentPath: true, aadhaarDocumentPath: true, certDocumentPath: true },
      });
      if (current && current.status !== 'REJECTED') return { blockedBy: current.status };
      const fields = {
        fullName: input.fullName,
        email: applicant.email,
        phone: input.phone,
        experienceYears: input.experienceYears,
        expertise: input.expertise,
        organizationName: input.organizationName ?? null,
        bio: input.bio,
        hourlyRate: input.hourlyRate ?? null,
        panDocumentPath: paths.pan,
        aadhaarDocumentPath: paths.aadhaar,
        certDocumentPath: paths.cert,
        status: 'PENDING',
      };
      const saved = await tx.advisorApplication.upsert({
        where: { userId },
        create: { userId, ...fields },
        update: { ...fields, rejectionReason: null, reviewedBy: null, reviewedAt: null, submittedAt: new Date() },
      });
      const superseded = current ? [current.panDocumentPath, current.aadhaarDocumentPath, current.certDocumentPath] : [];
      return { saved, superseded };
    });
    if (!result.saved) {
      await removeAdvisorDocuments(uploadedDocs);
      return res.status(400).json(result.blockedBy === 'PENDING'
        ? { error: 'You already have a pending application', code: 'APPLICATION_PENDING' }
        : { error: 'Your advisor application has already been approved', code: 'APPLICATION_APPROVED' });
    }
    const application = result.saved;
    applicationPersisted = true;

    // A resubmission replaces the rejected application's documents. Nothing can
    // reach the old copies any more, and identity documents kept with no purpose
    // are a liability, so they are deleted rather than left in the bucket.
    await removeAdvisorDocuments(result.superseded);

    // The role is NOT changed here. A pending applicant stays a 'user' (keeps
    // booking access, gains nothing); approval assigns 'advisor' + isApproved.

    // Notify BOTH admins and managers — the advisor-verification queue is
    // reviewable/approvable by either role (requireRole(['admin','manager']) on
    // /advisors/admin/*), so both must see incoming applications. Each gets a
    // deep link to their own verification surface. notify(), not a bare
    // notification insert: the insert reached nobody until they refetched —
    // no socket emit, no push — so a reviewer with the queue open never knew.
    const reviewers = await prisma.user.findMany({
      where: { role: { in: STAFF_ROLES } },
      select: { id: true, role: true },
    });
    const submission = application.submittedAt.getTime();
    await Promise.all(reviewers.map((reviewer) => notify({
      userId: reviewer.id,
      topic: 'system',
      type: 'advisor_application_submitted',
      title: 'New Advisor Application',
      message: `${input.fullName} has applied to become an advisor. Review required.`,
      deepLink: reviewer.role === 'manager' ? '/manager-advisor-verification' : '/admin-advisor-verification',
      metadata: { applicationId: application.id, applicantId: userId },
      // One announcement per reviewer per submission; a resubmission after a
      // rejection is a new submission and is announced again.
      dedupKey: `advisor_application_submitted:${application.id}:${submission}:${reviewer.id}`,
    })));

    logger.info('Advisor application submitted', { userId, applicationId: application.id });
    // Storage keys are internal: the response carries status only.
    return res.json({
      success: true,
      message: 'Application submitted. Awaiting review.',
      application: { id: application.id, status: application.status, submittedAt: application.submittedAt },
    });
  } catch (error: any) {
    // Nothing downstream will retry, so anything already in the bucket is
    // garbage from here on — unless the application row was saved, in which case
    // it references these paths and they must survive.
    if (!applicationPersisted) {
      await removeAdvisorDocuments(uploadedDocs);
    }

    // requestId ties this log line to the response the user saw — it is the
    // correlator a user's "advisor apply gives a 500" report can be grepped by.
    logger.error('Advisor application error', {
      requestId,
      userId: req.user?.id,
      applicationPersisted,
      // Serialised centrally by logger.ts (serializeErrors) — name, message,
      // stack and any Prisma code/meta all reach the log from here.
      error,
    });
    if (res.headersSent) return undefined;

    if (isDatabaseUnavailableError(error)) {
      return res.status(503).json({ error: 'Database is temporarily offline', code: 'DB_OFFLINE' });
    }
    return res.status(500).json({
      error: 'Failed to submit advisor application',
      code: 'ADVISOR_APPLY_FAILED',
      // Safe to expose: an opaque per-request id, no internal detail.
      requestId,
    });
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

/**
 * Streams one KYC document to its owner or to a reviewer.
 *
 * This used to answer with a Supabase signed URL: a bearer link that anyone it
 * reached (a forwarded message, browser history, a proxy log) could open for
 * its lifetime with no login and no record of who looked. Now the bytes are
 * served only on this authenticated request, decrypted in memory, never cached,
 * and every view — and every refused attempt — is written to the audit log.
 */
export const getApplicationDocument = async (req: AuthRequest, res: Response) => {
  const requestId = requestIdOf(req);
  const viewerId = getUserId(req);
  const { id, docType } = req.params as { id: string; docType: AdvisorDocType };
  try {
    const [viewer, application] = await Promise.all([
      prisma.user.findUnique({ where: { id: viewerId }, select: { role: true } }),
      prisma.advisorApplication.findFirst({
        where: { OR: [{ id }, { userId: id }] },
        select: { id: true, userId: true, panDocumentPath: true, aadhaarDocumentPath: true, certDocumentPath: true },
      }),
    ]);
    // Authorised from the database role, never the token's claims.
    const isReviewer = STAFF_ROLES.includes(viewer?.role ?? '');
    const audit = (granted: boolean, outcome: string) => auditFromRequest(req, granted ? 'kyc.document_view' : 'kyc.document_view_denied', {
      userId: viewerId,
      actorRole: viewer?.role,
      resource: 'AdvisorApplication',
      resourceId: application?.id ?? id,
      meta: { docType, outcome, ownerId: application?.userId ?? null },
    });

    // Someone else's application is answered exactly like a missing one, so the
    // route cannot be used to learn which ids exist.
    if (!application || (!isReviewer && application.userId !== viewerId)) {
      if (application) audit(false, 'not_owner_or_reviewer');
      return res.status(404).json({ error: 'Document not found', code: 'DOCUMENT_NOT_FOUND' });
    }

    const storagePath = { pan: application.panDocumentPath, aadhaar: application.aadhaarDocumentPath, cert: application.certDocumentPath }[docType];
    if (!storagePath) {
      return res.status(404).json({ error: 'This document was not provided', code: 'DOCUMENT_NOT_PROVIDED' });
    }

    const document = await readAdvisorDocument(application.userId, docType, storagePath);
    if (!document) {
      logger.error('Advisor document missing from storage', { requestId, applicationId: application.id, docType });
      audit(false, 'missing_from_storage');
      return res.status(404).json({ error: 'This document could not be retrieved from storage', code: 'DOCUMENT_UNAVAILABLE' });
    }

    audit(true, 'served');
    const renderable = document.contentType !== 'application/octet-stream';
    res.setHeader('Content-Type', document.contentType);
    res.setHeader('Content-Disposition', `${renderable ? 'inline' : 'attachment'}; filename="${docType}.${document.extension}"`);
    // The bytes came from an applicant: never sniffed into something else, and
    // sandboxed so nothing active in them can run on the API origin.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; img-src 'self' data: blob:; style-src 'unsafe-inline'");
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    return res.send(document.buffer);
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return res.status(503).json({ error: 'Database is temporarily offline', code: 'DB_OFFLINE' });
    }
    logger.error('Advisor document read failed', { requestId, viewerId, docType, error });
    return res.status(500).json({ error: 'Failed to load document', code: 'DOCUMENT_READ_FAILED', requestId });
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
