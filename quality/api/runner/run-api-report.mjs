#!/usr/bin/env node
/**
 * API Test Framework — fires every documented endpoint against a running backend,
 * captures the ACTUAL response, optionally compares it to the database, and writes
 * a stakeholder-friendly Excel report:
 *
 *   Feature | API Endpoint | Method | Auth | API Request | API Response Actual |
 *   HTTP Status | Result | API Count | DB Count | Match | Latency(ms) | Notes
 *
 * Re-runnable:  npm run qa:api-report
 *
 * Config (env vars):
 *   API_BASE_URL          backend root            (default http://localhost:3000)
 *   API_PREFIX            api prefix              (default /api/v1)
 *   QA_EMAIL / QA_PASSWORD  use an existing login (default: register a fresh user)
 *   QA_INCLUDE_DESTRUCTIVE  also fire DELETE endpoints   (default false)
 *   QA_ALLOW_REMOTE_WRITES  permit writes against a non-localhost host (default false)
 *   QA_ONLY               only run features whose name includes this substring
 *   QA_MAX                cap the number of endpoints (smoke run)
 *   DATABASE_URL          if set, enables DB record-count comparison (via Prisma)
 *
 * Source of endpoints: docs/api/contracts/api-index.json + the per-endpoint
 * contract JSON (shown verbatim in the "API Request" column). Request bodies are
 * enriched from the OpenAPI spec examples (backend/src/docs/api-docs.ts) when present.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..', '..');
const BACKEND = path.join(ROOT, 'backend');

const BASE = (process.env.API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const PREFIX = process.env.API_PREFIX || '/api/v1';
const IS_LOCAL = /localhost|127\.0\.0\.1/.test(BASE);
const INCLUDE_DESTRUCTIVE = process.env.QA_INCLUDE_DESTRUCTIVE === 'true' || process.env.QA_INCLUDE_DESTRUCTIVE === '1';
const ALLOW_REMOTE_WRITES = process.env.QA_ALLOW_REMOTE_WRITES === 'true' || process.env.QA_ALLOW_REMOTE_WRITES === '1';
const ONLY = process.env.QA_ONLY || '';
const MAX = process.env.QA_MAX ? Number(process.env.QA_MAX) : Infinity;
// Read-only run: fire GETs only, skip seeding — capture responses with zero DB
// writes (e.g. to safely run as a real/demo account without polluting its data).
const READONLY = process.env.QA_READONLY === '1' || process.env.QA_READONLY === 'true';
const REQUEST_TIMEOUT_MS = 15000;

const sha256Hex = (v) => createHash('sha256').update(v, 'utf8').digest('hex');
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, ''));
const stripV1 = (p) => p.replace(/^\/api\/v1/, '');
const norm = (p) => p.replace(/[:{][^/}]+}?/g, '{}'); // /accounts/:id → /accounts/{}

// Endpoints that would break the test session (kill our token / delete our user) — never auto-fire.
const SESSION_BREAKERS = new Set([
  'POST /api/v1/auth/logout',
  'DELETE /api/v1/auth/account',
  'DELETE /api/v1/settings/account',
  'POST /api/v1/auth/refresh', // rotates/ô invalidates current refresh cookie in some flows; run manually
]);

// Feature → Prisma client model accessor, for the API-vs-DB record count comparison.
const FEATURE_MODEL = {
  accounts: 'account', transactions: 'transaction', goals: 'goal', loans: 'loan',
  investments: 'investment', todos: 'todo', notifications: 'notification', friends: 'friend',
  devices: 'device', bills: 'expenseBill', aa: 'aaConsent', sessions: 'advisorSession',
  bookings: 'bookingRequest', payments: 'payment', groups: 'groupExpense',
  collaborations: 'collaborationParticipant',
};

function log(...a) { console.log(...a); }

// ─── OpenAPI spec (for request examples) ─────────────────────────────────────
function loadSpecExamples() {
  const specPath = path.join(ROOT, 'scratch', 'openapi.json');
  try {
    fs.mkdirSync(path.dirname(specPath), { recursive: true });
    execSync('npx ts-node --transpile-only scripts/dump-openapi.ts', { cwd: BACKEND, stdio: 'ignore' });
    const doc = readJson(specPath);
    const map = {};
    for (const [p, methods] of Object.entries(doc.paths || {})) {
      for (const [m, op] of Object.entries(methods)) {
        const media = op?.requestBody?.content?.['application/json'];
        const ex = media?.example ?? media?.schema?.example;
        if (ex !== undefined) map[`${m.toUpperCase()} ${norm(p)}`] = ex;
      }
    }
    return map;
  } catch (e) {
    log('⚠ Could not load OpenAPI examples (continuing without):', e.message);
    return {};
  }
}

// ─── HTTP ────────────────────────────────────────────────────────────────────
async function http(method, urlPath, { token, body } = {}) {
  const url = `${BASE}${PREFIX}${urlPath.startsWith('/') ? urlPath : '/' + urlPath}`;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined && method !== 'GET' && method !== 'DELETE' ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const latency = Date.now() - started;
    let parsed;
    const text = await res.text();
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    return { ok: true, status: res.status, body: parsed, latency };
  } catch (e) {
    return { ok: false, status: 0, body: { error: e.name === 'AbortError' ? 'timeout' : e.message }, latency: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Auth + seed ───────────────────────────────────────────────────────────--
async function authenticate() {
  const email = process.env.QA_EMAIL;
  const password = process.env.QA_PASSWORD;
  if (email && password) {
    log(`• Logging in as provided QA_EMAIL ${email}`);
    return loginFlow(email, password);
  }
  // Register a fresh, unique user so the run is repeatable and isolated.
  const suffix = `${Date.now().toString(36)}${randomUUID().slice(0, 6)}`;
  const fresh = { name: `QA Runner ${suffix}`, email: `qa.runner+${suffix}@kanaku.test`, password: `QaRun!${suffix}A9` };
  log(`• Registering fresh QA user ${fresh.email}`);
  const reg = await http('POST', '/auth/register', { body: fresh });
  if (reg.status !== 201 && reg.status !== 200) {
    log(`  register returned ${reg.status} — attempting login anyway`);
  }
  const tokens = await loginFlow(fresh.email, fresh.password);
  return { ...tokens, creds: fresh };
}

async function loginFlow(email, password) {
  const challenge = await http('POST', '/auth/login/challenge', { body: { email, password: sha256Hex(password) } });
  // The frontend sends x-pw-encoding: sha256; our http() helper can't set it, so retry with plain on failure.
  let code = challenge.body?.data?.code;
  if (!code) {
    const plain = await http('POST', '/auth/login/challenge', { body: { email, password } });
    code = plain.body?.data?.code;
  }
  if (!code) return { token: null, userId: null, loginError: challenge.body };
  const login = await http('POST', '/auth/login', { body: { email, challengeCode: code } });
  const d = login.body?.data || {};
  return { token: d.accessToken || null, userId: d.user?.id || null };
}

async function seed(token) {
  const reg = {};
  if (!token) return reg;
  const acct = await http('POST', '/accounts', { token, body: { name: 'QA Account', type: 'bank', balance: 1000, currency: 'INR' } });
  reg.accountId = acct.body?.data?.id;
  const goal = await http('POST', '/goals', { token, body: { name: 'QA Goal', targetAmount: 10000, currentAmount: 0, deadline: '2027-01-01' } });
  reg.goalId = goal.body?.data?.id;
  if (reg.accountId) {
    const tx = await http('POST', '/transactions', { token, body: { type: 'expense', amount: 100, account_id: reg.accountId, category: 'Food', description: 'QA tx', date: new Date().toISOString() } });
    reg.transactionId = tx.body?.data?.id;
  }
  return reg;
}

function substituteParams(endpoint, feature, reg, userId) {
  return endpoint.replace(/[:{]([A-Za-z0-9_]+)}?/g, (_, name) => {
    if (reg[name]) return reg[name];
    if (/^id$/i.test(name) && reg[`${feature.replace(/s$/, '')}Id`]) return reg[`${feature.replace(/s$/, '')}Id`];
    if (/^id$/i.test(name) && reg.accountId) return reg.accountId;
    if (/user/i.test(name) && userId) return userId;
    return randomUUID(); // unknown → placeholder (expect 404; recorded as actual)
  });
}

// ─── DB comparison ─────────────────────────────────────────────────────────--
async function makePrisma() {
  if (!process.env.DATABASE_URL) return null;
  try {
    const mod = await import(pathToFileURL(path.join(BACKEND, 'generated', 'prisma', 'index.js')).href);
    const PrismaClient = mod.PrismaClient || mod.default?.PrismaClient;
    const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    await prisma.$connect();
    return prisma;
  } catch (e) {
    log('⚠ DB comparison disabled (Prisma connect failed):', e.message);
    return null;
  }
}

async function dbCount(prisma, feature, userId) {
  if (!prisma) return null;
  const model = FEATURE_MODEL[feature];
  if (!model || !prisma[model]) return null;
  try {
    // Filter by the test user when the model has a userId column; else count all.
    try { return await prisma[model].count({ where: { userId } }); }
    catch { return await prisma[model].count(); }
  } catch { return null; }
}

// ─── classify ─────────────────────────────────────────────────────────────--
function classify(status) {
  if (status === 0) return 'NO CONN';
  if (status >= 200 && status < 300) return 'PASS';
  if (status === 401 || status === 403) return 'AUTH';
  if (status === 404) return 'NOT FOUND';
  if (status === 422 || status === 400) return 'VALIDATION';
  if (status === 429) return 'RATE LIMIT';
  if (status >= 500) return 'SERVER ERR';
  return `HTTP ${status}`;
}

// ─── main ─────────────────────────────────────────────────────────────────--
async function main() {
  log(`\n=== Kanaku API Report Runner ===`);
  log(`Base: ${BASE}${PREFIX}  | local: ${IS_LOCAL} | destructive: ${INCLUDE_DESTRUCTIVE}\n`);

  if (!IS_LOCAL && !ALLOW_REMOTE_WRITES) {
    log('⚠ Non-local target: write/delete endpoints will be SKIPPED (set QA_ALLOW_REMOTE_WRITES=1 to override).');
  }

  const index = readJson(path.join(ROOT, 'docs', 'api', 'contracts', 'api-index.json'));
  const examples = loadSpecExamples();
  const prisma = await makePrisma();

  // Auth + seed
  const auth = await authenticate();
  if (!auth.token) log('⚠ Could not obtain an access token — protected endpoints will return 401 (recorded as actual).');
  else log(`✓ Authenticated (userId: ${auth.userId || 'unknown'})`);
  const reg = READONLY ? {} : await seed(auth.token);
  log(READONLY ? '• Read-only run: skipped seeding; only GET endpoints will be fired.\n'
              : `✓ Seeded resources: ${Object.entries(reg).filter(([, v]) => v).map(([k]) => k).join(', ') || 'none'}\n`);

  // Flatten endpoints
  let endpoints = [];
  for (const [feature, list] of Object.entries(index.features || {})) {
    if (ONLY && !feature.includes(ONLY)) continue;
    for (const ep of list) endpoints.push({ feature, ...ep });
  }
  if (Number.isFinite(MAX)) endpoints = endpoints.slice(0, MAX);

  const rows = [];
  let n = 0;
  for (const ep of endpoints) {
    n++;
    const method = ep.method.toUpperCase();
    const key = `${method} ${norm(ep.endpoint)}`;
    const isWrite = method !== 'GET';
    const isDelete = method === 'DELETE';

    // Load the contract JSON (shown verbatim in the report's "API Request" column).
    let contract = {};
    try { contract = readJson(path.join(ROOT, ep.file)); } catch { /* ignore */ }

    let result, status, respBody, latency = '', apiCount = '', dbC = '', match = '', note = '';

    if (SESSION_BREAKERS.has(`${method} ${ep.endpoint.replace(/:[^/]+/g, (m) => `{${m.slice(1)}}`)}`) ||
        SESSION_BREAKERS.has(`${method} ${ep.endpoint}`)) {
      result = 'SKIP'; status = ''; respBody = { skipped: 'session-breaking endpoint (run manually)' };
    } else if (READONLY && isWrite) {
      result = 'SKIP'; status = ''; respBody = { skipped: 'read-only run (QA_READONLY=1)' };
    } else if (isDelete && !INCLUDE_DESTRUCTIVE) {
      result = 'SKIP'; status = ''; respBody = { skipped: 'DELETE skipped (set QA_INCLUDE_DESTRUCTIVE=1)' };
    } else if (isWrite && !IS_LOCAL && !ALLOW_REMOTE_WRITES) {
      result = 'SKIP'; status = ''; respBody = { skipped: 'write skipped on non-local host' };
    } else {
      const reqPath = stripV1(substituteParams(ep.endpoint, ep.feature, reg, auth.userId));
      const body = isWrite ? (examples[key] ?? contract?.request?.body ?? {}) : undefined;
      // Always send the token when we have one. The contract `auth` field is an
      // inaccurate auto-generated default (many "public" endpoints really need a
      // token); a bearer token is harmless on genuinely-public routes.
      const token = auth.token || null;
      const res = await http(method, reqPath, { token, body });
      status = res.status; respBody = res.body; latency = res.latency;
      result = classify(status);

      // API-vs-DB record-count comparison for list GETs (collection paths, no params).
      if (method === 'GET' && !/[:{]/.test(ep.endpoint) && Array.isArray(res.body?.data)) {
        apiCount = res.body.data.length;
        const c = await dbCount(prisma, ep.feature, auth.userId);
        if (c !== null) { dbC = c; match = String(apiCount) === String(c) ? 'YES' : 'NO'; }
      }
    }

    rows.push({
      feature: ep.feature,
      endpoint: ep.endpoint,
      method,
      auth: ep.auth || '',
      request: JSON.stringify(contract && Object.keys(contract).length ? contract : { endpoint: ep.endpoint, method }, null, 2),
      response: typeof respBody === 'string' ? respBody : JSON.stringify(respBody, null, 2),
      status: status === '' ? '' : String(status),
      result,
      apiCount: apiCount === '' ? '' : String(apiCount),
      dbCount: dbC === '' ? '' : String(dbC),
      match,
      latency: latency === '' ? '' : String(latency),
      note,
    });
    if (n % 20 === 0) log(`  …ran ${n}/${endpoints.length}`);
  }

  if (prisma) await prisma.$disconnect().catch(() => {});

  await writeWorkbook(rows, auth);
  log(`\n✓ Done. ${rows.length} endpoints exercised.`);
}

