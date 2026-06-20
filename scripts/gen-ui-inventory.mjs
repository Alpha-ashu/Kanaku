#!/usr/bin/env node
/**
 * UI Automation Element Inventory generator.
 *
 * Scans every React component under frontend/src and lists every *interactive*
 * UI element (buttons, inputs, dropdowns, checkboxes, radios, tabs, cards,
 * tables, links, search fields, modals/popups, nav items, and any element that
 * carries an onClick/onChange/onSubmit handler). For each element it records the
 * page, a human label, the element type, its `data-testid` (or MISSING), and a
 * Playwright-ready selector.
 *
 * Output (quality/reports/ui/):
 *   automation-element-inventory.xlsx   Page | Element Name | Type | Unique ID | Selector | Status | File | Line
 *   ui-inventory.json                   machine-readable sidecar (for CI / diffing)
 *   ui-gap-report.md                    per-page coverage %, list of untagged elements
 *
 * Every interactive element should have a unique `data-testid`. This report is
 * the single source of truth for how close we are and what's left to tag.
 *
 * Convention (already used across the app): data-testid="<page>-<element>-<action>"
 * e.g. goals-add-goal-button, goals-edit-name-input. Dynamic rows use a template:
 * `goals-edit-button-${goal.id}`.
 *
 * Run from repo root:  node scripts/gen-ui-inventory.mjs   (or npm run qa:ui-inventory)
 *   QA_UI_GLOB   override the source glob (default frontend/src)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import tsMod from 'typescript';

const ts = tsMod.default || tsMod;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, process.env.QA_UI_GLOB || path.join('frontend', 'src'));
const OUT_DIR = path.join(ROOT, 'quality', 'reports', 'ui');

// ─── what counts as an interactive element ───────────────────────────────────
// Native HTML tags that are interactive by definition.
const NATIVE_INTERACTIVE = new Set(['button', 'input', 'select', 'textarea', 'a', 'form', 'option', 'table']);
// Component (capitalised) names that render interactive controls in this app.
const COMPONENT_INTERACTIVE = new Set([
  'Button', 'IconButton', 'Input', 'TextField', 'Textarea', 'Select', 'SelectTrigger',
  'Dropdown', 'SearchableDropdown', 'CategoryDropdown', 'Combobox', 'Checkbox', 'Switch',
  'Toggle', 'RadioGroup', 'Radio', 'RadioGroupItem', 'Tabs', 'TabsTrigger', 'Tab',
  'Card', 'StatCard', 'Table', 'DataTable', 'Link', 'NavLink', 'Modal', 'ModalWrapper',
  'Dialog', 'DialogContent', 'DialogTrigger', 'Popover', 'PopoverTrigger', 'Popup',
  'NotificationPopup', 'Menu', 'MenuItem', 'DropdownMenu', 'DropdownMenuItem', 'Slider',
]);
// Event handlers that make any element interactive (clickable divs, nav items, cards).
const INTERACTIVE_HANDLERS = ['onClick', 'onChange', 'onSubmit', 'onKeyDown', 'onKeyPress'];

// Map a tag (and its attrs) to a friendly element Type for the report.
function elementType(tag, attrs) {
  const lower = tag.toLowerCase();
  if (lower === 'input') {
    const t = (attrs.type || '').toLowerCase();
    if (t === 'checkbox') return 'Checkbox';
    if (t === 'radio') return 'Radio Button';
    if (t === 'search') return 'Search Field';
    if (t === 'submit' || t === 'button') return 'Button';
    return 'Input Field';
  }
  if (lower === 'select') return 'Dropdown';
  if (lower === 'textarea') return 'Textarea';
  if (lower === 'a') return 'Link';
  if (lower === 'button') return 'Button';
  if (lower === 'form') return 'Form';
  if (lower === 'table') return 'Table';
  if (lower === 'option') return 'Option';
  // Components: humanise a couple, otherwise pass through the component name.
  if (/^(SearchableDropdown|CategoryDropdown|Dropdown|Select|Combobox|DropdownMenu)$/.test(tag)) return 'Dropdown';
  if (/Modal|Dialog|Popup|Popover/.test(tag)) return 'Modal';
  if (/Card$/.test(tag)) return 'Card';
  if (/Tab/.test(tag)) return 'Tab';
  if (/Checkbox/.test(tag)) return 'Checkbox';
  if (/Radio/.test(tag)) return 'Radio Button';
  if (/Link|NavLink/.test(tag)) return 'Link';
  if (/Table/.test(tag)) return 'Table';
  if (/Button/.test(tag)) return 'Button';
  return tag; // fallback: the component name itself
}

// ─── file discovery ──────────────────────────────────────────────────────────
function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (/node_modules|\.git|dist|build|coverage/.test(entry.name)) continue;
      walk(full, acc);
    } else if (/\.tsx$/.test(entry.name) && !/\.(test|spec|stories)\.tsx$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

// ─── JSX attribute extraction ────────────────────────────────────────────────
// Returns { static: bool, value: string } for a JSX attribute initializer.
function readAttr(initializer, sf) {
  if (!initializer) return { static: true, value: 'true' }; // bare attribute (e.g. <input disabled />)
  if (ts.isStringLiteral(initializer)) return { static: true, value: initializer.text };
  if (ts.isJsxExpression(initializer) && initializer.expression) {
    const expr = initializer.expression;
    if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
      return { static: true, value: expr.text };
    }
    if (ts.isTemplateExpression(expr)) {
      let out = expr.head.text;
      for (const span of expr.templateSpans) out += '${…}' + span.literal.text;
      return { static: false, value: out }; // e.g. goals-edit-button-${…}
    }
    return { static: false, value: expr.getText(sf) };
  }
  return { static: false, value: initializer.getText(sf) };
}

function collectAttrs(openingLike, sf) {
  const attrs = {};
  const props = openingLike.attributes?.properties || [];
  for (const prop of props) {
    if (!ts.isJsxAttribute(prop)) continue; // skip spread {...props}
    const name = prop.name.getText(sf);
    attrs[name] = readAttr(prop.initializer, sf);
  }
  return attrs;
}

// First meaningful text child of a JSX element → used as a label for buttons/links.
function textOf(node, sf) {
  if (!node.children) return '';
  const parts = [];
  for (const child of node.children) {
    if (ts.isJsxText(child)) {
      const t = child.text.replace(/\s+/g, ' ').trim();
      if (t) parts.push(t);
    } else if (ts.isJsxExpression(child) && child.expression && ts.isStringLiteral(child.expression)) {
      parts.push(child.expression.text);
    }
    if (parts.join(' ').length > 40) break;
  }
  return parts.join(' ').slice(0, 60).trim();
}

function labelFor(attrs, text) {
  const pick = (k) => attrs[k] && attrs[k].value && attrs[k].value !== 'true' ? attrs[k].value : '';
  return (
    pick('aria-label') || pick('placeholder') || pick('name') || pick('title') ||
    text || pick('alt') || '(unlabeled)'
  ).replace(/\$\{…\}/g, '*').slice(0, 80);
}

function selectorFor(testid) {
  if (!testid) return '';
  if (testid.static) return `[data-testid='${testid.value}']`;
  // Dynamic testid → prefix selector on the literal head before the first ${…}.
  const head = testid.value.split('${…}')[0].replace(/-+$/, '');
  return head ? `[data-testid^='${head}']` : '(dynamic data-testid)';
}

// ─── per-file scan ───────────────────────────────────────────────────────────
// Names imported from icon libraries collide with our interactive component set
// (lucide's <Menu>, <Link>, <Table> are icons, not controls). Collect them so we
// can ignore them — unless they carry their own click handler (clickable icon).
function iconImports(sf) {
  const names = new Set();
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    if (!/lucide-react|react-icons|@heroicons/.test(st.moduleSpecifier.text)) continue;
    const named = st.importClause?.namedBindings;
    if (named && ts.isNamedImports(named)) for (const el of named.elements) names.add(el.name.text);
  }
  return names;
}

function scanFile(file) {
  const text = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, /*setParentNodes*/ true, ts.ScriptKind.TSX);
  const page = path.basename(file).replace(/\.tsx$/, '');
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const icons = iconImports(sf);
  const rows = [];

  const visit = (node) => {
    let openingLike = null;
    let container = null; // the JsxElement (for text children) when not self-closing
    if (ts.isJsxSelfClosingElement(node)) openingLike = node;
    else if (ts.isJsxElement(node)) { openingLike = node.openingElement; container = node; }

    if (openingLike) {
      const tag = openingLike.tagName.getText(sf);
      const attrs = collectAttrs(openingLike, sf);
      const hasHandler = INTERACTIVE_HANDLERS.some((h) => h in attrs);
      const hasRole = 'role' in attrs;
      const isNative = NATIVE_INTERACTIVE.has(tag.toLowerCase());
      // An icon import only counts when it has its own handler (clickable icon).
      const isComponent = COMPONENT_INTERACTIVE.has(tag) && !icons.has(tag);

      if (isNative || isComponent || hasHandler || hasRole) {
        const testid = attrs['data-testid'];
        const text = container ? textOf(container, sf) : '';
        let type = elementType(tag, { type: attrs.type?.value });
        if (!isNative && !isComponent && (hasHandler || hasRole)) {
          // clickable div/span/li etc. — keep the tag but flag it.
          type = `${tag}${hasRole ? ` (role=${attrs.role.value})` : ' (clickable)'}`;
        }
        const line = sf.getLineAndCharacterOfPosition(openingLike.getStart(sf)).line + 1;
        rows.push({
          page,
          file: rel,
          line,
          tag,
          type,
          name: labelFor(attrs, text),
          uniqueId: testid ? testid.value : 'MISSING',
          dynamic: testid ? !testid.static : false,
          selector: testid ? selectorFor(testid) : '',
          status: testid ? 'HAS ID' : 'MISSING',
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return rows;
}

// ─── Excel ───────────────────────────────────────────────────────────────────
async function writeWorkbook(rows, pageStats, totals) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Kanaku UI Inventory';
  wb.created = new Date();

  // Summary sheet
  const sum = wb.addWorksheet('Summary');
  sum.columns = [{ header: 'Metric', key: 'k', width: 34 }, { header: 'Value', key: 'v', width: 60 }];
  sum.getRow(1).font = { bold: true };
  [
    ['Generated', new Date().toISOString()],
    ['Source', path.relative(ROOT, SRC_DIR).replace(/\\/g, '/')],
    ['Files scanned', totals.files],
    ['Interactive elements', totals.elements],
    ['With data-testid', totals.tagged],
    ['Missing data-testid', totals.missing],
    ['Coverage %', totals.elements ? `${((totals.tagged / totals.elements) * 100).toFixed(1)}%` : 'n/a'],
  ].forEach(([k, v]) => sum.addRow({ k, v }));
  sum.addRow({});
  sum.addRow({ k: '— Per-page coverage —', v: '' }).font = { bold: true };
  Object.values(pageStats)
    .sort((a, b) => b.missing - a.missing)
    .forEach((p) => sum.addRow({ k: p.page, v: `${p.tagged}/${p.total} tagged (${((p.tagged / p.total) * 100).toFixed(0)}%), ${p.missing} missing` }));

  // Inventory sheet — requested columns first, then dev-helper columns.
  const ws = wb.addWorksheet('Inventory', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'Page', key: 'page', width: 22 },
    { header: 'Element Name', key: 'name', width: 34 },
    { header: 'Type', key: 'type', width: 20 },
    { header: 'Unique ID', key: 'uniqueId', width: 38 },
    { header: 'Selector', key: 'selector', width: 38 },
    { header: 'Status', key: 'status', width: 11 },
    { header: 'File', key: 'file', width: 50 },
    { header: 'Line', key: 'line', width: 7 },
  ];
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
  header.height = 22;

  for (const r of rows) {
    const row = ws.addRow(r);
    row.alignment = { vertical: 'top', wrapText: true };
    const fill = r.status === 'MISSING' ? 'FFF8CBAD' : 'FFE2EFDA';
    row.getCell('status').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
    row.getCell('uniqueId').font = { name: 'Consolas', size: 9 };
    row.getCell('selector').font = { name: 'Consolas', size: 9 };
  }
  ws.autoFilter = { from: 'A1', to: 'H1' };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const xlsx = path.join(OUT_DIR, 'automation-element-inventory.xlsx');
  await wb.xlsx.writeFile(xlsx);
  return xlsx;
}

// ─── gap report (markdown) ───────────────────────────────────────────────────
function writeGapReport(rows, pageStats, totals) {
  const lines = [];
  lines.push('# UI Automation — Gap Report', '');
  lines.push(`_Generated ${new Date().toISOString()} from \`${path.relative(ROOT, SRC_DIR).replace(/\\/g, '/')}\`_`, '');
  lines.push(`**${totals.tagged}/${totals.elements}** interactive elements have a \`data-testid\` ` +
    `(**${totals.elements ? ((totals.tagged / totals.elements) * 100).toFixed(1) : 0}%** coverage) across ${totals.files} files. ` +
    `**${totals.missing}** still need one.`, '');
  lines.push('## Per-page coverage (most gaps first)', '');
  lines.push('| Page | Tagged | Total | Coverage | Missing |', '|---|---|---|---|---|');
  Object.values(pageStats)
    .sort((a, b) => b.missing - a.missing)
    .forEach((p) => lines.push(`| ${p.page} | ${p.tagged} | ${p.total} | ${((p.tagged / p.total) * 100).toFixed(0)}% | ${p.missing} |`));
  lines.push('', '## Untagged elements to fix', '');
  const missing = rows.filter((r) => r.status === 'MISSING');
  let lastPage = '';
  for (const r of missing) {
    if (r.page !== lastPage) { lines.push('', `### ${r.page}`, ''); lastPage = r.page; }
    lines.push(`- **${r.type}** "${r.name}" — \`${r.file}:${r.line}\``);
  }
  lines.push('');
  const md = path.join(OUT_DIR, 'ui-gap-report.md');
  fs.writeFileSync(md, lines.join('\n'));
  return md;
}

// ─── main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== Kanaku UI Element Inventory ===');
  if (!fs.existsSync(SRC_DIR)) { console.error(`Source dir not found: ${SRC_DIR}`); process.exit(1); }
  const files = walk(SRC_DIR);
  console.log(`• Scanning ${files.length} .tsx files …`);

  let rows = [];
  for (const f of files) {
    try { rows = rows.concat(scanFile(f)); }
    catch (e) { console.warn(`  ⚠ parse failed for ${path.relative(ROOT, f)}: ${e.message}`); }
  }
  // Sort: page, then missing-first so gaps surface, then by line.
  rows.sort((a, b) => a.page.localeCompare(b.page) || a.status.localeCompare(b.status) || a.line - b.line);

  const pageStats = {};
  for (const r of rows) {
    const p = (pageStats[r.page] ||= { page: r.page, total: 0, tagged: 0, missing: 0 });
    p.total++;
    if (r.status === 'HAS ID') p.tagged++; else p.missing++;
  }
  const totals = {
    files: files.length,
    elements: rows.length,
    tagged: rows.filter((r) => r.status === 'HAS ID').length,
    missing: rows.filter((r) => r.status === 'MISSING').length,
  };

  const xlsx = await writeWorkbook(rows, pageStats, totals);
  const md = writeGapReport(rows, pageStats, totals);
  const json = path.join(OUT_DIR, 'ui-inventory.json');
  fs.writeFileSync(json, JSON.stringify({ generatedAt: new Date().toISOString(), totals, pageStats, rows }, null, 2));

  console.log(`\n✓ ${totals.elements} interactive elements (${totals.tagged} tagged, ${totals.missing} missing) — ${totals.elements ? ((totals.tagged / totals.elements) * 100).toFixed(1) : 0}% coverage`);
  console.log(`✓ Excel:  ${path.relative(ROOT, xlsx)}`);
  console.log(`✓ JSON:   ${path.relative(ROOT, json)}`);
  console.log(`✓ Gaps:   ${path.relative(ROOT, md)}`);
}

main().catch((e) => { console.error('UI inventory failed:', e); process.exit(1); });
