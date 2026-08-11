/**
 * Releases the Postgres pool once the whole jest run finishes.
 *
 * Without this, every run ended with "Jest did not exit one second after the
 * test run has completed" and left its connections open on the pgBouncer
 * session-mode pool. Those leaked sessions accumulated across runs until the
 * pool (size 15) was exhausted, and the NEXT run failed at
 * `prisma.user.upsert()` with `FATAL: (EMAXCONNSESSION) max clients reached` —
 * surfacing as ~19 unrelated suites "failing" for reasons that had nothing to do
 * with the code under test.
 */
export default async function globalTeardown(): Promise<void> {
  try {
    // Imported lazily: a suite run that never touched the DB should not
    // instantiate a client here just to disconnect it.
    const { prisma } = await import('../../../backend/src/db/prisma');
    await prisma.$disconnect();
  } catch {
    // Nothing to disconnect (or the client failed to load) — teardown must never
    // turn a green run red.
  }
}
