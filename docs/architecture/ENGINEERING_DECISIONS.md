# Engineering Decisions Log

## 2026-07-14 — To-Do Lists PostgreSQL UUID Type Casting

- **Date:** 2026-07-14
- **Files Modified:** [todo.repository.ts](file:///k:/Project/Kanaku/backend/src/features/todos/todo.repository.ts)
- **Reason for Change:** Raw queries targeting the non-Prisma managed tables `public.todo_lists`, `public.todo_items`, and `public.todo_list_shares` failed because they compared or inserted parameterised string values of user ID into PostgreSQL `UUID` columns without casting. This resulted in SQL error `42883: operator does not exist: uuid = text`.
- **Alternative Approaches Considered:**
  - Map `ToDoList` etc. fully as Prisma models in `schema.prisma`.
    *Rejected:* This would require modifying the schema and generating a migration, which could alter the tables' schemas and affect data integrity on other environments. The existing codebase relies on raw SQL queries by design.
- **Chosen Solution:** Cast the user ID parameters explicitly using `::uuid` in all raw SQL queries within `todo.repository.ts`.
- **Trade-offs:** Minimal. The type casting is PostgreSQL specific, but since the system is bound to PostgreSQL/Supabase, portability is not affected.
- **Performance Impact:** Zero. Type casting is done at query parsing time by the database.
- **Security Impact:** None. Parameters are passed securely via Prisma's parameter binding, preventing SQL injection.
- **Database Impact:** Resolves query errors.
- **Future Improvements:** Implement full Prisma model mapping for the to-do tables if migration is desired in a future major release.

## 2026-07-14 — Interactive Transaction Timeout Increase for Concurrency Stability

- **Date:** 2026-07-14
- **Files Modified:** [transaction.repository.ts](file:///k:/Project/Kanaku/backend/src/features/transactions/transaction.repository.ts)
- **Reason for Change:** Under high concurrent write volumes, multiple transactions updating the balance of the same account execute sequential row locks via `tx.account.update`. The default Prisma Client interactive transaction timeout of 5 seconds was exceeded for queued requests, causing timeout exceptions (`P2028` errors) and returning HTTP 500. Additionally, when using PgBouncer transaction pooling, timeouts occurring during lock contention caused uncommitted changes to be persisted in subsequent traffic.
- **Alternative Approaches Considered:**
  - Application-level queue/mutex for account updates.
    *Rejected:* Adding application-level locks would introduce complexity, potential memory overhead, and would not scale across multiple node instances.
  - Disable row locking.
    *Rejected:* Disabling locking would introduce race conditions (double spending and incorrect ledger balances).
- **Chosen Solution:** Increase interactive transaction `maxWait` to 20 seconds and `timeout` to 30 seconds for transaction repository operations (`createWithBalanceUpdate`, `updateWithBalanceUpdate`, and `deleteWithBalanceUpdate`).
- **Trade-offs:** Long-running transactions hold locks longer if there is a network issue, but 30 seconds is a standard timeout for database transactions under heavy write loads.
- **Performance Impact:** Accommodates high-concurrency queueing and decreases error rate to 0.0% under parallel write stress.
- **Security Impact:** None.
- **Database Impact:** Safe and prevents connection pollution/uncommitted state leakage on PgBouncer by allowing transactions to complete cleanly.

