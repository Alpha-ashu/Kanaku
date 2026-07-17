# ADR-002: Double-Entry Bookkeeping

## Status
Accepted

## Context
A single-sided transaction log is prone to rounding issues, unbacked assets, and tracking gaps. Financial accounts must maintain balanced debits and credits.

## Decision
We enforce a strict double-entry ledger model where:
- Every accounting event is represented by a `JournalEntry`.
- A `JournalEntry` is associated with one or more `Transaction` legs.
- For transfer and multi-leg journal entries, the sum of `income` (debit) transactions must match the sum of `expense` (credit) transactions exactly.
- Single-leg journal entries are validated against strict account limits and balance floors.

## Consequences
- Impossible to create asset out of thin air.
- Simplifies multi-party settlements and internal transfers.
- Requires precise Decimal representation rather than floating-point math.
