# ai module

> AI/LLM features — insights, NLQ, document intelligence (lazy-loaded).

**Base path:** `/api/v1/ai`

## Endpoints

| Method | Path | Guards | Handler |
|---|---|---|---|
| POST | `/ai/events` | auth, validated | `captureAIEvent` |
| GET | `/ai/quota` | auth | `Response` |
| GET | `/ai/insights` | auth | `Response` |
| GET | `/ai/health-score` | auth | `Response` |
| GET | `/ai/recommendations` | auth | `Response` |
| GET | `/ai/fraud-alerts` | auth | `Response` |
| GET | `/ai/bill-predictions` | auth | `Response` |
| GET | `/ai/spending-patterns` | auth | `Response` |

## Files

- `agents.ts`
- `ai.controller.ts`
- `ai.engine.ts`
- `ai.processor.ts`
- `ai.routes.ts`
- `ai.types.ts`
- `ai.validation.ts`
- `ocr.engine.ts`
- `README.md`

## Canonical-shape conformance

✅ controller · — service · — repository · ✅ validation · ✅ routes · ✅ types

---
_Auto-generated from `ai/*.routes.ts`. Regenerate with `node scripts/gen-module-readmes.mjs`. Edit the purpose line in the generator, not here._
