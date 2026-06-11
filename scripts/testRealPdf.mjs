// Test the actual Canara Bank PDF using pdfjs-dist
import { readFileSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Use the same pdfjs that the app uses
let pdfjsLib;
try {
  pdfjsLib = require('k:/Project/KANAKU/node_modules/pdfjs-dist/build/pdf.js');
} catch (e) {
  pdfjsLib = require('k:/Project/KANAKU/frontend/node_modules/pdfjs-dist/build/pdf.js');
}

// Minimal canvas stub for Node (pdfjs may need it)
if (typeof globalThis.document === 'undefined') {
  globalThis.document = { createElement: () => ({ getContext: () => null }) };
}

const pdfPath = 'k:/Project/KANAKU/tests/canara_epassbook_2026-05-14 184602.001357.pdf';
const data = readFileSync(pdfPath);
const uint8 = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

pdfjsLib.GlobalWorkerOptions.workerSrc = '';

async function main() {
  console.log('Loading PDF...', uint8.length, 'bytes');

  const pdf = await pdfjsLib.getDocument({ data: uint8, disableFontFace: true }).promise;
  console.log('Pages:', pdf.numPages);

  let fullText = '';

  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex++) {
    const page = await pdf.getPage(pageIndex);
    const textContent = await page.getTextContent({ disableCombineTextItems: false });

    // Group text items by Y coordinate (same as app does)
    const rows = new Map();
    for (const item of textContent.items) {
      const y = Math.round(item.transform[5]);
      const x = item.transform[4];
      const cur = rows.get(y) || [];
      cur.push({ x, text: item.str });
      rows.set(y, cur);
    }

    const pageLines = Array.from(rows.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([, entries]) =>
        entries.sort((a, b) => a.x - b.x).map(e => e.text).join(' ')
      )
      .map(line => line.replace(/\s+/g, ' ').trim())
      .filter(Boolean);

    fullText += pageLines.join('\n') + '\n';
  }

  console.log('\n=== EXTRACTED TEXT ===\n');
  console.log(fullText.slice(0, 5000));

  // Now run the parser logic
  console.log('\n=== RUNNING PARSER ===\n');

  const lines = fullText.split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);

  const SKIP_RE = /^\s*(?:statement for|opening balance|closing balance|page\s*\d+|date\s+particulars|sl\.?\s*no|deposits\s+withdrawals|deposits|withdrawals|narration|\*{3,}|-{5,}|={5,})/i;
  const TRAILING_PAIR_RE = /[\d,]+\.\d{2}\s+[\d,]+\.\d{2}\s*$/;
  const TXN_DATE_RE = /\b(\d{2}-(?:\d{2}|[A-Za-z]{3,9})-\d{4})\b/;
  const CHQ_RE = /^(?:chq|ref)\s*:\s*\d+/i;

  const blocks = [];
  let acc = [];

  for (const line of lines) {
    if (SKIP_RE.test(line)) { console.log('[SKIP]', line); continue; }
    if (CHQ_RE.test(line)) {
      if (blocks.length > 0) blocks[blocks.length - 1].push(line);
      continue;
    }
    acc.push(line);
    if (TRAILING_PAIR_RE.test(line)) {
      blocks.push([...acc]);
      acc = [];
    }
  }
  if (acc.length > 0) blocks.push(acc);

  console.log('\nBlocks found:', blocks.length);
  console.log('\nDetailed block analysis:');

  blocks.forEach((block, i) => {
    const full = block.join(' ');
    const dm = full.match(TXN_DATE_RE);
    const amts = (full.match(/[\d,]+\.\d{2}/g) || []).map(v => parseFloat(v.replace(/,/g, '')));
    const merchant = full.match(/UPI\/(?:DR|CR)\/\d+\/([^/]+)\//i);
    const type = /UPI\/CR/i.test(full) ? 'CREDIT' : /UPI\/DR/i.test(full) ? 'DEBIT' : 'OTHER';
    console.log(`\n--- Block ${i+1} ---`);
    console.log('  Date:', dm?.[1] || 'NOT FOUND');
    console.log('  Type:', type);
    console.log('  All amounts:', amts);
    console.log('  Txn amt:', amts[amts.length-2], '| Balance:', amts[amts.length-1]);
    console.log('  Merchant:', merchant?.[1] || 'N/A');
    console.log('  Full text:', full.slice(0, 150));
  });

  // Show any unmatched lines (in acc after loop)
  if (acc.length > 0) {
    console.log('\n=== UNCLOSED LINES (no trailing pair) ===');
    acc.forEach(l => console.log(' ', l));
  }
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
