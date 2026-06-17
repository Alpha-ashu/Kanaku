// Kanaku Auth API Test Suite — corrected route paths + delay between tests
// Run: node scratch/auth_api_test.mjs
// Routes confirmed from source:
//   POST /api/v1/auth/register
//   POST /api/v1/auth/login
//   POST /api/v1/auth/login/challenge   ← PIN/device challenge
//   GET  /api/v1/auth/profile           ← protected profile
//   GET  /api/v1/devices                ← protected devices
//   POST /api/v1/pin/...                ← PIN management

const BASE = 'https://kanaku.fly.dev';
const ts = Date.now();
const TEST_EMAIL = `testuser_${ts}@mailinator.com`;
const TEST_PASS = 'TestPass123!';
const DELAY_MS = 2000; // 2s between auth calls to avoid rate-limiting

const results = [];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function apiTest(name, url, method, body, expectCode, headers = {}) {
  await sleep(DELAY_MS);
  process.stdout.write(`\n  ${name}\n`);
  try {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
    };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(url, opts);
    const text = await r.text();
    const preview = text.length > 350 ? text.slice(0, 350) + '...' : text;
    const pass = r.status === expectCode;
    const icon = pass ? '✅' : (r.status < 500 ? '⚠️ ' : '❌');
    console.log(`  ${icon} HTTP ${r.status} (expected ${expectCode}): ${pass ? 'PASS' : 'FAIL'}`);
    console.log(`  Body: ${preview}`);
    results.push({ name, status: r.status, pass, body: text });
    return { status: r.status, body: text, pass };
  } catch (e) {
    console.log(`  ❌ Network Error: ${e.message}`);
    results.push({ name, status: 0, pass: false, body: e.message });
    return { status: 0, body: e.message, pass: false };
  }
}

