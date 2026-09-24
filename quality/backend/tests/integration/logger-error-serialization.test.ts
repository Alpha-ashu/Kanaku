/**
 * The logger must not swallow errors that are nested inside a meta object.
 *
 * `logger.error('msg', { error })` is the dominant shape in this codebase (~60
 * call sites). An Error's `message` and `stack` are non-enumerable, so before
 * `serializeErrors` existed that payload serialised to `{"error":{}}` — every
 * 5xx from those handlers was logged as "something failed" with no indication of
 * what. That is not a cosmetic logging nit: it is what made the production
 * `/api/v1/advisors/apply` 500 untraceable from the Render logs.
 *
 * These assertions read the JSON pino actually writes, so they fail if the
 * flattening regresses or is reordered behind redaction.
 */
import { logger } from '../../../../backend/src/config/logger';

describe('logger error serialization', () => {
  const lines: any[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);

  beforeAll(() => {
    // pino holds the `process.stdout` object and calls `.write()` on it at emit
    // time, so swapping the method here captures everything the logger emits.
    (process.stdout as any).write = (chunk: any, ...rest: any[]) => {
      for (const line of String(chunk).split('\n')) {
        if (line.trim().startsWith('{')) {
          try { lines.push(JSON.parse(line)); } catch { /* not one of ours */ }
        }
      }
      return originalWrite(chunk, ...rest);
    };
  });

  afterAll(() => {
    (process.stdout as any).write = originalWrite;
  });

  const lastLine = (message: string) => [...lines].reverse().find((l) => l.message === message);

  it('records message and stack for an Error nested in the meta object', () => {
    logger.error('nested error case', { userId: 'u-1', error: new Error('bucket unreachable') });

    const line = lastLine('nested error case');
    expect(line).toBeDefined();
    // The regression: `error` used to serialise to `{}`.
    expect(line.error.message).toBe('bucket unreachable');
    expect(line.error.name).toBe('Error');
    expect(typeof line.error.stack).toBe('string');
    // Sibling context must survive the flattening.
    expect(line.userId).toBe('u-1');
  });

  it('lifts out a Prisma-style code so schema drift is distinguishable', () => {
    logger.error('prisma error case', {
      error: Object.assign(new Error('column does not exist'), {
        code: 'P2022',
        meta: { column: 'hourly_rate' },
      }),
    });

    const line = lastLine('prisma error case');
    expect(line.error.code).toBe('P2022');
    expect(line.error.meta).toEqual({ column: 'hourly_rate' });
  });

  it('still handles an Error passed as the whole meta', () => {
    logger.error('top level error case', new Error('top level'));

    const line = lastLine('top level error case');
    expect(line.err.message).toBe('top level');
    expect(typeof line.err.stack).toBe('string');
  });

  it('keeps redaction applied alongside the flattened error fields', () => {
    logger.error('redaction case', { error: new Error('failed'), accessToken: 'a'.repeat(64) });

    const line = lastLine('redaction case');
    expect(line.error.message).toBe('failed');
    expect(line.accessToken).toBe('[REDACTED]');
  });

  it('does not spin on a self-referencing payload', () => {
    const box: any = { error: new Error('cyclic') };
    box.self = box;

    expect(() => logger.error('cyclic case', box)).not.toThrow();
    const line = lastLine('cyclic case');
    expect(line.error.message).toBe('cyclic');
    // The cycle is cut rather than re-expanded at every level — each level would
    // otherwise repeat a full stack trace and turn one line into tens of KB.
    expect(line.self).toBe('[Circular]');
  });

  it('does not mistake a repeated sibling for a cycle', () => {
    // Ancestor-scoped detection: the same object referenced twice side by side is
    // an ordinary payload shape and must serialise fully both times.
    const shared = { accountId: 'acc-1' };
    logger.error('shared sibling case', { left: shared, right: shared, error: new Error('x') });

    const line = lastLine('shared sibling case');
    expect(line.left).toEqual({ accountId: 'acc-1' });
    expect(line.right).toEqual({ accountId: 'acc-1' });
  });

  it('truncates a pathologically long stack instead of emitting it whole', () => {
    const error = new Error('huge');
    error.stack = ['Error: huge', ...Array.from({ length: 5000 }, () => '    at frame')].join('\n');
    logger.error('long stack case', { error });

    const { stack } = lastLine('long stack case').error;
    expect(stack.length).toBeLessThan(4200);
    expect(stack.endsWith('… [truncated]')).toBe(true);
  });
});
