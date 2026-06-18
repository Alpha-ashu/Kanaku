#!/usr/bin/env node
// Generates browsable, in-repo catalogs:
//   platform/database/docs/SCHEMA.md   Ã¢â€ Â parsed from backend/prisma/schema.prisma (source of truth)
//   database/docs/README.md   Ã¢â€ Â Ã‚Â§4 database-visibility map
//   quality/api/API_CATALOG.md Ã¢â€ Â aggregated from the per-module READMEs (Phase 2)
//   api-testing/README.md     Ã¢â€ Â Ã‚Â§7 map + live OpenAPI + import instructions
// Run from repo root: `node scripts/gen-catalogs.mjs`
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SCHEMA = path.join(ROOT, 'backend/prisma/schema.prisma');
const MODULES = path.join(ROOT, 'backend/src/modules');

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ DATABASE CATALOG (Ã‚Â§4) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
const schemaSrc = fs.readFileSync(SCHEMA, 'utf8');
const modelNames = new Set([...schemaSrc.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]));
const SCALAR = (t) => !modelNames.has(t.replace(/[\[\]?]/g, ''));

const models = [];
const modelRe = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
let mm;
while ((mm = modelRe.exec(schemaSrc))) {
  const name = mm[1];
  const body = mm[2];
  const fields = [];
  const relations = [];
  const indexes = [];
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('//')) continue;
    if (line.startsWith('@@')) {
      const idx = line.match(/@@(index|unique|id)\(([^)]*)\)/);
      if (idx) indexes.push(`${idx[1]}(${idx[2]})`);
      continue;
    }
    const fm = line.match(/^(\w+)\s+([\w\[\]?]+)(.*)$/);
    if (!fm) continue;
    const [, fname, ftype, restRaw] = fm;
    const rest = restRaw.replace(/\/\/.*$/, '').trim();
    if (SCALAR(ftype)) {
      const attrs = [];
      if (/@id\b/.test(rest)) attrs.push('PK');
      if (/@unique\b/.test(rest)) attrs.push('unique');
      const def = rest.match(/@default\(([^()]*(?:\([^()]*\))?[^()]*)\)/);
      if (def) attrs.push(`default ${def[1]}`);
      if (/@updatedAt\b/.test(rest)) attrs.push('auto-updated');
      const db = rest.match(/@db\.(\w+(?:\([^)]*\))?)/);
      if (db) attrs.push(db[1]);
      fields.push({ fname, ftype, attrs: attrs.join(', ') });
    } else {
      const rel = rest.match(/@relation\(([^)]*)\)/);
      relations.push(`\`${fname}\` Ã¢â€ â€™ **${ftype}**${rel ? ` (${rel[1].replace(/"/g, '')})` : ''}`);
    }
  }
  models.push({ name, fields, relations, indexes });
}
models.sort((a, b) => a.name.localeCompare(b.name));

const dbSections = models
  .map((m) => {
    const fieldRows = m.fields
      .map((f) => `| \`${f.fname}\` | \`${f.ftype}\` | ${f.attrs || ''} |`)
      .join('\n');
    const rel = m.relations.length ? m.relations.map((r) => `- ${r}`).join('\n') : '_None._';
    const idx = m.indexes.length ? m.indexes.map((i) => `\`${i}\``).join(' Ã‚Â· ') : '_None._';
    return `### ${m.name}

| Column | Type | Attributes |
|---|---|---|
${fieldRows}

**Relations:**
${rel}

**Indexes / constraints:** ${idx}
`;
  })
  .join('\n---\n\n');

const dbToc = models.map((m) => `[\`${m.name}\`](#${m.name.toLowerCase()})`).join(' Ã‚Â· ');

const schemaMd = `# Database schema catalog

Auto-generated from [\`backend/prisma/schema.prisma\`](../../backend/prisma/schema.prisma)
Ã¢â‚¬â€ the **single source of truth** (PostgreSQL via Prisma). ${models.length} models.

> Regenerate with \`npm run docs:catalogs\`. Edit the Prisma schema, not this file.

**Models:** ${dbToc}

---

${dbSections}`;

fs.mkdirSync(path.join(ROOT, 'platform/database/docs'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'platform/platform/database/docs/SCHEMA.md'), schemaMd);

const dbReadme = `# database/

Database visibility for KANAKU (PostgreSQL via Prisma + Supabase).

## Source of truth & layout

| Concern | Location |
|---|---|
| **Schema (source of truth)** | [\`backend/prisma/schema.prisma\`](../backend/prisma/schema.prisma) (${models.length} models) |
| **Schema catalog (browsable)** | [\`docs/SCHEMA.md\`](./docs/SCHEMA.md) Ã¢â‚¬â€ generated |
| **Migrations (Prisma)** | [\`backend/prisma/migrations/\`](../backend/prisma/migrations/) |
| **Migrations / functions (Supabase)** | [\`supabase/migrations/\`](../supabase/migrations/), [\`supabase/functions/\`](../supabase/functions/) |
| **Legacy SQL** | \`init.sql\`, \`ai_schema.sql\`, \`supabase_schema.sql\`, \`models.js\` (here) |

## Ã‚Â§4 mapping

| Ã‚Â§4 concept | Where |
|---|---|
| schemas/ | Prisma models Ã¢â€ â€™ \`docs/SCHEMA.md\` (per-model tables, columns, relations, indexes) |
| migrations/ | \`backend/prisma/migrations/\`, \`supabase/migrations/\` |
| functions/ / triggers/ | \`supabase/functions/\`; triggers in SQL migrations (e.g. balance trigger on Account) |
| policies/ (RLS) | Supabase RLS Ã¢â‚¬â€ see [[security]] / Phase 8 Supabase review |
| seeds/ | \`backend/scripts/seed-*.cjs\` |
| docs/ | \`docs/SCHEMA.md\` (this catalog) |

**Gap:** RLS policies and DB functions/triggers are not yet centrally documented here Ã¢â‚¬â€ covered in the Phase 8 Supabase review.
`;
fs.writeFileSync(path.join(ROOT, 'platform/database/docs/README.md'), dbReadme);

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ API CATALOG (Ã‚Â§7) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// Aggregate the per-module READMEs (Phase 2) Ã¢â‚¬â€ single source for endpoints.
const moduleDirs = fs
  .readdirSync(MODULES, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

let totalEndpoints = 0;
const apiSections = [];
for (const mod of moduleDirs) {
  const readme = path.join(MODULES, mod, 'README.md');
  if (!fs.existsSync(readme)) continue;
  const txt = fs.readFileSync(readme, 'utf8');
  const purpose = (txt.match(/^>\s*(.+)$/m) || [])[1] || '';
  const base = (txt.match(/\*\*Base path:\*\*\s*`([^`]+)`/) || [])[1] || `/api/v1/${mod}`;
  const endpointsBlock = (txt.split('## Endpoints')[1] || '').split('## Files')[0] || '';
  const rows = endpointsBlock.split('\n').filter((l) => /^\|\s*(GET|POST|PUT|PATCH|DELETE)\b/.test(l.trim()));
  totalEndpoints += rows.length;
  if (!rows.length) continue;
  apiSections.push(
    `### \`${mod}\` Ã¢â‚¬â€ \`${base}\`\n\n${purpose}\n\n| Method | Path | Guards | Handler |\n|---|---|---|---|\n${rows.join('\n')}\n`
  );
}

const apiCatalog = `# API catalog

All HTTP endpoints, by feature module Ã¢â‚¬â€ aggregated from the per-module READMEs
(\`backend/src/modules/*/README.md\`). **${totalEndpoints} endpoints** across
${apiSections.length} modules. Base prefix: \`/api/v1\`.

> Regenerate with \`npm run docs:catalogs\`. For a machine-readable spec, use the
> live OpenAPI document (see [README](./README.md)).

---

${apiSections.join('\n---\n\n')}`;

fs.mkdirSync(path.join(ROOT, 'quality/api'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'quality/api/API_CATALOG.md'), apiCatalog);

const apiReadme = `# api-testing/

Centralized API visibility for KANAKU.

## Contents

| File | What |
|---|---|
| [\`API_CATALOG.md\`](./API_CATALOG.md) | Every endpoint by feature (method, path, guards, handler) Ã¢â‚¬â€ generated |

## Live, machine-readable spec

The backend serves an OpenAPI document and a testing guide (generated from the
running app Ã¢â‚¬â€ always current):

- \`GET /api-docs/openapi.json\` Ã¢â‚¬â€ OpenAPI 3 spec
- \`GET /api-docs/testing-guide\` Ã¢â‚¬â€ Markdown testing guide
- \`GET /api-docs\` Ã¢â‚¬â€ index

Source: [\`backend/src/docs/api-docs.ts\`](../backend/src/docs/api-docs.ts).

## Import into a client

- **Postman / Insomnia / Bruno:** Import Ã¢â€ â€™ URL Ã¢â€ â€™ \`https://<host>/api-docs/openapi.json\`
  (or \`http://localhost:3000/api-docs/openapi.json\` in dev).
- **Swagger UI:** point it at the same \`openapi.json\`.

## Auth

Most endpoints require \`Authorization: Bearer <accessToken>\`. Obtain tokens via
\`POST /api/v1/auth/login\`; refresh via \`POST /api/v1/auth/refresh\` (send the
refresh token in the \`x-refresh-token\` header). See
[\`backend/src/modules/auth/README.md\`](../backend/src/modules/auth/README.md).

## Suggested layout for saved collections

\`\`\`
api-testing/
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ API_CATALOG.md
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ collections/        # exported Postman/Bruno/Insomnia collections
Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ <feature>/          # per-feature saved requests (accounts, transactions, Ã¢â‚¬Â¦)
\`\`\`
`;
fs.writeFileSync(path.join(ROOT, 'quality/api/README.md'), apiReadme);

console.log(`Generated platform/database/docs/SCHEMA.md (${models.length} models) + README, and quality/api/API_CATALOG.md (${totalEndpoints} endpoints) + README.`);
