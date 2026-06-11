import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

async function extract(pdfPath) {
  const ab = fs.readFileSync(pdfPath).buffer;
  const pdf = await pdfjsLib.getDocument({ data: ab, disableFontFace: true, standardFontDataUrl: 'node_modules/pdfjs-dist/standard_fonts/' }).promise;
  let full = '';
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent({ disableCombineTextItems: false });
    const rows = new Map();
    for (const item of tc.items) {
      const y = Math.round(item.transform[5]);
      const current = rows.get(y) ?? [];
      current.push({ x: item.transform[4], text: item.str });
      rows.set(y, current);
    }
    const lines = Array.from(rows.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([, e]) => e.sort((a, b) => a.x - b.x).map(x => x.text).join(' '))
      .map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
    full += lines.join('\n') + '\n';
  }
  return full;
}

function parseAmountStr(s) {
  if (!s) return null;
  const c = s.replace(/,/g, '').replace(/[^\d.]/g, '');
  const n = parseFloat(c);
  return isFinite(n) ? n : null;
}

async function test(pdfPath) {
  const text = await extract(pdfPath);
  const rawLines = text.split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim());

  const HEADER_RE = /\b(?:date\b.{0,60}\b(?:particulars|description|transaction\s*details?|narration|details)\b)/i;
  let headerIdx = -1;
  for (let i = 0; i < rawLines.length; i++) {
    if (HEADER_RE.test(rawLines[i])) { headerIdx = i; break; }
  }
  const lines = (headerIdx >= 0 ? rawLines.slice(headerIdx + 1) : rawLines).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);

  const SKIP_RE = /^\s*(?:date\b|opening balance|closing balance|page\s*\d+|account activity|account statement|total\b|subtotal\b|\*{3,}|-{5,}|={5,})/i;
  const DATE_START_RE = /^(\d{1,2}[\s\/\-\.](?:\d{1,2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*)[\s\/\-\.]\d{2,4})\s/i;

  const blocks = [];
  let acc = [];
  for (const line of lines) {
    if (SKIP_RE.test(line)) continue;
    if (DATE_START_RE.test(line) && acc.length > 0) { blocks.push([...acc]); acc = []; }
    acc.push(line);
  }
  if (acc.length > 0) blocks.push(acc);

  let credits = 0, debits = 0;
  for (const block of blocks) {
    const ft = block.join(' ');
    
    // Look for amounts
    const nums = [...ft.matchAll(/(?:INR\s*)?(\d[\d,]*\.\d{2})/g)]
      .map(m => parseAmountStr(m[1])).filter(v => v != null && v >= 0);
    if (nums.length === 0) continue;
    
    const txnAmt = nums[0];
    const balance = nums.length > 1 ? nums[1] : undefined;
    if (nums.length > 2) {
      console.log(`\nBAD BLOCK nums=${nums.join(', ')}`);
      console.log(ft);
    }

    const isUpiCr   = /\bUPI\/CR\b/i.test(ft);
    const isUpiDr   = /\bUPI\/DR\b/i.test(ft);
    const hasDashBefore = /-\s*(?:INR\s*)?[\d,]+\.\d{2}\s+(?:INR\s*)?[\d,]+\.\d{2}$/i.test(ft) || /-\s*(?:INR\s*)?[\d,]+\.\d{2}/i.test(ft.split(/(?:INR\s*)?[\d,]+\.\d{2}/)[0]);
    const hasDashAfter  = /(?:INR\s*)?[\d,]+\.\d{2}\s+-\s+(?:INR\s*)?[\d,]+\.\d{2}/i.test(ft);
    const hasCrKw   = /\b(transfer from|salary|refund|reversal|cashback|credited|received|deposit|credit interest)\b/i.test(ft);

    let type = 'DR';
    if (isUpiCr || hasDashBefore) {
      type = 'CR';
    } else if (isUpiDr || hasDashAfter) {
      type = 'DR';
    } else if (hasCrKw) {
      type = 'CR';
    }

    if (type === 'CR') credits += txnAmt; else debits += txnAmt;
    console.log(`[${type}] ${txnAmt} \t (bal: ${balance}) \t | ${ft.slice(0, 80)}`);
  }
  console.log(`CR: ${credits.toFixed(2)} | DR: ${debits.toFixed(2)} | Total: ${(credits+debits).toFixed(2)}`);
}

test('k:/Project/KANAKU/tests/indian bank.pdf').catch(console.error);
