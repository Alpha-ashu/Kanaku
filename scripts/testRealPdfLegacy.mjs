import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const pdfPath = 'k:/Project/KANAKU/tests/canara_epassbook_2026-05-14 184602.001357.pdf';
const data = fs.readFileSync(pdfPath);
const uint8 = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

if (typeof globalThis.document === 'undefined') {
  globalThis.document = { createElement: () => ({ getContext: () => null }) };
}

pdfjsLib.GlobalWorkerOptions.workerSrc = 'k:/Project/KANAKU/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs';

async function main() {
  const pdf = await pdfjsLib.getDocument({ data: uint8, disableFontFace: true }).promise;
  let fullText = '';

  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex++) {
    const page = await pdf.getPage(pageIndex);
    const textContent = await page.getTextContent({ disableCombineTextItems: false });

    // Extract text items exactly like the frontend does (by Y coordinate)
    const rows = new Map();
    for (const item of textContent.items) {
      // In statementImportService.ts, it uses: const y = Math.round(item.transform[5] / 5) * 5; wait, let's look at the actual code...
      // Let's use exactly what we have in the original code. Let me check statementImportService.ts.
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
