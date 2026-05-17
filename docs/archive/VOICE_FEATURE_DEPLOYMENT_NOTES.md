# Voice Feature Deployment Notes

## Scope of this update
This document records the voice-entry enhancements applied to the frontend voice flow.

### Updated areas
- `frontend/src/lib/voiceExpenseParser.ts`
- `frontend/src/lib/voiceDrafts.ts`
- `frontend/src/app/components/VoiceInput.tsx`
- `frontend/src/app/components/VoiceReview.tsx`
- `frontend/src/app/components/AddGoal.tsx`
- `frontend/src/app/components/AddInvestment.tsx`
- `frontend/src/app/components/AddGold.tsx`
- `frontend/src/app/components/AddTransaction.tsx`
- `frontend/src/app/components/Goals.tsx`
- `frontend/src/app/components/Groups.tsx`
- `frontend/src/app/components/GoalDetail.tsx`
- `frontend/src/lib/voiceExpenseParser.test.ts`

## What was implemented
- Added voice intent support for `goal`, `group`, and `investment`.
- Added parser confidence scoring and date extraction.
- Added user-language-aware speech recognition locale selection.
- Added per-intent routing helpers with exact localStorage draft handling.
- Added inline goal contribution handling in voice review.
- Switched voice review transaction saving to the existing sync-aware transaction helper.
- Added undo support for voice review batch saves.
- Added direct handoff support for:
  - existing goal contributions from `Goals`
  - group expense drafts from `Groups`
  - goal contribution prefills in `GoalDetail`
  - gold investment prefills in `AddGold`
- Added parser tests for new intents, confidence, and date extraction.

## Package / dependency status
### Installed during this update
- None

### New packages required for this implementation
- None

### Existing packages relied on
- `react`
- `typescript`
- `dexie`
- `sonner`
- `lucide-react`
- `motion` / existing animation stack already present in the project
- existing project utilities under `frontend/src/lib`

## Optional future dependencies
No additional package is required for the implemented feature set.

If corporate policy later approves deeper NLP or localization upgrades, evaluate them in a separate review before adoption. They were **not** added here.

## Deployment / validation checklist
When Node.js tooling is available in the target environment, run:

```powershell
Set-Location "C:\Users\sashra19\Documents\Intellij\KANKU\frontend"
npm run type-check
npm run test:unit
npm run build
```

## Environment note
During this session, workspace-level static error checks passed, but Node.js / npm were not available in the execution environment, so package-script test/build commands could not be executed here.

