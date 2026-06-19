# User Journey — Kanaku

## Primary Journey: Track a Daily Expense
1. Open app → cached session loads instantly.
2. Tap "+" → enter amount, category, account.
3. Save → stored locally, shown immediately, marked sync pending.
4. Connectivity returns → background sync confirms balance.
5. Dashboard updates with new balance and category insight.

## Journey: New User Onboarding
1. Sign up (Supabase) → verify email.
2. Create first account (e.g., Cash / Bank).
3. Add opening balance.
4. Guided to add first transaction.

## Journey: Receipt Capture
1. Tap "Scan Receipt" → capture image.
2. OCR extracts amount/merchant/date.
3. Low-confidence fields highlighted → user confirms.
4. Save → becomes a transaction.

## Emotional/Trust Touchpoints
- Instant local feedback (no spinner blocking input).
- Clear "synced" vs "pending" indicators build trust.
- Accurate, server-authoritative balances reinforce reliability.

