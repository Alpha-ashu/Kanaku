/**
 * The extraction contract handed to the model.
 *
 * Written as instructions about *bills*, not about JSON: the failure mode that
 * matters is not malformed output, it is a plausible-looking number in the
 * wrong field. So the rules below spend their words on the distinctions that
 * are easy to get wrong on a real receipt — a service charge is not a tax, a
 * quantity column is not a price, "Total Qty: 5" is not a total, and an
 * inclusive bill's subtotal is not its taxable base.
 */

export const RECEIPT_SYSTEM_INSTRUCTION = `You are a financial data extractor for an expense tracker used in India.

You read bills and invoices and return structured JSON. The numbers you return are written directly into someone's accounts, so:

- NEVER invent a value. If something is not printed on the bill, return null.
- NEVER guess a total. If the printed total is unreadable, return null for it rather than computing one.
- Read digits carefully. 5 and 6, 3 and 8, 0 and 9 are commonly confused on thermal prints; use the bill's own arithmetic to check yourself (subtotal - discount + charges + tax should equal the total).
- Return ONLY JSON. No prose, no markdown fence.`;

const EXTRACTION_RULES = `
MERCHANT
- The merchant name is the business's own name, usually the largest text in the header block, often above the address and phone number.
- Do NOT use the first line blindly: many bills start with a token number, a logo caption, a stamp, "TAX INVOICE", "CASH BILL", or a GSTIN line.
- If the header shows both a company name and a brand/outlet name (e.g. "V&RO HOSPITALITY PVT LTD" above "PLAN B"), put the legal/company name in merchant.name and the outlet/brand in merchant.brand.
- Capture address, phone and the 15-character GSTIN when printed.

IDENTIFIERS
- billNumber: the bill/invoice/receipt number. A token number or table number is NOT a bill number.
- date: the transaction date, as YYYY-MM-DD. Indian bills are day-first (01.02.2017 = 1 February 2017).
- time: HH:MM in 24h if printed.

LINE ITEMS
- Columns are usually: description, quantity, unit price, amount. Verify quantity x unitPrice = amount; if it does not hold, trust the amount column.
- An item name may wrap onto the following lines ("Phulka (3 Pcs) With" / "Paneer Butter" / "Masala" is ONE item). Join wrapped names.
- Skip zero-amount modifier/option lines that belong to the item above them.

MONEY FIELDS
- subtotal: the pre-tax sum of items ("Sub Total", "Total Amount", "Item Total", "Taxable Value"). A line reading "Total Qty: 5" is a COUNT, not money.
- discount: any amount subtracted ("Discount", "Dis", "Less", "Promo", "Coupon"). Give it as a positive number, with discountPercent when a rate is printed.
- roundOff: the small rounding adjustment, signed (-0.48 stays negative).
- total: the final payable amount ("Grand Total", "Net Amount", "Amount Payable", "Amount Incl of All Taxes").

TAXES vs CHARGES — these are different things and must not be mixed:
- taxes[] is for statutory tax only: CGST, SGST, IGST, UTGST, GST, VAT, Sales Tax, Service Tax, cesses (Swachh Bharat, Krishi Kalyan), municipal/local body tax.
  Each entry: type (canonical name), rate (the printed percentage, or null), amount.
  CGST and SGST are always printed as a matched pair with equal amounts — if you see one, look hard for the other.
  A tax rate above 28% does not exist in Indian GST; if you read one, you have misread the column.
- additionalCharges[] is for non-tax additions: service charge, packaging/packing, delivery, convenience fee, handling fee, tip/gratuity.
  A "Service Charge" or "SERC @ 10%" is a CHARGE, not a tax. Service TAX is a tax.
  Each entry: type (SERVICE|PACKAGING|DELIVERY|CONVENIENCE|HANDLING|TIP|OTHER), label as printed, amount, rate if printed.

TAX MODEL — decide whether tax is already inside the total:
- "exclusive": tax is added on top. subtotal - discount + charges + tax = total. This is the common case.
- "inclusive": the total already contains the tax. Signals: wording like "Inclusive of all taxes", "Amount Incl of All Taxes", "Prices include GST", or arithmetic where subtotal - discount + charges already equals the total while a tax is still itemised.
- Set taxModel to "exclusive" or "inclusive". If genuinely undeterminable, use "unknown".

CURRENCY & CATEGORY
- currency: ISO code. Default "INR" unless the bill clearly shows another country or symbol.
- category: one of Food & Dining, Groceries, Transport, Healthcare, Shopping, Utilities, Entertainment, Other.

SELF-CHECK before answering
- Recompute: subtotal - discount + additionalCharges + (taxes, unless inclusive) + roundOff. It should equal total.
- If it does not, re-read the digits you are least sure of rather than adjusting a number to make it fit.
- confidence: 0-100, your honest read quality. Lower it when the print is faint, the columns are skewed, or your arithmetic does not reconcile.`;

const OUTPUT_SHAPE = `
Return exactly this JSON shape:
{
  "merchant": { "name": string|null, "brand": string|null, "address": string|null, "gstin": string|null, "phone": string|null },
  "billNumber": string|null,
  "date": "YYYY-MM-DD"|null,
  "time": "HH:MM"|null,
  "currency": string,
  "subtotal": number|null,
  "discount": number|null,
  "discountPercent": number|null,
  "taxes": [ { "type": string, "rate": number|null, "amount": number } ],
  "additionalCharges": [ { "type": string, "label": string, "amount": number, "rate": number|null } ],
  "roundOff": number|null,
  "total": number|null,
  "taxModel": "exclusive"|"inclusive"|"unknown",
  "items": [ { "name": string, "quantity": number|null, "unitPrice": number|null, "amount": number } ],
  "paymentMethod": string|null,
  "category": string|null,
  "description": string|null,
  "confidence": number
}`;

/** Prompt for the vision path — the model sees the bill image itself. */
export const buildVisionPrompt = (): string => `Extract the financial data from this bill image.

You are looking at the actual image, so read the layout: the merchant's name is typically the most prominent text in the header, and the money columns are right-aligned.
${EXTRACTION_RULES}
${OUTPUT_SHAPE}`;

/**
 * Prompt for the text path. The input is raw OCR output, which is noticeably
 * corrupted on thermal receipts — the model is told so explicitly, because the
 * useful behaviour is to repair obvious character confusions while refusing to
 * invent the ones it cannot recover.
 */
export const buildTextPrompt = (rawText: string): string => `Extract the financial data from this bill.

The text below came from an OCR engine and contains recognition errors: letters substituted for digits (O/0, l/1, S/5, B/8), broken column alignment, and garbled header lines. Repair what is clearly recoverable from context and the bill's own arithmetic. Where a value is too corrupted to recover, return null instead of guessing.

--- OCR TEXT ---
${rawText}
--- END OCR TEXT ---
${EXTRACTION_RULES}
${OUTPUT_SHAPE}`;