async function main() {
  console.log('=========================================');
  console.log('   Kanaku AUTH API TEST SUITE v2');
  console.log(`   Backend  : ${BASE}`);
  console.log(`   Email    : ${TEST_EMAIL}`);
  console.log(`   Delay    : ${DELAY_MS}ms between requests`);
  console.log('=========================================');

  // ── HEALTH ──────────────────────────────────────────────────────────────
  console.log('\n=== HEALTH CHECK ===');
  await apiTest('T0: Health Check', `${BASE}/health`, 'GET', null, 200);

  // ── REGISTRATION NEGATIVE ──────────────────────────────────────────────
  console.log('\n=== REGISTRATION — NEGATIVE TESTS ===');

  // Rate limit is 5/min. We have ~6-7 calls. Run with 2s delay so we stay under.
  await apiTest('T1: Empty body → 400',
    `${BASE}/api/v1/auth/register`, 'POST', {}, 400);

  await apiTest('T2: Missing password → 400',
    `${BASE}/api/v1/auth/register`, 'POST',
    { firstName: 'Test', lastName: 'User', email: 'nopwd@test.com' }, 400);

  await apiTest('T3: Invalid email format → 400',
    `${BASE}/api/v1/auth/register`, 'POST',
    { firstName: 'Test', lastName: 'User', email: 'notanemail', password: 'Test1234!' }, 400);

  await apiTest('T4: Weak password "123" → 400',
    `${BASE}/api/v1/auth/register`, 'POST',
    { firstName: 'Test', lastName: 'User', email: 'weak@test.com', password: '123' }, 400);

  await apiTest('T5: Missing firstName → 400',
    `${BASE}/api/v1/auth/register`, 'POST',
    { lastName: 'User', email: 'nofirst@test.com', password: TEST_PASS }, 400);

  // Wait extra to reset window before positive test
  console.log('\n  ⏳ Waiting 65s for rate-limit window to reset before positive tests...');
  await sleep(65000);

  // ── REGISTRATION POSITIVE ─────────────────────────────────────────────
  console.log('\n=== REGISTRATION — POSITIVE TEST ===');

  const r6 = await apiTest('T6: Register valid user → 201',
    `${BASE}/api/v1/auth/register`, 'POST',
    { firstName: 'TestKanaku', lastName: 'AutoTest', email: TEST_EMAIL, password: TEST_PASS }, 201);

  let regToken = null;
  if (r6.status === 200 || r6.status === 201) {
    try {
      const data = JSON.parse(r6.body);
      regToken = data?.data?.token || data?.token;
      if (regToken) console.log(`  🔑 Reg Token: ${regToken.slice(0, 50)}...`);
    } catch { console.log('  Could not parse token'); }
  }

  // Duplicate registration
  await apiTest('T7: Register duplicate email → 409',
    `${BASE}/api/v1/auth/register`, 'POST',
    { firstName: 'Dup', lastName: 'User', email: TEST_EMAIL, password: TEST_PASS }, 409);

  // ── LOGIN NEGATIVE ─────────────────────────────────────────────────────
  console.log('\n=== LOGIN — NEGATIVE TESTS ===');

  await apiTest('T8: Login empty body → 400',
    `${BASE}/api/v1/auth/login`, 'POST', {}, 400);

  await apiTest('T9: Login non-existent user → 401',
    `${BASE}/api/v1/auth/login`, 'POST',
    { email: `ghost_${ts}@nowhere.com`, password: 'FakePass123!' }, 401);

  await apiTest('T10: Login wrong password → 401',
    `${BASE}/api/v1/auth/login`, 'POST',
    { email: TEST_EMAIL, password: 'WrongPassword999!' }, 401);

  await apiTest('T11: Login invalid email format → 400',
    `${BASE}/api/v1/auth/login`, 'POST',
    { email: 'badformat', password: TEST_PASS }, 400);

  // Wait for rate limit window
  console.log('\n  ⏳ Waiting 65s for rate-limit window before positive login...');
  await sleep(65000);

  // ── LOGIN POSITIVE ────────────────────────────────────────────────────
  console.log('\n=== LOGIN — POSITIVE TEST ===');

  const r12 = await apiTest('T12: Login valid credentials → 200',
    `${BASE}/api/v1/auth/login`, 'POST',
    { email: TEST_EMAIL, password: TEST_PASS }, 200);

  let loginToken = null;
  if (r12.status === 200) {
    try {
      const data = JSON.parse(r12.body);
      loginToken = data?.data?.token || data?.token;
      if (loginToken) console.log(`  🔑 Login Token: ${loginToken.slice(0, 50)}...`);
    } catch { console.log('  Could not parse login token'); }
  }

  // ── CHALLENGE / PIN ────────────────────────────────────────────────────
  console.log('\n=== CHALLENGE / PIN TESTS ===');
  // Correct route: POST /api/v1/auth/login/challenge
  await apiTest('T13: Challenge without token → 401',
    `${BASE}/api/v1/auth/login/challenge`, 'POST',
    { pin: '481620', deviceId: 'device-test-001' }, 401);

  await apiTest('T14: Challenge with fake token → 401',
    `${BASE}/api/v1/auth/login/challenge`, 'POST',
    { pin: '481620', deviceId: 'device-test-001' }, 401,
    { Authorization: 'Bearer fake.invalid.jwt.token' });

  // ── PROTECTED ROUTES ───────────────────────────────────────────────────
  console.log('\n=== PROTECTED ROUTES ===');

  // GET /api/v1/auth/profile (no token → 401)
  await apiTest('T15: GET /auth/profile without token → 401',
    `${BASE}/api/v1/auth/profile`, 'GET', null, 401);

  // GET /api/v1/devices (no token → 401)
  await apiTest('T16: GET /devices without token → 401',
    `${BASE}/api/v1/devices`, 'GET', null, 401);

  if (loginToken) {
    await apiTest('T17: GET /auth/profile with valid token → 200',
      `${BASE}/api/v1/auth/profile`, 'GET', null, 200,
      { Authorization: `Bearer ${loginToken}` });

    await apiTest('T18: GET /devices with valid token → 200',
      `${BASE}/api/v1/devices`, 'GET', null, 200,
      { Authorization: `Bearer ${loginToken}` });
  } else {
    console.log('\n  ⏭️  SKIP T17, T18 — no login token');
    results.push({ name: 'T17: GET /auth/profile with valid token', status: 0, pass: false });
    results.push({ name: 'T18: GET /devices with valid token', status: 0, pass: false });
  }

  // ── SUMMARY ───────────────────────────────────────────────────────────
  console.log('\n=========================================');
  console.log('   FINAL TEST RESULTS SUMMARY');
  console.log('=========================================');
  let passed = 0, failed = 0;
  for (const r of results) {
    const icon = r.pass ? '✅' : '❌';
    console.log(`  ${icon} ${r.name} — HTTP ${r.status}`);
    if (r.pass) passed++; else failed++;
  }
  console.log('');
  console.log(`  Total: ${results.length}  |  ✅ Passed: ${passed}  |  ❌ Failed: ${failed}`);
  console.log(`  Test account: ${TEST_EMAIL} / ${TEST_PASS}`);
  console.log('=========================================');
}

main().catch(console.error);
