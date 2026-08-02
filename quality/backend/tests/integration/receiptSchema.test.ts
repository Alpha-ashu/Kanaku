/**
 * The reconciliation layer every extraction engine funnels through.
 *
 * These are the decisions that turn a pile of numbers into an expense record:
 * whether tax is already inside the total, whether a service charge is tax,
 * and whether the bill's own arithmetic holds. Getting any of them wrong writes
 * a wrong figure into someone's ledger, so each is pinned here with the real
 * bill shape that motivated it.
 */
import {
  normalizeExtractedReceipt,
  detectTaxModel,
  validateReceiptMath,
  canonicalTaxType,
  canonicalChargeType,
  looksLikeCharge,
} from '../../../../backend/src/features/ai/receiptSchema';

describe('tax model detection', () => {
  it('reads an exclusive bill from its arithmetic', () => {
    // Shri Gowri Krishnaa: 452.30 + 22.60 = 474.90, printed 475.00
    expect(detectTaxModel({
      subtotal: 452.30, totalTax: 22.60, totalCharges: null, discount: null, total: 475.00,
    })).toBe('exclusive');
  });

  it('reads an inclusive bill from its arithmetic', () => {
    // The subtotal alone lands on the total while tax is still itemised.
    expect(detectTaxModel({
      subtotal: 1249, totalTax: 59.48, totalCharges: null, discount: null, total: 1249,
    })).toBe('inclusive');
  });

  it('uses the printed wording when the numbers cannot decide', () => {
    expect(detectTaxModel({
      subtotal: null, totalTax: 114.32, totalCharges: null, discount: null, total: 749,
      rawText: 'Amount Incl of All Taxes 749.00',
    })).toBe('inclusive');
  });

  it('does not guess when there is nothing to go on', () => {
    expect(detectTaxModel({
      subtotal: null, totalTax: null, totalCharges: null, discount: null, total: null,
    })).toBe('unknown');
  });
});

describe('tax and charge taxonomy', () => {
  it('maps the tax labels Indian bills actually print', () => {
    expect(canonicalTaxType('CGST')).toBe('CGST');
    expect(canonicalTaxType('State Gst @ 2.5%')).toBe('SGST');
    expect(canonicalTaxType('Central Gst')).toBe('CGST');
    expect(canonicalTaxType('Govt Service Tax')).toBe('SERVICE_TAX');
    expect(canonicalTaxType('Swach Bharat Cess')).toBe('SWACHH_BHARAT_CESS');
    expect(canonicalTaxType('Krishi Kalyan Cess')).toBe('KRISHI_KALYAN_CESS');
    expect(canonicalTaxType('(+) VAT')).toBe('VAT');
  });

  it('keeps a service CHARGE out of the tax bucket', () => {
    // "SERC @ 10%" on a restaurant bill is the house's fee, not GST. Counting
    // it as tax overstates tax paid and breaks reconciliation.
    expect(looksLikeCharge('SERC @ 10%')).toBe(true);
    expect(canonicalChargeType('Service Charge')).toBe('SERVICE');
    expect(canonicalChargeType('Packaging Charges')).toBe('PACKAGING');
    expect(canonicalChargeType('Delivery Fee')).toBe('DELIVERY');
    expect(canonicalChargeType('Convenience Fee')).toBe('CONVENIENCE');
    expect(canonicalChargeType('Handling')).toBe('HANDLING');
    expect(canonicalChargeType('Tip')).toBe('TIP');
    expect(canonicalChargeType('Something else')).toBe('OTHER');
  });

  it('still classifies service TAX as a tax', () => {
    expect(canonicalTaxType('Service Tax')).toBe('SERVICE_TAX');
  });
});

describe('math reconciliation', () => {
  const base = {
    subtotal: 4525, discount: null, totalTax: 248.98, totalCharges: 452.50,
    roundOff: -0.48, total: 5226, taxModel: 'exclusive' as const, items: [],
  };

  it('accepts a bill whose components land on the printed total', () => {
    // Plan B: 4525 + 452.50 service + 248.98 tax - 0.48 round off = 5226.00
    const result = validateReceiptMath(base);
    expect(result?.isValid).toBe(true);
    expect(result?.requiresReview).toBe(false);
  });

  it('flags a bill that does not add up instead of storing it', () => {
    const result = validateReceiptMath({ ...base, total: 6226 });
    expect(result?.isValid).toBe(false);
    expect(result?.requiresReview).toBe(true);
    expect(result?.issues[0]).toMatch(/off by 1000/);
  });

  it('does not add inclusive tax on top of a subtotal that already contains it', () => {
    const result = validateReceiptMath({
      subtotal: 1249, discount: null, totalTax: 59.48, totalCharges: null,
      roundOff: null, total: 1249, taxModel: 'inclusive', items: [],
    });
    expect(result?.isValid).toBe(true);
  });

  it('flags line items that disagree with the subtotal', () => {
    const result = validateReceiptMath({
      ...base,
      items: [{ name: 'Item', quantity: 1, unitPrice: 1101, amount: 1101 }],
    });
    expect(result?.issues.some((issue) => /line items total/i.test(issue))).toBe(true);
  });

  it('returns nothing to reconcile when no total was read', () => {
    expect(validateReceiptMath({ ...base, total: null })).toBeNull();
  });
});

