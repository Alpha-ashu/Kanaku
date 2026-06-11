import { readFileSync, writeFileSync } from 'fs';

const filePath = 'k:/Project/KANAKU/frontend/src/services/statementImportService.ts';
let code = readFileSync(filePath, 'utf8');

// Fix 1: DATE_START_RE — the character class [\/-\.] causes "Range out of order"
// Fix by escaping the dash: [\/\-\.]
code = code.replace(
  /\[\\\/\-\\\.\]\(\\d\{1,2\}\|/g,
  '[\\\/\\-\\.](\\d{1,2}|'
);

// More targeted fix — find the exact bad pattern and replace
// Pattern: /^(\d{1,2}[BADCLASS](\d{1,2}|...
const BAD1 = String.raw`/^(\d{1,2}[\/-\.](\d{1,2}|[a-zA-Z]{3,9})[\/-\.]\d{2,4})(?:\s|$)/`;
const GOOD1 = String.raw`/^(\d{1,2}[\/\-\.](\d{1,2}|[a-zA-Z]{3,9})[\/\-\.]\d{2,4})(?:\s|$)/`;

// Also fix TRAILING_PAIR_RE if it has the same issue
const BAD2 = String.raw`/[\d,]+\.\d{2}\s+[\d,]+\.\d{2}\s*$/`;
const GOOD2 = String.raw`/[\d,]+\.\d{2}\s+[\d,]+\.\d{2}\s*$/`;

if (code.includes(BAD1)) {
  code = code.replace(BAD1, GOOD1);
  console.log('Fixed DATE_START_RE');
} else {
  // Try to find and fix any [\/-\.] pattern (the slash-dash-dot range issue)
  const count1 = (code.match(/\[\\\/\-\\\.\]/g) || []).length;
  const count2 = (code.match(/\[\/\-\.\]/g) || []).length;
  console.log('Pattern counts:', { escaped: count1, unescaped: count2 });
  
  // Fix escaped version: [\/\-\.] -> already fine but check
  // Fix unescaped: [/-\.] -> [/\-\.] (move dash to end or escape it)
  code = code.replace(/\[\/\-\\\.\]/g, '[\\/\\-\\.]');
  code = code.replace(/\[\/\-\.\]/g, '[\\/\\-\\.]');
  console.log('Applied fallback fix for character class ranges');
}

writeFileSync(filePath, code);

// Verify no more bad patterns
const remaining = code.match(/\[\/\-[^\/\]]/g) || [];
console.log('Remaining potentially bad ranges:', remaining);
console.log('Done. File size:', code.length);
