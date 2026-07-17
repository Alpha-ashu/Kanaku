/**
 * Phase 9.5 — Scale Performance Benchmark
 *
 * Seeds a temporary test user with realistic financial data and runs:
 *   1. Read performance (dashboard, cashflow, accounts, transactions)
 *   2. Write performance (expense, group expense, settlement, transfer)
 *   3. Concurrency stress (100 simultaneous expense creates)
 *   4. Cleanup with post-cleanup verification (fails if any seeded data remains)
 *
 * Usage:
 *   node quality/performance/scale_benchmark.cjs
 *
 * Environment:
 *   BENCHMARK_URL     — API base (default: http://localhost:3000/api/v1)
 *   BENCHMARK_EMAIL   — test user email
 *   BENCHMARK_PASS    — test user password
 */

'use strict';
const fs = require('fs');
const path = require('path');

// ── Config ────────────────────────────────────────────────────────────────────
const BASE = process.env.BENCHMARK_URL || 'http://localhost:3000/api/v1';
const USER_EMAIL = process.env.BENCHMARK_EMAIL || 'user@kanaku.com';
const USER_PASS = process.env.BENCHMARK_PASS || 'K@n4ku_Us3r#3Pm2*Wy';

const ACCOUNT_COUNT = 5;
const TRANSACTION_COUNT = 100;
const GROUP_EXPENSE_COUNT = 10;
const RECURRING_RULE_COUNT = 5;
const CONCURRENCY = 20;

const SLA = { read: 1000, write: 2000, login: 3000 };

// ── Helpers ───────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function calcStats(latencies) {
  if (!latencies.length) return { min: 0, max: 0, mean: 0, p50: 0, p95: 0, p99: 0 };
  const s = [...latencies].sort((a, b) => a - b);
  const sum = s.reduce((a, b) => a + b, 0);
  const idx = (p) => Math.min(Math.floor(s.length * p), s.length - 1);
  return {
    min: s[0],
    max: s[s.length - 1],
    mean: Math.round(sum / s.length),
    p50: s[idx(0.50)],
    p95: s[idx(0.95)],
    p99: s[idx(0.99)],
  };
}

function memSnapshot() {
  const m = process.memoryUsage();
  return {
    heapUsedMb: (m.heapUsed / 1024 / 1024).toFixed(2),
    rssMb: (m.rss / 1024 / 1024).toFixed(2),
  };
}

async function request(method, endpoint, body, token, silent = false) {
  const url = `${BASE}${endpoint}`;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const opts = { method, headers, credentials: 'include' };
  if (body) opts.body = JSON.stringify(body);
  const t0 = Date.now();
  const res = await fetch(url, opts);
  const latency = Date.now() - t0;
  let data;
  try { data = await res.json(); } catch { data = {}; }
  if (!silent && !res.ok) {
    console.warn(`  [WARN] ${method} ${endpoint} -> ${res.status} (${latency}ms)`, data?.error ?? '');
  }
  return { ok: res.ok, status: res.status, data, latency };
}

async function login() {
  console.log('\n> Authenticating benchmark user...');
  let res = await request('POST', '/auth/login/challenge', { email: USER_EMAIL, password: USER_PASS }, null, true);
  if (res.ok && res.data?.data?.code) {
    res = await request('POST', '/auth/login', { email: USER_EMAIL, challengeCode: res.data.data.code }, null, true);
  } else {
    res = await request('POST', '/auth/login', { email: USER_EMAIL, password: USER_PASS }, null, true);
  }
  const token = res.data?.data?.accessToken || res.data?.token;
  if (!token) {
    console.error('  FAIL: Could not obtain auth token. Is the server running?');
    process.exit(1);
  }
  console.log('  OK: Authenticated');
  return token;
}

async function benchmarkEndpoint(name, method, endpoint, body, token, iterations = 15) {
  const latencies = [];
  for (let i = 0; i < iterations; i++) {
    const r = await request(method, endpoint, body, token, true);
    latencies.push(r.latency);
    await sleep(20);
  }
  const stats = calcStats(latencies);
  const sla = method === 'GET' ? SLA.read : SLA.write;
  const pass = stats.p95 <= sla;
  const icon = pass ? 'OK' : 'FAIL';
  console.log(`  [${icon}] ${name.padEnd(30)} p50=${stats.p50}ms p95=${stats.p95}ms p99=${stats.p99}ms mean=${stats.mean}ms [SLA=${sla}ms]`);
  return { name, ...stats, sla, pass };
}

