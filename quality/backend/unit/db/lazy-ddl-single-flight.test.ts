/**
 * Tables the backend creates at runtime are ensured once per process, and
 * concurrent first callers share that one run.
 *
 * Each ensure used to set a "done" flag only after its DDL finished, so every
 * request that arrived meanwhile ran its own copy. For the to-do tables that
 * DDL includes `ALTER TABLE … ADD COLUMN IF NOT EXISTS` (an ACCESS EXCLUSIVE
 * lock even when the column exists), and parallel copies deadlocked each other
 * (40P01) when several users opened their lists right after a restart.
 */
const mockExecuteRawUnsafe = jest.fn();
const mockExecuteRaw = jest.fn();

jest.mock('../../../../backend/src/db/prisma', () => ({
  prisma: {
    $executeRawUnsafe: (...args: unknown[]) => mockExecuteRawUnsafe(...args),
    $executeRaw: (...args: unknown[]) => mockExecuteRaw(...args),
  },
}));
jest.mock('../../../../backend/src/db/rls', () => ({ enableRowLevelSecurity: jest.fn(async () => undefined) }));
jest.mock('../../../../backend/src/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

/** A DDL call that stays in flight until released, so callers can pile up. */
const holdDdl = () => {
  let release!: () => void;
  mockExecuteRawUnsafe.mockImplementationOnce(() => new Promise<number>((resolve) => { release = () => resolve(0); }));
  return () => release();
};

beforeEach(() => {
  jest.resetModules();
  mockExecuteRawUnsafe.mockReset().mockResolvedValue(0);
  mockExecuteRaw.mockReset().mockResolvedValue(0);
});

describe('to-do tables', () => {
  const load = async () => (await import('../../../../backend/src/features/todos/todo.repository')).ensureTodoTablesExist;

  it('runs the DDL once for callers that arrive while it is running', async () => {
    const ensure = await load();
    const release = holdDdl();
    const pending = [ensure(), ensure(), ensure()];
    release();
    await Promise.all(pending);
    await ensure();
    expect(mockExecuteRawUnsafe).toHaveBeenCalledTimes(1);
  });

  it('tries again on the next call after a failed run, without failing the request', async () => {
    const ensure = await load();
    mockExecuteRawUnsafe.mockRejectedValueOnce(new Error('cannot execute CREATE TABLE in a read-only transaction'));
    await expect(ensure()).resolves.toBeUndefined();
    await ensure();
    expect(mockExecuteRawUnsafe).toHaveBeenCalledTimes(2);
  });
});

describe('categorisation tables', () => {
  const load = async () => (await import('../../../../backend/src/features/categorization/categorization.engine')).ensureCategorizationTables;

  it('creates the tables and seeds the keywords once for concurrent callers', async () => {
    const ensure = await load();
    const release = holdDdl();
    const pending = [ensure(), ensure()];
    release();
    await Promise.all(pending);
    const seededOnce = mockExecuteRaw.mock.calls.length;
    await ensure();
    expect(mockExecuteRawUnsafe).toHaveBeenCalledTimes(2); // keyword_mappings + user_learning
    expect(seededOnce).toBeGreaterThan(0);
    expect(mockExecuteRaw).toHaveBeenCalledTimes(seededOnce);
  });

  it('reports a failed run to its callers and retries on the next call', async () => {
    const ensure = await load();
    mockExecuteRawUnsafe.mockRejectedValueOnce(new Error('connection reset'));
    await expect(ensure()).rejects.toThrow('connection reset');
    await expect(ensure()).resolves.toBeUndefined();
  });
});
