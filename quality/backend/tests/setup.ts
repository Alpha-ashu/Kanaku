import path from 'path';
import { config } from 'dotenv';

// Never send real email from the test suite. .env.test (and backend/.env,
// which src/db/prisma.ts also loads) carry the live SendGrid key, so every
// registration test mailed an OTP to a throwaway @example.com address through
// the production account — spending its credits until SendGrid began
// rejecting ALL sends ("Maximum credits exceeded"), which blocked real signups.
// Blank values (not deleted keys) are required: dotenv never overrides a key
// that already exists in process.env, so a deleted key would be re-populated
// from the env files. With no provider configured, sendEmail() uses its dev
// mock outside production. Set TEST_SEND_REAL_EMAIL=true to opt back in.
if (process.env.TEST_SEND_REAL_EMAIL !== 'true') {
  for (const key of ['SENDGRID_API_KEY', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS']) {
    process.env[key] = '';
  }
}

// The AI proxy tokens (OpenLux is paid, xkiro's free models are rate limited)
// are live in backend/.env: any test that reaches KAI or the chat assistant
// would spend them and send test prompts to the proxy. Blank them unless
// TEST_USE_PAID_AI=true.
if (process.env.TEST_USE_PAID_AI !== 'true') {
  for (const key of ['XKIRO_API_KEY', 'OPENLUX_GEMINI_API_KEY', 'OPENLUX_OPENAI_API_KEY']) {
    process.env[key] = '';
  }
}

// The auth suites register, verify and log in dozens of users from one IP
// within a minute. The production per-IP limits (auth 20/min, login challenge
// 5/min, sign-up 10/hour) turned their later cases into 429s. No suite asserts
// these limits (regression.test.ts checks them only under NODE_ENV=production).
for (const [key, value] of [['AUTH_RATE_LIMIT', '1000'], ['LOGIN_RATE_LIMIT', '1000'], ['REGISTER_RATE_LIMIT', '1000']]) {
  if (!process.env[key]) process.env[key] = value;
}

// Tests live in quality/backend/tests/; the env file stays in backend/.
config({ path: path.resolve(__dirname, '../../../backend/.env.test') });

// ── The suite must never run against production ──────────────────────────────
//
// `backend/.env` points DATABASE_URL at the PRODUCTION database, and
// `src/db/prisma.ts` loads it. `.env.test` is loaded first and dotenv never
// overrides an existing key, so today the test database wins — but that is an
// ordering accident, not a guarantee. One reordered import, one missing
// `.env.test`, and a suite that truncates tables would run against real user
// data.
//
// So this asserts the outcome rather than trusting the mechanism. It checks the
// resolved URL, which is what Prisma will actually connect to.
const assertNotProduction = (): void => {
  const url = process.env.DATABASE_URL || '';
  if (!url) return; // nothing resolved yet; Prisma will fail its own way

  let host = '';
  let database = '';
  try {
    const parsed = new URL(url);
    host = parsed.hostname;
    database = parsed.pathname.replace(/^\//, '');
  } catch {
    return; // unparseable — not something we can judge
  }

  // A test database announces itself. Anything else is treated as production,
  // because the safe default when we cannot tell is to refuse.
  const looksLikeTest =
    /(^|[_-])(test|ci|scratch|staging|shadow)([_-]|$)/i.test(database) ||
    /^(localhost|127\.0\.0\.1|\[::1\]|host\.docker\.internal)$/i.test(host);

  const override = process.env.ALLOW_NON_TEST_DATABASE === 'true';

  if (!looksLikeTest && !override) {
    throw new Error(
      `Refusing to run the test suite against database "${database}" on ${host}: ` +
        'it is not recognisably a test database. Point DATABASE_URL at a scratch/CI/staging ' +
        'database, or set ALLOW_NON_TEST_DATABASE=true if you are certain.',
    );
  }
};
assertNotProduction();

// The Account-Aggregator router is mount-gated OFF by default in production
// (see src/routes/index.ts), but the integration suite exercises it, so opt it
// in for tests unless the runner already configured ENABLED_MODULES.
process.env.ENABLED_MODULES = process.env.ENABLED_MODULES || 'aa';
