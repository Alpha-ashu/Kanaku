import { describe, expect, it } from 'vitest';
import { csvCell, htmlCell, neutralizeFormula } from '@/lib/spreadsheetSafe';

describe('spreadsheet-safe cells', () => {
  it('opens formulas as text', () => {
    expect(neutralizeFormula('=HYPERLINK("http://evil","x")')).toBe(`'=HYPERLINK("http://evil","x")`);
    expect(neutralizeFormula('+cmd')).toBe(`'+cmd`);
    expect(neutralizeFormula('@SUM(A1)')).toBe(`'@SUM(A1)`);
    expect(neutralizeFormula('-2+3')).toBe(`'-2+3`);
  });

  it('leaves plain numbers and ordinary text alone', () => {
    expect(neutralizeFormula('-450.00')).toBe('-450.00');
    expect(neutralizeFormula('+1,200.50')).toBe('+1,200.50');
    expect(neutralizeFormula('12.5%')).toBe('12.5%');
    expect(neutralizeFormula('Swiggy')).toBe('Swiggy');
  });

  it('quotes CSV cells and escapes quotes', () => {
    expect(csvCell('He said "hi", then left')).toBe('"He said ""hi"", then left"');
    expect(csvCell('=1+1')).toBe(`"'=1+1"`);
  });

  it('escapes HTML for the .xls report', () => {
    expect(htmlCell('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;');
    expect(htmlCell('Tom & "Jerry"')).toBe('Tom &amp; &quot;Jerry&quot;');
  });
});
