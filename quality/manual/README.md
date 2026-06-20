# Quality · Manual Testing

Human-driven test plans and exploratory checks.

- **Scenario scripts:** [`../scenarios/`](../scenarios/)
- **Reports:** [`../reports/`](../reports/)
- The old ad-hoc debug pages and console snippets (`debug-auth.html`,
  `test-suite.html`, `verify-realtime.js`, …) were retired to
  [`../archive/legacy-tests/manual/`](../archive/legacy-tests/manual/) — they are
  not maintained. Use the Playwright suites in [`../e2e/`](../e2e/) and
  [`../api/e2e/`](../api/e2e/) instead.

## How to add a manual test
1. Write the steps in `quality/scenarios/<feature>.md`.
2. Add a row to the feature table in [`../README.md`](../README.md).
3. Link the expected result + screenshots.
