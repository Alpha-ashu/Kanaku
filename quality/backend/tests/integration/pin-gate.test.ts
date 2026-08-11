/**
 * pinGate middleware contract: financial routes are blocked with
 * 403 PIN_VERIFICATION_REQUIRED unless the caller holds a live PIN unlock.
 *
 * The gate now consults `evaluatePinUnlockRequest`, which both decides and
 * returns a refreshed unlock token — that echo is what slides the re-lock window
 * with activity, so it is part of the contract and asserted here.
 * (The gate's env switch is off under tests, so the unlock check is mocked.)
 */
jest.mock('../../../../backend/src/security/pinUnlock', () => ({
  evaluatePinUnlockRequest: jest.fn(),
  PIN_UNLOCK_HEADER: 'x-pin-unlock',
}));

import { pinGate } from '../../../../backend/src/middleware/pinGate';
import { evaluatePinUnlockRequest } from '../../../../backend/src/security/pinUnlock';
import { AppError } from '../../../../backend/src/utils/AppError';

const mockEval = evaluatePinUnlockRequest as unknown as jest.Mock;

const runGate = async (opts: {
  unlocked?: boolean;
  refreshedToken?: string | null;
  reject?: Error;
  userId?: string | null;
  presentedToken?: string;
}) => {
  if (opts.reject) mockEval.mockRejectedValue(opts.reject);
  else {
    mockEval.mockResolvedValue({
      unlocked: opts.unlocked ?? false,
      refreshedToken: opts.refreshedToken ?? null,
    });
  }

  const req: any = {
    user: opts.userId === null ? undefined : { id: opts.userId ?? 'user-1' },
    method: 'GET',
    path: '/accounts',
    headers: opts.presentedToken ? { 'x-pin-unlock': opts.presentedToken } : {},
  };
  const setHeader = jest.fn();
  const res: any = { setHeader };
  const next = jest.fn();

  await pinGate(req, res, next);
  return { next, setHeader };
};

describe('pinGate middleware', () => {
  beforeEach(() => mockEval.mockReset());

  it('allows the request when the user holds a live PIN unlock', async () => {
    const { next } = await runGate({ unlocked: true });
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeUndefined(); // next() with no error
  });

  it('blocks with 403 PIN_VERIFICATION_REQUIRED when there is no live unlock', async () => {
    const { next } = await runGate({ unlocked: false });
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('PIN_VERIFICATION_REQUIRED');
  });

  it('echoes the refreshed unlock token so the window slides with activity', async () => {
    const { next, setHeader } = await runGate({ unlocked: true, refreshedToken: 'refreshed.jwt.value' });
    expect(next.mock.calls[0][0]).toBeUndefined();
    expect(setHeader).toHaveBeenCalledWith('X-Pin-Unlock', 'refreshed.jwt.value');
  });

  it('sets no header when the evaluation returns no refreshed token', async () => {
    const { next, setHeader } = await runGate({ unlocked: true, refreshedToken: null });
    expect(next.mock.calls[0][0]).toBeUndefined();
    expect(setHeader).not.toHaveBeenCalled();
  });

  it('forwards the presented token to the evaluator', async () => {
    await runGate({ unlocked: true, presentedToken: 'client.jwt.value' });
    expect(mockEval).toHaveBeenCalledWith('user-1', 'client.jwt.value');
  });

  it('fails OPEN on an unexpected evaluation error (never locks a user out)', async () => {
    const { next } = await runGate({ reject: new Error('storage down') });
    expect(next.mock.calls[0][0]).toBeUndefined();
  });

  it('passes through when there is no authenticated user (auth handles it)', async () => {
    const { next } = await runGate({ userId: null });
    expect(next.mock.calls[0][0]).toBeUndefined();
    expect(mockEval).not.toHaveBeenCalled();
  });
});
