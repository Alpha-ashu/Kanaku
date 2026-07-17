# ADR-004: Snapshot Strategy

## Status
Accepted

## Context
Aggregating account balances, monthly cashflows, and category spends dynamically by querying millions of transaction rows causes severe latency on dashboard reads.

## Decision
We implement a write-time incremental snapshot strategy:
- Dedicated projection tables exist in the database: `DailyAccountBalance`, `MonthlyCategorySpend`, and `MonthlyCashflow`.
- These projections are updated incrementally ($O(1)$ writes) inside the database transaction context.
- Historical data is loaded using an automated startup backfill script.

## Consequences
- Fast dashboard and analysis reads.
- Write operations carry a small extra overhead.
- Projections can be completely rebuilt/replayed from the immutable ledger source of truth.
