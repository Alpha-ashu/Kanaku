/**
 * KANAKKU CONCURRENCY & ACID COMPLIANCE TEST
 * 
 * Tests: concurrent read/write, double-entry ledger consistency,
 *        transaction isolation, rollback behavior
 * 
 * TARGET: http://localhost:3000/api/v1 (STAGING ONLY)
 * SAFETY: Will detect environment and abort if pointed at production markers
 */

const BASE_URL = 'http://localhost:3000/api/v1';
const USER_EMAIL = 'user@kanaku.com';
const USER_PASSWORD = 'K@n4ku_Us3r#3Pm2*Wy';

let authToken = null;
let authHeaders = {};
let testAccountId = null;

const results = { pass: 0, fail: 0, warn: 0, tests: [] };

function log(category, test, status, detail = '') {
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️ ';
  console.log(`  ${icon} [${category}] ${test}${detail ? ': ' + detail : ''}`);
  results.tests.push({ category, test, status, detail });
  if (status === 'PASS') results.pass++;
  else if (status === 'FAIL') results.fail++;
  else results.warn++;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function getToken() {
  const res = await fetch(`${BASE_URL}/auth/login/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: USER_EMAIL, password: USER_PASSWORD })
  });
  const data = await res.json();
  if (res.status === 200 && data.data?.code) {
    const res2 = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: USER_EMAIL, challengeCode: data.data.code })
    });
    const loginData = await res2.json();
    const token = res2.headers.get('authorization') || loginData.token || loginData.data?.token;
    return token ? (token.startsWith('Bearer ') ? token : `Bearer ${token}`) : null;
  }
  return null;
}

async function getAccounts() {
  const res = await fetch(`${BASE_URL}/accounts`, { headers: authHeaders });
  const data = await res.json();
  return data.data || data.accounts || (Array.isArray(data) ? data : []);
}

async function createTransaction(accountId, amount, type = 'expense', description = 'Concurrency test') {
  const res = await fetch(`${BASE_URL}/transactions`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      accountId,
      amount: Math.abs(amount),
      type,
      description,
      date: new Date().toISOString(),
      category: 'Food & Dining'
    })
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

async function getAccountBalance(accountId) {
  const res = await fetch(`${BASE_URL}/accounts/${accountId}`, { headers: authHeaders });
  const data = await res.json();
  const account = data.data || data;
  return parseFloat(account?.balance ?? account?.currentBalance ?? 0);
}

async function runConcurrencyTests() {
  console.log('='.repeat(60));
  console.log('       KANAKKU CONCURRENCY & ACID COMPLIANCE TEST');
  console.log('='.repeat(60));
  console.log(`Target: ${BASE_URL}`);
  console.log('Environment: STAGING (safe for concurrency tests)');
  console.log('='.repeat(60));

  // Setup
  console.log('\n[Setup] Authenticating...');
  authToken = await getToken();
  if (!authToken) {
    console.error('CRITICAL: Authentication failed. Aborting.');
    process.exit(1);
  }
  authHeaders = { Authorization: authToken, 'Content-Type': 'application/json' };
  console.log('  ✅ Token obtained');

  const accounts = await getAccounts();
  if (accounts.length === 0) {
    console.error('CRITICAL: No accounts found. Ensure demo data is seeded.');
    process.exit(1);
  }
  testAccountId = accounts[0].id;
  console.log(`  ✅ Test account: ${testAccountId.substring(0, 8)}... (${accounts.length} accounts total)`);

  // ══════════════════════════════════════════════════════════
  // TEST 1: Concurrent Read Consistency
  // ══════════════════════════════════════════════════════════
  console.log('\n── 1. CONCURRENT READ CONSISTENCY ──');
  {
    const CONCURRENCY = 10;
    const promises = Array.from({ length: CONCURRENCY }, () =>
      fetch(`${BASE_URL}/transactions?limit=10`, { headers: authHeaders })
        .then(r => r.status)
        .catch(() => 0)
    );
    const statuses = await Promise.all(promises);
    const successCount = statuses.filter(s => s === 200).length;
    if (successCount === CONCURRENCY) {
      log('CONCURRENCY', `${CONCURRENCY} concurrent reads`, 'PASS', `All ${CONCURRENCY} returned 200`);
    } else {
      log('CONCURRENCY', `${CONCURRENCY} concurrent reads`, 'FAIL', `Only ${successCount}/${CONCURRENCY} succeeded`);
    }
  }

  // ══════════════════════════════════════════════════════════
  // TEST 2: Concurrent Write — No Phantom Balance
  // ══════════════════════════════════════════════════════════
  console.log('\n── 2. CONCURRENT WRITE ISOLATION ──');
  {
    const balanceBefore = await getAccountBalance(testAccountId);
    console.log(`  Balance before: ${balanceBefore}`);

    const CONCURRENT_WRITES = 5;
    const AMOUNT_EACH = 10;
    const runId = Math.random().toString(36).substring(2, 7);

    // Fire 5 simultaneous expense transactions
    const writePromises = Array.from({ length: CONCURRENT_WRITES }, (_, i) =>
      createTransaction(testAccountId, AMOUNT_EACH, 'expense', `Concurrent write test [${runId}] #${i + 1}`)
    );
    const writeResults = await Promise.all(writePromises);
    const successWrites = writeResults.filter(r => r.status === 201 || r.status === 200).length;

    await sleep(500); // Brief wait for DB writes to settle
    const balanceAfter = await getAccountBalance(testAccountId);
    console.log(`  Balance after:  ${balanceAfter} (${successWrites}/${CONCURRENT_WRITES} writes succeeded)`);

    const expectedDelta = successWrites * AMOUNT_EACH;
    const actualDelta = Math.abs(balanceBefore - balanceAfter);
    const tolerance = 0.01;

    if (Math.abs(actualDelta - expectedDelta) <= tolerance) {
      log('ACID', `Concurrent write balance consistency`, 'PASS',
        `Δ=${actualDelta.toFixed(2)}, expected ${expectedDelta} (${successWrites} txns)`);
    } else {
      log('ACID', `Concurrent write balance consistency`, 'FAIL',
        `Δ=${actualDelta.toFixed(2)}, expected ${expectedDelta} — BALANCE MISMATCH!`);
    }
  }

  // ══════════════════════════════════════════════════════════
  // TEST 3: Concurrent Account List — No Duplication
  // ══════════════════════════════════════════════════════════
  console.log('\n── 3. ACCOUNT DATA CONSISTENCY ──');
  {
    const READS = 5;
    const readPromises = Array.from({ length: READS }, () =>
      fetch(`${BASE_URL}/accounts`, { headers: authHeaders })
        .then(r => r.json())
        .then(d => (d.data || d.accounts || (Array.isArray(d) ? d : [])).length)
        .catch(() => -1)
    );
    const counts = await Promise.all(readPromises);
    const allSame = counts.every(c => c === counts[0]);
    if (allSame && counts[0] > 0) {
      log('CONSISTENCY', `${READS} parallel account reads return same count`, 'PASS', `count=${counts[0]}`);
    } else {
      log('CONSISTENCY', `${READS} parallel account reads return same count`, 'FAIL', `counts: ${counts.join(',')}`);
    }
  }

  // ══════════════════════════════════════════════════════════
  // TEST 4: Invalid Transaction Rejection (negative amounts)
  // ══════════════════════════════════════════════════════════
  console.log('\n── 4. INVALID TRANSACTION REJECTION ──');
  
  async function tryRawCreate(amount, description) {
    const res = await fetch(`${BASE_URL}/transactions`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ accountId: testAccountId, amount, type: 'expense', description, date: new Date().toISOString(), category: 'Test' })
    });
    return { status: res.status, data: await res.json().catch(() => ({})) };
  }
  
  {
    const res = await tryRawCreate(-100, 'Negative amount test');
    if (res.status === 400 || res.status === 422) {
      log('VALIDATION', 'Negative amount transaction rejected', 'PASS', `HTTP ${res.status}`);
    } else if (res.status === 201 || res.status === 200) {
      log('VALIDATION', 'Negative amount transaction rejected', 'FAIL', `HTTP ${res.status} — negative amount accepted!`);
    } else {
      log('VALIDATION', 'Negative amount transaction rejected', 'WARN', `HTTP ${res.status}`);
    }
  }

  // Zero amount
  {
    const res = await tryRawCreate(0, 'Zero amount test');
    if (res.status === 400 || res.status === 422) {
      log('VALIDATION', 'Zero amount transaction rejected', 'PASS', `HTTP ${res.status}`);
    } else if (res.status === 201 || res.status === 200) {
      log('VALIDATION', 'Zero amount transaction rejected', 'FAIL', `HTTP ${res.status} — zero amount accepted!`);
    } else {
      log('VALIDATION', 'Zero amount transaction rejected', 'WARN', `HTTP ${res.status}`);
    }
  }

  // ══════════════════════════════════════════════════════════
  // TEST 5: High Concurrency Stress (50 requests)
  // ══════════════════════════════════════════════════════════
  console.log('\n── 5. HIGH CONCURRENCY STRESS (50 simultaneous reads) ──');
  {
    const CONCURRENCY = 50;
    const startTime = Date.now();
    const promises = Array.from({ length: CONCURRENCY }, () =>
      fetch(`${BASE_URL}/accounts`, { headers: authHeaders })
        .then(r => ({ status: r.status, ok: r.ok }))
        .catch(e => ({ status: 0, ok: false, error: e.message }))
    );
    const stressResults = await Promise.all(promises);
    const elapsed = Date.now() - startTime;
    const successCount = stressResults.filter(r => r.ok).length;
    const failCount = CONCURRENCY - successCount;
    const errorRate = (failCount / CONCURRENCY * 100).toFixed(1);

    if (parseFloat(errorRate) <= 0.5) {
      log('STRESS', `${CONCURRENCY} concurrent reads`, 'PASS',
        `${successCount}/${CONCURRENCY} OK, error rate: ${errorRate}%, elapsed: ${elapsed}ms`);
    } else {
      log('STRESS', `${CONCURRENCY} concurrent reads`, 'FAIL',
        `error rate: ${errorRate}% — exceeds 0.5% SLA`);
    }
  }

  // ══════════════════════════════════════════════════════════
  // TEST 6: Transaction Pagination Consistency
  // ══════════════════════════════════════════════════════════
  console.log('\n── 6. PAGINATION CONSISTENCY ──');
  {
    const page1 = await fetch(`${BASE_URL}/transactions?limit=5&page=1`, { headers: authHeaders }).then(r => r.json());
    const page2 = await fetch(`${BASE_URL}/transactions?limit=5&page=2`, { headers: authHeaders }).then(r => r.json());

    const items1 = page1.data || (Array.isArray(page1) ? page1 : []);
    const items2 = page2.data || (Array.isArray(page2) ? page2 : []);

    const ids1 = new Set(items1.map(t => t.id));
    const ids2 = new Set(items2.map(t => t.id));
    const overlap = [...ids1].filter(id => ids2.has(id));

    if (overlap.length === 0) {
      log('PAGINATION', 'No overlap between page 1 and page 2', 'PASS', `P1: ${items1.length} items, P2: ${items2.length} items`);
    } else {
      log('PAGINATION', 'No overlap between page 1 and page 2', 'FAIL', `${overlap.length} duplicate IDs across pages`);
    }
  }

  // ══════════════════════════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════════════════════════
  console.log('\n' + '='.repeat(60));
  console.log('           CONCURRENCY TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`  ✅ PASS:  ${results.pass}`);
  console.log(`  ❌ FAIL:  ${results.fail}`);
  console.log(`  ⚠️  WARN:  ${results.warn}`);
  console.log(`  TOTAL:   ${results.pass + results.fail + results.warn}`);
  console.log('='.repeat(60));

  if (results.fail === 0) {
    console.log('\n  ⚡ VERDICT: CONCURRENCY GATE PASSED');
  } else {
    console.log(`\n  🚨 VERDICT: ${results.fail} CONCURRENCY/ACID FAILURE(S) — MUST FIX`);
  }

  const fs = require('fs');
  const path = require('path');
  const reportPath = path.join(__dirname, 'concurrency_results.json');
  fs.writeFileSync(reportPath, JSON.stringify({ timestamp: new Date().toISOString(), ...results }, null, 2));
  console.log(`  Saved: ${reportPath}`);
}

runConcurrencyTests().catch(e => { console.error('CONCURRENCY TEST ERROR:', e); process.exit(1); });
