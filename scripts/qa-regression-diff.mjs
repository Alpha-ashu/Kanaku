#!/usr/bin/env node
/**
 * API regression diff — compares two `qa:api-report` runs and highlights what
 * changed, so a deploy can be gated on "no new failures".
 *
 * Reads the JSON sidecars written by quality/api/runner/run-api-report.mjs
 * (quality/reports/api/api-report-*.json). By default it diffs the two most
 * recent; pass explicit files to compare any two:
 *   node scripts/qa-regression-diff.mjs --base <old.json> --head <new.json>
 *
 * Each endpoint is classified:
 *   NEW FAILURE     was passing/ok, now errors (2xx→non-2xx, or now 5xx/no-conn)
 *   FIXED           was failing, now passes
 *   STATUS CHANGED  status moved but not a clear regression/fix (e.g. 401→403)
 *   NEW ENDPOINT    present only in head
 *   REMOVED         present only in base
 *   UNCHANGED       same status + result
 *
 * Output (quality/reports/api/):
 *   regression-<ts>.xlsx / .md
 * Exit code: 1 when there are NEW FAILURES (so CI/deploy can fail the gate).
 *
 * Run from repo root:  node scripts/qa-regression-diff.mjs   (or npm run qa:regression)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const REPORTS = path.join(ROOT, 'quality', 'reports', 'api');

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, ''));
const argOf = (flag) => { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : null; };
const is2xx = (s) => Number(s) >= 200 && Number(s) < 300;
const isBad = (s) => Number(s) === 0 || Number(s) >= 500;

function pickReports() {
  let base = argOf('--base');
  let head = argOf('--head');
  if (base && head) return { base, head };
  if (!fs.existsSync(REPORTS)) return {};
  const all = fs.readdirSync(REPORTS).filter((f) => /^api-report-.*\.json$/.test(f)).sort();
  if (all.length < 2) return { only: all[0] ? path.join(REPORTS, all[0]) : null };
  return { base: path.join(REPORTS, all[all.length - 2]), head: path.join(REPORTS, all[all.length - 1]) };
}

function index(report) {
  const map = new Map();
  for (const r of report.rows || []) map.set(`${r.method} ${r.endpoint}`, r);
  return map;
}

function classify(base, head) {
  if (!base) return 'NEW ENDPOINT';
  if (!head) return 'REMOVED';
  if (String(base.status) === String(head.status) && base.result === head.result) return 'UNCHANGED';
  const wasOk = is2xx(base.status), nowOk = is2xx(head.status);
  if (head.result === 'SKIP' || base.result === 'SKIP') return 'STATUS CHANGED';
  if (wasOk && !nowOk) return 'NEW FAILURE';
  if (!wasOk && nowOk) return 'FIXED';
  if (!isBad(base.status) && isBad(head.status)) return 'NEW FAILURE';
  if (isBad(base.status) && !isBad(head.status)) return 'FIXED';
  return 'STATUS CHANGED';
}

const ORDER = ['NEW FAILURE', 'STATUS CHANGED', 'REMOVED', 'NEW ENDPOINT', 'FIXED', 'UNCHANGED'];

async function main() {
  const { base, head, only } = pickReports();
  if (!base || !head) {
    console.log(only
      ? `Only one api-report found (${path.relative(ROOT, only)}). Run \`npm run qa:api-report\` again to create a second run to diff against.`
      : 'No api-report-*.json sidecars found. Run `npm run qa:api-report` first.');
    process.exit(0);
  }
  console.log('=== Kanaku API Regression Diff ===');
  console.log(`• base: ${path.relative(ROOT, base)}`);
  console.log(`• head: ${path.relative(ROOT, head)}\n`);

  const baseMap = index(readJson(base));
  const headMap = index(readJson(head));
  const keys = new Set([...baseMap.keys(), ...headMap.keys()]);

  const rows = [];
  for (const k of keys) {
    const b = baseMap.get(k), h = headMap.get(k);
    const change = classify(b, h);
    const ref = h || b;
    rows.push({
      feature: ref.feature, endpoint: ref.endpoint, method: ref.method,
      baseStatus: b ? String(b.status) : '—', headStatus: h ? String(h.status) : '—',
      baseResult: b ? b.result : '—', headResult: h ? h.result : '—', change,
    });
  }
  rows.sort((a, b) => ORDER.indexOf(a.change) - ORDER.indexOf(b.change) || a.feature.localeCompare(b.feature) || a.endpoint.localeCompare(b.endpoint));

  const tally = rows.reduce((m, r) => ((m[r.change] = (m[r.change] || 0) + 1), m), {});
  const newFailures = tally['NEW FAILURE'] || 0;

  await writeOutputs(rows, tally, base, head);

  console.log('\nResult tally:');
  ORDER.forEach((k) => tally[k] && console.log(`  ${k.padEnd(15)} ${tally[k]}`));
  if (newFailures) {
    console.log(`\n✗ ${newFailures} NEW FAILURE(S) — failing the gate.`);
    rows.filter((r) => r.change === 'NEW FAILURE').forEach((r) => console.log(`   ${r.method} ${r.endpoint}: ${r.baseStatus}→${r.headStatus}`));
    process.exit(1);
  }
  console.log('\n✓ No new failures.');
}

async function writeOutputs(rows, tally, base, head) {
  fs.mkdirSync(REPORTS, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Kanaku Regression Diff';
  const sum = wb.addWorksheet('Summary');
  sum.columns = [{ header: 'Metric', key: 'k', width: 22 }, { header: 'Value', key: 'v', width: 64 }];
  sum.getRow(1).font = { bold: true };
  [['Base', path.relative(ROOT, base)], ['Head', path.relative(ROOT, head)],
   ...ORDER.filter((k) => tally[k]).map((k) => [k, tally[k]])].forEach(([k, v]) => sum.addRow({ k, v }));

  const ws = wb.addWorksheet('Diff', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'Change', key: 'change', width: 16 },
    { header: 'Feature', key: 'feature', width: 16 },
    { header: 'Endpoint', key: 'endpoint', width: 46 },
    { header: 'Method', key: 'method', width: 9 },
    { header: 'Base Status', key: 'baseStatus', width: 12 },
    { header: 'Head Status', key: 'headStatus', width: 12 },
    { header: 'Base Result', key: 'baseResult', width: 13 },
    { header: 'Head Result', key: 'headResult', width: 13 },
  ];
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
  const FILL = { 'NEW FAILURE': 'FFF8CBAD', 'STATUS CHANGED': 'FFFFF2CC', 'REMOVED': 'FFFCE4D6', 'NEW ENDPOINT': 'FFDDEBF7', 'FIXED': 'FFE2EFDA', 'UNCHANGED': 'FFFFFFFF' };
  for (const r of rows) {
    const row = ws.addRow(r);
    const f = FILL[r.change];
    if (f) row.getCell('change').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: f } };
  }
  ws.autoFilter = { from: 'A1', to: 'H1' };
  const xlsx = path.join(REPORTS, `regression-${stamp}.xlsx`);
  await wb.xlsx.writeFile(xlsx);

  const md = ['# API Regression Diff', '', `_Generated ${new Date().toISOString()}_`, '',
    `- **base:** \`${path.relative(ROOT, base)}\``, `- **head:** \`${path.relative(ROOT, head)}\``, '',
    '| Change | Count |', '|---|---|',
    ...ORDER.filter((k) => tally[k]).map((k) => `| ${k} | ${tally[k]} |`), ''];
  const interesting = rows.filter((r) => r.change !== 'UNCHANGED');
  if (interesting.length) {
    md.push('## Changes', '', '| Change | Endpoint | Method | Base | Head |', '|---|---|---|---|---|');
    interesting.forEach((r) => md.push(`| ${r.change} | \`${r.endpoint}\` | ${r.method} | ${r.baseStatus} (${r.baseResult}) | ${r.headStatus} (${r.headResult}) |`));
    md.push('');
  } else md.push('_No changes — every endpoint matched the previous run._', '');
  fs.writeFileSync(path.join(REPORTS, `regression-${stamp}.md`), md.join('\n'));

  console.log(`✓ Excel: ${path.relative(ROOT, xlsx)}`);
  console.log(`✓ MD:    ${path.relative(ROOT, path.join(REPORTS, `regression-${stamp}.md`))}`);
}

main().catch((e) => { console.error('Regression diff failed:', e); process.exit(1); });
