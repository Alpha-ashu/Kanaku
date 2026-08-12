/**
 * Releases this test file's database connections when the file finishes.
 *
 * ── Why a per-FILE hook and not just globalTeardown ──
 *
 * Jest gives every test file its own module registry, so each file that imports
 * the app instantiates its own PrismaClient. With `maxWorkers: 1` all of those
 * live in one process, and nothing closed them until the run ended — so the
 * connections accumulated file after file against a pgBouncer pool of 15 and the
 * run died partway through with:
 *
 *     FATAL: (EMAXCONNSESSION) max clients reached in session mode
 *
 * That is what made ~16 suites "fail" in a full run while every one of them
 * passed in isolation, and why the failures moved around depending on order.
 * globalTeardown alone cannot fix it: it runs once, after everything, which is
 * far too late.
 *
 * Registered via `setupFilesAfterEnv`, so this `afterAll` is attached to the ROOT
 * block before the test file is loaded. Jest runs describe-scoped hooks before
 * root-scoped ones, so every suite's own cleanup still completes first — this
 * only closes the sockets afterwards.
 */
afterAll(async () => {
  try {
    const { disconnectPrisma } = await import('../../../backend/src/db/prisma');
    // Closes the writer AND the reader. prismaRead is a separate client even
    // without READ_REPLICA_URL, so disconnecting only `prisma` left half the
    // connections open — which is why the pool still ran dry mid-run.
    await disconnectPrisma();
  } catch {
    // A suite that never touched the database has nothing to disconnect, and a
    // teardown problem must never turn a green run red.
  }
});
