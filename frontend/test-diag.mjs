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

async function test(label, pdfPath) {
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
  const DATE_INLINE_RE = /\b\d{2}-\d{2}-\d{4}\b/;

  let isDateFirst = false;
  for (const line of lines.slice(0, 15)) {
    if (SKIP_RE.test(line)) continue;
    if (DATE_START_RE.test(line)) { isDateFirst = true; break; }
    if (DATE_INLINE_RE.test(line)) { isDateFirst = false; break; }
  }

  const blocks = [];
  let acc = [];
  if (isDateFirst) {
    for (const line of lines) {
      if (SKIP_RE.test(line)) continue;
      if (DATE_START_RE.test(line) && acc.length > 0) { blocks.push([...acc]); acc = []; }
      acc.push(line);
    }
  } else {
    const TAIL = /[\d,]+\.\d{2}(?:\s+[\d,]+\.\d{2})?\s*$/;
    const NEW_TXN = /^(?:UPI\/|NEFT|RTGS|IMPS|POS\/|CASH|ATM|ACH\/|INB\/|BIL\/|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{2,4})/i;
    let hasAmt = false;
    for (const line of lines) {
      if (SKIP_RE.test(line)) continue;
      if (hasAmt && NEW_TXN.test(line)) { blocks.push([...acc]); acc = []; hasAmt = false; }
      acc.push(line);
      if (TAIL.test(line)) hasAmt = true;
    }
  }
  if (acc.length > 0) blocks.push(acc);

  const ANY_DATE = /\b(\d{1,2}[\s\/\-\.](?:\d{1,2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*)[\s\/\-\.]\d{2,4})\b/i;

  let totalTxn = 0, totalAmt = 0, credits = 0, debits = 0;
  for (let bi = 0; bi < Math.min(20, blocks.length); bi++) {
    const block = blocks[bi];
    const ft = block.join(' ');
    const nums = [...ft.matchAll(/(?:INR\s*)?(\d[\d,]*\.\d{2})/g)]
      .map(m => parseAmountStr(m[1])).filter(v => v != null && v >= 0);
    const txnAmt = nums.length >= 2 ? nums[nums.length - 2] : nums[0];
    const isCredit = /\bUPI\/CR\b|\btransfer from\b|\bsalary\b|\brefund\b|\bcredited\b|\breceived\b|\bdeposit\b/i.test(ft);
    const hasDash  = /(?:INR\s*[\d,]+\.\d{2})\s+-\s+(?:INR\s*[\d,]+\.\d{2})/i.test(ft);
    const isUpiDr  = /\bUPI\/DR\b/i.test(ft);
    const type = (isCredit && !hasDash && !isUpiDr) ? 'CR' : 'DR';
    console.log(`[${bi}] ${type} amt=${txnAmt} nums=[${nums.slice(-4).join(',')}] | ${ft.slice(0,100)}`);
  }
  console.log(`\n=== ${label} TOTALS ===`);
  console.log(`Header at line: ${headerIdx} | Layout: ${isDateFirst ? 'date-first' : 'desc-first'} | Blocks: ${blocks.length}`);
}

async function main() {
  await test('INDIAN BANK', 'k:/Project/KANAKU/tests/indian bank.pdf');
  await test('CANARA', 'k:/Project/KANAKU/tests/canara_epassbook_2026-05-14 184602.001357.pdf');
}
main().catch(console.error);
