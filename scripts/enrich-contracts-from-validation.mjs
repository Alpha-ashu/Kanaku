#!/usr/bin/env node
/**
 * Second-pass contract enricher — fills request.body / request.query for the
 * endpoints NOT covered by the OpenAPI spec, using the backend's Zod validation
 * schemas as the source of truth.
 *
 *   1. dumps an example value for every exported Zod schema
 *      (backend/scripts/dump-zod-examples.ts → scratch/zod-examples.json)
 *   2. parses each feature's *.routes.ts to learn which schema validates which
 *      route (validateBody(X) / validateQuery(X))
 *   3. fills each contract's empty request.body / request.query from that schema
 *
 * Only fills missing fields (preserves hand-authored + spec-enriched content).
 *
 * Run from repo root:  node scripts/enrich-contracts-from-validation.mjs
 *                      (npm run qa:contract-enrich-zod)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BACKEND = path.join(ROOT, 'backend');
const FEATURES = path.join(BACKEND, 'src', 'features');
const CONTRACTS = path.join(ROOT, 'docs', 'api', 'contracts');
const EXAMPLES_JSON = path.join(ROOT, 'scratch', 'zod-examples.json');

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, ''));
const isEmpty = (o) => o == null || (typeof o === 'object' && Object.keys(o).length === 0);
const normPath = (p) => p.replace(/[:{][^/}]+\}?/g, ':p').replace(/\/+$/, '');

// ── parse a feature's route files → [{ method, rel, body, query }] ───────────--
function parseRoutes(featDir) {
  const routes = [];
  for (const file of fs.readdirSync(featDir)) {
    if (!/\.routes\.ts$/.test(file)) continue;
    const text = fs.readFileSync(path.join(featDir, file), 'utf8').replace(/\r\n/g, '\n');
    // split into per-call chunks so multi-line router.post(\n '/x',\n validateBody(X)) parse cleanly
    const re = /\brouter\.(get|post|put|patch|delete)\s*\(/g;
    const starts = [];
    let m;
    while ((m = re.exec(text))) starts.push({ method: m[1].toUpperCase(), idx: m.index, end: re.lastIndex });
    for (let i = 0; i < starts.length; i++) {
      const chunk = text.slice(starts[i].end, i + 1 < starts.length ? starts[i + 1].idx : text.length);
      const pathM = chunk.match(/['"`]([^'"`]+)['"`]/);
      if (!pathM) continue;
      routes.push({
        method: starts[i].method,
        rel: pathM[1],
        body: (chunk.match(/validateBody\(\s*(\w+)/) || [])[1],
        query: (chunk.match(/validateQuery\(\s*(\w+)/) || [])[1],
      });
    }
  }
  return routes;
}

// most-specific route whose relative path is a suffix of the contract endpoint
function matchRoute(routes, method, endpoint) {
  const ne = normPath(endpoint);
  return routes
    .filter((r) => r.method === method)
    .map((r) => ({ r, nr: normPath(r.rel) }))
    .filter(({ nr }) => ne.endsWith(nr))
    .sort((a, b) => b.nr.length - a.nr.length)[0]?.r;
}

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, acc);
    else if (/\.api\.json$/.test(e.name) && e.name !== '_template.api.json') acc.push(full);
  }
  return acc;
}

function main() {
  console.log('=== Kanaku Contract Enricher (Zod validation) ===');
  try {
    execSync('npx ts-node --transpile-only scripts/dump-zod-examples.ts', { cwd: BACKEND, stdio: 'ignore' });
  } catch (e) { console.error('Could not dump Zod examples:', e.message); process.exit(1); }
  const examples = readJson(EXAMPLES_JSON);

  // cache routes per feature dir
  const routesByFeature = {};
  for (const dir of fs.readdirSync(FEATURES)) {
    const fd = path.join(FEATURES, dir);
    if (fs.statSync(fd).isDirectory()) routesByFeature[dir] = parseRoutes(fd);
  }

  let bodies = 0, queries = 0, files = 0;
  for (const file of walk(CONTRACTS)) {
    let c; try { c = readJson(file); } catch { continue; }
    const method = (c.method || '').toUpperCase();
    const isWrite = ['POST', 'PUT', 'PATCH'].includes(method);
    const routes = routesByFeature[c.feature] || [];
    const route = matchRoute(routes, method, c.endpoint || '');
    if (!route) continue;

    c.request ||= {};
    let changed = false;
    if (isWrite && isEmpty(c.request.body) && route.body && !isEmpty(examples[route.body])) {
      c.request.body = examples[route.body]; bodies++; changed = true;
    }
    // A write route with no validateBody() legitimately takes no body (action
    // endpoints like .../approve, .../revoke/:id, .../online-status) — mark it so
    // the auditor doesn't flag an empty body as a gap.
    if (isWrite && isEmpty(c.request.body) && !route.body && c.request.noBody !== true) {
      c.request.noBody = true; changed = true;
    }
    if (isEmpty(c.request.query) && route.query && !isEmpty(examples[route.query])) {
      c.request.query = examples[route.query]; queries++; changed = true;
    }
    if (changed) {
      c.generator = { ...(c.generator || {}), zodEnrichedAt: new Date().toISOString().slice(0, 10) };
      fs.writeFileSync(file, JSON.stringify(c, null, 2) + '\n');
      files++;
    }
  }
  console.log(`✓ Filled ${bodies} request bodies + ${queries} query specs across ${files} contracts (from Zod schemas).`);
  console.log('  Next: `npm run qa:contract-audit` to re-score.');
}

main();
