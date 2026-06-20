#!/usr/bin/env node
/**
 * UI test-id auto-tagger (codemod).
 *
 * Injects a unique `data-testid` on every interactive element that is missing one,
 * so `npm run qa:ui-inventory` can reach ~100% coverage. Mirrors the element
 * predicate in gen-ui-inventory.mjs.
 *
 * Safe by construction:
 *  - Only tags elements that ACCEPT a data-testid prop: intrinsic HTML tags
 *    (button, input, div, span, a, …), framer `motion.*`, and the local
 *    prop-forwarding components in FORWARDING (Card, Button). Anything else
 *    (custom components) is left untouched and reported, so the build never breaks.
 *  - Elements rendered inside `.map(…)` get a DYNAMIC id that includes the row's
 *    key / index expression, so every row is unique at runtime (no Playwright
 *    strict-mode collisions). Non-mapped elements get a stable static id.
 *  - Never touches an element that already has data-testid.
 *
 * Usage:  node scripts/fix-ui-testids.mjs [--dry] [--only <substr>]
 *         npm run qa:ui-fix
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tsMod from 'typescript';

const ts = tsMod.default || tsMod;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'frontend', 'src');
const DRY = process.argv.includes('--dry');
const ONLY = (() => { const i = process.argv.indexOf('--only'); return i >= 0 ? process.argv[i + 1] : ''; })();

const NATIVE_INTERACTIVE = new Set(['button', 'input', 'select', 'textarea', 'a', 'form', 'option', 'table']);
const COMPONENT_INTERACTIVE = new Set([
  'Button', 'IconButton', 'Input', 'TextField', 'Textarea', 'Select', 'SelectTrigger',
  'Dropdown', 'SearchableDropdown', 'CategoryDropdown', 'Combobox', 'Checkbox', 'Switch',
  'Toggle', 'RadioGroup', 'Radio', 'RadioGroupItem', 'Tabs', 'TabsTrigger', 'Tab',
  'Card', 'StatCard', 'Table', 'DataTable', 'Link', 'NavLink', 'Modal', 'ModalWrapper',
  'Dialog', 'DialogContent', 'DialogTrigger', 'Popover', 'PopoverTrigger', 'Popup',
  'NotificationPopup', 'Menu', 'MenuItem', 'DropdownMenu', 'DropdownMenuItem', 'Slider',
]);
const INTERACTIVE_HANDLERS = ['onClick', 'onChange', 'onSubmit', 'onKeyDown', 'onKeyPress'];
// Local/3rd-party components known to forward HTML props to their root DOM node
// (they spread {...props} or extend HTML attribute types) → safe to inject data-testid.
const FORWARDING = new Set(['Card', 'Button', 'StatCard', 'Input', 'Textarea', 'Table', 'Dialog', 'DialogContent', 'Select', 'SelectTrigger', 'Badge']);
// Components that expose a custom test-id prop name instead of `data-testid`.
const TESTID_PROP = { SearchableDropdown: 'testId', CategoryDropdown: 'testId', TimeFilter: 'testId', SelectionCard: 'testId' };
// Logical / composite wrappers that DON'T render their own DOM leaf (they return a
// fragment or compose other components/inputs whose interactive DOM is already
// tagged inside their own definition file). Tagging the usage would double-count,
// so they are neither tagged nor counted.
const EXCLUDE = new Set([
  'FeatureVisibility', 'FeatureGate', 'SignInForm', 'SignUpForm', 'ActionButtons', 'PreviewView', 'ResultsView',
  // field wrappers (each wraps a tagged <input>) + asset forms, defined in ReceiptScannerViews / wealth-vault
  'AmountField', 'TextField', 'NumberField', 'DateField', 'SelectField', 'SubcategoryField', 'AccountSelector',
  'PhysicalAssetForm', 'RealEstateForm', 'BusinessForm',
  // composites whose interactive buttons/rows are tagged in their definition
  'SegmentedTabs', 'ModalWrapper', 'StockRow', 'NotificationPopup',
]);
const testIdAttr = (tag) => TESTID_PROP[tag] || 'data-testid';
const acceptsTestId = (tag) =>
  /^[a-z]/.test(tag) || /^motion\./.test(tag) || FORWARDING.has(tag) || tag in TESTID_PROP;

// ── slug helpers ──────────────────────────────────────────────────────────────
const slug = (s) => (s || '')
  .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
  .toLowerCase()
  .replace(/\$\{[^}]*\}/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .split('-').slice(0, 4).join('-');

const typeSlug = (tag, attrs) => {
  const t = tag.toLowerCase();
  if (t === 'input') {
    const ty = (attrs.type || '').toLowerCase();
    if (ty === 'checkbox') return 'checkbox';
    if (ty === 'radio') return 'radio';
    if (ty === 'search') return 'search';
    return 'input';
  }
  if (t === 'a') return 'link';
  if (t === 'select') return 'select';
  if (t === 'textarea') return 'textarea';
  if (/card/i.test(tag)) return 'card';
  if (/button/i.test(tag)) return 'button';
  return slug(tag.replace(/^motion\./, '')) || 'el';
};

const iconImports = (sf) => {
  const names = new Set();
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    if (!/lucide-react|react-icons|@heroicons/.test(st.moduleSpecifier.text)) continue;
    const nb = st.importClause?.namedBindings;
    if (nb && ts.isNamedImports(nb)) for (const el of nb.elements) names.add(el.name.text);
  }
  return names;
};

const attrText = (init, sf) => {
  if (!init) return 'true';
  if (ts.isStringLiteral(init)) return init.text;
  if (ts.isJsxExpression(init) && init.expression) {
    const e = init.expression;
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text;
    return e.getText(sf);
  }
  return init.getText(sf);
};

const getAttrs = (opening, sf) => {
  const a = {};
  for (const p of opening.attributes?.properties || []) {
    if (ts.isJsxAttribute(p)) a[p.name.getText(sf)] = attrText(p.initializer, sf);
  }
  return a;
};

const labelOf = (opening, container, sf, attrs) => {
  const pick = (k) => attrs[k] && attrs[k] !== 'true' ? attrs[k] : '';
  let text = '';
  if (container?.children) {
    for (const c of container.children) {
      if (ts.isJsxText(c)) { const t = c.text.replace(/\s+/g, ' ').trim(); if (t) { text = t; break; } }
    }
  }
  return pick('aria-label') || pick('placeholder') || pick('name') || pick('title') || text || '';
};

// Walk up to the nearest `.map(cb)` arrow/function; return a JS expression string
// that's unique per row (key=… on this element or an ancestor, else index param,
// else the item param), or null if not inside a map.
function mapSuffix(node, sf) {
  let cur = node;
  const elementsSeen = [];
  while (cur) {
    if (ts.isJsxElement(cur) || ts.isJsxSelfClosingElement(cur)) elementsSeen.push(cur);
    if ((ts.isArrowFunction(cur) || ts.isFunctionExpression(cur)) &&
        cur.parent && ts.isCallExpression(cur.parent) &&
        ts.isPropertyAccessExpression(cur.parent.expression) &&
        cur.parent.expression.name.text === 'map') {
      // 1) a key={…} on this element or any ancestor element within the map
      for (const el of elementsSeen) {
        const opening = ts.isJsxElement(el) ? el.openingElement : el;
        for (const p of opening.attributes?.properties || []) {
          if (ts.isJsxAttribute(p) && p.name.getText(sf) === 'key' && p.initializer && ts.isJsxExpression(p.initializer) && p.initializer.expression) {
            return p.initializer.expression.getText(sf);
          }
        }
      }
      // 2) index param, else 3) item param
      const params = cur.parameters;
      if (params[1]) return params[1].name.getText(sf);
      if (params[0] && ts.isIdentifier(params[0].name)) return params[0].name.getText(sf);
      return 'idx';
    }
    cur = cur.parent;
  }
  return null;
}

function processFile(file) {
  const text = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const page = slug(path.basename(file).replace(/\.tsx$/, ''));
  const icons = iconImports(sf);
  const inserts = [];
  const used = new Map();
  const skipped = [];

  const visit = (node) => {
    let opening = null, container = null;
    if (ts.isJsxSelfClosingElement(node)) opening = node;
    else if (ts.isJsxElement(node)) { opening = node.openingElement; container = node; }

    if (opening) {
      const tag = opening.tagName.getText(sf);
      const attrs = getAttrs(opening, sf);
      const hasHandler = INTERACTIVE_HANDLERS.some((h) => h in attrs);
      const hasRole = 'role' in attrs;
      const isNative = NATIVE_INTERACTIVE.has(tag.toLowerCase());
      const isComponent = COMPONENT_INTERACTIVE.has(tag) && !icons.has(tag);
      const interactive = (isNative || isComponent || hasHandler || hasRole) && !EXCLUDE.has(tag);
      const attr = testIdAttr(tag);

      if (interactive && !(attr in attrs)) {
        if (!acceptsTestId(tag)) {
          skipped.push(tag);
        } else {
          const lbl = labelOf(opening, container, sf, attrs);
          let base = `${page}-${slug(lbl) || typeSlug(tag, attrs)}`;
          // ensure file-unique base
          const n = (used.get(base) || 0) + 1; used.set(base, n);
          if (n > 1) base = `${base}-${n}`;
          const suffix = mapSuffix(node, sf);
          const value = suffix ? `{\`${base}-\${${suffix}}\`}` : `"${base}"`;
          inserts.push({ pos: opening.tagName.getEnd(), text: ` ${attr}=${value}` });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  if (inserts.length && !DRY) {
    let out = text;
    for (const ins of inserts.sort((a, b) => b.pos - a.pos)) {
      out = out.slice(0, ins.pos) + ins.text + out.slice(ins.pos);
    }
    fs.writeFileSync(file, out);
  }
  return { added: inserts.length, skipped };
}

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (!/node_modules|dist|build/.test(e.name)) walk(full, acc); }
    else if (/\.tsx$/.test(e.name) && !/\.(test|spec|stories)\.tsx$/.test(e.name)) acc.push(full);
  }
  return acc;
}

const files = walk(SRC_DIR).filter((f) => !ONLY || f.includes(ONLY));
let added = 0, filesChanged = 0; const skippedTags = {};
for (const f of files) {
  const r = processFile(f);
  if (r.added) { added += r.added; filesChanged++; }
  for (const t of r.skipped) skippedTags[t] = (skippedTags[t] || 0) + 1;
}
console.log(`${DRY ? '[dry] would add' : 'Added'} ${added} data-testid across ${filesChanged} files.`);
const skipTotal = Object.values(skippedTags).reduce((a, b) => a + b, 0);
if (skipTotal) {
  console.log(`\nLeft untouched (custom components that don't forward props) — ${skipTotal} elements:`);
  Object.entries(skippedTags).sort((a, b) => b[1] - a[1]).forEach(([t, n]) => console.log(`  ${String(n).padStart(4)}  ${t}`));
}
