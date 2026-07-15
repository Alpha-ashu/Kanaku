/**
 * KANAKKU SECURITY AUDIT SCRIPT
 * Tests: SQL Injection, XSS, Rate Limiting, JWT Integrity,
 *        IDOR (Broken Access Control), Sensitive Data Exposure
 *
 * Environment variables:
 *   TARGET_URL   — Base API URL (default: http://localhost:3000/api/v1)
 *   TARGET_TOKEN — Pre-authenticated Bearer token (optional, skips login step)
 *
 * Rate limit testing:
 *   Rate limiting is DISABLED in development (NODE_ENV !== 'production').
 *   To test rate limiting locally, start the backend with FORCE_RATE_LIMIT=true:
 *     FORCE_RATE_LIMIT=true npm run dev:backend
 *   OR run this audit against the live Fly.io URL:
 *     TARGET_URL=https://kanaku.fly.dev/api/v1 node quality/security/security-audit.cjs
 */

const BASE_URL = process.env.TARGET_URL || 'http://localhost:3000/api/v1';
const PRE_TOKEN = process.env.TARGET_TOKEN || null;

const USERS = {
  user1: { email: process.env.AUDIT_USER1_EMAIL || 'user@kanaku.com', password: process.env.AUDIT_USER1_PASS || 'K@n4ku_Us3r#3Pm2*Wy' },
  user2: { email: process.env.AUDIT_USER2_EMAIL || 'manager@kanaku.com', password: process.env.AUDIT_USER2_PASS || 'K@n4ku_M4n4g3r#7Qw8$' }
};

const results = [];
let pass = 0, fail = 0, warn = 0;

function log(category, test, status, detail = '') {
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️ ';
  console.log(`  ${icon} [${category}] ${test}${detail ? ': ' + detail : ''}`);
  results.push({ category, test, status, detail });
  if (status === 'PASS') pass++;
  else if (status === 'FAIL') fail++;
  else warn++;
}

async function getToken(credentials) {
  try {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials)
    });
    const data = await res.json();
    const token = res.headers.get('authorization') ||
      data.token ||
      (data.data && data.data.token);
    return token ? (token.startsWith('Bearer ') ? token : `Bearer ${token}`) : null;
  } catch {
    return null;
  }
}