// ─── XLSX ─────────────────────────────────────────────────────────────────--
async function writeWorkbook(rows, auth) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Kanaku API Report Runner';
  wb.created = new Date();

  // Summary sheet
  const tally = rows.reduce((m, r) => ((m[r.result] = (m[r.result] || 0) + 1), m), {});
  const sum = wb.addWorksheet('Summary');
  sum.columns = [{ header: 'Metric', key: 'k', width: 32 }, { header: 'Value', key: 'v', width: 60 }];
  sum.getRow(1).font = { bold: true };
  const meta = [
    ['Generated', new Date().toISOString()],
    ['Base URL', `${BASE}${PREFIX}`],
    ['Authenticated user', auth.userId || (auth.creds?.email ?? 'n/a')],
    ['Total endpoints', rows.length],
    ...Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([k, v]) => [`Result: ${k}`, v]),
  ];
  meta.forEach(([k, v]) => sum.addRow({ k, v }));

  // Main report sheet (matches the requested layout)
  const ws = wb.addWorksheet('API Report', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'Feature', key: 'feature', width: 16 },
    { header: 'API Endpoint', key: 'endpoint', width: 38 },
    { header: 'Method', key: 'method', width: 9 },
    { header: 'Auth', key: 'auth', width: 10 },
    { header: 'API Request', key: 'request', width: 60 },
    { header: 'API Response Actual', key: 'response', width: 60 },
    { header: 'HTTP Status', key: 'status', width: 11 },
    { header: 'Result', key: 'result', width: 13 },
    { header: 'API Count', key: 'apiCount', width: 10 },
    { header: 'DB Count', key: 'dbCount', width: 10 },
    { header: 'Match', key: 'match', width: 8 },
    { header: 'Latency(ms)', key: 'latency', width: 12 },
    { header: 'Notes', key: 'note', width: 24 },
  ];
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
  header.height = 22;

  const RESULT_FILL = {
    PASS: 'FFE2EFDA', AUTH: 'FFFFF2CC', 'NOT FOUND': 'FFFCE4D6', VALIDATION: 'FFFFF2CC',
    'RATE LIMIT': 'FFFCE4D6', 'SERVER ERR': 'FFF8CBAD', 'NO CONN': 'FFF8CBAD', SKIP: 'FFEDEDED',
  };

  for (const r of rows) {
    const row = ws.addRow(r);
    row.alignment = { vertical: 'top', wrapText: true };
    row.getCell('request').font = { name: 'Consolas', size: 9 };
    row.getCell('response').font = { name: 'Consolas', size: 9 };
    const fill = RESULT_FILL[r.result];
    if (fill) row.getCell('result').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
    if (r.match === 'NO') row.getCell('match').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8CBAD' } };
    row.eachCell((c) => { c.border = { top: { style: 'thin', color: { argb: 'FFD9D9D9' } }, bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } }, left: { style: 'thin', color: { argb: 'FFD9D9D9' } }, right: { style: 'thin', color: { argb: 'FFD9D9D9' } } }; });
  }
  ws.autoFilter = { from: 'A1', to: 'M1' };

  const outDir = path.join(ROOT, 'quality', 'reports', 'api');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
  const file = path.join(outDir, `api-report-${stamp}.xlsx`);
  await wb.xlsx.writeFile(file);
  // Also drop a JSON sidecar for diffing across runs.
  fs.writeFileSync(file.replace(/\.xlsx$/, '.json'), JSON.stringify({ base: `${BASE}${PREFIX}`, generatedAt: new Date().toISOString(), rows }, null, 2));
  log(`\n✓ Excel report:  ${path.relative(ROOT, file)}`);
  log(`✓ JSON sidecar:  ${path.relative(ROOT, file.replace(/\.xlsx$/, '.json'))}`);
}

main().catch((e) => { console.error('Runner failed:', e); process.exit(1); });
