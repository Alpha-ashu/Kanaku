/**
 * The gate that decides whether an on-device reading is good enough to show,
 * and whether the cloud engine should be asked instead.
 *
 * The strings here are real: they are what Tesseract produced from the
 * benchmark bills in quality/smaple_files/bills. The merchant name that reached
 * the review card as "SHREGQWRICKI" is the reason this module exists — a scan
 * that returns nonsense still returns *something*, so "did we get a value" was
 * the wrong question to gate on.
 */
import { describe, expect, it } from 'vitest';
import { looksGarbled, assessScanQuality } from '@/lib/ocrTextQuality';

describe('looksGarbled', () => {
  it('rejects the OCR scrambles that reached users', () => {
    expect(looksGarbled('SHREGQWRICKI')).toBe(true);
    expect(looksGarbled('SHRLEGQWRIKRISHNAA')).toBe(true);
    expect(looksGarbled('SHRI;GQWRISKRISHNAA')).toBe(true);
    expect(looksGarbled('VRS ta tn amo')).toBe(true);
    expect(looksGarbled('Eadie Jide PrAVaRCy')).toBe(true);
  });

  it('accepts the real merchant names from the same bills', () => {
    expect(looksGarbled('SHRI GOWRI KRISHNAA')).toBe(false);
    expect(looksGarbled('SUKHDEV VAISHNO DHABA')).toBe(false);
    expect(looksGarbled('V&RO HOSPITALITY PVT LTD')).toBe(false);
    expect(looksGarbled('Saravana Bhavan')).toBe(false);
    expect(looksGarbled('HOUSE OF BAGAARA')).toBe(false);
    expect(looksGarbled('NAIR MESS')).toBe(false);
    expect(looksGarbled('Thalappakatti Hotels (P) Ltd')).toBe(false);
    expect(looksGarbled('EATING CIRCLES')).toBe(false);
  });

  it('treats empty and near-empty values as unusable', () => {
    expect(looksGarbled(undefined)).toBe(true);
    expect(looksGarbled('')).toBe(true);
    expect(looksGarbled('AB')).toBe(true);
  });

  it('catches letter-spacing artefacts', () => {
    expect(looksGarbled('S H R I G')).toBe(true);
  });

  it('does not reject a legitimate Q name', () => {
    // The rule is Q-without-U, not Q.
    expect(looksGarbled('QUALITY BAKERS')).toBe(false);
  });
});

describe('assessScanQuality', () => {
  const cleanScan = {
    amount: 475,
    merchantName: 'SHRI GOWRI KRISHNAA',
    subtotal: 452.3,
    taxAmount: 22.6,
    items: [
      { name: 'Phulka (3 Pcs) With Paneer Butter Masala', amount: 190.4 },
      { name: 'Chappathi (2 Pcs)', amount: 133.3 },
      { name: 'Ghee Podi Dosa', amount: 128.5 },
    ],
    confidence: 0.9,
    date: new Date('2023-11-26'),
    validationResult: { isValid: true, calculated: 474.9, detected: 475 },
  };

  it('keeps a clean local read local', () => {
    const quality = assessScanQuality(cleanScan);
    expect(quality.shouldEscalate).toBe(false);
    expect(quality.score).toBeGreaterThanOrEqual(0.7);
  });

  it('escalates when the merchant came back as noise', () => {
    // This is the exact scan from the screenshot: every number looked fine, but
    // the merchant was garbage — which means the transcript was bad, which
    // means the numbers off it are suspect too.
    const quality = assessScanQuality({ ...cleanScan, merchantName: 'SHREGQWRICKI' });
    expect(quality.shouldEscalate).toBe(true);
    expect(quality.reasons).toContain('merchant unreadable');
  });

  it('escalates when nothing could be totalled', () => {
    expect(assessScanQuality({ ...cleanScan, amount: undefined }).shouldEscalate).toBe(true);
  });

  it('escalates when the totals do not reconcile', () => {
    const quality = assessScanQuality({
      ...cleanScan,
      validationResult: { isValid: false, calculated: 4977.02, detected: 20 },
    });
    expect(quality.shouldEscalate).toBe(true);
    expect(quality.reasons).toContain('totals do not reconcile');
  });

  it('escalates when no line items were found', () => {
    expect(assessScanQuality({ ...cleanScan, items: [] }).shouldEscalate).toBe(true);
  });

  it('escalates on a null result rather than throwing', () => {
    expect(assessScanQuality(null).shouldEscalate).toBe(true);
    expect(assessScanQuality(undefined).score).toBe(0);
  });
});
