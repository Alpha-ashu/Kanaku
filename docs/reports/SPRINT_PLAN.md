# Kanaku — Product Sprint Plan
**Perspective:** CEO / Product Owner
**Date:** June 13, 2026
**Current Version:** v495
**Platform Status:** Production-deployed (Vercel + Supabase)

---

## Executive Summary

Kanaku is a production-ready personal finance platform. Core financial features (accounts, transactions, loans, goals, investments, budgets, receipts, voice, advisor booking) are fully implemented. The next phase shifts focus from building to **hardening**: real-data user testing, cross-user integration flows (friends/notifications), SMS integration, and E2E test coverage.

**Current overall completion: ~93%**

---

## Feature Status at a Glance

| Feature Area | Status | Completeness |
|---|---|---|
| Accounts & Transactions | ✅ Live | 100% |
| Budgets | ✅ Live | 100% |
| Goals | ✅ Live | 100% |
| Loans / Debt Tracking | ✅ Live | 100% |
| Investment Tracking (Stocks, MF, Gold, FD) | ✅ Live | 100% |
| Receipt OCR Scanner | ✅ Live | 100% |
| Voice Expense Logging | ✅ Live | 100% |
| Bill Tracking & Recurring Transactions | ✅ Live | 100% |
| Tax Tracking | ✅ Live | 100% |
| Friends (add / mutual detection) | ✅ Live | 95% — missing route-level Zod validation |
| Group Expense Splitting | ✅ Live | 95% — missing route-level Zod validation |
| To-Do Lists (personal + shared) | ✅ Live | 100% |
| Notifications (in-app + email + push) | ✅ Live | 95% — SMS infrastructure only |
| Advisor Booking & Sessions | ✅ Live | 100% |
| Admin Feature Gates (44 flags) | ✅ Live | 100% |
| Cross-user Notifications (friend events) | ✅ Live | 100% |
| Email (SendGrid) | ✅ Live | 100% |
| Push Notifications (FCM) | ✅ Live | 100% |
| SMS / OTP via SMS | ⚠️ Partial | Infrastructure only — no Twilio/SNS worker |
| E2E Testing | ❌ Missing | No Playwright / Cypress suite |
| OAuth (Google / Apple Sign-in) | ❌ Missing | Not started |
| Open Banking / Live balance import | ❌ Missing | Not started |
| Biometric Auth (FaceID / Fingerprint) | ❌ Missing | Capacitor-ready, not wired |
| WebSocket notification for advisor sessions | ⚠️ TODO | session.controller.ts line 101 |
| Error monitoring (Sentry) | ⚠️ TODO | errorHandling.ts line 223 |

---

## Sprint Structure

### SPRINT 1 (Current) — Real-Data User Testing
**Duration:** 1 week (June 13 – June 20, 2026)
**Goal:** Validate every core feature with real data across 7 user personas. Identify bugs before the next feature push.

> See **[User-Level Test Scenarios](../testing/USER_LEVEL_TEST_SCENARIOS.md)** for the full plan.

**Deliverables:**
- [ ] 7 test user accounts created with realistic data (see testing doc)
- [ ] Each user's flows manually tested end-to-end
- [ ] Bug report filed per user persona
- [ ] Cross-user notification flow verified (User A adds User B → both get notified)
- [ ] Group expense split verified across 2+ users
- [ ] Shared To-Do list verified across users

**Success criteria:** All 7 user scenarios complete without blocking errors. Notification events fire correctly for friend + group flows.

---

### SPRINT 2 — Validation Hardening + SMS Integration
**Duration:** 1 week (June 21 – June 27, 2026)
**Goal:** Patch the 2 validation gaps found in Sprint 1 and ship SMS.

**Tasks:**
- [ ] Add Zod validation middleware to `friend.routes.ts` (schema: name, email/phone, nickname)
- [ ] Add Zod validation middleware to `group.routes.ts` (schema: name, members array, currency)
- [ ] Integrate Twilio (or AWS SNS) for SMS delivery in the notification worker
- [ ] Wire SMS OTP for login verification (replace email OTP as fallback)
- [ ] Add SMS delivery channel to `notification.service.ts`
- [ ] Add SMS delivery tracking to `notification.deliveryStatus`
- [ ] Test: OTP via SMS on login for all 4 roles
- [ ] Test: SMS notification on friend request

**Deliverables:**
- [ ] `sms.worker.ts` with Twilio integration
- [ ] Zod schemas for friends and groups routes
- [ ] SMS OTP tested end-to-end
- [ ] Updated notification channel documentation

---

### SPRINT 3 — WebSocket Session Notifications + Error Monitoring
**Duration:** 1 week (June 28 – July 4, 2026)
**Goal:** Complete the advisor session real-time experience and add production error visibility.

**Tasks:**
- [ ] Implement TODO at `session.controller.ts:101` — WebSocket notification when session starts/ends
- [ ] Advisor gets real-time alert when client joins session
- [ ] Client gets real-time alert when advisor starts session
- [ ] Integrate Sentry (or equivalent) — `errorHandling.ts:223`
- [ ] Configure Sentry with user ID, role, and environment tags
- [ ] Add Sentry to both frontend and backend
- [ ] Set up error alerting thresholds (Sentry → Slack/email alerts)
- [ ] Test: Advisor + Client session flow end-to-end with WebSocket events
- [ ] Test: Trigger a controlled error and confirm it appears in Sentry

