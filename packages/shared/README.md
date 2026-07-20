# @kanaku/shared

Shared **API contract types** between `backend/` and `frontend/`, consumed as an npm
workspace (`"@kanaku/shared": "*"` in each package).

## Rules

1. **Declaration-only.** `index.d.ts` is the whole package — always import with
   `import type { ... } from '@kanaku/shared'`. A value import would fail at bundle
   time (there is no runtime output, by design: no build step means the package works
   under CI's `npm ci --ignore-scripts` and inside Vite with zero orchestration).
2. **Wire contract, not internals.** Types here describe what crosses the HTTP
   boundary. Backends may declare stricter internal variants and frontends wider
   client-only ones — both should `extends` the shared shape so drift becomes a
   compile error (see `voice.nlp.ts` and `voiceFinancialService.ts` for the pattern).
3. **Adding runtime code later:** give the package a `tsc` build (`src/` → `dist/`,
   `main` + `types` fields), add it to the turbo `build` pipeline before
   backend/frontend, and add a build step to `ci.yml` (which installs with
   `--ignore-scripts`). Until someone needs that, keep it declaration-only.

## Contents

- Voice NLP contract: `VoiceActionType`, `VoiceActionEntities`, `VoiceFinancialAction`,
  `VoiceProcessResponse`
- Statement import contract: `StatementTransaction`, `StatementMeta`,
  `ImportPreviewRow`, `ImportPreviewResponse`, `ImportConfirmResponse`
