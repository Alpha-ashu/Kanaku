#!/usr/bin/env node
/**
 * Generates one Markdown file per API endpoint into docs/api/<feature>/, plus an
 * index (README.md) and a coverage report (COVERAGE.md).
 *
 * Source of truth: the hand-crafted OpenAPI document returned by
 * backend/src/docs/api-docs.ts → generateOpenApiDocument(). We dump it to JSON
 * via backend/scripts/dump-openapi.ts (run under the backend's CommonJS
 * ts-node), then render request/response details for each operation.
 *
 * Coverage: we additionally parse the live Express route files
 * (backend/src/routes/index.ts + features/<x>/<x>.routes.ts) and diff the routed
 * endpoints against the documented ones, so undocumented endpoints surface.
 *
 * Run from repo root:  node scripts/gen-endpoint-docs.mjs   (or npm run docs:endpoints)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BACKEND = path.join(ROOT, 'backend');
// Human-readable reference lives under docs/api/reference/ so it coexists with
// the existing machine-readable JSON contracts in docs/api/contracts/.
const OUT_DIR = path.join(ROOT, 'docs', 'api', 'reference');
const SPEC_JSON = path.join(ROOT, 'scratch', 'openapi.json');
const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'];

// ─── 1. Produce the OpenAPI JSON from the TypeScript source ──────────────────
function loadSpec() {
  fs.mkdirSync(path.dirname(SPEC_JSON), { recursive: true });
  console.log('• Dumping OpenAPI spec from backend/src/docs/api-docs.ts …');
  execSync('npx ts-node --transpile-only scripts/dump-openapi.ts', {
    cwd: BACKEND,
    stdio: 'inherit',
  });
  return JSON.parse(fs.readFileSync(SPEC_JSON, 'utf8'));
}

// ─── helpers ─────────────────────────────────────────────────────────────────
const code = (s) => '`' + s + '`';
const fence = (obj) => '```json\n' + JSON.stringify(obj, null, 2) + '\n```';

function resolveRef(ref, components) {
  // "#/components/schemas/Envelope"
  const name = ref.split('/').pop();
  return { name, schema: components?.schemas?.[name] };
}

function constraintsOf(s) {
  const c = [];
  if (s.format) c.push(`format: ${s.format}`);
  if (s.enum) c.push(`enum: ${s.enum.map((e) => `\`${e}\``).join(', ')}`);
  if (s.minLength != null) c.push(`minLen ${s.minLength}`);
  if (s.maxLength != null) c.push(`maxLen ${s.maxLength}`);
  if (s.minimum != null) c.push(`min ${s.minimum}`);
  if (s.maximum != null) c.push(`max ${s.maximum}`);
  if (s.default !== undefined) c.push(`default \`${s.default}\``);
  if (s.example !== undefined && typeof s.example !== 'object') c.push(`e.g. \`${s.example}\``);
  return c.join('; ');
}

/** Render an object schema's top-level properties as a Markdown table. */
function propsTable(schema, components) {
  let s = schema;
  if (s?.$ref) s = resolveRef(s.$ref, components).schema || {};
  if (!s || s.type !== 'object' || !s.properties) return null;
  const required = new Set(s.required || []);
  const rows = Object.entries(s.properties).map(([name, prop]) => {
    let type = prop.type || (prop.$ref ? resolveRef(prop.$ref, components).name : 'object');
    if (type === 'array') {
      const it = prop.items || {};
      const itType = it.type || (it.$ref ? resolveRef(it.$ref, components).name : 'object');
      type = `array<${itType}>`;
    }
    return `| ${code(name)} | ${type} | ${required.has(name) ? 'yes' : 'no'} | ${constraintsOf(prop) || ''} |`;
  });
  if (!rows.length) return null;
  return ['| Field | Type | Required | Notes |', '|---|---|---|---|', ...rows].join('\n');
}

function authLabel(op, doc) {
  const sec = op.security ?? doc.security ?? [];
  const needs = Array.isArray(sec) && sec.some((s) => Object.keys(s || {}).length > 0);
  return needs ? '🔒 Bearer token required' : '🔓 Public (no auth)';
}

function paramsTable(params, where) {
  const rows = (params || []).filter((p) => p.in === where).map((p) => {
    const sc = p.schema || {};
    const type = sc.type || (sc.$ref ? sc.$ref.split('/').pop() : 'string');
    return `| ${code(p.name)} | ${type} | ${p.required ? 'yes' : 'no'} | ${(p.description || '').replace(/\n/g, ' ')} ${constraintsOf(sc) ? `(${constraintsOf(sc)})` : ''} |`;
  });
  if (!rows.length) return null;
  return ['| Name | Type | Required | Description |', '|---|---|---|---|', ...rows].join('\n');
}

