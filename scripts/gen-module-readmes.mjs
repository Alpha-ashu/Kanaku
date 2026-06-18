#!/usr/bin/env node
// Generates a README.md for every backend module (and a master catalog) from
// each module's actual *.routes.ts. Run from the repo root.
import fs from 'node:fs';
import path from 'node:path';

const MODULES_DIR = path.resolve('backend/src/modules');

// base path (as mounted in src/routes/index.ts) + a curated one-line purpose.
const META = {
  aa:             { base: '/aa',             purpose: 'RBI Account Aggregator (Setu) integration — consent flows and financial-data fetch.' },
  accounts:       { base: '/accounts',       purpose: 'User bank/cash/credit accounts — CRUD with feature-gated create/edit/delete.' },
  admin:          { base: '/admin',          purpose: 'Admin console — user/role management, feature flags, and operational dashboards (admin role required).' },
  advisors:       { base: '/advisors',       purpose: 'Financial advisor directory, verification, and ratings.' },
  ai:             { base: '/ai',             purpose: 'AI/LLM features — insights, NLQ, document intelligence (lazy-loaded).' },
  auth:           { base: '/auth',           purpose: 'Authentication — login, registration, token issuance, device + OTP services (public).' },
  avatars:        { base: '/avatars',        purpose: 'Avatar gallery and user avatar assignment (public assets).' },
  bills:          { base: '/bills',          purpose: 'Secure bill/document uploads with file-type validation (lazy-loaded).' },
  bookings:       { base: '/bookings',       purpose: 'Advisor session bookings.' },
  budgets:        { base: '/budgets',        purpose: 'Budgets and budget-alert thresholds.' },
  categorization: { base: '/categorize',     purpose: 'Transaction auto-categorization and learning (also mounts /learn).' },
  collaboration:  { base: '/collaborations', purpose: 'Unified invitation/notification system across Group Expenses, To-Do Lists, and Goals.' },
  dashboard:      { base: '/dashboard',      purpose: 'Cross-feature dashboard aggregation.' },
  devices:        { base: '/devices',        purpose: 'Device registration and management for multi-device sync.' },
  friends:        { base: '/friends',        purpose: 'Friends list and friend requests.' },
  goals:          { base: '/goals',          purpose: 'Savings goals — CRUD and contribution tracking.' },
  gold:           { base: '/gold',           purpose: 'Gold/precious-metal holdings and live rates.' },
  groups:         { base: '/groups',         purpose: 'Group expenses and shared-expense settlement.' },
  import:         { base: '/import',         purpose: 'Statement/CSV import and smart expense ingestion.' },
  investments:    { base: '/investments',    purpose: 'Investment holdings (stocks, MFs, etc.) and valuation.' },
  loans:          { base: '/loans',          purpose: 'Loans and EMI tracking.' },
  notifications:  { base: '/notifications',  purpose: 'In-app notifications and notification preferences.' },
  otp:            { base: '/otp',            purpose: 'RBI-compliant OTP generation and verification.' },
  payments:       { base: '/payments',       purpose: 'Payment processing and settlement (includes provider webhook).' },
  pin:            { base: '/pin',            purpose: 'App PIN setup and verification.' },
  receipts:       { base: '/receipts',       purpose: 'Receipt OCR scanning and parsing (lazy-loaded).' },
  recurring:      { base: '/recurring',      purpose: 'Recurring transactions and schedules.' },
  sessions:       { base: '/sessions',       purpose: 'Advisor↔client session lifecycle.' },
  settings:       { base: '/settings',       purpose: 'User preferences and app settings.' },
  stocks:         { base: '/stocks',         purpose: 'Public stock/market quotes proxy.' },
  sync:           { base: '/sync',           purpose: 'Offline-first client↔server data synchronization.' },
  tax:            { base: '/tax',            purpose: 'Tax estimation and calculators.' },
  todos:          { base: '/todos',          purpose: 'To-do lists with collaboration/sharing.' },
  transactions:   { base: '/transactions',  purpose: 'Core income/expense transactions — CRUD with feature gates.' },
  voice:          { base: '/voice',          purpose: 'Voice command parsing and voice-driven transaction entry.' },
  webhooks:       { base: '/webhooks',       purpose: 'Inbound webhooks from external providers (e.g. SendGrid) — public.' },
};

const CANONICAL = ['controller', 'service', 'repository', 'validation', 'routes', 'types'];
const LETTER = { controller: 'C', service: 'S', repository: 'D', validation: 'V', routes: 'R', types: 'T' };

function listRouteFiles(dir) {
  return fs.readdirSync(dir).filter((f) => /\.routes\.ts$/.test(f));
}

