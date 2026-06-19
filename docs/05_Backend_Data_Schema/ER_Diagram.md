# ER Diagram — Kanaku (Core Relationships)

> Full model list (48) in `Database_Schema.md`. This diagram shows the principal money + collaboration + advisory + AA relationships.

```mermaid
erDiagram
    USER ||--o{ ACCOUNT : owns
    USER ||--o{ TRANSACTION : owns
    USER ||--o{ GOAL : owns
    USER ||--o{ LOAN : owns
    USER ||--o{ INVESTMENT : owns
    USER ||--o{ GOLDASSET : owns
    USER ||--o{ BUDGET : owns
    USER ||--o{ RECURRING : owns
    USER ||--o{ FRIEND : has
    USER ||--|| USERPIN : secures
    USER ||--o{ DEVICE : registers
    USER ||--o{ NOTIFICATION : receives
    USER ||--o{ AACONSENT : grants

    ACCOUNT ||--o{ TRANSACTION : contains
    TRANSACTION ||--o| EXPENSEBILL : attaches
    GOAL ||--o{ GOALCONTRIBUTION : funded_by
    GOAL ||--o{ GOALMEMBER : shared_with
    LOAN ||--o{ LOANPAYMENT : repaid_by
    GROUPEXPENSE ||--o{ GROUPEXPENSEMEMBER : split_among

    USER ||--o{ BOOKINGREQUEST : books
    ADVISORAPPLICATION }o--|| USER : applied_by
    ADVISORAVAILABILITY }o--|| USER : advisor
    ADVISORSESSION ||--o{ CHATMESSAGE : has

    AACONSENT ||--o{ AACONSENTARTIFACT : produces
    AACONSENT ||--o{ AADATASESSION : opens
    AADATASESSION ||--o{ AAFINANCIALDATA : returns
    AAFINANCIALDATA ||--o{ AATRANSACTION : parsed_into

    USER ||--o{ TODO : owns
    TODO ||--o{ COLLABORATIONPARTICIPANT : shared_with
```

Monetary integrity: `ACCOUNT.balance`, `GOAL.current`, `LOAN.outstanding` are server-authoritative `Decimal(18,2)`, updated only inside `prisma.$transaction`.
