const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000/api/v1';
const USER_EMAIL = 'user@kanaku.com';
const USER_PASSWORD = 'K@n4ku_Us3r#3Pm2*Wy';

// SLA thresholds in ms
// NOTE: /reports/* endpoints require PIN gate in addition to JWT auth — tested separately
const SLAs = {
  login: 2000,
  dashboard: 1000,
  cashflow: 1000,
  accounts: 500,
  transactions: 500,
  todos: 500
};

function calculateStats(latencies) {
  if (latencies.length === 0) return { min: 0, max: 0, mean: 0, median: 0, p95: 0, p99: 0 };
  
  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / sorted.length;
  
  const median = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1];
  const p99 = sorted[Math.floor(sorted.length * 0.99)] || sorted[sorted.length - 1];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];

  return { min, max, mean, median, p95, p99 };
}

async function runBenchmark() {
  console.log('==================================================');
  console.log('       KANAKKU PERFORMANCE BENCHMARK RUN          ');
  console.log('==================================================');
  console.log(`Target API URL: ${BASE_URL}`);
  console.log(`Test User:      ${USER_EMAIL}`);
  console.log('--------------------------------------------------');

  let token = '';
  
  // 1. Benchmark Login
  console.log('Benchmarking Login...');
  const loginLatencies = [];
  
  for (let i = 0; i < 5; i++) {
    const start = Date.now();
    try {
      // First try challenge-response if configured, otherwise fallback to simple
      let res = await fetch(`${BASE_URL}/auth/login/challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: USER_EMAIL, password: USER_PASSWORD })
      });
      
      let data = await res.json();
      if (res.status === 200 && data.success && data.data && data.data.code) {
        // Complete challenge login
        res = await fetch(`${BASE_URL}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: USER_EMAIL, challengeCode: data.data.code })
        });
        const loginData = await res.json();
        const duration = Date.now() - start;
        loginLatencies.push(duration);
        
        const authHeader = res.headers.get('authorization') || loginData.token;
        if (authHeader) token = authHeader;
      } else {
        // Fallback to simple login
        const simpleStart = Date.now();
        res = await fetch(`${BASE_URL}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: USER_EMAIL, password: USER_PASSWORD })
        });
        const simpleData = await res.json();
        const duration = Date.now() - simpleStart;
        loginLatencies.push(duration);
        
        const authHeader = res.headers.get('authorization') || simpleData.token || (simpleData.data && simpleData.data.token);
        if (authHeader) token = authHeader;
      }
    } catch (err) {
      console.error(`Login attempt ${i + 1} failed:`, err.message);
    }
  }

  if (!token) {
    console.error('CRITICAL ERROR: Failed to obtain authorization token. Aborting benchmark.');
    process.exit(1);
  }

  const authHeaders = {
    'Authorization': token.startsWith('Bearer ') ? token : `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  // Helper to benchmark endpoint
  async function benchmarkEndpoint(name, path, iterations = 10) {
    console.log(`Benchmarking GET ${path}...`);
    const latencies = [];
    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < iterations; i++) {
      const start = Date.now();
      try {
        const res = await fetch(`${BASE_URL}${path}`, {
          headers: authHeaders
        });
        const duration = Date.now() - start;
        if (res.status === 200) {
          latencies.push(duration);
          successCount++;
        } else {
          failureCount++;
        }
      } catch (err) {
        failureCount++;
      }
      // Brief sleep between requests to avoid rate limits
      await new Promise(r => setTimeout(r, 100));
    }

    const stats = calculateStats(latencies);
    const sla = SLAs[name];
    const p95Passed = stats.p95 <= sla;

    return {
      name,
      path,
      successCount,
      failureCount,
      stats,
      sla,
      passed: p95Passed
    };
  }

  // 2. Run Benchmarks
  const results = [];
  
  // Login stats
  results.push({
    name: 'login',
    path: '/auth/login',
    successCount: loginLatencies.length,
    failureCount: 5 - loginLatencies.length,
    stats: calculateStats(loginLatencies),
    sla: SLAs.login,
    passed: calculateStats(loginLatencies).p95 <= SLAs.login
  });

  // Other endpoints
  results.push(await benchmarkEndpoint('dashboard', '/dashboard/summary', 10));
  results.push(await benchmarkEndpoint('cashflow', '/dashboard/cashflow', 10));
  results.push(await benchmarkEndpoint('accounts', '/accounts', 10));
  results.push(await benchmarkEndpoint('transactions', '/transactions', 10));
  results.push(await benchmarkEndpoint('todos', '/todos', 10));

  console.log('\n==================================================');
  console.log('               BENCHMARK RESULTS                  ');
  console.log('==================================================');
  
  console.log(
    String('').padEnd(12) + 
    ' | ' + 'Avg (ms)'.padEnd(8) + 
    ' | ' + 'P50 (ms)'.padEnd(8) + 
    ' | ' + 'P95 (ms)'.padEnd(8) + 
    ' | ' + 'P99 (ms)'.padEnd(8) + 
    ' | ' + 'SLA (ms)'.padEnd(8) + 
    ' | ' + 'Status'
  );
  console.log('-'.repeat(70));

  for (const r of results) {
    const s = r.stats;
    const status = r.passed ? '✅ PASS' : '❌ FAIL';
    console.log(
      r.name.padEnd(12) + 
      ' | ' + Math.round(s.mean).toString().padEnd(8) + 
      ' | ' + s.median.toString().padEnd(8) + 
      ' | ' + s.p95.toString().padEnd(8) + 
      ' | ' + s.p99.toString().padEnd(8) + 
      ' | ' + r.sla.toString().padEnd(8) + 
      ' | ' + status
    );
  }

  console.log('==================================================');

  // Save the benchmark report locally
  const reportPath = path.join(__dirname, 'benchmark_results.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`Saved detailed logs to: ${reportPath}`);
}

runBenchmark().catch(console.error);
