# Architecture Diagram — Kanaku

> Diagrams use [Mermaid](https://mermaid.js.org/) so they render in GitHub/VS Code and stay in version control.

## High-Level System
```mermaid
flowchart LR
    subgraph Client["Client (React 18 + TS / Capacitor)"]
        UI[UI Components]
        Dexie[(Dexie / IndexedDB)]
        UI --> Dexie
    end

    subgraph Cloud["Cloud"]
        API[Express API /api/v1]
        Prisma[Prisma]
        DB[(PostgreSQL)]
        Supa[Supabase Identity]
        DexieCloud[(Dexie Cloud)]
    end

    UI -->|HTTPS + JWT| API
    UI -->|OAuth/OTP| Supa
    Dexie <-->|delta sync| DexieCloud
    API --> Prisma --> DB
    API -->|verify| Supa
```

## Request/Auth Path
```mermaid
flowchart TD
    A[User action] --> B{Online?}
    B -- No --> C[Write to Dexie, mark sync pending]
    B -- Yes --> D[Call /api/v1 with JWT]
    D --> E[Helmet + CORS + Rate limit]
    E --> F[zod validation]
    F --> G[Ownership check]
    G --> H[DB transaction: balance + record]
    H --> I[Response]
    C --> J[Background sync retry] --> D
```

## Tooling for richer diagrams
- **Mermaid** (preferred, code-based, diffable).
- **draw.io** / **Figma** for visual design assets (export to `03_UI_UX_Design/UI_Designs`).

