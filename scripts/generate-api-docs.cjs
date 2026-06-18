#!/usr/bin/env node
/**
 * scripts/generate-api-docs.cjs
 *
 * Scans every backend module router file and emits one JSON file per endpoint
 * into api-docs/<feature>/<action>.api.json, following api-docs/_template.api.json.
 *
 * Run:  node scripts/generate-api-docs.cjs
 *
 * - Idempotent: if a target file already exists and has been hand-edited
 *   (i.e. its "generator" field is missing), the script SKIPS it.
 * - Newly generated files include "generator": { "auto": true, "version": 1 }
 *   so re-runs can safely overwrite them as routes change.
 *
 * Heuristics (best-effort, must be reviewed by humans):
 *   - HTTP method/path: regex over `router.<method>(<path>, ...)`
 *   - Auth: presence of `authMiddleware` / `requireAuth` / `requireRole`
 *           on the line ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ "bearer"; otherwise "public".
 *   - Step-up: presence of `securityGate(` ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ "bearer+stepUp".
 *   - Rate limit: `destructiveLimiter` ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ "destructive (3/min)";
 *                 `authLimiter`        ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ "auth (20/min)";
 *                 otherwise            ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ "default".
 *   - Validation: presence of `validateBody(<Name>)` / `validateParams` /
 *                 `validateQuery` on the line ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ reference that schema.
 *   - Handler:    last identifier in the args list.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const modulesDir = path.join(repoRoot, 'backend', 'src', 'features');
const apiDocsDir = path.join(repoRoot, 'docs', 'api', 'contracts');
const indexFile = path.join(repoRoot, 'backend', 'src', 'routes', 'index.ts');

// ---------- 1. Build feature -> URL prefix map from routes/index.ts ----------
function buildPrefixMap() {
  const src = fs.readFileSync(indexFile, 'utf8');
  // Match:  router.use('/auth', authRoutes);
  //   or:   router.use('/ai', lazyRoute(() => require('../features/ai/ai.routes'), 'aiRoutes'));
  const re =
    /router\.use\(\s*['"]([^'"]+)['"]\s*,\s*(?:lazyRoute\(\s*\(\)\s*=>\s*require\(['"]\.\.\/features\/([^/'"]+)\/[^'"]+['"]\)\s*,\s*['"]([A-Za-z0-9_]+)['"]|([A-Za-z0-9_]+))\s*\)/g;
  // Map: importName -> prefix
  const importToPrefix = {};
  let m;
  while ((m = re.exec(src)) !== null) {
    const prefix = m[1];
    const lazyExport = m[3];
    const directImport = m[4];
    const importName = lazyExport || directImport;
    if (importName) importToPrefix[importName] = prefix;
  }
  // Now resolve importName -> module folder via the import statements at top of file
  const importRe =
    /import\s+(?:\{\s*([A-Za-z0-9_,\s]+)\s*\}|([A-Za-z0-9_]+))\s+from\s+['"]\.\.\/features\/([^/'"]+)\/[^'"]+['"]/g;
  const featureToPrefix = {};
  let im;
  while ((im = importRe.exec(src)) !== null) {
    const namedList = im[1];
    const defaultName = im[2];
    const folder = im[3];
    const names = namedList
      ? namedList.split(',').map((s) => s.trim()).filter(Boolean)
      : [defaultName];
    for (const n of names) {
      if (importToPrefix[n]) {
        // First binding wins per feature; if multiple, append rest too.
        if (!featureToPrefix[folder]) featureToPrefix[folder] = importToPrefix[n];
      }
    }
  }
  // Also handle lazy require modules that don't have a top-level import (ai, receipts, bills)
  const lazyRe =
    /router\.use\(\s*['"]([^'"]+)['"]\s*,\s*lazyRoute\(\s*\(\)\s*=>\s*require\(['"]\.\.\/features\/([^/'"]+)\/[^'"]+['"]\)/g;
  let lm;
  while ((lm = lazyRe.exec(src)) !== null) {
    if (!featureToPrefix[lm[2]]) featureToPrefix[lm[2]] = lm[1];
  }
  return featureToPrefix;
}

// ---------- 2. Find all routes files ----------
function findRouteFiles() {
  const out = [];
  for (const entry of fs.readdirSync(modulesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(modulesDir, entry.name);
    for (const f of fs.readdirSync(dir)) {
      if (/\.routes\.ts$/.test(f)) {
        out.push({ feature: entry.name, file: path.join(dir, f) });
      }
    }
  }
  return out;
}

// ---------- 3. Parse routes from a file ----------
const ROUTE_RE =
  /router\.(get|post|put|patch|delete|options|head)\s*\(\s*['"`]([^'"`]+)['"`]([^)]*)\)/g;

function parseRoutes(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  const routes = [];
  let m;
  while ((m = ROUTE_RE.exec(src)) !== null) {
    const method = m[1].toUpperCase();
    const subpath = m[2];
    const argsRaw = m[3];
    routes.push({
      method,
      subpath,
      argsRaw: argsRaw.trim(),
      ...inferMetadata(argsRaw),
    });
  }
  return routes;
}

function inferMetadata(args) {
  const hasAuth =
    /authMiddleware|requireAuth\b|requireRole\(|requireApproved|requireAdmin/.test(
      args,
    );
  const hasStepUp = /securityGate\(/.test(args);
  const auth = hasStepUp ? 'bearer+stepUp' : hasAuth ? 'bearer' : 'public';

  let rateLimit = 'default';
  if (/destructiveLimiter|destructive_limiter|destructive_rate/i.test(args))
    rateLimit = 'destructive (3/min)';
  else if (/authLimiter|auth_limiter|auth_rate/i.test(args))
    rateLimit = 'auth (20/min)';

  const validation = {};
  const vb = args.match(/validateBody\(\s*([A-Za-z0-9_.]+)/);
  const vp = args.match(/validateParams\(\s*([A-Za-z0-9_.]+)/);
  const vq = args.match(/validateQuery\(\s*([A-Za-z0-9_.]+)/);
  if (vb) validation.body = vb[1];
  if (vp) validation.params = vp[1];
  if (vq) validation.query = vq[1];

  // Handler = last identifier in the args list
  const tokens = args
    .replace(/\([^)]*\)/g, '') // strip parens
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  const handler = tokens.length ? tokens[tokens.length - 1].replace(/[^A-Za-z0-9_]/g, '') : null;

  return { auth, rateLimit, validation, handler };
}

// ---------- 4. Action name from method + subpath ----------
function actionName(method, subpath) {
  // /auth/login -> "login"
  // /auth/devices/:deviceId -> "devices.byId"
  // GET /         -> "list"
  // POST /        -> "create"
  // GET /:id      -> "get"
  // PUT /:id      -> "update"
  // DELETE /:id   -> "delete"
  const seg = subpath.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);

  if (seg.length === 0) {
    if (method === 'GET') return 'list';
    if (method === 'POST') return 'create';
    if (method === 'PUT' || method === 'PATCH') return 'update';
    if (method === 'DELETE') return 'delete';
    return method.toLowerCase();
  }
  const normalized = seg
    .map((s) => (s.startsWith(':') ? `by-${s.slice(1)}` : s))
    .join('.')
    .replace(/[^A-Za-z0-9._-]/g, '-');
  return `${method.toLowerCase()}.${normalized}`;
}

// ---------- 5. Build JSON doc ----------
function buildDoc({ feature, prefix, route }) {
  const fullPath = `/api/v1${prefix}${route.subpath === '/' ? '' : route.subpath}`;
  const implController = `backend/src/features/${feature}/${feature}.controller.ts#${route.handler || '?'}`;
  return {
    endpoint: fullPath,
    method: route.method,
    feature,
    description: `TODO: describe ${route.method} ${fullPath}`,
    auth: route.auth,
    rateLimit: route.rateLimit,
    implementation: {
      controller: implController,
      route: `backend/src/features/${feature}/${path.basename(routeFileFor(feature))}`,
      validation:
        Object.keys(route.validation).length > 0
          ? Object.fromEntries(
              Object.entries(route.validation).map(([k, v]) => [
                k,
                `backend/src/features/${feature}/*.validation.ts#${v}`,
              ]),
            )
          : 'inline or none ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â verify',
    },
    request: {
      headers: {
        'Content-Type': 'application/json',
        Authorization: route.auth === 'public' ? null : 'Bearer <jwt>',
      },
      params: extractPathParams(route.subpath),
      query: {},
      body: route.method === 'GET' || route.method === 'DELETE' ? null : {},
    },
    responses: {
      '200': { description: 'TODO success shape', body: {} },
      ...(route.auth !== 'public' && {
        '401': { description: 'Missing/invalid token', body: { error: 'unauthorized' } },
        '403': { description: 'Forbidden', body: { error: 'forbidden' } },
      }),
      '400': {
        description: 'Validation failed',
        body: { error: 'validation_error', issues: [] },
      },
      '429': {
        description: 'Rate limited',
        body: { error: 'too_many_requests' },
      },
      '500': {
        description: 'Server error',
        body: { error: 'internal_error' },
      },
    },
    sideEffects: {
      writesDb: !['GET', 'HEAD', 'OPTIONS'].includes(route.method),
      emitsSocket: false,
      transactional: false,
      audited: false,
    },
    notes: '',
    generator: { auto: true, version: 1, generatedAt: new Date().toISOString().slice(0, 10) },
  };
}

function extractPathParams(subpath) {
  const params = {};
  const m = subpath.match(/:([A-Za-z0-9_]+)/g);
  if (m) for (const p of m) params[p.slice(1)] = 'string (required)';
  return params;
}

function routeFileFor(feature) {
  const dir = path.join(modulesDir, feature);
  for (const f of fs.readdirSync(dir)) {
    if (/\.routes\.ts$/.test(f)) return f;
  }
  return `${feature}.routes.ts`;
}

// ---------- 6. Write files ----------
function shouldSkip(targetPath) {
  if (!fs.existsSync(targetPath)) return false;
  try {
    const existing = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
    return !existing.generator || existing.generator.auto !== true;
  } catch {
    return true; // unreadable / hand-written non-JSON
  }
}

function main() {
  if (!fs.existsSync(apiDocsDir)) fs.mkdirSync(apiDocsDir, { recursive: true });
  const prefixMap = buildPrefixMap();
  const routeFiles = findRouteFiles();
  let written = 0;
  let skipped = 0;
  let missingPrefix = 0;
  const index = {};

  for (const { feature, file } of routeFiles) {
    const prefix = prefixMap[feature];
    if (!prefix) {
      console.warn(`[skip-feature] no URL prefix found for module '${feature}' in routes/index.ts`);
      missingPrefix++;
      continue;
    }
    const routes = parseRoutes(file);
    if (routes.length === 0) continue;
    const featureDir = path.join(apiDocsDir, feature);
    fs.mkdirSync(featureDir, { recursive: true });
    index[feature] = index[feature] || [];

    for (const r of routes) {
      const action = actionName(r.method, r.subpath);
      const fileName = `${action}.api.json`;
      const target = path.join(featureDir, fileName);
      index[feature].push({
        method: r.method,
        endpoint: `/api/v1${prefix}${r.subpath === '/' ? '' : r.subpath}`,
        file: `docs/api/contracts/${feature}/${fileName}`,
        auth: r.auth,
      });
      if (shouldSkip(target)) {
        skipped++;
        continue;
      }
      const doc = buildDoc({ feature, prefix, route: r });
      fs.writeFileSync(target, JSON.stringify(doc, null, 2) + '\n', 'utf8');
      written++;
    }
  }

  // Index file
  const indexPath = path.join(apiDocsDir, 'api-index.json');
  fs.writeFileSync(
    indexPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        totalEndpoints: Object.values(index).reduce((a, b) => a + b.length, 0),
        features: index,
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );

  console.log(
    `[api-docs] features=${Object.keys(index).length} endpoints=${Object.values(index)
      .reduce((a, b) => a + b.length, 0)} written=${written} skipped(hand-edited)=${skipped} missingPrefix=${missingPrefix}`,
  );
}

main();

