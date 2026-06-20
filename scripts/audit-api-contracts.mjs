#!/usr/bin/env node
/**
 * API contract completeness auditor (the "feature matrix").
 *
 * Walks every contract under docs/api/contracts/<feature>/<action>.api.json and
 * scores how complete each one is, flagging the gaps that make the
 * expected-vs-actual validation in `npm run qa:api-report` weaker than it should
 * be (empty request bodies, missing/expected response shapes, TODO descriptions).
 *
 * Output (quality/reports/api/):
 *   contract-completeness.xlsx   Feature | Endpoint | Method | Auth | Score | Missing | File
 *   contract-completeness.md     same, plus per-feature rollup
 *
 * --write-expected   Backfill each contract's success-response body from the most
 *                    recent api-report-*.json sidecar (ACTUAL 2xx responses become
 *                    the documented EXPECTED shape) — ONLY where the contract's
 *                    success body is currently empty. Hand-authored bodies are kept.
 *
 * Run from repo root:  node scripts/audit-api-contracts.mjs [--write-expected]
 *                      (or npm run qa:contract-audit)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONTRACTS = path.join(ROOT, 'docs', 'api', 'contracts');
const REPORTS = path.join(ROOT, 'quality', 'reports', 'api');
const WRITE_EXPECTED = process.argv.includes('--write-expected');

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, ''));
const isEmpty = (o) => !o || (typeof o === 'object' && Object.keys(o).length === 0);
const norm = (p) => p.replace(/[:{][^/}]+}?/g, '{}'); // /accounts/:id → /accounts/{}

// ─── discover contracts ──────────────────────────────────────────────────────
function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (/\.api\.json$/.test(entry.name) && entry.name !== '_template.api.json') acc.push(full);
  }
  return acc;
}

// ─── completeness checks ─────────────────────────────────────────────────────
// Each returns true when the field is considered COMPLETE.
function evaluate(c) {
  const method = (c.method || '').toUpperCase();
  const isWrite = ['POST', 'PUT', 'PATCH'].includes(method);
  const hasPathParams = /[:{]/.test(c.endpoint || '');
  const successKey = Object.keys(c.responses || {}).find((k) => /^2\d\d$/.test(k));
  const successBody = successKey ? c.responses[successKey].body : undefined;

  const checks = {
    'description': !!c.description && !/^TODO/i.test(c.description),
    'auth': !!c.auth,
    'implementation': !isEmpty(c.implementation),
    'request.body': !isWrite || !isEmpty(c.request?.body),
    'path params': !hasPathParams || !isEmpty(c.request?.params),
    'expected response': !!successKey && !isEmpty(successBody),
    'error responses': Object.keys(c.responses || {}).some((k) => /^[45]\d\d$/.test(k)),
  };
  const missing = Object.entries(checks).filter(([, ok]) => !ok).map(([k]) => k);
  const score = Math.round(((Object.keys(checks).length - missing.length) / Object.keys(checks).length) * 100);
  return { score, missing, successKey };
}

// ─── latest api-report sidecar → actual 2xx responses ────────────────────────
function loadActualResponses() {
  if (!fs.existsSync(REPORTS)) return null;
  const sidecars = fs.readdirSync(REPORTS).filter((f) => /^api-report-.*\.json$/.test(f)).sort();
  if (!sidecars.length) return null;
  const latest = path.join(REPORTS, sidecars[sidecars.length - 1]);
  const data = readJson(latest);
  const map = {};
  for (const r of data.rows || []) {
    if (!/^2\d\d$/.test(String(r.status))) continue;
    let body; try { body = JSON.parse(r.response); } catch { continue; }
    if (body && typeof body === 'object') map[`${r.method} ${norm(r.endpoint)}`] = { status: r.status, body };
  }
  return { file: latest, map };
}

// ─── main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== Kanaku API Contract Auditor ===');
  const files = walk(CONTRACTS);
  console.log(`• Auditing ${files.length} contracts …`);

  const actual = WRITE_EXPECTED ? loadActualResponses() : null;
  if (WRITE_EXPECTED) {
    if (!actual) console.warn('  ⚠ --write-expected: no api-report-*.json found — run `npm run qa:api-report` first. Skipping backfill.');
    else console.log(`  • Backfilling expected responses from ${path.relative(ROOT, actual.file)} (${Object.keys(actual.map).length} 2xx samples)`);
  }

  const rows = [];
  let backfilled = 0;
  for (const file of files) {
    let c; try { c = readJson(file); } catch (e) { console.warn(`  ⚠ bad JSON ${path.relative(ROOT, file)}: ${e.message}`); continue; }

    // Optional backfill BEFORE scoring, so the report reflects the new state.
    if (WRITE_EXPECTED && actual) {
      const key = `${(c.method || '').toUpperCase()} ${norm(c.endpoint || '')}`;
      const sample = actual.map[key];
      const successKey = Object.keys(c.responses || {}).find((k) => /^2\d\d$/.test(k));
      const successBody = successKey ? c.responses[successKey].body : undefined;
      // Only fill when empty (preserve hand-authored bodies). Skip auto-stub contracts
      // only if they already have a non-empty body — emptiness is the gate, not provenance.
      if (sample && isEmpty(successBody)) {
        c.responses ||= {};
        const k = successKey || String(sample.status);
        c.responses[k] = { description: c.responses[k]?.description || 'Success (captured from a live api-report run)', body: sample.body };
        if (c.generator) c.generator.expectedBackfilledAt = new Date().toISOString().slice(0, 10);
        fs.writeFileSync(file, JSON.stringify(c, null, 2) + '\n');
        backfilled++;
      }
    }

    const { score, missing } = evaluate(c);
    rows.push({
      feature: c.feature || path.basename(path.dirname(file)),
      endpoint: c.endpoint || '',
      method: (c.method || '').toUpperCase(),
      auth: c.auth || '',
      score,
      missing: missing.join(', ') || '—',
      file: path.relative(ROOT, file).replace(/\\/g, '/'),
    });
  }
  if (WRITE_EXPECTED && actual) console.log(`  ✓ Backfilled expected responses into ${backfilled} contracts.`);

  rows.sort((a, b) => a.score - b.score || a.feature.localeCompare(b.feature) || a.endpoint.localeCompare(b.endpoint));
  await writeOutputs(rows);

  const complete = rows.filter((r) => r.score === 100).length;
  console.log(`\n✓ ${rows.length} contracts audited — ${complete} complete (100%), ${rows.length - complete} with gaps.`);
}

async function writeOutputs(rows) {
  fs.mkdirSync(REPORTS, { recursive: true });

  // ── Excel ──
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Kanaku Contract Auditor';
  const byFeature = {};
  for (const r of rows) (byFeature[r.feature] ||= []).push(r);

  const sum = wb.addWorksheet('Summary');
  sum.columns = [{ header: 'Feature', key: 'f', width: 22 }, { header: 'Contracts', key: 'n', width: 11 }, { header: 'Avg score', key: 's', width: 11 }, { header: 'Complete', key: 'c', width: 11 }];
  sum.getRow(1).font = { bold: true };
  Object.entries(byFeature).sort().forEach(([f, rs]) => {
    const avg = Math.round(rs.reduce((a, r) => a + r.score, 0) / rs.length);
    sum.addRow({ f, n: rs.length, s: `${avg}%`, c: `${rs.filter((r) => r.score === 100).length}/${rs.length}` });
  });

  const ws = wb.addWorksheet('Contracts', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'Feature', key: 'feature', width: 16 },
    { header: 'Endpoint', key: 'endpoint', width: 46 },
    { header: 'Method', key: 'method', width: 9 },
    { header: 'Auth', key: 'auth', width: 12 },
    { header: 'Score', key: 'score', width: 8 },
    { header: 'Missing fields', key: 'missing', width: 52 },
    { header: 'File', key: 'file', width: 52 },
  ];
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
  for (const r of rows) {
    const row = ws.addRow(r);
    row.alignment = { vertical: 'top', wrapText: true };
    const fill = r.score === 100 ? 'FFE2EFDA' : r.score >= 70 ? 'FFFFF2CC' : 'FFF8CBAD';
    row.getCell('score').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
  }
  ws.autoFilter = { from: 'A1', to: 'G1' };
  const xlsx = path.join(REPORTS, 'contract-completeness.xlsx');
  await wb.xlsx.writeFile(xlsx);

  // ── Markdown ──
  const md = [];
  md.push('# API Contract Completeness', '');
  md.push(`_Generated ${new Date().toISOString()}_`, '');
  const complete = rows.filter((r) => r.score === 100).length;
  md.push(`**${complete}/${rows.length}** contracts are complete. Gaps below weaken the expected-vs-actual check in \`qa:api-report\` — fill them (or run \`--write-expected\` after an api-report to backfill response shapes).`, '');
  md.push('## Per-feature', '', '| Feature | Contracts | Avg score | Complete |', '|---|---|---|---|');
  Object.entries(byFeature).sort().forEach(([f, rs]) => {
    const avg = Math.round(rs.reduce((a, r) => a + r.score, 0) / rs.length);
    md.push(`| ${f} | ${rs.length} | ${avg}% | ${rs.filter((r) => r.score === 100).length}/${rs.length} |`);
  });
  md.push('', '## Contracts with gaps (lowest score first)', '', '| Endpoint | Method | Score | Missing |', '|---|---|---|---|');
  rows.filter((r) => r.score < 100).forEach((r) => md.push(`| \`${r.endpoint}\` | ${r.method} | ${r.score}% | ${r.missing} |`));
  md.push('');
  fs.writeFileSync(path.join(REPORTS, 'contract-completeness.md'), md.join('\n'));

  console.log(`✓ Excel: ${path.relative(ROOT, xlsx)}`);
  console.log(`✓ MD:    ${path.relative(ROOT, path.join(REPORTS, 'contract-completeness.md'))}`);
}

main().catch((e) => { console.error('Auditor failed:', e); process.exit(1); });
