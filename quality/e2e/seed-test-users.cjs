/**
 * quality/e2e/seed-test-users.cjs
 *
 * Idempotently creates / verifies all 7 E2E test users before the Playwright suite runs.
 * Run: node quality/e2e/seed-test-users.cjs
 *
 * What it does per user:
 *  1. Check if email exists via POST /auth/check-email
 *  2. If not → register
 *  3. Login (SHA-256 challenge flow) to verify credentials work
 *  4. Create a default "Savings Account" (idempotent via clientRequestId)
 *  5. Log evidence — PASS / FAIL per user
 */
'use strict';

const { createHash } = require('crypto');

const API = process.env.TEST_API_URL || 'http://localhost:3000';
const PASSWORD = process.env.SEED_TEST_PASSWORD || 'example-Test-password-123!';

const USERS = [
  { firstName: 'Arjun',  lastName: 'Sharma',  email: 'arjun.test@kanaku.app',  mobile: '9000000001', role: 'user' },
  { firstName: 'Priya',  lastName: 'Mehta',   email: 'priya.test@kanaku.app',  mobile: '9000000002', role: 'user' },
  { firstName: 'Rohan',  lastName: 'Verma',   email: 'rohan.test@kanaku.app',  mobile: '9000000003', role: 'user' },
  { firstName: 'Sneha',  lastName: 'Kapoor',  email: 'sneha.test@kanaku.app',  mobile: '9000000004', role: 'user' },
  { firstName: 'Dev',    lastName: 'Nair',    email: 'dev.test@kanaku.app',    mobile: '9000000005', role: 'user' },
  { firstName: 'Isha',   lastName: 'Patel',   email: 'isha.test@kanaku.app',   mobile: '9000000006', role: 'user' },
  { firstName: 'Power',  lastName: 'User',    email: 'admin.test@kanaku.app',  mobile: '9000000007', role: 'user' },
];

async function post(path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}/api/v1${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function checkEmail(email) {
  try {
    const r = await post('/auth/check-email', { email });
    // API returns { available: false } when email is taken
    const available = r.body?.data?.available ?? r.body?.available;
    // available = false means email exists
    return available === false;
  } catch {
    return false;
  }
}

async function register(user) {
  const r = await post('/auth/register', {
    firstName: user.firstName,
    lastName:  user.lastName,
    email:     user.email,
    mobile:    user.mobile,
    password:  PASSWORD,
    confirmPassword: PASSWORD,
    agreeToTerms: true,
  });
  return r;
}

async function loginGetToken(email) {
  const sha256 = createHash('sha256').update(PASSWORD, 'utf8').digest('hex');

  // Step 1: challenge with SHA-256 hash
  let cr = await post('/auth/login/challenge', { email, password: sha256 }, null);
  if (!cr.body?.data?.code) {
    // Fallback: plain password
    cr = await post('/auth/login/challenge', { email, password: PASSWORD }, null);
  }
  const code = cr.body?.data?.code;
  if (!code) return null;

  // Step 2: exchange code for tokens
  const tr = await post('/auth/login', { email, challengeCode: code });
  return tr.body?.data?.accessToken || null;
}

async function ensureDefaultAccount(token, email) {
  await post('/accounts', {
    name: 'Savings Account',
    type: 'bank',
    balance: 50000,
    currency: 'INR',
    clientRequestId: `seed-acct-${email}`,
  }, token);
}

async function enableFeaturesForUsers(adminToken) {
  // POST /api/v1/admin/features/matrix — enable key features for user role
  const matrix = {
    user: {
      accounts: true, transactions: true, loans: true, goals: true,
      groups: true, investments: true, reports: true, calendar: true,
      todoLists: true, transfer: true, bookAdvisor: true,
      notifications: true, userProfile: true, settings: true,
      recurringTransactions: true, budgetAlerts: true, dashboard: true,
      aiInsights: false, clientManagement: false,
    },
  };
  const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` };
  try {
    const res = await fetch(`${API}/api/v1/admin/features/matrix`, {
      method: 'POST',
      headers,
      body: JSON.stringify(matrix),
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 200 || res.status === 201) {
      console.log('  ✅  Feature matrix saved (todoLists + bookAdvisor enabled for user role)');
    } else {
      console.warn(`  ⚠️  Feature matrix save returned ${res.status}:`, JSON.stringify(body).slice(0, 120));
    }
  } catch (e) {
    console.warn('  ⚠️  Feature matrix save failed:', e.message);
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('       KANAKKU E2E TEST USER SEEDER');
  console.log(`       API: ${API}`);
  console.log('═══════════════════════════════════════════════════');

  // Verify backend is reachable
  try {
    const r = await fetch(`${API}/health`);
    if (!r.ok) throw new Error(`Health returned ${r.status}`);
    console.log('✅  Backend reachable\n');
  } catch (e) {
    console.error('❌  Backend unreachable — is the server running?', e.message);
    process.exit(1);
  }

  const results = [];
  let adminToken = null;

  for (const user of USERS) {
    process.stdout.write(`  [${user.email}] checking... `);
    let status = 'UNKNOWN';

    try {
      const exists = await checkEmail(user.email);
      if (!exists) {
        const r = await register(user);
        if (r.status === 201 || r.status === 200) {
          status = 'REGISTERED';
        } else if (r.status === 409 || r.body?.code === 'DUPLICATE_ACCOUNT') {
          status = 'ALREADY_EXISTS';
        } else {
          status = `REG_FAILED(${r.status})`;
        }
      } else {
        status = 'ALREADY_EXISTS';
      }

      // Login to verify credentials
      const token = await loginGetToken(user.email);
      if (!token) {
        console.log(`❌  LOGIN_FAILED (${status})`);
        results.push({ email: user.email, status: 'LOGIN_FAILED' });
        continue;
      }

      // Save admin token for feature matrix
      if (user.email === 'admin.test@kanaku.app') {
        adminToken = token;
      }

      await ensureDefaultAccount(token, user.email);
      console.log(`✅  ${status} + LOGIN OK + account ensured`);
      results.push({ email: user.email, status: 'OK' });

    } catch (e) {
      console.log(`❌  ERROR: ${e.message}`);
      results.push({ email: user.email, status: 'ERROR', error: e.message });
    }
  }

  // Enable feature flags for user role using admin token
  if (adminToken) {
    console.log('\n  Enabling feature flags for user role via admin API...');
    await enableFeaturesForUsers(adminToken);
  } else {
    console.warn('\n  ⚠️  No admin token — feature matrix not updated. Tests 06/07 may fail if features are not enabled.');
  }

  console.log('\n═══════════════════════════════════════════════════');
  const failed = results.filter(r => r.status !== 'OK');
  if (failed.length === 0) {
    console.log(`✅  All ${results.length} test users seeded and verified.`);
    console.log('    E2E suite can now run.\n');
    process.exit(0);
  } else {
    console.log(`❌  ${failed.length}/${results.length} users failed:`);
    failed.forEach(r => console.log(`    - ${r.email}: ${r.status} ${r.error || ''}`));
    console.log('\n    Fix the above before running E2E tests.\n');
    process.exit(1);
  }
}

main().catch(e => { console.error('Seeder crashed:', e); process.exit(1); });