describe('normalisation', () => {
  const plainBill = {
    merchant: { name: 'V&RO HOSPITALITY PVT LTD', brand: 'PLAN B', gstin: '29AAGCVA390M1ZL' },
    billNumber: '2314PBSK/23-24',
    date: '2023-05-30',
    subtotal: 4525,
    taxes: [
      { type: 'State Gst', rate: 2.5, amount: 124.49 },
      { type: 'Central Gst', rate: 2.5, amount: 124.49 },
    ],
    additionalCharges: [{ type: 'SERVICE', label: 'SERC @ 10%', amount: 452.50, rate: 10 }],
    roundOff: -0.48,
    total: 5226,
    items: [{ name: 'GINGER ALE', quantity: 3, unitPrice: 130, amount: 390 }],
    confidence: 95,
  };

  it('produces one canonical shape regardless of engine', () => {
    const receipt = normalizeExtractedReceipt(plainBill, { engine: 'gemini-vision' });

    expect(receipt.merchant.name).toBe('V&RO HOSPITALITY PVT LTD');
    expect(receipt.merchant.brand).toBe('PLAN B');
    expect(receipt.taxes.map((t) => t.type)).toEqual(['SGST', 'CGST']);
    expect(receipt.totalTax).toBe(248.98);
    expect(receipt.additionalCharges[0].type).toBe('SERVICE');
    expect(receipt.totalCharges).toBe(452.5);
    expect(receipt.taxModel).toBe('exclusive');
    expect(receipt.validation?.isValid).toBe(true);
  });

  it('caps the offline parser below the trust-it threshold', () => {
    const vision = normalizeExtractedReceipt(plainBill, { engine: 'gemini-vision' });
    const heuristic = normalizeExtractedReceipt(plainBill, { engine: 'ocr-heuristic' });

    // Identical input, but a heuristic reading of a corrupted transcript can be
    // internally consistent and still wrong, so it never presents as certain.
    expect(vision.confidence).toBeGreaterThan(heuristic.confidence);
    expect(heuristic.confidence).toBeLessThanOrEqual(70);
  });

  it('collapses confidence when the bill does not reconcile', () => {
    const good = normalizeExtractedReceipt(plainBill, { engine: 'gemini-vision' });
    const bad = normalizeExtractedReceipt({ ...plainBill, total: 9999 }, { engine: 'gemini-vision' });
    expect(bad.confidence).toBeLessThan(good.confidence);
  });

  it('rejects a tax rate that cannot exist under GST', () => {
    const receipt = normalizeExtractedReceipt(
      { ...plainBill, taxes: [{ type: 'CGST', rate: 452, amount: 124.49 }] },
      { engine: 'gemini-vision' },
    );
    // The amount is kept; only the impossible rate is dropped.
    expect(receipt.taxes[0].rate).toBeNull();
    expect(receipt.taxes[0].amount).toBe(124.49);
  });

  it('derives the taxable base for an inclusive bill with no printed subtotal', () => {
    const receipt = normalizeExtractedReceipt(
      { total: 749, taxes: [{ type: 'CGST', amount: 57.16 }, { type: 'SGST', amount: 57.16 }], taxModel: 'inclusive' },
      { engine: 'gemini-vision' },
    );
    expect(receipt.taxModel).toBe('inclusive');
    expect(receipt.subtotal).toBe(634.68);
  });

  it('discards a date that cannot be a receipt date', () => {
    expect(normalizeExtractedReceipt({ date: '2089-91-89' }, { engine: 'gemini-vision' }).date).toBeNull();
    expect(normalizeExtractedReceipt({ date: '30-05-2023' }, { engine: 'gemini-vision' }).date).toBe('2023-05-30');
  });

  it('recovers a GSTIN from the raw text when the model missed it', () => {
    const receipt = normalizeExtractedReceipt(
      { total: 100 },
      { engine: 'ocr-heuristic', rawText: 'GSTIN : 33ADPFS7571Q1Z1' },
    );
    expect(receipt.merchant.gstin).toBe('33ADPFS7571Q1Z1');
  });

  it('never returns a null-ish string as a real value', () => {
    const receipt = normalizeExtractedReceipt(
      { merchant: { name: 'N/A' }, billNumber: 'null', category: 'unknown' },
      { engine: 'gemini-vision' },
    );
    expect(receipt.merchant.name).toBeNull();
    expect(receipt.billNumber).toBeNull();
    expect(receipt.category).toBeNull();
  });
});