**Deliverables:**
- [ ] Real-time advisor session notifications working
- [ ] Sentry installed and receiving errors from production
- [ ] Error dashboard accessible to admin team

---

### SPRINT 4 — E2E Test Suite (Playwright)
**Duration:** 2 weeks (July 5 – July 18, 2026)
**Goal:** Build a comprehensive automated E2E test suite that runs on every deployment.

**Critical paths to automate:**
- [ ] Register new user → complete onboarding
- [ ] Login with OTP → access dashboard
- [ ] Add account → add transaction → verify dashboard balance
- [ ] Create goal → add contribution → verify progress
- [ ] Scan receipt → confirm extracted transaction
- [ ] Add friend → verify cross-user notification
- [ ] Create group → add expense → split → verify each member share
- [ ] Book advisor session (client flow) + accept (advisor flow)
- [ ] Admin: approve advisor application

**Setup:**
- [ ] Install Playwright with TypeScript
- [ ] Add CI step in `.github/workflows/` to run E2E on PR merge to main
- [ ] Create test fixture users (separate from manual test users)
- [ ] Run against staging environment

**Deliverables:**
- [ ] `tests/e2e/` folder with Playwright tests
- [ ] CI pipeline gate: PR cannot merge if E2E fails
- [ ] Test report published as GitHub Actions artifact

---

### SPRINT 5 — Biometric Auth + OAuth
**Duration:** 2 weeks (July 19 – August 1, 2026)
**Goal:** Improve onboarding conversion with Google/Apple sign-in and enhance mobile security.

**Tasks:**
- [ ] Integrate Google OAuth on web (Supabase Auth provider)
- [ ] Integrate Apple Sign-In (required for iOS App Store)
- [ ] Wire Capacitor Biometric plugin for FaceID / Fingerprint on mobile
- [ ] Biometric: on device that supports it, offer as alternative to PIN
- [ ] Handle OAuth user creation (map to existing account if email matches)
- [ ] Test: Google login on web + Android
- [ ] Test: Apple login on iOS simulator
- [ ] Test: Fingerprint unlock on Android device

**Deliverables:**
- [ ] Google + Apple sign-in buttons on login screen
- [ ] Biometric auth option in Security settings
- [ ] OAuth flow tested on 3 devices

---

### SPRINT 6 — Performance + Open Banking Exploration
**Duration:** 2 weeks (August 2 – August 15, 2026)
**Goal:** Ensure the app handles scale. Begin research on live bank data import.

**Tasks:**
- [ ] Load test API endpoints (transactions, dashboard) with k6 or Artillery
- [ ] Identify and fix any endpoint that exceeds 500ms at 100 concurrent users
- [ ] Optimize Prisma queries with missing indexes (run EXPLAIN ANALYZE)
- [ ] Frontend: verify Vite code-splitting (no bundle chunk > 500KB)
- [ ] Add Redis cache for dashboard summary endpoint
- [ ] Research: evaluate account aggregation APIs (Plaid, FinBox, Setu AA)
- [ ] Prototype: bank statement auto-import via AA (Account Aggregator) API
- [ ] Spike: live balance polling strategy

**Deliverables:**
- [ ] Performance test report with before/after metrics
- [ ] Redis-cached dashboard endpoint (< 50ms response)
- [ ] Open Banking PoC document with vendor recommendation

---

## Priority Backlog (Post Sprint 6)

| Feature | Priority | Rationale |
|---|---|---|
| Open Banking / Live balance import | High | Major user value — removes manual entry |
| iOS App Store submission | High | Wider distribution |
| Financial report templates (PDF export) | Medium | Common advisor/client request |
| Advisor earnings withdrawal portal | Medium | Advisor retention |
| Referral / invite system | Medium | Growth lever |
| Multi-currency real-time exchange rates | Medium | Global users |
| AI-powered monthly financial summary (auto-generated) | Medium | Engagement driver |
| Dark mode | Low | UX enhancement |
| Apple Watch / WearOS companion | Low | Future expansion |

---

## Current Sprint 1 — User Scenario Summary

| User | Persona | Core Features Being Tested |
|---|---|---|
| U1 | Debt Manager | Loan tracking, EMI logging, repayment |
| U2 | Group Splitter | Group expense splitting, friend requests, settlements |
| U3 | Investor | Stock, mutual fund, gold, FD tracking |
| U4 | Goal Setter | Multiple savings goals, contributions, milestones |
| U5 | Portfolio Builder | Multiple accounts, transfers, transaction categorization |
| U6 | Collaborative Planner | Shared To-Do lists, personal To-Do lists, group tasks |
| U7 | Power User | All features — full activity monitoring dashboard |

> Full scenario details, seed data, and test scripts: **[USER_LEVEL_TEST_SCENARIOS.md](../testing/USER_LEVEL_TEST_SCENARIOS.md)**

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| SMS vendor setup delay | Medium | Medium | Use email OTP as fallback during Sprint 2 |
| E2E tests flaky on CI | High | Medium | Run with retry=2, use stable test fixtures |
| OAuth edge cases (existing email + new OAuth) | Medium | High | Detect and merge accounts at auth layer |
| Open Banking API approval delay (RBI-regulated) | High | High | Start vendor relationship early in Sprint 6 |
| Sentry quota overage in production | Low | Low | Set sampling rate to 10% initially |

---

*Document maintained by: Platform Owner / CEO*
*Next review: End of Sprint 1 (June 20, 2026)*
