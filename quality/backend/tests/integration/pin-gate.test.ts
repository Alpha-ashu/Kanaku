/**
 * pinGate middleware contract: financial routes are blocked with
 * 403 PIN_VERIFICATION_REQUIRED unless the user holds a live PIN unlock.
 * (The gate's env switch is off under tests, so the unlock check is mocked.)
 */
jest.mock('../../../../backend/src/security/pinUnlock', () => ({
  evaluatePinUnlock: jest.fn(),
}));

import { pinGate } from '../../../../backend/src/middleware/pinGate';
import { evaluatePinUnlock } from '../../../../backend/src/security/pinUnlock';
import { AppError } from '../../../../backend/src/utils/AppError';

const mockEval = evaluatePinUnlock as unknown as jest.Mock;

const runGate = async (opts: { unlocked?: boolean; reject?: Error; userId?: string | null }) => {
  if (opts.reject) mockEval.mockRejectedValue(opts.reject);
  else mockEval.mockResolvedValue(opts.unlocked ?? false);

  const req: any = {
    user: opts.userId === null ? undefined : { id: opts.userId ?? 'user-1' },
    method: 'GET',
    path: '/accounts',
  };
  const next = jest.fn();
  await pinGate(req, {} as any, next);
  return next;
};

describe('pinGate middleware', () => {
  beforeEach(() => mockEval.mockReset());

  it('allows the request when the user holds a live PIN unlock', async () => {
    const next = await runGate({ unlocked: true });
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeUndefined(); // next() with no error
  });

  it('blocks with 403 PIN_VERIFICATION_REQUIRED when there is no live unlock', async () => {
    const next = await runGate({ unlocked: false });
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('PIN_VERIFICATION_REQUIRED');
  });

  it('fails OPEN on an unexpected evaluation error (never locks a user out)', async () => {
    const next = await runGate({ reject: new Error('redis down') });
    expect(next.mock.calls[0][0]).toBeUndefined();
  });

  it('passes through when there is no authenticated user (auth handles it)', async () => {
    const next = await runGate({ userId: null });
    expect(next.mock.calls[0][0]).toBeUndefined();
    expect(mockEval).not.toHaveBeenCalled();
  });
});
