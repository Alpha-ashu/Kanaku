# Samples

Use this folder for demo and verification assets that should stay separate from runtime code.

## Suggested layout

- `imports/`: sample JSON, CSV, or statement imports
- `receipts/`: bill or receipt images/PDFs
- `documents/`: demo files for presentations, walkthroughs, or validation

## Current external sample source

Recent receipt-image validation used local files from:

`C:\Users\USER\OneDrive\Documents\sample`

If you want those samples under version control later, copy only sanitized/non-sensitive files into the matching folder here.

## Rules

- Do not place secrets in sample files.
- Prefer anonymized or synthetic data for demos.
- Keep large local-only samples out of Git unless they are intentionally part of regression coverage.