// path → { feature, rest }
function splitPath(p) {
  let rest = p.replace(/^\/api\/v1\//, '').replace(/^\//, '');
  const seg = rest.split('/');
  const feature = seg[0] || 'root';
  return { feature, rest: seg.slice(1).join('/') };
}

function fileSlug(method, rest) {
  const slug = (rest || 'index').replace(/\//g, '-').replace(/[{}]/g, '');
  return `${method.toUpperCase()}__${slug}.md`;
}

// ─── 2. Render one endpoint file ─────────────────────────────────────────────
function renderOperation(fullPath, method, op, doc) {
  const components = doc.components || {};
  const M = method.toUpperCase();
  const lines = [];
  lines.push(`# ${M} ${fullPath}`);
  lines.push('');
  if (op.summary) lines.push(`> ${op.summary}`);
  if (op.description) lines.push('', op.description);
  lines.push('');
  lines.push('| | |', '|---|---|');
  lines.push(`| **Method** | ${code(M)} |`);
  lines.push(`| **URL** | ${code(fullPath)} |`);
  lines.push(`| **Auth** | ${authLabel(op, doc)} |`);
  if (op.tags?.length) lines.push(`| **Tags** | ${op.tags.join(', ')} |`);
  if (op.operationId) lines.push(`| **operationId** | ${code(op.operationId)} |`);
  lines.push('');

  // Parameters
  const pathTbl = paramsTable(op.parameters, 'path');
  const queryTbl = paramsTable(op.parameters, 'query');
  lines.push('## Path parameters', '', pathTbl || '_None._', '');
  lines.push('## Query parameters', '', queryTbl || '_None._', '');

  // Request body
  lines.push('## Request');
  const rb = op.requestBody;
  if (rb) {
    const ct = Object.keys(rb.content || { 'application/json': {} })[0];
    const media = rb.content?.[ct] || {};
    lines.push('', `**Content-Type:** ${code(ct)}  ·  **Required:** ${rb.required ? 'yes' : 'no'}`);
    if (rb.description) lines.push('', rb.description);
    const tbl = propsTable(media.schema, components);
    if (tbl) lines.push('', '**Body schema:**', '', tbl);
    const ex = media.example ?? media.schema?.example;
    if (ex !== undefined) lines.push('', '**Example request body:**', '', fence(ex));
    else if (media.schema && !tbl) lines.push('', '**Body schema:**', '', fence(media.schema));
  } else {
    lines.push('', '_No request body._');
  }
  lines.push('');

  // Responses
  lines.push('## Responses', '');
  for (const [status, resp] of Object.entries(op.responses || {})) {
    lines.push(`### ${status} — ${resp.description || ''}`.trim());
    const media = resp.content?.['application/json'];
    if (media) {
      if (media.schema?.$ref) {
        const { name } = resolveRef(media.schema.$ref, components);
        lines.push('', `Schema: ${code(name)}`);
      }
      const ex = media.example ?? media.schema?.example;
      if (ex !== undefined) lines.push('', fence(ex));
    }
    lines.push('');
  }

  lines.push('---');
  lines.push(
    `_Generated from the OpenAPI spec (\`backend/src/docs/api-docs.ts\`) by \`scripts/gen-endpoint-docs.mjs\`. ` +
      `Do not edit by hand — re-run \`npm run docs:endpoints\`._`,
  );
  return lines.join('\n') + '\n';
}

// ─── 3. Parse the live Express routes (rich metadata + coverage) ─────────────
function joinPath(mount, p) {
  let full = '/api/v1' + mount + (p === '/' || p === '' ? '' : p.startsWith('/') ? p : '/' + p);
  return full.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

const MW_KEYWORDS = new Set([
  'authMiddleware', 'requireRole', 'requireFeature', 'requireAdmin', 'validateBody',
  'validateParams', 'validateQuery', 'responseCache', 'idempotency', 'upload', 'rateLimit',
  'authenticatedRateLimit', 'express', 'cacheMiddleware', 'optionalAuth', 'asyncHandler',
  'req', 'res', 'next', 'async', 'await', 'true', 'false', 'null', 'prefix', 'ttlSeconds', 'scope',
]);

function describeMiddleware(rest) {
  const guards = [];
  if (/\bauthMiddleware\b/.test(rest)) guards.push('auth');
  for (const g of rest.matchAll(/requireRole\(\s*([^)]*)\)/g)) guards.push(`role(${g[1].replace(/['"]/g, '')})`);
  for (const g of rest.matchAll(/requireFeature\(\s*([^)]*)\)/g)) guards.push(`feature(${g[1].replace(/['"]/g, '').replace(/\s+/g, '')})`);
  if (/\brequireAdmin\b/.test(rest)) guards.push('admin');
  if (/\bidempotency\(/.test(rest)) guards.push('idempotent');
  const validation = [];
  for (const v of rest.matchAll(/validate(Body|Params|Query)\(\s*(\w+)/g)) validation.push(`${v[1].toLowerCase()}:${v[2]}`);
  const upload = rest.match(/upload\.(single|array|fields)\(\s*['"]?(\w+)?/);
  if (upload) validation.push(`multipart:${upload[2] || upload[1]}`);
  // handler = the last meaningful identifier (usually Controller.method), skipping middleware
  const tokens = [...rest.matchAll(/([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?)/g)]
    .map((m) => m[1])
    .filter((t) => !MW_KEYWORDS.has(t) && !MW_KEYWORDS.has(t.split('.')[0]));
  const handler = tokens.length ? tokens[tokens.length - 1] : '';
  return { guards: [...new Set(guards)], validation, handler };
}

function parseRoutedEndpoints() {
  const routesIndex = path.join(BACKEND, 'src', 'routes', 'index.ts');
  if (!fs.existsSync(routesIndex)) return { endpoints: [], mounts: 0 };
  const src = fs.readFileSync(routesIndex, 'utf8').replace(/\r\n/g, '\n');
  const routesDir = path.dirname(routesIndex);

  // import { a, b } from '../features/x/y.routes'   |   import a from '...'
  const importMap = {};
  for (const m of src.matchAll(
    /import\s+(?:\{([^}]*)\}|(\w+))\s+from\s+['"](\.\.\/features\/[^'"]+\.routes)['"]/g,
  )) {
    const names = m[1]
      ? m[1].split(',').map((s) => s.trim().split(/\s+as\s+/).pop().trim()).filter(Boolean)
      : [m[2]];
    const file = path.resolve(routesDir, m[3]) + '.ts';
    for (const n of names) importMap[n] = file;
  }

  // Capture the whole router.use(...) line so lazyRoute(require('…')) resolves too.
  const mounts = [];
  for (const m of src.matchAll(/router\.use\(\s*['"](\/[^'"]+)['"]\s*,\s*(.+)$/gm)) {
    const mount = m[1];
    const rest = m[2];
    const lazy = rest.match(/require\(\s*['"](\.\.\/features\/[^'"]+)['"]\s*\)/);
    let file;
    if (lazy) file = path.resolve(routesDir, lazy[1]) + '.ts';
    else file = importMap[(rest.match(/[A-Za-z_$][\w$]*/) || [])[0]];
    if (file) mounts.push({ mount, file });
  }

  const endpoints = [];
  const seen = new Set();
  for (const { mount, file } of mounts) {
    const key = mount + '::' + file;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!fs.existsSync(file)) continue;
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    const content = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    const fileAuth = /router\.use\(\s*authMiddleware\s*\)/.test(content);
    const lineOf = (idx) => content.slice(0, idx).split('\n').length;
    // Whole-file match so multi-line route definitions (path on a later line) are caught.
    // Capture args up to the closing `);` (non-greedy) for guard/validation/handler hints.
    for (const r of content.matchAll(/\brouter\s*\.\s*(get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)['"]([\s\S]*?)\)\s*;/g)) {
      const method = r[1].toUpperCase();
      const rest = r[3] || '';
      const meta = describeMiddleware(rest);
      if (fileAuth && !meta.guards.includes('auth')) meta.guards.unshift('auth');
      endpoints.push({ method, full: joinPath(mount, r[2]), file: rel, line: lineOf(r.index), ...meta });
    }
    // router.route('/x').get(handler).post(handler)
    for (const r of content.matchAll(/\brouter\s*\.\s*route\(\s*['"]([^'"]+)['"]\s*\)([\s\S]*?)(?=\n\s*router\.|\n\n|$)/g)) {
      for (const mm of r[2].matchAll(/\.\s*(get|post|put|patch|delete)\s*\(/g)) {
        const method = mm[1].toUpperCase();
        const meta = describeMiddleware(r[2]);
        if (fileAuth && !meta.guards.includes('auth')) meta.guards.unshift('auth');
        endpoints.push({ method, full: joinPath(mount, r[1]), file: rel, line: lineOf(r.index), ...meta });
      }
    }
  }
  return { endpoints, mounts: mounts.length };
}

// stub file for an endpoint that exists in code but isn't in the OpenAPI spec yet
function renderStub(ep) {
  const L = [];
  L.push(`# ${ep.method} ${ep.full}`, '');
  L.push('> ⚠️ **Not yet in the OpenAPI spec** (`backend/src/docs/api-docs.ts`). Details below are parsed from the route definition; request/response shapes are pending — see the source/validation schema.', '');
  L.push('| | |', '|---|---|');
  L.push(`| **Method** | ${code(ep.method)} |`);
  L.push(`| **URL** | ${code(ep.full)} |`);
  L.push(`| **Auth** | ${ep.guards.includes('auth') ? '🔒 Bearer token required' : '🔓 Public / see source'} |`);
  if (ep.guards.length) L.push(`| **Guards** | ${ep.guards.map(code).join(', ')} |`);
  if (ep.validation.length) L.push(`| **Validation** | ${ep.validation.map(code).join(', ')} |`);
  if (ep.handler) L.push(`| **Handler** | ${code(ep.handler)} |`);
  L.push(`| **Source** | [${ep.file}:${ep.line}](/${ep.file}#L${ep.line}) |`);
  L.push('');
  L.push('## Request', '');
  if (ep.validation.length) {
    L.push('Request shape is enforced by the validation schema(s) above ' + ep.validation.map(code).join(', ') + '. See the feature\'s `*.validation.ts` for the exact fields.', '');
  } else {
    L.push('_Request shape not documented yet. Check the handler in the source file above._', '');
  }
  L.push('## Responses', '');
  L.push('Standard envelope: `{ "success": true, "data": … }` on success, `{ "success": false, "error": "…", "code": "…" }` on error. Exact `data` shape pending promotion into the OpenAPI spec.', '');
  L.push('---');
  L.push('_Generated by `scripts/gen-endpoint-docs.mjs` from the Express route definition. Promote this endpoint into `backend/src/docs/api-docs.ts` for a full request/response contract._');
  return L.join('\n') + '\n';
}

// ─── 4. Main ─────────────────────────────────────────────────────────────────
function main() {
  const doc = loadSpec();
  const paths = doc.paths || {};

  // wipe previously generated feature folders (keep nothing stale)
  if (fs.existsSync(OUT_DIR)) {
    for (const entry of fs.readdirSync(OUT_DIR)) {
      const full = path.join(OUT_DIR, entry);
      if (fs.statSync(full).isDirectory()) fs.rmSync(full, { recursive: true, force: true });
    }
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const byFeature = {};
  const specSet = new Set();
  let docCount = 0;

  // 4a. Rich files from the OpenAPI spec
  for (const [p, methods] of Object.entries(paths)) {
    for (const method of Object.keys(methods)) {
      if (!HTTP_METHODS.includes(method)) continue;
      const op = methods[method];
      specSet.add(`${method.toUpperCase()} ${p}`);
      const { feature, rest } = splitPath(p);
      const dir = path.join(OUT_DIR, feature);
      fs.mkdirSync(dir, { recursive: true });
      const fname = fileSlug(method, rest);
      fs.writeFileSync(path.join(dir, fname), renderOperation(p, method, op, doc));
      docCount++;
      (byFeature[feature] ||= []).push({
        method: method.toUpperCase(),
        path: p,
        summary: op.summary || '',
        file: `${feature}/${fname}`,
        stub: false,
      });
    }
  }

  // 4b. Coverage + stub files for endpoints that exist in code but not in the spec
  const norm = (s) => s.replace(/\{[^}]+\}/g, '{}'); // compare ignoring param names
  const specNorm = new Set([...specSet].map(norm));
  const { endpoints: routed, mounts } = parseRoutedEndpoints();
  const routeStrings = [...new Set(routed.map((e) => `${e.method} ${e.full}`))];
  const routeNorm = new Set(routeStrings.map(norm));

  const undocumentedSeen = new Set();
  const undocumented = [];
  let stubCount = 0;
  for (const ep of routed) {
    const key = `${ep.method} ${ep.full}`;
    if (specNorm.has(norm(key)) || undocumentedSeen.has(key)) continue;
    undocumentedSeen.add(key);
    undocumented.push(key);
    const { feature, rest } = splitPath(ep.full);
    const dir = path.join(OUT_DIR, feature);
    fs.mkdirSync(dir, { recursive: true });
    const fname = fileSlug(ep.method, rest);
    fs.writeFileSync(path.join(dir, fname), renderStub(ep));
    stubCount++;
    (byFeature[feature] ||= []).push({
      method: ep.method,
      path: ep.full,
      summary: '⚠️ spec pending',
      file: `${feature}/${fname}`,
      stub: true,
    });
  }
  undocumented.sort();
  const documentedNotRouted = [...specSet].filter((e) => !routeNorm.has(norm(e))).sort();
  const totalFiles = docCount + stubCount;

  // 4c. index README
  const features = Object.keys(byFeature).sort();
  const idx = [];
  idx.push('# API Endpoint Reference', '');
  idx.push(
    `Auto-generated — one file per endpoint. **${totalFiles} endpoints** across **${features.length} feature groups** ` +
      `(${docCount} with a full OpenAPI contract, ${stubCount} ⚠️ spec-pending stubs). Base prefix: \`/api/v1\` ` +
      `(servers: ${(doc.servers || []).map((s) => code(s.url || '<prod>')).join(', ')}).`,
    '',
  );
  idx.push(
    '> Source of truth for documented endpoints: `backend/src/docs/api-docs.ts`. ⚠️ rows are parsed from the ' +
      'Express routes and need promoting into that spec. Regenerate with `npm run docs:endpoints`. ' +
      'Live Swagger UI: `/api-docs` · raw spec: `/api-docs/openapi.json` · gap checklist: [COVERAGE.md](./COVERAGE.md).',
    '',
    'Pairs with the machine-readable JSON contracts in [`../contracts/`](../contracts/README.md) ' +
      '(see [`../README.md`](../README.md)). This human-readable reference is generated from the OpenAPI spec.',
    '',
  );
  for (const f of features) {
    idx.push(`## ${f}`, '');
    idx.push('| Method | Endpoint | Summary | Doc |', '|---|---|---|---|');
    for (const e of byFeature[f].sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method))) {
      idx.push(`| ${e.method} | ${code(e.path)} | ${e.summary} | [↗](./${e.file}) |`);
    }
    idx.push('');
  }
  fs.writeFileSync(path.join(OUT_DIR, 'README.md'), idx.join('\n') + '\n');

  // 4d. coverage report
  const cov = [];
  cov.push('# API Coverage Report', '');
  cov.push(`Generated by \`scripts/gen-endpoint-docs.mjs\` on ${new Date().toISOString().split('T')[0]}.`, '');
  cov.push(
    `- Documented operations (OpenAPI): **${specSet.size}**`,
    `- Routed endpoints discovered (Express, ${mounts} mounts parsed): **${routeStrings.length}**`,
    `- In routes but **NOT in the OpenAPI spec** (⚠️ stub files generated): **${undocumented.length}**`,
    `- In the spec but **not matched in route files** (app-level like \`/health\`, or parser limits): **${documentedNotRouted.length}**`,
    `- **Total endpoint files written: ${totalFiles}**`,
    '',
  );
  cov.push(
    '> Comparison ignores path-parameter names (`{id}` vs `{accountId}`). The route parser is ' +
      'static/best-effort: modules exporting multiple routers from one file (e.g. `/categorize` + `/learn`) ' +
      'may be over/under-counted. Treat this as a checklist, not a contract.',
    '',
  );
  cov.push('## In routes but NOT in the OpenAPI spec — promote into `api-docs.ts`', '');
  cov.push(undocumented.length ? undocumented.map((e) => `- [ ] ${code(e)}`).join('\n') : '_None 🎉_');
  cov.push('', '## In the spec but not matched in route files', '');
  cov.push(documentedNotRouted.length ? documentedNotRouted.map((e) => `- ${code(e)}`).join('\n') : '_None_');
  cov.push('');
  fs.writeFileSync(path.join(OUT_DIR, 'COVERAGE.md'), cov.join('\n') + '\n');

  console.log(`✓ Wrote ${totalFiles} endpoint files (${docCount} documented + ${stubCount} stubs) across ${features.length} features → docs/api/reference/`);
  console.log(`✓ Index: docs/api/reference/README.md`);
  console.log(`✓ Coverage: docs/api/reference/COVERAGE.md  (undocumented: ${undocumented.length}, doc-only: ${documentedNotRouted.length})`);
}

main();