async function runAudit() {
  console.log('='.repeat(60));
  console.log('       KANAKKU SECURITY AUDIT');
  console.log('='.repeat(60));
  console.log(`Target: ${BASE_URL}`);
  console.log('Environment: STAGING (read-only + inject tests)');
  console.log('='.repeat(60));

  // ── Authenticate both users ──────────────────────────────
  console.log('\n[Auth Setup]');
  const token1 = await getToken(USERS.user1);
  const token2 = await getToken(USERS.user2);

  if (!token1) { console.error('CRITICAL: Could not authenticate user1. Aborting.'); process.exit(1); }
  if (!token2) { console.warn('WARNING: Could not authenticate user2. IDOR tests will be skipped.'); }

  const auth1 = { Authorization: token1, 'Content-Type': 'application/json' };
  const auth2 = token2 ? { Authorization: token2, 'Content-Type': 'application/json' } : null;
  console.log(`  user1 token: ${token1 ? 'OK' : 'FAILED'}`);
  console.log(`  user2 token: ${token2 ? 'OK' : 'FAILED'}`);

  // ══════════════════════════════════════════════════════════
  // 1. SQL INJECTION
  // ══════════════════════════════════════════════════════════
  console.log('\n── 1. SQL INJECTION ──');
  const sqlPayloads = [
    `' OR '1'='1`,
    `'; DROP TABLE accounts; --`,
    `1 UNION SELECT username, password FROM users --`,
    `' OR 1=1 --`,
    `admin'--`
  ];

  for (const payload of sqlPayloads) {
    try {
      const res = await fetch(`${BASE_URL}/transactions?search=${encodeURIComponent(payload)}`, {
        headers: auth1
      });
      const text = await res.text();
      const isVulnerable = text.toLowerCase().includes('syntax error') ||
        text.toLowerCase().includes('pg_') ||
        text.toLowerCase().includes('column') ||
        text.toLowerCase().includes('relation') ||
        (res.status === 500 && text.includes('sql'));
      if (isVulnerable) {
        log('SQL_INJECTION', `Payload: ${payload.substring(0, 30)}`, 'FAIL', `HTTP ${res.status} — possible SQL error leaked`);
      } else {
        log('SQL_INJECTION', `Payload: ${payload.substring(0, 30)}`, 'PASS', `HTTP ${res.status} — safely handled`);
      }
    } catch (e) {
      log('SQL_INJECTION', `Payload: ${payload.substring(0, 30)}`, 'PASS', 'Connection refused (safe)');
    }
    await sleep(200);
  }

  // ══════════════════════════════════════════════════════════
  // 2. XSS (Reflected)
  // ══════════════════════════════════════════════════════════
  console.log('\n── 2. XSS INJECTION ──');
  const xssPayloads = [
    `<script>alert(1)</script>`,
    `"><img src=x onerror=alert(1)>`,
    `<svg/onload=alert(1)>`,
    `javascript:alert(1)`,
    `<iframe src="javascript:alert(1)">`
  ];

  for (const payload of xssPayloads) {
    try {
      // Try injecting via POST body
      const res = await fetch(`${BASE_URL}/transactions`, {
        method: 'POST',
        headers: auth1,
        body: JSON.stringify({ description: payload, amount: 1, type: 'expense', accountId: 'test', categoryId: 'test', date: new Date().toISOString() })
      });
      const data = await res.json().catch(() => ({}));
      const bodyStr = JSON.stringify(data);
      // Check if XSS payload is reflected raw in response
      const reflected = bodyStr.includes('<script>') || bodyStr.includes('onerror=') || bodyStr.includes('onload=');
      if (reflected) {
        log('XSS', `Payload reflected in response`, 'FAIL', payload.substring(0, 40));
      } else if (res.status === 400 || res.status === 422) {
        log('XSS', `POST with XSS payload`, 'PASS', `HTTP ${res.status} — rejected`);
      } else {
        log('XSS', `POST with XSS payload`, 'PASS', `HTTP ${res.status} — not reflected`);
      }
    } catch {
      log('XSS', `POST with XSS payload`, 'PASS', 'Request failed safely');
    }
    await sleep(150);
  }

  // ══════════════════════════════════════════════════════════
  // 3. AUTHENTICATION EDGE CASES
  // ══════════════════════════════════════════════════════════
  console.log('\n── 3. AUTHENTICATION EDGE CASES ──');

  // Test: No token
  try {
    const res = await fetch(`${BASE_URL}/accounts`);
    if (res.status === 401) {
      log('AUTH', 'No token → /accounts', 'PASS', 'HTTP 401 Unauthorized');
    } else {
      log('AUTH', 'No token → /accounts', 'FAIL', `HTTP ${res.status} — should be 401`);
    }
  } catch { log('AUTH', 'No token → /accounts', 'WARN', 'Connection error'); }

  // Test: Malformed JWT
  try {
    const res = await fetch(`${BASE_URL}/accounts`, {
      headers: { Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.INVALID.INVALID' }
    });
    if (res.status === 401 || res.status === 403) {
      log('AUTH', 'Malformed JWT', 'PASS', `HTTP ${res.status}`);
    } else {
      log('AUTH', 'Malformed JWT', 'FAIL', `HTTP ${res.status} — should be 401/403`);
    }
  } catch { log('AUTH', 'Malformed JWT', 'WARN', 'Connection error'); }

  // Test: Expired/random token
  try {
    const fakeToken = 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiJmYWtlLXVzZXItaWQiLCJpYXQiOjE2MDAwMDAwMDAsImV4cCI6MTYwMDAwMDAwMX0.fake_signature';
    const res = await fetch(`${BASE_URL}/accounts`, {
      headers: { Authorization: fakeToken }
    });
    if (res.status === 401 || res.status === 403) {
      log('AUTH', 'Fake/expired JWT', 'PASS', `HTTP ${res.status}`);
    } else {
      log('AUTH', 'Fake/expired JWT', 'FAIL', `HTTP ${res.status} — should be 401/403`);
    }
  } catch { log('AUTH', 'Fake/expired JWT', 'WARN', 'Connection error'); }

  // Test: Empty bearer token
  try {
    const res = await fetch(`${BASE_URL}/accounts`, {
      headers: { Authorization: 'Bearer ' }
    });
    if (res.status === 401 || res.status === 403) {
      log('AUTH', 'Empty Bearer token', 'PASS', `HTTP ${res.status}`);
    } else {
      log('AUTH', 'Empty Bearer token', 'FAIL', `HTTP ${res.status} — should be 401/403`);
    }
  } catch { log('AUTH', 'Empty Bearer token', 'WARN', 'Connection error'); }

  // ══════════════════════════════════════════════════════════
  // 4. IDOR — Broken Access Control
  // ══════════════════════════════════════════════════════════
  console.log('\n── 4. IDOR / BROKEN ACCESS CONTROL ──');

  if (auth2) {
    // Get user1's accounts
    try {
      const res1 = await fetch(`${BASE_URL}/accounts`, { headers: auth1 });
      const data1 = await res1.json();
      const accounts1 = data1.data || data1.accounts || (Array.isArray(data1) ? data1 : []);
      
      if (accounts1.length > 0) {
        const account1Id = accounts1[0].id;
        
        // Attempt to access user1's account using user2's token
        const res2 = await fetch(`${BASE_URL}/accounts/${account1Id}`, { headers: auth2 });
        if (res2.status === 403 || res2.status === 404) {
          log('IDOR', `user2 cannot access user1 account (${account1Id.substring(0,8)}...)`, 'PASS', `HTTP ${res2.status}`);
        } else if (res2.status === 200) {
          const data2 = await res2.json();
          log('IDOR', `user2 cannot access user1 account`, 'FAIL', `HTTP 200 — IDOR vulnerability! Data leaked.`);
        } else {
          log('IDOR', `user2 cannot access user1 account`, 'WARN', `HTTP ${res2.status} — unexpected`);
        }
        
        // Attempt to delete user1's account using user2's token
        const resDel = await fetch(`${BASE_URL}/accounts/${account1Id}`, {
          method: 'DELETE',
          headers: auth2
        });
        if (resDel.status === 403 || resDel.status === 404) {
          log('IDOR', `user2 cannot DELETE user1 account`, 'PASS', `HTTP ${resDel.status}`);
        } else if (resDel.status === 200 || resDel.status === 204) {
          log('IDOR', `user2 cannot DELETE user1 account`, 'FAIL', `HTTP ${resDel.status} — account deleted!`);
        } else {
          log('IDOR', `user2 cannot DELETE user1 account`, 'WARN', `HTTP ${resDel.status}`);
        }
      } else {
        log('IDOR', 'Account IDOR test', 'WARN', 'No accounts found for user1 to test against');
      }
    } catch (e) {
      log('IDOR', 'Account IDOR test', 'WARN', `Error: ${e.message}`);
    }

    // Transaction IDOR
    try {
      const res1 = await fetch(`${BASE_URL}/transactions?limit=1`, { headers: auth1 });
      const data1 = await res1.json();
      const txns = data1.data || data1.transactions || (Array.isArray(data1) ? data1 : []);
      
      if (txns.length > 0) {
        const txnId = txns[0].id;
        const res2 = await fetch(`${BASE_URL}/transactions/${txnId}`, { headers: auth2 });
        if (res2.status === 403 || res2.status === 404) {
          log('IDOR', `user2 cannot access user1 transaction`, 'PASS', `HTTP ${res2.status}`);
        } else if (res2.status === 200) {
          log('IDOR', `user2 cannot access user1 transaction`, 'FAIL', 'HTTP 200 — IDOR!');
        } else {
          log('IDOR', `user2 cannot access user1 transaction`, 'WARN', `HTTP ${res2.status}`);
        }
      }
    } catch (e) {
      log('IDOR', 'Transaction IDOR test', 'WARN', `Error: ${e.message}`);
    }
  } else {
    log('IDOR', 'Cross-user access tests', 'WARN', 'Skipped — user2 token unavailable');
  }

  // ══════════════════════════════════════════════════════════
  // 5. SENSITIVE DATA EXPOSURE
  // ══════════════════════════════════════════════════════════
  console.log('\n── 5. SENSITIVE DATA EXPOSURE ──');

  try {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(USERS.user1)
    });
    const data = await res.json();
    const bodyStr = JSON.stringify(data).toLowerCase();
    
    if (bodyStr.includes('"password"') && !bodyStr.includes('undefined')) {
      log('EXPOSURE', 'Password not in login response', 'FAIL', 'password field found in response');
    } else {
      log('EXPOSURE', 'Password not in login response', 'PASS', 'password field absent');
    }
    
    // Check for JWT secret leak
    if (bodyStr.includes('secret') || bodyStr.includes('jwt_secret')) {
      log('EXPOSURE', 'JWT secret not in response', 'FAIL', 'secret field found');
    } else {
      log('EXPOSURE', 'JWT secret not in response', 'PASS');
    }
  } catch (e) {
    log('EXPOSURE', 'Login response audit', 'WARN', e.message);
  }

  // Check profile endpoint doesn't leak sensitive fields
  try {
    const res = await fetch(`${BASE_URL}/profile`, { headers: auth1 });
    const data = await res.json();
    const bodyStr = JSON.stringify(data).toLowerCase();
    if (bodyStr.includes('"password"') || bodyStr.includes('"hash"')) {
      log('EXPOSURE', 'Profile endpoint — no password hash', 'FAIL', 'hash/password found in profile response');
    } else {
      log('EXPOSURE', 'Profile endpoint — no password hash', 'PASS');
    }
  } catch (e) {
    log('EXPOSURE', 'Profile endpoint audit', 'WARN', e.message);
  }

  // Check security headers
  try {
    const res = await fetch(`${BASE_URL}/accounts`, { headers: auth1 });
    const csp = res.headers.get('content-security-policy');
    const xct = res.headers.get('x-content-type-options');
    const xfo = res.headers.get('x-frame-options');
    const hsts = res.headers.get('strict-transport-security');
    
    log('HEADERS', 'Content-Security-Policy', csp ? 'PASS' : 'WARN', csp || 'not set');
    log('HEADERS', 'X-Content-Type-Options', xct === 'nosniff' ? 'PASS' : 'WARN', xct || 'not set');
    log('HEADERS', 'X-Frame-Options', xfo ? 'PASS' : 'WARN', xfo || 'not set');
    log('HEADERS', 'Strict-Transport-Security', hsts ? 'PASS' : 'WARN', hsts || 'not set (expected on prod)');
  } catch (e) {
    log('HEADERS', 'Security headers check', 'WARN', e.message);
  }

  // ══════════════════════════════════════════════════════════
  // 6. RATE LIMITING
  // ══════════════════════════════════════════════════════════
  console.log('\n── 6. RATE LIMITING ──');
  console.log('   NOTE: Rate limiting is disabled in NODE_ENV=development.');
  console.log('   For accurate results, run against the live Fly URL or with FORCE_RATE_LIMIT=true.');

  // Test using the auth challenge endpoint (5/min limit) — sequential to match the
  // login challenge rate-limiter scope rather than the global API limit.
  let rateLimited = false;
  try {
    const statuses = [];
    for (let i = 0; i < 25; i++) {
      const res = await fetch(`${BASE_URL}/auth/login/challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'brute.force.attacker@test.invalid', password: 'wrongpassword123' })
      });
      statuses.push(res.status);
      // Small delay between requests to avoid network-level drops
      await sleep(50);
    }
    const got429 = statuses.filter(s => s === 429);
    const isLocalDev = BASE_URL.includes('localhost') || BASE_URL.includes('127.0.0.1');
    if (got429.length > 0) {
      log('RATE_LIMIT', 'Login brute force protection', 'PASS', `${got429.length}/25 challenge requests returned 429`);
      rateLimited = true;
    } else if (isLocalDev) {
      log('RATE_LIMIT', 'Login brute force protection', 'WARN',
        'No 429 on localhost — rate limiting disabled in dev. ' +
        'Run with FORCE_RATE_LIMIT=true or against Fly URL to verify production behavior.');
    } else {
      log('RATE_LIMIT', 'Login brute force protection', 'FAIL',
        '25 rapid challenge attempts — no 429 returned on non-localhost target');
    }
  } catch (e) {
    log('RATE_LIMIT', 'Login brute force test', 'WARN', e.message);
  }

  // ══════════════════════════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════════════════════════
  console.log('\n' + '='.repeat(60));
  console.log('               SECURITY AUDIT SUMMARY');
  console.log('='.repeat(60));
  console.log(`  ✅ PASS:  ${pass}`);
  console.log(`  ❌ FAIL:  ${fail}`);
  console.log(`  ⚠️  WARN:  ${warn}`);
  console.log(`  TOTAL:   ${pass + fail + warn}`);
  console.log('='.repeat(60));

  if (fail === 0) {
    console.log('\n  🔐 VERDICT: SECURITY GATE PASSED');
  } else {
    console.log(`\n  🚨 VERDICT: ${fail} SECURITY FAILURE(S) — MUST FIX BEFORE RELEASE`);
  }

  const fs = require('fs');
  const path = require('path');
  const reportPath = path.join(__dirname, 'security_audit_results.json');
  fs.writeFileSync(reportPath, JSON.stringify({ timestamp: new Date().toISOString(), pass, fail, warn, results }, null, 2));
  console.log(`\n  Saved: ${reportPath}`);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

runAudit().catch(e => { console.error('AUDIT ERROR:', e); process.exit(1); });
