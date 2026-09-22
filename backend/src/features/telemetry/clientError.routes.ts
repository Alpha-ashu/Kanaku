import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { logger } from '../../config/logger';
import { validateBody } from '../../middleware/validate';
import { authenticatedRateLimit } from '../../middleware/rateLimit';
import { resolveRateLimitKey } from '../../middleware/rateLimit';

const router = Router();

/**
 * Client crash + failed-request sink.
 *
 * The app's top-level ErrorBoundary showed "Something went wrong" and reported
 * the cause NOWHERE: its `reportError` hook was never wired to a reporter, and
 * the shared logger is silent in production builds. So every occurrence of that
 * screen was, by construction, undiagnosable — which is exactly the complaint.
 *
 * This endpoint gives those errors somewhere to land, in the server logs where
 * requestId/correlationId already tie them to the backend side of the same user
 * action. Deliberately:
 *
 *   - AUTH-OPTIONAL. A crash on the login screen is the one we most need, and
 *     it happens before there is a token. `resolveRateLimitKey` still buckets by
 *     user when a bearer token is present, by IP otherwise.
 *   - BOUNDED. Every string is length-capped by the schema and the body parser
 *     caps the whole payload, so this cannot be used to write unbounded data
 *     into the log pipeline.
 *   - WRITE-ONLY. It stores nothing and echoes nothing back but the reference
 *     the client already generated, so it cannot be used to read state or to
 *     probe which references exist.
 */
const clientErrorSchema = z.object({
  /** Client-minted id the user sees on the error screen and can quote. */
  reference: z.string().trim().min(1).max(64),
  /** Stable per-browser-session id, matching the X-Session-Id header. */
  sessionId: z.string().trim().max(64).optional(),
  name: z.string().trim().max(200).optional(),
  message: z.string().trim().max(1000).optional(),
  stack: z.string().trim().max(8000).optional(),
  componentStack: z.string().trim().max(8000).optional(),
  /** The API call that failed, when the error came from one. */
  endpoint: z.string().trim().max(300).optional(),
  method: z.string().trim().max(10).optional(),
  status: z.number().int().min(0).max(599).optional(),
  /** Server-side ids echoed by the failing response, for exact correlation. */
  requestId: z.string().trim().max(64).optional(),
  correlationId: z.string().trim().max(64).optional(),
  serverCode: z.string().trim().max(100).optional(),
  /** Where in the app the user was. */
  route: z.string().trim().max(300).optional(),
  platform: z.string().trim().max(60).optional(),
  appVersion: z.string().trim().max(40).optional(),
  online: z.boolean().optional(),
  occurredAt: z.string().trim().max(40).optional(),
}).strict();

router.post(
  '/',
  // A crashing client can loop. Bucketed per user (or per IP pre-login) so one
  // bad device cannot flood the log pipeline, but generous enough that a burst
  // of genuine errors during one broken session is still recorded in full.
  authenticatedRateLimit({
    windowMs: 60_000,
    max: Number(process.env.CLIENT_ERROR_RATE_LIMIT || 30),
    scope: 'client-errors',
    message: 'Too many error reports.',
  }),
  validateBody(clientErrorSchema),
  (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof clientErrorSchema>;
    const authReq = req as Request & { userId?: string; id?: string };

    logger.error('Client error reported', {
      reference: body.reference,
      // Who and where. userId is taken from the verified token, never from the
      // body — a client may not attribute its crash to someone else.
      userId: authReq.userId ?? resolveRateLimitKey(req),
      sessionId: body.sessionId ?? (req.headers['x-session-id'] as string | undefined),
      platform: body.platform,
      appVersion: body.appVersion,
      online: body.online,
      route: body.route,
      // What failed.
      name: body.name,
      clientMessage: body.message,
      stack: body.stack,
      componentStack: body.componentStack,
      // The API call behind it, if any — these ids are what join this record to
      // the backend's own log line for the same request.
      endpoint: body.endpoint,
      method: body.method,
      status: body.status,
      serverCode: body.serverCode,
      clientRequestId: body.requestId,
      correlationId: body.correlationId ?? (req as any).correlationId,
      occurredAt: body.occurredAt,
      reportedAt: new Date().toISOString(),
      receivedRequestId: (req as any).id,
    });

    // 204: nothing to return, and nothing the caller should retry on.
    res.status(204).end();
  },
);

export { router as clientErrorRoutes };
