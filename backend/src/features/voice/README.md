# voice module

> Voice command parsing and voice-driven transaction entry.

**Base path:** `/api/v1/voice`

## Endpoints

| Method | Path | Guards | Handler |
|---|---|---|---|
| POST | `/voice/process-audio` | auth | `processVoiceAudio` |
| POST | `/voice/process` | auth, validated | `processVoice` |
| POST | `/voice/learn` | auth, validated | `learnFromCorrection` |

## Files

- `README.md`
- `voice.controller.ts`
- `voice.nlp.ts`
- `voice.routes.ts`

## Canonical-shape conformance

✅ controller · — service · — repository · — validation · ✅ routes · — types

---
_Auto-generated from `voice/*.routes.ts`. Regenerate with `node scripts/gen-module-readmes.mjs`. Edit the purpose line in the generator, not here._
