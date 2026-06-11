import { readFileSync, writeFileSync } from 'fs';

const filePath = 'k:/Project/KANAKU/frontend/src/services/statementImportService.ts';
let code = readFileSync(filePath, 'utf8');

// Find the exact line and print it so we can see
const lines = code.split('\n');
const idx = lines.findIndex(l => l.includes('DATE_START_RE'));
if (idx === -1) { console.log('Not found'); process.exit(1); }

console.log('Found at line', idx + 1, ':', JSON.stringify(lines[idx]));

// Replace that entire line with a safe version
// The fix: put - at the END of the character class so it's literal, not a range
lines[idx] = lines[idx].replace(
  /const DATE_START_RE = .+/,
  "    const DATE_START_RE = /^(\\d{1,2}[/.\-](\\d{1,2}|[a-zA-Z]{3,9})[/.\-]\\d{2,4})(?:\\s|$)/;"
);

console.log('Fixed to:', JSON.stringify(lines[idx]));

code = lines.join('\n');
writeFileSync(filePath, code);
console.log('Saved.');
