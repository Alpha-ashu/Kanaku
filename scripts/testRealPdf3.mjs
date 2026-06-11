import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/build/pdf.mjs';

const pdfPath = 'k:/Project/KANAKU/tests/canara_epassbook_2026-05-14 184602.001357.pdf';
const data = fs.readFileSync(pdfPath);
const uint8 = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

if (typeof globalThis.document === 'undefined') {
  globalThis.document = { createElement: () => ({ getContext: () => null }) };
}

// We just need it to parse text, worker might be optional for Node, but let's see.
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
  console.log(fullText.slice(0, 3000));
}

main().catch(e => {
  console.error('Error:', e);
});
