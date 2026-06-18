# Frontend

This folder contains the React/Vite application.

## Owns

- Application pages and components
- Dexie/IndexedDB local data layer
- Receipt scanner, bank statement import, JSON import, and voice parsing flows
- Auth and permission client state
- Offline-first sync triggers and local UX

## Key folders

- `src/app/`: page and feature components
- `src/contexts/`: app and auth state
- `src/services/`: AI, import, sync, OCR, and data services
- `src/lib/`: shared runtime helpers
- `src/hooks/`: hooks for permissions, scanner flows, and UI state
- `public/`: static browser assets

## Commands

```bash
npm run dev
npm run build
npm run test:unit
```

## Environment

- Template: [`frontend/.env.example`](./.env.example)
- Local overrides: `frontend/.env.local`

## Notes

- Historical `Investments.*.tsx` backup files and `patch.diff` were moved to [`archive-unused/frontend/legacy-experiments/`](../archive-unused/frontend/legacy-experiments/README.md).
- Roles and PIN state are backend-authoritative; do not reintroduce client-only privilege flags.
