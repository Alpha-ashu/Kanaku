# ADR-001: Ledger V2 Architecture

## Status
Accepted

## Context
In early phases of Kanakku, ledger balances and financial transactions were calculated on the client side or modified through direct CRUD REST endpoints. This led to state drifts, orphaned records, and inconsistent dashboard aggregations.

## Decision
We transition to **Ledger V2**, which establishes a centralized, backend-driven, immutable double-entry ledger.
- **Immutability**: Once a transaction or journal entry is written, it can never be mutated or deleted. Corrections must be handled via explicit reversals.
- **Centralized Engine**: All ledger modifications must flow through the central `FinancialLedgerService`, bypassing raw database updates.

## Consequences
- Guaranteed mathematical consistency.
- Auditable history trace for compliance.
- Need for complex reversal logic for adjustments.
