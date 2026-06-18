# Testing and Fixtures

This repo uses separate test surfaces for frontend services, backend integrations, QA runners, and manual/demo files.

## Automated commands

### Root

```bash
npm run build
npm run qa:backend
```

### Frontend

```bash
cd frontend
npm run test:unit
npm run build
```

### Backend

```bash
cd backend
npm test
npm run build
npm run qa:test-features
```

## Test asset structure

- [`tests/fixtures/imports/`](../../tests/fixtures/imports/)
  Canonical JSON import fixtures such as `expense.json`, `expense1.json`, `different.json`, and `expense_test_250_records.json`
- [`tests/fixtures/auth/`](../../tests/fixtures/auth/)
  request bodies and auth payload examples
- [`tests/manual/`](../../tests/manual/)
  manual browser/html checks and console helpers
- [`tests/runners/`](../../tests/runners/)
  older standalone runner scripts
- [`tests/scenarios/`](../../tests/scenarios/)
  scenario notes

## External local sample files

Real receipt samples used during recent OCR verification were read from:

`C:\Users\USER\OneDrive\Documents\sample`

Those files are intentionally kept outside the repo right now. If you want a versioned demo set, stage them under [`samples/`](../../samples/README.md).

## Guidance

- Put reusable machine-readable fixtures under `tests/fixtures/`
- Put visual/manual experiments under `tests/manual/`
- Avoid committing generated logs or ad-hoc outputs as top-level test files
- Keep unit tests close to the runtime they validate unless the asset is shared across runtimes