function extractEndpoints(src, base) {
  const moduleAuth = /router\.use\(\s*authMiddleware/.test(src);
  const re = /router\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]*)['"`]([^\n]*)/g;
  const rows = [];
  let m;
  while ((m = re.exec(src))) {
    const method = m[1].toUpperCase();
    const sub = m[2];
    const rest = m[3] || '';
    const full = (base + (sub === '/' ? '' : sub)) || '/';
    const guards = [];
    if (moduleAuth || /authMiddleware/.test(rest)) guards.push('auth');
    const feat = rest.match(/requireFeature\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]/);
    if (feat) guards.push(`feature:${feat[1]}.${feat[2]}`);
    if (/requireRole|requireAdmin|adminMiddleware/.test(rest)) guards.push('admin');
    if (/validateBody|validateParams|validateQuery/.test(rest)) guards.push('validated');
    // Handler = last by-reference identifier (not a function call, not a known noise token).
    // Catches both `Controller.method` and bare imported `handler` styles.
    const tokens = [];
    const tre = /([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s*(\(?)/g;
    let t;
    while ((t = tre.exec(rest))) {
      if (t[2] === '(') continue; // skip function/middleware-factory calls
      if (/^(req|res|next|process|console|true|false|null|undefined|CACHE_TTL_SECONDS|prefix|ttlSeconds|scope|max|windowMs|message|keyGenerator)\b/.test(t[1])) continue;
      tokens.push(t[1]);
    }
    const handler = tokens.length ? tokens[tokens.length - 1] : '';
    rows.push({ method, full, guards, handler });
  }
  return { moduleAuth, rows };
}

function conformance(files) {
  return CANONICAL.map((kind) => {
    const has = files.some((f) => f.includes(`.${kind}.`));
    return `${has ? '✅' : '—'} ${kind}`;
  }).join(' · ');
}

const modules = fs.readdirSync(MODULES_DIR).filter((d) =>
  fs.statSync(path.join(MODULES_DIR, d)).isDirectory()
);

let generated = 0;
const summary = [];
for (const mod of modules) {
  const dir = path.join(MODULES_DIR, mod);
  const files = fs.readdirSync(dir).filter((f) => fs.statSync(path.join(dir, f)).isFile());
  const meta = META[mod] || { base: `/${mod}`, purpose: '_TODO: describe this module._' };

  const routeFiles = listRouteFiles(dir);
  let endpointTable = '_No HTTP routes (internal/service-only module)._';
  let endpointCount = 0;
  if (routeFiles.length) {
    const all = [];
    let anyAuth = false;
    for (const rf of routeFiles) {
      const { moduleAuth, rows } = extractEndpoints(fs.readFileSync(path.join(dir, rf), 'utf8'), meta.base);
      anyAuth = anyAuth || moduleAuth;
      all.push(...rows);
    }
    endpointCount = all.length;
    if (all.length) {
      endpointTable =
        '| Method | Path | Guards | Handler |\n|---|---|---|---|\n' +
        all
          .map((r) => `| ${r.method} | \`${r.full}\` | ${r.guards.join(', ') || 'public'} | \`${r.handler || '—'}\` |`)
          .join('\n');
    }
  }

  const readme = `# ${mod} module

> ${meta.purpose}

**Base path:** \`/api/v1${meta.base}\`

## Endpoints

${endpointTable}

## Files

${files.map((f) => `- \`${f}\``).join('\n')}

## Canonical-shape conformance

${conformance(files)}

---
_Auto-generated from \`${mod}/*.routes.ts\`. Regenerate with \`node scripts/gen-module-readmes.mjs\`. Edit the purpose line in the generator, not here._
`;

  fs.writeFileSync(path.join(dir, 'README.md'), readme);
  generated += 1;

  const confShort = CANONICAL.filter((k) => files.some((f) => f.includes(`.${k}.`)))
    .map((k) => LETTER[k])
    .join('');
  summary.push({ mod, base: meta.base, purpose: meta.purpose, endpointCount, confShort });
}

// ---- master catalog: backend/src/modules/README.md ----
summary.sort((a, b) => a.mod.localeCompare(b.mod));
const catalogRows = summary
  .map((s) => `| [\`${s.mod}\`](./${s.mod}/README.md) | \`/api/v1${s.base}\` | ${s.endpointCount || '—'} | ${s.confShort} | ${s.purpose} |`)
  .join('\n');

const master = `# Backend modules

The backend is organised as **feature modules** under \`backend/src/modules/<feature>/\`.
Each module owns one domain and is mounted under a base path in [\`../routes/index.ts\`](../routes/index.ts).

## Canonical module shape

| File | Role |
|---|---|
| \`<m>.routes.ts\` | Express router — declares endpoints, wires middleware (auth, validation, feature gates, cache). |
| \`<m>.controller.ts\` | HTTP layer — parses the request, calls the service, shapes the response. No business logic. |
| \`<m>.service.ts\` | Business logic — orchestration, rules, cross-entity coordination. |
| \`<m>.repository.ts\` | Data access — Prisma queries for this domain. (Not every module has one yet.) |
| \`<m>.validation.ts\` | Zod request schemas (the DTO/schema layer) used by \`validateBody\`/\`validateParams\`. |
| \`<m>.types.ts\` | Shared TypeScript types for the module. |
| \`README.md\` | This catalog entry — purpose, endpoints, files, conformance. |

> Convention: keep HTTP concerns in the controller, business rules in the service, and DB access in the
> repository. New modules should follow \`accounts/\` or \`transactions/\` (the most complete examples).

## Conformance legend

The **Shape** column shows which canonical files exist (in order):
**C**ontroller · **S**ervice · **D**ata-access (repository) · **V**alidation · **R**outes · **T**ypes.

## Module catalog

| Module | Base path | Endpoints | Shape | Purpose |
|---|---|---|---|---|
${catalogRows}

---
_Auto-generated by \`scripts/gen-module-readmes.mjs\`. Run \`node scripts/gen-module-readmes.mjs\` after adding/removing routes or modules._
`;

fs.writeFileSync(path.join(MODULES_DIR, 'README.md'), master);

console.log(`Generated ${generated} module READMEs + master catalog.`);
