/**
 * One rating implementation behind both routes. They had diverged: one let a
 * client rate a session that had not happened and never told the advisor; the
 * other skipped the notification pipeline. And the app had no way to call
 * either, while telling clients "please rate your experience".
 */
const mockFindFirst = jest.fn();
const mockUpdate = jest.fn();
const mockNotify = jest.fn();

jest.mock('../../../../backend/src/db/prisma', () => ({
  prisma: { advisorSession: { findFirst: (...a: unknown[]) => mockFindFirst(...a), update: (...a: unknown[]) => mockUpdate(...a) } },
}));
jest.mock('../../../../backend/src/features/notifications/notify', () => ({ notify: (...a: unknown[]) => mockNotify(...a) }));

import { MAX_REVIEW_LENGTH, SessionReviewError, submitSessionReview } from '../../../../backend/src/features/advisors/sessionReview.service';

const session = (over: Record<string, unknown> = {}) => ({ id: 's1', advisorId: 'adv', status: 'completed', rating: null, ...over });

beforeEach(() => {
  mockFindFirst.mockReset();
  mockUpdate.mockReset().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 's1', status: 'completed', ...data }));
  mockNotify.mockReset().mockResolvedValue(undefined);
});

const expectRefusal = async (promise: Promise<unknown>, code: string) => {
  await expect(promise).rejects.toBeInstanceOf(SessionReviewError);
  await promise.catch((e: SessionReviewError) => expect(e.code).toBe(code));
};

describe('submitSessionReview', () => {
  it.each([0, 6, 3.5, 'abc', null, undefined])('refuses a rating of %p', async (rating) => {
    await expectRefusal(submitSessionReview('client', 's1', { rating }), 'INVALID_RATING');
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("refuses someone else's session", async () => {
    mockFindFirst.mockResolvedValue(null);
    await expectRefusal(submitSessionReview('client', 's1', { rating: 5 }), 'SESSION_NOT_FOUND');
    expect(mockFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 's1', clientId: 'client' } }));
  });

  it.each(['scheduled', 'in-progress', 'cancelled'])('refuses a %s session — only completed ones can be rated', async (status) => {
    mockFindFirst.mockResolvedValue(session({ status }));
    await expectRefusal(submitSessionReview('client', 's1', { rating: 5 }), 'SESSION_NOT_COMPLETED');
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('saves the rating, trims and caps the review, and tells the advisor once', async () => {
    mockFindFirst.mockResolvedValue(session());
    const long = `  ${'x'.repeat(MAX_REVIEW_LENGTH + 50)}  `;
    const saved = await submitSessionReview('client', 's1', { rating: '4', feedback: long });
    expect(saved).toMatchObject({ rating: 4 });
    expect(mockUpdate.mock.calls[0][0].data.feedback).toHaveLength(MAX_REVIEW_LENGTH);
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ userId: 'adv', type: 'session_rated', dedupKey: 'session_rated:s1' }));
  });

  it('lets the client change a rating without notifying the advisor again', async () => {
    mockFindFirst.mockResolvedValue(session({ rating: 3 }));
    await submitSessionReview('client', 's1', { rating: 5, feedback: '   ' });
    expect(mockUpdate.mock.calls[0][0].data).toEqual({ rating: 5, feedback: null });
    expect(mockNotify).not.toHaveBeenCalled();
  });
});
