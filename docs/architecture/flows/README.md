# Feature Flow Diagrams — by Role

Per‑feature sequence diagrams for every role. Open any file on GitHub or in VS Code
(Mermaid preview) to see them rendered. All diagrams are render‑verified.

| Role | Doc | Features covered |
|---|---|---|
| **User** | [USER_FLOWS.md](./USER_FLOWS.md) | dashboard · accounts · transactions · calendar · to‑do lists · goals · group expense · book advisor · AI insights · budgets · recurring · investments · loans · reports · voice logging · receipt scanner · notifications · profile · settings |
| **Advisor** | [ADVISOR_FLOWS.md](./ADVISOR_FLOWS.md) | apply · online status / role mode · availability · incoming bookings · workspace + session chat · fee + rating |
| **Manager** | [MANAGER_FLOWS.md](./MANAGER_FLOWS.md) | advisor verification queue · approve/reject · role switch |
| **Admin** | [ADMIN_FLOWS.md](./ADMIN_FLOWS.md) | user management · advisor approval · platform stats · feature flags · reports · AI intelligence |

Core cross‑cutting flows (Login, PIN, Sync, Account Aggregator) are in
[../SEQUENCE_DIAGRAMS.md](../SEQUENCE_DIAGRAMS.md); the system component diagram and
the role/permission model are in [../ARCHITECTURE.md](../ARCHITECTURE.md) and
[../ROLE_FEATURE_FLOWS.md](../ROLE_FEATURE_FLOWS.md).

**Conventions:** `auth+gate` = `authMiddleware → idle‑session → pinGate`. Advisors,
managers, and admins also retain all user (personal‑finance) features.