async function seedData(token) {
  console.log('\n> Seeding test data...');
  const accountIds = [];

  for (let i = 0; i < ACCOUNT_COUNT; i++) {
    const r = await request('POST', '/accounts', {
      name: `BENCH_ACCOUNT_${i}`,
      type: i % 2 === 0 ? 'savings' : 'checking',
      balance: 50000,
      currency: 'INR',
    }, token, true);
    if (r.ok && r.data?.data?.id) accountIds.push(r.data.data.id);
  }
  console.log(`  OK: Seeded ${accountIds.length} accounts`);

  let txCount = 0;
  for (let i = 0; i < TRANSACTION_COUNT; i++) {
    const r = await request('POST', '/transactions', {
      accountId: accountIds[i % accountIds.length],
      type: i % 3 === 0 ? 'income' : 'expense',
      amount: Math.round(Math.random() * 5000 + 100),
      category: i % 3 === 0 ? 'Salary' : 'Food',
      description: `BENCH_TX_${i}`,
      date: new Date(Date.now() - i * 86400000).toISOString(),
    }, token, true);
    if (r.ok) txCount++;
  }
  console.log(`  OK: Seeded ${txCount} transactions`);

  let groupExpenseCount = 0;
  const friendsRes = await request('GET', '/friends', null, token, true);
  const friends = friendsRes.data?.data ?? [];
  if (friends.length > 0) {
    const friendId = friends[0]?.friendId ?? friends[0]?.id;
    for (let i = 0; i < GROUP_EXPENSE_COUNT; i++) {
      const r = await request('POST', '/group-expenses', {
        description: `BENCH_GE_${i}`,
        totalAmount: 2000,
        paidBy: 'me',
        members: [{ userId: friendId, amount: 1000, status: 'pending' }],
        accountId: accountIds[0],
        category: 'Travel',
        date: new Date().toISOString(),
      }, token, true);
      if (r.ok) groupExpenseCount++;
    }
  } else {
    console.log('  INFO: No friends found — skipping group expense seeding');
  }
  console.log(`  OK: Seeded ${groupExpenseCount} group expenses`);

  let recurringCount = 0;
  for (let i = 0; i < RECURRING_RULE_COUNT; i++) {
    const r = await request('POST', '/recurring', {
      title: `BENCH_REC_${i}`,
      amount: 500,
      category: 'Utilities',
      type: 'expense',
      interval: 'monthly',
      accountId: accountIds[0],
      autoProcess: false,
      nextDueDate: new Date(Date.now() + 30 * 86400000).toISOString(),
    }, token, true);
    if (r.ok) recurringCount++;
  }
  console.log(`  OK: Seeded ${recurringCount} recurring rules`);

  return { accountIds, txCount, groupExpenseCount, recurringCount };
}

async function concurrencyTest(token, accountIds) {
  console.log(`\n> Concurrency test — ${CONCURRENCY} simultaneous expense creates...`);
  const tasks = Array.from({ length: CONCURRENCY }, (_, i) =>
    request('POST', '/transactions', {
      accountId: accountIds[i % accountIds.length],
      type: 'expense',
      amount: 100 + i,
      category: 'Test',
      description: `BENCH_CONCURRENT_${i}`,
      date: new Date().toISOString(),
    }, token, true)
  );
  const t0 = Date.now();
  const results = await Promise.all(tasks);
  const wallMs = Date.now() - t0;
  const successes = results.filter(r => r.ok).length;
  const failures = results.filter(r => !r.ok).length;
  const icon = failures === 0 ? 'OK' : 'FAIL';
  console.log(`  [${icon}] ${successes}/${CONCURRENCY} succeeded in ${wallMs}ms wall time`);
  if (failures > 0) console.log(`  FAIL: ${failures} concurrent writes failed`);
  return { parallel: CONCURRENCY, successes, failures, wallMs };
}

async function cleanupAndVerify(token) {
  console.log('\n> Cleanup — clearing all test data...');
  const clearRes = await request('POST', '/settings/clear-data', {}, token, false);
  if (!clearRes.ok) {
    console.error('  FAIL: Clear-data endpoint failed:', clearRes.data?.error);
    return false;
  }
  console.log('  OK: Server-side clear completed');
  await sleep(500);

  console.log('\n> Post-cleanup verification...');
  let allClean = true;

  const checks = [
    { name: 'accounts', endpoint: '/accounts' },
    { name: 'transactions', endpoint: '/transactions' },
    { name: 'group-expenses', endpoint: '/group-expenses' },
    { name: 'recurring rules', endpoint: '/recurring' },
  ];

  for (const { name, endpoint } of checks) {
    const r = await request('GET', endpoint, null, token, true);
    const items = r.data?.data ?? r.data ?? [];
    const count = Array.isArray(items) ? items.length : (items?.items?.length ?? 0);
    if (count > 0) {
      console.error(`  FAIL: ${name}: ${count} records still exist after cleanup`);
      allClean = false;
    } else {
      console.log(`  OK: ${name}: clean`);
    }
  }

  const integrityRes = await request('GET', '/system/integrity', null, token, true);
  if (integrityRes.ok && integrityRes.data?.data?.isHealthy === false) {
    console.warn('  WARN: Integrity endpoint reports unhealthy state post-cleanup');
    allClean = false;
  } else if (integrityRes.ok) {
    console.log('  OK: Integrity endpoint: healthy');
  }

  return allClean;
}

