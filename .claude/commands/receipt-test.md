# Receipt OCR Pipeline Test

Test the complete receipt scanning and processing pipeline: upload → OCR → AI extraction → transaction creation.

## Pipeline stages to verify

**Stage 1 — Upload:**
1. Check `backend/src/utils/uploadPolicy.ts` — verify allowed MIME types (image/jpeg, image/png, application/pdf) and max size.
2. Check `backend/src/modules/receipts/` — find the upload handler and verify Multer config.

**Stage 2 — OCR processing:**
3. Read `backend/src/modules/ai/ocr.engine.ts` — identify the OCR engine (Tesseract.js or Google Vision).
4. Check `backend/receipt_ai/` for any Python/Node OCR scripts.
5. Run OCR on a sample: use a receipt from `samples/receipts/` if available.

**Stage 3 — AI extraction:**
6. Read `backend/src/modules/ai/agents.ts` — find the receipt data extraction prompt.
7. Verify the AI extracts: merchant, date, total amount, line items, currency.
8. Check `backend/src/modules/ai/ai.validation.ts` — confirm extracted data is validated before saving.

**Stage 4 — Transaction creation:**
9. Verify that after OCR + AI extraction, a transaction record is created in the database.
10. Check that the original receipt image is stored (Supabase Storage bucket reference).

**Frontend:**
11. Find the receipt scanner component in `frontend/src/hooks/useReceiptScanner.ts`.
12. Verify camera/file-picker integration and loading state handling.

## Test run

- Upload `samples/receipts/` test image via API: `POST /api/receipts/upload`
- Log the response and extracted transaction data
- Report processing time and any extraction errors
