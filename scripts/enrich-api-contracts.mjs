#!/usr/bin/env node
/**
 * API contract enricher.
 *
 * Fills the empty/TODO fields in docs/api/contracts/**.api.json from the
 * hand-crafted OpenAPI spec (backend/src/docs/api-docs.ts), so the contracts —
 * and therefore the "API Request" / expected-response columns in the Excel
 * reports — are populated without a running backend.
 *
 * Fills ONLY missing fields (preserves any hand-authored content):
 *   - description        ← operation summary/description, else a humanised default
 *   - request.params     ← `:param` segments in the path
 *   - request.query      ← spec query parameters (with example values)
 *   - request.body       ← synthesised from the requestBody JSON schema (write verbs)
 *   - responses.<2xx>.body ← the response example, or synthesised from its schema
 *
 * Endpoints absent from the spec (55 of 240) get description + params only;
 * their response bodies are best filled later with:
 *   npm run qa:api-report           (capture ACTUAL responses against a live backend)
 *   npm run qa:contract-audit -- --write-expected
 *
 * Run from repo root:  node scripts/enrich-api-contracts.mjs   (npm run qa:contract-enrich)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BACKEND = path.join(ROOT, 'backend');
const CONTRACTS = path.join(ROOT, 'docs', 'api', 'contracts');
const SPEC_JSON = path.join(ROOT, 'scratch', 'openapi.json');

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, ''));
const isEmpty = (o) => o == null || (typeof o === 'object' && Object.keys(o).length === 0);
const toBrace = (p) => p.replace(/:([A-Za-z0-9_]+)/g, '{$1}'); // /x/:id → /x/{id}

// ── synthesise an example value from a JSON schema ──────────────────────────--
function example(schema, components, depth = 0) {
  if (!schema || depth > 6) return null;
  if (schema.$ref) {
    const name = schema.$ref.split('/').pop();
    return example(components?.schemas?.[name], components, depth + 1);
  }
  if (schema.example !== undefined) return schema.example;
  if (schema.enum) return schema.enum[0];
  if (schema.default !== undefined) return schema.default;
  const t = schema.type;
  if (t === 'object' || schema.properties) {
    const o = {};
    for (const [k, v] of Object.entries(schema.properties || {})) o[k] = example(v, components, depth + 1);
    return o;
  }
  if (t === 'array') return [example(schema.items, components, depth + 1)].filter((v) => v !== null);
  if (t === 'integer' || t === 'number') return schema.minimum ?? 0;
  if (t === 'boolean') return false;
  if (t === 'string') {
    switch (schema.format) {
      case 'date-time': return new Date().toISOString();
      case 'date': return new Date().toISOString().slice(0, 10);
      case 'uuid': return 'uuid';
      case 'email': return 'user@example.com';
      default: return 'string';
    }
  }
  return null;
}

const jsonMedia = (obj) => obj?.content?.['application/json'];
const bodyExample = (rb, components) => {
  const m = jsonMedia(rb); if (!m) return undefined;
  return m.example ?? example(m.schema, components);
};

function humanDescription(method, endpoint) {
  const m = method.toUpperCase();
  const parts = endpoint.replace(/^\/api\/v1\//, '').split('/').filter(Boolean);
  const noun = parts.filter((p) => !/^[:{]/.test(p)).join(' ');
  const verb = { GET: /[:{]/.test(endpoint) ? 'Get' : 'List', POST: 'Create', PUT: 'Update', PATCH: 'Update', DELETE: 'Delete' }[m] || m;
  return `${verb} ${noun}`.replace(/\s+/g, ' ').trim();
}

// ── discover contracts ─────────────────────────────────────────────────────--
function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, acc);
    else if (/\.api\.json$/.test(e.name) && e.name !== '_template.api.json') acc.push(full);
  }
  return acc;
}

function main() {
  console.log('=== Kanaku API Contract Enricher ===');
  // 1. Dump the spec (offline; the document is a pure function, no DB needed).
  fs.mkdirSync(path.dirname(SPEC_JSON), { recursive: true });
  try {
    execSync('npx ts-node --transpile-only scripts/dump-openapi.ts', { cwd: BACKEND, stdio: 'ignore' });
  } catch (e) { console.error('Could not dump OpenAPI spec:', e.message); process.exit(1); }
  const spec = readJson(SPEC_JSON);
  const components = spec.components || {};

  // 2. Index operations by `METHOD path` (path uses {param}).
  const ops = new Map();
  for (const [p, methods] of Object.entries(spec.paths || {})) {
    for (const [m, op] of Object.entries(methods)) ops.set(`${m.toUpperCase()} ${p}`, op);
  }

  const files = walk(CONTRACTS);
  let enriched = 0, fromSpec = 0;
  for (const file of files) {
    let c; try { c = readJson(file); } catch { continue; }
    const method = (c.method || '').toUpperCase();
    const isWrite = ['POST', 'PUT', 'PATCH'].includes(method);
    const op = ops.get(`${method} ${toBrace(c.endpoint || '')}`);
    let changed = false;

    // description
    if (!c.description || /^TODO/i.test(c.description)) {
      c.description = (op?.summary || op?.description || humanDescription(method, c.endpoint || '')).trim();
      changed = true;
    }
    // path params
    c.request ||= {};
    const pathParams = [...(c.endpoint || '').matchAll(/[:{]([A-Za-z0-9_]+)\}?/g)].map((m) => m[1]);
    if (pathParams.length && isEmpty(c.request.params)) {
      c.request.params = Object.fromEntries(pathParams.map((p) => [p, 'string']));
      changed = true;
    }

    if (op) {
      // query params
      const q = (op.parameters || []).filter((p) => p.in === 'query');
      if (q.length && isEmpty(c.request.query)) {
        c.request.query = Object.fromEntries(q.map((p) => [p.name, example(p.schema, components) ?? 'string']));
        changed = true;
      }
      // request body
      if (isWrite && isEmpty(c.request.body)) {
        const ex = bodyExample(op.requestBody, components);
        if (ex && !isEmpty(ex)) { c.request.body = ex; changed = true; }
      }
      // responses
      c.responses ||= {};
      for (const [code, resp] of Object.entries(op.responses || {})) {
        const ex = bodyExample(resp, components);
        if (ex !== undefined) {
          const cur = c.responses[code];
          if (!cur || isEmpty(cur.body)) {
            c.responses[code] = { description: cur?.description || resp.description || 'Response', body: ex };
            changed = true;
          }
        }
      }
      if (changed) fromSpec++;
    }

    if (changed) {
      c.generator = { ...(c.generator || {}), enrichedAt: new Date().toISOString().slice(0, 10) };
      fs.writeFileSync(file, JSON.stringify(c, null, 2) + '\n');
      enriched++;
    }
  }
  console.log(`✓ Enriched ${enriched}/${files.length} contracts (${fromSpec} from the OpenAPI spec, rest description/params only).`);
  console.log('  Next: `npm run qa:contract-audit` to re-score; `qa:api-report` + `--write-expected` for live response bodies.');
}

main();
