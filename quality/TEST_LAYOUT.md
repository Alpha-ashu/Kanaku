# Tests

This folder separates fixtures, manual checks, runners, and scenario notes so test assets do not sit in one flat directory.

## Layout

- `fixtures/imports/`
  JSON files used by import validation tests.
- `fixtures/auth/`
  Request payload samples for auth verification.
- `manual/`
  Browser/manual debug HTML and ad-hoc console scripts.
- `runners/`
  Legacy end-to-end or infrastructure runner scripts.
- `scenarios/`
  Human-readable scenario notes.

## Current automated coverage

- Frontend unit and service tests run from `frontend/` with `npm run test:unit`
- Backend integration tests run from `backend/` with `npm test`
- Backend feature matrix helpers live in `backend/scripts/`

## Sample data

- Canonical JSON import fixtures live in `tests/fixtures/imports/`
- External receipt image samples used during local verification currently live outside the repo at `C:\Users\USER\OneDrive\Documents\sample`
- If you want to version additional demo files, place them under [`samples/`](../samples/README.md)

## Notes

- Files under `manual/` and `runners/` are historical support tools, not part of the main CI path.
- Prefer adding new reusable fixtures under `fixtures/` instead of dropping files at the test root.
