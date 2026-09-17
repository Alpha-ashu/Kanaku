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

// Tests live in quality/backend/tests/; the env file stays in backend/.
config({ path: path.resolve(__dirname, '../../../backend/.env.test') });

// The Account-Aggregator router is mount-gated OFF by default in production
// (see src/routes/index.ts), but the integration suite exercises it, so opt it
// in for tests unless the runner already configured ENABLED_MODULES.
process.env.ENABLED_MODULES = process.env.ENABLED_MODULES || 'aa';
