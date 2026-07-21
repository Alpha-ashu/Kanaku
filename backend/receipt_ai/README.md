# Receipt AI Service (FastAPI + Donut + PaddleOCR)

This service runs `naver-clova-ix/donut-base-finetuned-cord-v2` (structured
receipt extraction) and **PaddleOCR** (layout-aware raw OCR), exposing both to
the Node backend proxy.

## Endpoints

- `POST /scan-receipt` — Donut structured extraction. multipart field `file`;
  returns Donut's parsed fields plus normalized fallbacks.
- `POST /ocr` — **PaddleOCR** raw text. multipart field `file`; returns
  `{ text, lines:[{text,confidence}], lineCount, avgConfidence, engine }`.
  `text` is **row-reconstructed** from the detected bounding boxes, so table
  layouts (item/qty/rate/amount, debit/credit/balance) stay aligned instead of
  collapsing into a merged string. This is what the Node backend calls (via
  `PADDLE_OCR_ENDPOINT`) for receipt + scanned-statement OCR, preferring it over
  in-process Tesseract; it falls back to Tesseract automatically if this service
  is unreachable.
- `GET /health` — `{ status, model, paddleReady }`.

PaddleOCR is loaded lazily on the first `/ocr` call (not at import), so a
Donut-only deployment still boots even without `paddleocr`/`paddlepaddle`
installed — `/ocr` then returns 503 and the backend uses Tesseract.

## Run locally

```bash
cd backend/receipt_ai
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\\Scripts\\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8001
```

## Environment

- `DONUT_MODEL_ID` (optional): defaults to `naver-clova-ix/donut-base-finetuned-cord-v2`
- `RECEIPT_OCR_API_KEY` (optional): if set, both `/scan-receipt` and `/ocr` require `x-api-key`
- `PADDLE_OCR_LANG` (optional): PaddleOCR recognition language, default `en`
  (e.g. `ch`, `devanagari`; see PaddleOCR's supported language list)

On the **Node backend** set `PADDLE_OCR_ENDPOINT` to this service's base URL
(e.g. `http://127.0.0.1:8001`) to route raw OCR through `/ocr`.

## Notes

- Donut loads at startup; PaddleOCR loads on first `/ocr` call.
- For production, run on GPU for lower latency.
- This service is intended to be called by the backend, not directly by clients.
- PaddleOCR is pinned to the 2.x `.ocr()` API in `requirements.txt`; 3.x renamed
  it to `.predict()` and would need a code change.
