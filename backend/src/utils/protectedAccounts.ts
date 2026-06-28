/**
 * The four canonical Kanaku role accounts (admin / manager / advisor / user)
 * are protected: they are the project's secure credentials and must never be
 * deleted. Their addresses come from the SEED_*_EMAIL env vars, falling back to
 * the well-known @kanaku.com logins when those are unset.
 */
const FALLBACK_PROTECTED = [
  'admin@kanaku.com',
  'manager@kanaku.com',
  'advisor@kanaku.com',
  'user@kanaku.com',
];

export function getProtectedEmails(): Set<string> {
  const fromEnv = [
    process.env.SEED_ADMIN_EMAIL,
    process.env.SEED_MANAGER_EMAIL,
    process.env.SEED_ADVISOR_EMAIL,
    process.env.SEED_USER_EMAIL,
  ].filter((e): e is string => !!e);
  const source = fromEnv.length ? fromEnv : FALLBACK_PROTECTED;
  return new Set(source.map((e) => e.toLowerCase().trim()));
}

/** True when `email` is one of the protected canonical role accounts. */
export function isProtectedAccount(email?: string | null): boolean {
  if (!email) return false;
  return getProtectedEmails().has(email.toLowerCase().trim());
}
