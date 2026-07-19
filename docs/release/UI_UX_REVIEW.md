# Kanaku — UI/UX Review (Beta Audit, 2026-07-19)

Method: static review of the complete live component tree (`frontend/src/app`), routing
audit of all ~45 pages, affordance counts, and the recorded Playwright E2E evidence.
(A full interactive click-through across devices was not performed in this audit session;
the 17-spec E2E suite is the executable form of that check — see TEST_PLAN.md.)

## Page inventory (live surface — all reachable, no placeholders)

- **Marketing/pre-auth:** Landing, About, Pricing, Contact, Privacy, Terms
- **Auth:** AuthFlow (register/login/challenge), AuthCallback, PINSetup, PINAuth,
  NewUserOnboarding + AppFeatureSlides
- **Core:** Dashboard, Accounts (+Add/Edit), Transactions (+Add, PayEMI), Calendar
- **Wealth:** Goals (+Add, Detail), Loans (+Add), Investments (+Add/Edit, AddGold), Reports
- **Social:** Groups (+Add), Friends (list/add/profile), ToDo Lists (+Detail/Share)
- **Advisor:** BookAdvisor, AdvisorPanel, AdvisorWorkspace
- **Admin/Manager** (admin build only): AdminDashboard, AdminAIDashboard, AdminFeaturePanel,
  AdminAdvisorVerification, SyncMonitorDashboard, ManagerAdvisorVerification
- **Features:** AIInsights, RecurringTransactions, BudgetAlerts, ClientManagement,
  ReceiptScanner, VoiceInput/VoiceReview, Notifications, UserProfile, Settings, Diagnostics

Navigation: Sidebar + BottomNav + QuickActionModal all map to registered pages in the
App.tsx state machine — the audit found **no dead navigation targets** (every `case` in the
page switch renders a real component; unknown pages fall back to Dashboard).

## Affordances (measured)

| Concern | Evidence | Assessment |
|---|---|---|
| Loading states | 20 components with skeleton/pulse states; Suspense fallbacks on every lazy page | ✅ |
| Empty states | 12 explicit "no data" states in list views | ✅ |
| Error handling | root ErrorBoundary + per-feature boundaries; sonner toasts for success/error on all mutations (standardized via api.ts options) | ✅ |
| Responsive | Tailwind responsive classes throughout; BottomNav (mobile) + Sidebar (desktop); Capacitor Android build in CI | ✅ (add mobile-viewport E2E project — backlog) |
| Offline UX | OfflineBanner, LimitedModeBanner, PWA install prompt, local-first data | ✅ |
| Security UX | PIN gate screens, inactivity auto-lock (E2E-tested), session/device management UI | ✅ |
| Accessibility | ARIA in 75 components; shadcn primitives are Radix-based (focus management, keyboard nav) | ⚠ partial — no automated axe pass yet (TEST_PLAN gap) |
| Dark mode | `dark:` variants in only 14 live components | ⚠ light-first product; full dark theme is a post-beta item (KNOWN_LIMITATIONS §6) |
| Automation readiness | 1,383 `data-testid`s + AUTOMATION_REGISTRY.md | ✅ |

## Issues found

1. **No blocking issues.** No placeholder screens, no dead buttons/links in the live tree,
   no console-error-producing render paths surfaced by the unit/E2E suites.
2. Dark-mode inconsistency (above) — treat as theming feature, not defect.
3. Legacy `src/pages/**` tree could mislead contributors into editing dead screens —
   removal tracked (CODE_QUALITY_REPORT Q-1).
4. Recommendation: add axe-core + firefox/webkit + mobile-viewport Playwright projects
   (accessibility & cross-browser gates) before GA.
