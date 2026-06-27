# Quality · Manual · OCR diagnostics

Ad-hoc receipt-OCR scripts, relocated here from the `backend/` root so all
test-related files live under `quality/`. These are throwaway diagnostics, **not**
part of any Jest/Vitest/Playwright suite — run them by hand when debugging OCR.

| Script | What it does | Needs |
|---|---|---|
| `test-tess.ts` | Smoke-tests Tesseract init against a sample image URL. | network |
| `test-ocr.ts` | Runs the hybrid (Tesseract + Gemini) engine on `~/Downloads/the-bill.jpg`. | `GEMINI_API_KEY` in `backend/.env`, a local image |

## Run

They depend on backend source + deps, so run them with the backend's TypeScript runner:

```bash
# from the repo root (workspace deps are hoisted)
npx ts-node quality/manual/ocr/test-tess.ts
npx ts-node quality/manual/ocr/test-ocr.ts
```

`test-ocr.ts` imports `../../../backend/src/...` directly; if you move it again,
fix those relative paths.
