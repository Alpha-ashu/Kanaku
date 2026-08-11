/**
 * Per-suite fixture namespacing.
 *
 * The integration suites share one Postgres database and jest runs them serially
 * (`maxWorkers: 1`), which prevents *concurrent* interference but not *residual*
 * interference: suites create rows, assert, and delete by hardcoded identity
 * values that several of them happen to share.
 *
 * Two collision classes were doing the damage:
 *
 *   1. Identical user ids — platformConsistency and systemIntegrity both used
 *      the literal uuid 'da6d92bf-33ab-41c6-a675-ea285f524021', so each suite's
 *      `deleteMany({ where: { userId } })` wiped the other's fixtures.
 *   2. Identical values behind UNIQUE constraints — phone '9876543219' appears
 *      in three suites and 'test@example.com' in six. Whichever ran second got
 *      a 400/500 from a duplicate-key violation on a row it did not create.
 *
 * Both show the same symptom: every suite passes alone, and a full run fails in
 * a way that shifts depending on execution order.
 *
 * These helpers derive identity from the *test file name*, so values are unique
 * per suite, stable across runs (no random ids to chase in a failure), and
 * self-describing when you find a stray row in the database.
 */
import path from 'path';

/**
 * Slug for the currently-executing suite, e.g. 'platformConsistency'.
 *
 * `expect.getState().testPath` is set by jest per test file, which is what makes
 * this work without every suite having to pass its own name in.
 */
export const suiteSlug = (): string => {
  const testPath = (expect as unknown as { getState?: () => { testPath?: string } })
    .getState?.()?.testPath;

  if (!testPath) {
    throw new Error(
      'suiteSlug() could not determine the test path. Call it from inside a test file.',
    );
  }

  return path
    .basename(testPath)
    .replace(/\.(test|spec)\.[tj]s$/, '')
    .replace(/[^a-zA-Z0-9]/g, '-')
    .toLowerCase();
};

/** Stable, suite-unique user id. `suffix` separates multiple users in one suite. */
export const testUserId = (suffix = ''): string =>
  `u-${suiteSlug()}${suffix ? `-${suffix}` : ''}`;

/** Suite-unique email. Safe against the UNIQUE(email) constraint on User. */
export const testEmail = (local = 'user'): string =>
  `${local}.${suiteSlug()}@kanaku-test.invalid`;

/**
 * Suite-unique 10-digit phone.
 *
 * Phone carries a UNIQUE constraint, so a literal like '9876543219' shared
 * across suites is a guaranteed duplicate-key failure for whichever runs second.
 * Derived from a hash of the suite slug plus `seed`, keeping it deterministic
 * while staying inside a valid Indian mobile range (leading 6-9).
 */
export const testPhone = (seed = 0): string => {
  const slug = suiteSlug();
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = (hash * 31 + slug.charCodeAt(i)) >>> 0;
  }
  hash = (hash + seed * 7919) >>> 0;
  const nine = String(hash % 1_000_000_000).padStart(9, '0');
  return `9${nine}`;
};

/** Suite-unique device id, for suites that register sessions/devices. */
export const testDeviceId = (suffix = ''): string =>
  `d-${suiteSlug()}${suffix ? `-${suffix}` : ''}`;

/**
 * Everything a suite typically needs, in one call.
 *
 * ```ts
 * const fx = testFixtures();
 * await prisma.user.upsert({ where: { id: fx.userId }, ... });
 * ```
 */
export const testFixtures = (suffix = '') => ({
  userId: testUserId(suffix),
  email: testEmail(suffix || 'user'),
  phone: testPhone(0),
  deviceId: testDeviceId(suffix),
  slug: suiteSlug(),
});
