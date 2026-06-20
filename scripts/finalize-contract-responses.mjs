#!/usr/bin/env node
/**
 * Final pass — documents an expected success response for every contract that
 * still has none after live capture + spec/zod enrichment. These are endpoints
 * that can't be exercised in a local/dev run (external integrations — Account
 * Aggregator, payments, webhooks, OTP, AI — plus cross-entity/admin flows that
 * need real fixtures).
 *
 * Each filled response is a realistic standard envelope shaped by the method,
 * and is explicitly marked `generator.responseSource = "documented-default"` so
 * it is never mistaken for a live-captured shape. Run `qa:api-report` against a
 * fully-provisioned environment later to replace these with real captures.
 *
 * Idempotent; only touches contracts whose 2xx body is still empty.
 *
 * Run from repo root:  node scripts/finalize-contract-responses.mjs
 *                      (npm run qa:contract-finalize)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONTRACTS = path.join(ROOT, 'docs', 'api', 'contracts');

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, ''));
const isEmpty = (o) => o == null || (typeof o === 'object' && Object.keys(o).length === 0);
const singular = (f) => (f || 'resource').replace(/s$/, '');

function defaultResponse(c) {
  const method = (c.method || 'GET').toUpperCase();
  const hasParam = /[:{]/.test(c.endpoint || '');
  if (method === 'DELETE') return { code: '200', body: { success: true, message: `${singular(c.feature)} deleted successfully` } };
  if (method === 'GET' && !hasParam) return { code: '200', body: { success: true, data: [] } };
  if (method === 'GET') return { code: '200', body: { success: true, data: { id: '00000000-0000-0000-0000-000000000000' } } };
  // writes: echo the documented request entity with an id, when we have one
  const entity = (c.request && typeof c.request.body === 'object' && !isEmpty(c.request.body))
    ? { id: '00000000-0000-0000-0000-000000000000', ...c.request.body }
    : { id: '00000000-0000-0000-0000-000000000000' };
  return { code: method === 'POST' && !hasParam ? '201' : '200', body: { success: true, data: entity } };
}

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, acc);
    else if (/\.api\.json$/.test(e.name) && e.name !== '_template.api.json') acc.push(full);
  }
  return acc;
}

let filled = 0, total = 0;
for (const file of walk(CONTRACTS)) {
  let c; try { c = readJson(file); } catch { continue; }
  total++;
  const sk = Object.keys(c.responses || {}).find((k) => /^2\d\d$/.test(k));
  const sb = sk ? c.responses[sk].body : undefined;
  if (sk && !isEmpty(sb)) continue; // already documented (live/spec/zod)
  const def = defaultResponse(c);
  c.responses ||= {};
  const code = sk || def.code;
  c.responses[code] = { description: c.responses[code]?.description || 'Success (documented default — replace with a live capture)', body: def.body };
  c.generator = { ...(c.generator || {}), responseSource: 'documented-default', finalizedAt: new Date().toISOString().slice(0, 10) };
  fs.writeFileSync(file, JSON.stringify(c, null, 2) + '\n');
  filled++;
}
console.log(`✓ Documented a default response for ${filled} of ${total} contracts (the rest were live-captured or spec/zod-enriched).`);
console.log('  These are marked generator.responseSource="documented-default" — replace with real captures when the integrations are provisioned.');
