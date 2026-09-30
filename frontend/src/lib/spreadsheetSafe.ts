/**
 * Cells for files the user opens in Excel / Sheets / Numbers.
 *
 * Descriptions, merchants, categories and account names come from the user and
 * from imported third-party files, so treat them as hostile:
 *   - A value starting with = + - @ (or tab/CR) is run as a FORMULA by
 *     spreadsheets (CWE-1236) — `=HYPERLINK("http://…")`, `=WEBSERVICE(…)`.
 *     It is prefixed with an apostrophe so it opens as text. Plain numbers
 *     ("-450.00") are left alone.
 *   - The .xls report is an HTML table; unescaped text there is markup
 *     (`<img src=…>` would fetch a URL when the file opens).
 */

const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^[-+]?\d[\d,]*(\.\d+)?%?$/;

export const neutralizeFormula = (value: unknown): string => {
  const text = String(value ?? '');
  return FORMULA_START.test(text) && !PLAIN_NUMBER.test(text) ? `'${text}` : text;
};

/** One quoted CSV cell. */
export const csvCell = (value: unknown): string => `"${neutralizeFormula(value).replace(/"/g, '""')}"`;

/** Text for an HTML table cell in an .xls report. */
export const htmlCell = (value: unknown): string =>
  neutralizeFormula(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
