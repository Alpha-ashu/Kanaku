# ADR-005: Event Store Architecture

## Status
Accepted

## Context
Reconstructing system state, tracking request correlations, and auditing user actions requires a durable append-only event record.

## Decision
We implement a dedicated, append-only **Financial Event Store**:
- Every financial mutation creates a structured, immutable event in the `FinancialEvent` table.
- Events map to a strict enum type (`FinancialEventType`) and support schema versioning (`eventVersion`).
- Full trace metadata is captured: `correlationId`, `requestId`, `sessionId`, `journalEntryId`, and `transactionId`.

## Consequences
- Guaranteed audit trail of all ledger postings.
- Facilitates diagnostic logs and debugging.
- Enables snapshot rebuilding from raw historical event streams.
