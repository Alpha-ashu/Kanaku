# Reviewer Skill Reference  KANAKU

This document outlines the standards and checklist for code reviews in the KANAKUproject.

---

## 1. Architectural Compliance
- [ ] **Modular Structure**: Are new components placed in the correct feature folder under `src/app/components/`?
- [ ] **Import Paths**: Does the code use absolute aliases (`@/app/components/...`)? Reject any relative imports like `../../`.
- [ ] **Prop Drilling**: Is state managed correctly? (Local vs Context vs Prop-passing).
- [ ] **Logic Extraction**: Is business logic in services (`lib/`) and hooks, keeping components lean?

## 2. Design System Consistency
- [ ] **Glassmorphism**: Are cards and panels using the standard glass effect (`bg-white/70 backdrop-blur-xl`)?
- [ ] **Gradients**: Are primary buttons and headers using the `#7B4CFF` to `#4A9EFF` gradient?
- [ ] **Responsiveness**: Has the code been tested for both mobile and desktop views?
- [ ] **Icons**: Is `lucide-react` used consistently?

## 3. Code Quality & Performance
- [ ] **Lazy Loading**: Are large feature modules lazy-loaded in `App.tsx`?
- [ ] **Strict Types**: Are `any` types avoided? Are domain interfaces reused from `types/`?
- [ ] **Error Handling**: Are try/catch blocks used with user-friendly toast notifications?
- [ ] **Re-renders**: Are expensive computations wrapped in `useMemo` or `useCallback` where necessary?

## 4. Security & Data Integrity
- [ ] **Ownership Checks**: (Backend) Does the service check if the resource belongs to the `req.userId`?
- [ ] **Sanitization**: Is user input sanitized before DB insertion?
- [ ] **Local-First**: (Frontend) Does the UI update the local `Dexie` state before background syncing?
- [ ] **PIN Protection**: Are sensitive actions guarded by PIN verification if required?

## 5. Technical Rigour
- [ ] **Decimal Arithmetic**: Does the code cast Prisma `Decimal` values to `Number()` before performing addition/subtraction?
- [ ] **Lazy Initialization**: Are new database or third-party client instances created lazily (via singleton/getter) to avoid serverless startup crashes?
- [ ] **Circuit Breakers**: Are all outbound AI/API calls wrapped in the `withCircuitBreaker` utility?

## 6. Documentation
- [ ] **Context Update**: If a major architectural decision was made, has `KANAKU_DEVELOPER_CONTEXT.md` been updated?
- [ ] **Comments**: Are complex logic blocks explained with clear, concise comments?

