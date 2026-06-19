# UI Flow Explanation — Kanaku

## Login Screen
- **Input:** Email + Password (or OTP).
- **Button:** Login.
- **Validation:** Required fields; email format; clear inline errors.
- **States:** idle, submitting, error, offline (cached session).

## Dashboard
- Shows total balance, recent transactions, spend-by-category.
- Navigation menu: Dashboard, Transactions, Receipts, Settings.
- **States:** loading (cached), synced, sync-pending badge.

## Add Transaction
- **Input:** amount, type (income/expense), category, account, date, note.
- **Validation:** amount > 0; category required; default date = today.
- **Offline:** writes locally first, shows "pending sync" indicator.

## Receipt Scan
- Capture image → OCR draft → confirm/edit → save.
- Low-confidence parses require explicit confirmation.

## Wireframe Assets
- Place exported PNGs (`Login_Wireframe.png`, `Dashboard_Wireframe.png`) here.
- Source diagrams recommended in Figma or draw.io; export PNG to this folder.

