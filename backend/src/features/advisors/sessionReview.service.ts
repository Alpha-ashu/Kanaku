import { prisma } from '../../db/prisma';
import { notify } from '../notifications/notify';

/**
 * A client's rating (and optional written review) of a consultation.
 *
 * The one implementation behind both routes that accept a rating
 * (`POST /bookings/sessions/:id/review` and the older
 * `PUT /advisors/sessions/:id/rate`). They had diverged: one let a client rate
 * a session that had not happened (scheduled or cancelled) and never told the
 * advisor; the other ignored the Reviews switch and wrote the advisor's
 * notification straight into the table, skipping preferences and the live push.
 *
 * Rules: only the session's own client, only once it is completed, a whole
 * number of stars from 1 to 5, and the text trimmed and capped. Rating again
 * replaces the earlier rating. The advisor is told about the first one only.
 */
export class SessionReviewError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}

export const MAX_REVIEW_LENGTH = 1000;

export const submitSessionReview = async (
  clientId: string,
  sessionId: string,
  input: { rating?: unknown; feedback?: unknown },
) => {
  const rating = Number(input.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new SessionReviewError(400, 'INVALID_RATING', 'Choose a rating from 1 to 5 stars.');
  }
  const feedback = typeof input.feedback === 'string' ? input.feedback.trim().slice(0, MAX_REVIEW_LENGTH) : '';

  const session = await prisma.advisorSession.findFirst({
    where: { id: sessionId, clientId },
    select: { id: true, advisorId: true, status: true, rating: true },
  });
  if (!session) {
    throw new SessionReviewError(404, 'SESSION_NOT_FOUND', 'Session not found.');
  }
  if (session.status !== 'completed') {
    throw new SessionReviewError(409, 'SESSION_NOT_COMPLETED', 'You can rate a session once it has been completed.');
  }

  const updated = await prisma.advisorSession.update({
    where: { id: sessionId },
    data: { rating, feedback: feedback || null },
    select: { id: true, rating: true, feedback: true, status: true },
  });

  if (session.rating == null) {
    await notify({
      userId: session.advisorId,
      sourceUserId: clientId,
      topic: 'session',
      type: 'session_rated',
      title: 'New session rating',
      message: `A client rated your session ${rating} out of 5${feedback ? ' and left a review' : ''}.`,
      deepLink: '/advisor-panel',
      dedupKey: `session_rated:${sessionId}`,
    });
  }
  return updated;
};
