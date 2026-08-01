/**
 * Unit tests for the heuristic receipt parser — the fallback that runs whenever
 * the LLM structuring pass is unavailable.
 *
 * The fixture is the Tesseract reading of a real Chennai restaurant bill that
 * the old parser mangled in four separate ways: it read the tail of the GSTIN
 * as a 121.00 GST charge, kept only 1 of 3 items, missed the subtotal, and then
 * reported the whole thing as a high-confidence scan.
 */
import { parseReceiptFromText, extractLineAmount } from '../../../../backend/src/features/ai/receiptTextParser';

const CHENNAI_RESTAURANT_BILL = [
  'SHRI GOWRI KRISHNAA',
  'MOGAPPAIR WEST, CHENNAI',
  'MOB : 97918 99111',
  'GSTIN : 33ADPFS7571Q121',
  'Name:',
  'Date: 26/11/23 18:45   Pick Up',
  'Cashier: admin        Bill No.: 197082',
  'Token No.: 694',
  'Item              Qty.   Price  Amount',
  'Phulka (3 Pcs) With   2   95.24  190.48',
  'Paneer Butter',
  'Masala',
  'Chappathi (2 Pcs)     2   66.67  133.34',
  'Ghee Podi Dosa        1  128.57  128.57',
  'Total Qty: 5      Sub Total   452.39',
  'CGST            2.5%     11.31',
  'SGST            2.5%     11.31',
  'Round off                 -0.01',
  'Grand Total            ₹475.00',
  'FSSAI Lic No. 12418023000737',
  'THANK YOU !! VISIT AGAIN !!',
].join('\n');

describe('receipt text parser — Chennai restaurant bill', () => {
  const parsed = parseReceiptFromText(CHENNAI_RESTAURANT_BILL);

  it('reads the grand total, not the subtotal or the item count', () => {
    expect(parsed.netAmount).toBe(475);
  });

  it('reads a subtotal that shares a line with the quantity column', () => {
    expect(parsed.preTaxSubtotal).toBe(452.39);
  });

  it('never treats the tail of a GSTIN as a tax charge', () => {
    const names = (parsed.taxBreakdown ?? []).map((t) => t.name);
    expect(names).toEqual(['CGST', 'SGST']);
    expect(parsed.totalTaxAmount).toBe(22.62);
  });

  it('keeps every item, including names with brackets and digits', () => {
    const items = parsed.items ?? [];
    expect(items).toHaveLength(3);
    expect(items.map((i) => i.amount)).toEqual([190.48, 133.34, 128.57]);
    expect(items[1].name).toBe('Chappathi (2 Pcs)');
    expect(items[2]).toMatchObject({ name: 'Ghee Podi Dosa', quantity: 1, rate: 128.57 });
  });

  it('folds a wrapped item name back into its row', () => {
    expect(parsed.items?.[0].name).toBe('Phulka (3 Pcs) With Paneer Butter Masala');
  });

  it('extracts the printed date', () => {
    expect(parsed.date).toBe('2023-11-26');
  });

  it('picks the trading name over the address and the metadata block', () => {
    expect(parsed.merchantName).toBe('SHRI GOWRI KRISHNAA');
  });

  it('validates subtotal + tax against the printed total', () => {
    expect(parsed.validationResult).toMatchObject({ isValid: true, detected: 475 });
  });

  it('categorises a restaurant bill as food rather than leaving it blank', () => {
    expect(parsed.category).toBe('Food & Dining');
  });

  it('never claims high confidence for a heuristic reading', () => {
    // 0.8 is the UI's "trust it without reviewing" threshold.
    expect(parsed.confidence).toBeLessThan(0.8);
    expect(parsed.confidence).toBeGreaterThan(0.3);
  });

  it('reports the engine that produced the data', () => {
    expect(parsed._source).toBe('ocr-heuristic');
  });
});

describe('receipt text parser — amount extraction guards', () => {
  it('ignores digits glued to an identifier', () => {
    expect(extractLineAmount('GSTIN : 33ADPFS7571Q121')).toBeUndefined();
    expect(extractLineAmount('FSSAI Lic No. 12418023000737')).toBeUndefined();
    expect(extractLineAmount('MOB : 97918 99111')).toBeUndefined();
    expect(extractLineAmount('Bill No.: 197082')).toBeUndefined();
  });

  it('reads money at the end of a line, with or without a currency mark', () => {
    expect(extractLineAmount('Grand Total  ₹475.00')).toBe(475);
    expect(extractLineAmount('Sub Total   452.39')).toBe(452.39);
    expect(extractLineAmount('Total  Rs. 1,250.50')).toBe(1250.5);
  });

  it('ignores a zero or negative rounding line', () => {
    expect(extractLineAmount('Round off  -0.01')).toBeUndefined();
  });
});

describe('receipt text parser — degraded input', () => {
  it('does not invent a merchant from OCR noise', () => {
    const parsed = parseReceiptFromText(['VRS ta tn amo', 'Total  100.00'].join('\n'));
    expect(parsed.merchantName).toBeNull();
  });

  it('flags a total that contradicts the printed subtotal and taxes', () => {
    const parsed = parseReceiptFromText(
      ['Sub Total  100.00', 'CGST 2.5%  2.50', 'SGST 2.5%  2.50', 'Grand Total  900.00'].join('\n'),
    );
    expect(parsed.validationResult).toMatchObject({ isValid: false, calculated: 105, detected: 900 });
    expect(parsed.confidence).toBeLessThan(0.5);
  });

  it('drops a tax component too large to be a real GST charge', () => {
    const parsed = parseReceiptFromText(
      ['Sub Total  452.39', 'GST  400.00', 'SGST 2.5%  11.31', 'Grand Total  475.00'].join('\n'),
    );
    expect((parsed.taxBreakdown ?? []).map((t) => t.name)).toEqual(['SGST']);
  });

  it('returns a usable shell rather than throwing on unparseable text', () => {
    const parsed = parseReceiptFromText('~~~~\n****\n');
    expect(parsed.netAmount).toBeUndefined();
    expect(parsed.confidence).toBeLessThanOrEqual(0.3);
  });
});
