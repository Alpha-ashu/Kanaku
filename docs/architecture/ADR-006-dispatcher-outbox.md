# ADR-006: Dispatcher & Outbox Pattern

## Status
Accepted

## Context
Executing slow side-effects (e.g. notifications, webhook calls) inside critical ledger transactions blocks execution and introduces potential failures.

## Decision
We decouple state changes from event dispatching using the **Outbox Pattern**:
- Financial events are appended to the Event Store *within* the core database transaction block.
- Once committed, events are safely dispatched asynchronously by background workers.
- The Dispatcher handles queueing, exponential retries, and dead-letter channels.

## Consequences
- Fast response times for ledger posts.
- Decouples notification channels (push, SMS) from core transaction commits.
- Ensures zero event loss: even if a worker crashes, pending events can be fetched and re-processed.
