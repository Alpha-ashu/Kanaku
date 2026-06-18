# Docs Â· Onboarding

New to Kanaku? Read these in order.

1. **What is Kanaku** â€” [`../../README.md`](../../README.md)
2. **Architecture (the big picture)** â€” [`../../ARCHITECTURE_RESTRUCTURE.md`](../../ARCHITECTURE_RESTRUCTURE.md)
3. **Feature map (find any feature end-to-end)** â€” [`../architecture/FEATURE_MAP.md`](../architecture/FEATURE_MAP.md)
4. **Developer context & rules** â€” [`../../KANAKU_DEVELOPER_CONTEXT.md`](../../KANAKU_DEVELOPER_CONTEXT.md)
5. **Contributing** â€” [`../CONTRIBUTING.md`](../CONTRIBUTING.md)
6. **Guidelines (AI + design system)** â€” [`../guidelines/Guidelines.md`](../guidelines/Guidelines.md)
7. **Quick reference** â€” [`../DEVELOPER_QUICK_REFERENCE.md`](../DEVELOPER_QUICK_REFERENCE.md)

## Local setup (TL;DR)

```bash
npm install                 # installs workspaces; postinstall runs prisma generate
npm run dev                 # frontend + backend together (scripts/dev-full.mjs)
npm run db:migrate          # apply Prisma migrations
npm test                    # frontend unit (vitest)
npm --prefix backend test   # backend jest
npx playwright test         # e2e
```

## Where things live (cheat sheet)

| I want toâ€¦ | Go to |
|---|---|
| Change a screen | `frontend/src/` |
| Change server logic for a feature | `backend/src/features/<name>/` |
| Change the data model | `backend/prisma/schema.prisma` |
| See an API contract | `docs/api/contracts/<feature>/` |
| Add a test | `backend/tests/` or `frontend/src/**/*.test.tsx`; index in `quality/` |
| Understand security | `platform/security/README.md` |
| Safely retire a file | `archive-unused/` (+ `reason.md`) |

