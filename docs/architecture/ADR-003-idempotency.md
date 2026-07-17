# ADR-003: Idempotency Guarantees

## Status
Accepted

## Context
Mobile apps and background workers operate over unreliable networks, which can lead to retried requests. In a financial application, double-posting must be prevented under all conditions.

## Decision
We enforce transactional idempotency:
- A unique constraint is configured on `(userId, sourceModule, idempotencyKey)` in the `Transaction` table.
- Before executing any double-entry write, the engine checks for the existence of this key.
- If it exists, the engine returns the previously recorded result, preventing duplicated executions.

## Consequences
- 100% protection against race conditions and network retry duplication.
- Clients must generate and send deterministic UUIDv4 keys for state-changing operations.
