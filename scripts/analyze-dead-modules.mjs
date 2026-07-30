/**
 * BFS over the frontend import graph from the real entrypoints.
 * Reports modules under src/ that nothing reachable imports.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.argv[2] || 'k:/Project/Kanaku/frontend';
const SRC = path.join(ROOT, 'src');
const EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

const ENTRIES = ['src/index.tsx'];

const norm = (p) => p.split(path.sep).join('/');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const allFiles = walk(SRC).filter((f) => EXTS.includes(path.extname(f)));

function resolveSpec(spec, fromFile) {
  let base;
  if (spec.startsWith('@/')) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(fromFile), spec);
  else return null; // bare package

  const candidates = [];
  if (path.extname(base) && EXTS.includes(path.extname(base))) candidates.push(base);
  for (const ext of EXTS) candidates.push(base + ext);
  for (const ext of EXTS) candidates.push(path.join(base, 'index' + ext));
  // allow ".js" specifier pointing at ".ts" source
  if (base.endsWith('.js')) for (const ext of EXTS) candidates.push(base.slice(0, -3) + ext);

  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return path.resolve(c);
  }
  return null;
}

const SPEC_RE = [
  /\bfrom\s+['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\bimport\s+['"]([^'"]+)['"]/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\bexport\s+\*\s+from\s+['"]([^'"]+)['"]/g,
  /\bexport\s*\{[^}]*\}\s*from\s+['"]([^'"]+)['"]/g,
];

function specsOf(file) {
  const src = fs.readFileSync(file, 'utf8');
  const found = new Set();
  for (const re of SPEC_RE) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src))) found.add(m[1]);
  }
  return [...found];
}

const reachable = new Set();
const queue = [];
for (const e of ENTRIES) {
  const f = path.resolve(path.join(ROOT, e));
  if (fs.existsSync(f)) {
    reachable.add(f);
    queue.push(f);
  }
}

while (queue.length) {
  const file = queue.pop();
  for (const spec of specsOf(file)) {
    const target = resolveSpec(spec, file);
    if (target && !reachable.has(target)) {
      reachable.add(target);
      queue.push(target);
    }
  }
}

const unreachable = allFiles
  .map((f) => path.resolve(f))
  .filter((f) => !reachable.has(f))
  .map((f) => norm(path.relative(SRC, f)))
  .sort();

console.log(`total=${allFiles.length} reachable=${reachable.size} unreachable=${unreachable.length}`);
console.log(unreachable.join('\n'));