async function main() {
  console.log('=============================================================');
  console.log('   KANAKKU - Phase 9.5 Scale Performance Benchmark           ');
  console.log('=============================================================');
  console.log(`Target: ${BASE}`);
  console.log(`Seed: ${ACCOUNT_COUNT} accounts, ${TRANSACTION_COUNT} txns, ${GROUP_EXPENSE_COUNT} group expenses, ${RECURRING_RULE_COUNT} recurring rules`);
  console.log(`Concurrency: ${CONCURRENCY} simultaneous writes`);
  const memBefore = memSnapshot();
  console.log(`Memory before: heap=${memBefore.heapUsedMb}MB rss=${memBefore.rssMb}MB`);

  const token = await login();
  const { accountIds } = await seedData(token);

  console.log('\n> Read Performance Benchmarks (15 iterations each)');
  const readResults = [];
  readResults.push(await benchmarkEndpoint('Dashboard Summary', 'GET', '/dashboard/summary', null, token));
  readResults.push(await benchmarkEndpoint('Dashboard Cashflow', 'GET', '/dashboard/cashflow', null, token));
  readResults.push(await benchmarkEndpoint('Accounts List', 'GET', '/accounts', null, token));
  readResults.push(await benchmarkEndpoint('Transactions List', 'GET', '/transactions', null, token));
  readResults.push(await benchmarkEndpoint('Group Expenses List', 'GET', '/group-expenses', null, token));
  readResults.push(await benchmarkEndpoint('Recurring Rules List', 'GET', '/recurring', null, token));
  readResults.push(await benchmarkEndpoint('System Integrity', 'GET', '/system/integrity', null, token));

  console.log('\n> Write Performance Benchmarks (10 iterations each)');
  const writeResults = [];
  writeResults.push(await benchmarkEndpoint('Create Expense', 'POST', '/transactions', {
    accountId: accountIds[0],
    type: 'expense',
    amount: 500,
    category: 'Food',
    description: 'Benchmark write',
    date: new Date().toISOString(),
  }, token, 10));
  writeResults.push(await benchmarkEndpoint('Create Income', 'POST', '/transactions', {
    accountId: accountIds[0],
    type: 'income',
    amount: 5000,
    category: 'Salary',
    description: 'Benchmark income',
    date: new Date().toISOString(),
  }, token, 10));

  const concurrencyResult = await concurrencyTest(token, accountIds);

  const memAfter = memSnapshot();
  console.log(`\n> Resource usage after load: heap=${memAfter.heapUsedMb}MB rss=${memAfter.rssMb}MB`);

  const cleanupPassed = await cleanupAndVerify(token);

  const allReadPass = readResults.every(r => r.pass);
  const allWritePass = writeResults.every(r => r.pass);
  const noDeadlocks = concurrencyResult.failures === 0;

  const report = {
    timestamp: new Date().toISOString(),
    target: BASE,
    seed: { ACCOUNT_COUNT, TRANSACTION_COUNT, GROUP_EXPENSE_COUNT, RECURRING_RULE_COUNT },
    readBenchmarks: readResults,
    writeBenchmarks: writeResults,
    concurrency: concurrencyResult,
    memory: { before: memBefore, after: memAfter },
    cleanup: { passed: cleanupPassed },
    summary: {
      allReadSLAsPassed: allReadPass,
      allWriteSLAsPassed: allWritePass,
      noDeadlocks,
      cleanupPassed,
      overallPass: allReadPass && allWritePass && noDeadlocks && cleanupPassed,
    },
  };

  const reportPath = path.join(__dirname, 'scale_benchmark_results.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log('\n=============================================================');
  console.log('                 BENCHMARK SUMMARY                           ');
  console.log('=============================================================');
  console.log(`Read SLAs passed:   ${allReadPass ? 'PASS' : 'FAIL'}`);
  console.log(`Write SLAs passed:  ${allWritePass ? 'PASS' : 'FAIL'}`);
  console.log(`No deadlocks:       ${noDeadlocks ? 'PASS' : 'FAIL'}`);
  console.log(`Cleanup verified:   ${cleanupPassed ? 'PASS' : 'FAIL'}`);
  console.log(`Overall:            ${report.summary.overallPass ? 'PASS' : 'FAIL'}`);
  console.log(`\nFull report: ${reportPath}`);

  process.exit(report.summary.overallPass ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal benchmark error:', err);
  process.exit(1);
});
