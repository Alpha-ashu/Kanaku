# Test Plan: User & Advisor Role Scenario-Level Testing

This document defines the test plan for scenario-level verification of the User and Advisor roles within the Kanaku platform.

## 1. Objectives
- Validate end-to-end user workflows from signup/onboarding to daily financial activities.
- Validate the lifecycle of financial advisors from application submission and approval to scheduling availability, session bookings, notes, and payouts.
- Ensure data isolation and authorization policies are robustly enforced.

## 2. Test Environment
- **Backend API**: Running at `http://localhost:3000` (Postgres & Prisma schema).
- **Frontend App**: Running at `http://localhost:9002` (Vite, React, Dexie IndexedDB cache).
- **Automation Framework**: Playwright (Typescript) running in headless/headed modes.

## 3. Test Roles
1. **User (Client)**: A standard user who creates accounts, enters transactions, registers goals/debts, searches for financial advisors, and books advisory sessions.
2. **Advisor**: A professional advisor who applies for status, updates availability, conducts advisory sessions, views client bookings, logs session notes, and requests payouts.
3. **Manager/Admin**: Internal staff role responsible for review, verification, and approval/rejection of advisor applications.

---

## 4. Test Scenario Directory (10 Scenarios per Role)

### User Role Scenarios
| Scenario ID | Name | Focus Area |
|-------------|------|------------|
| US-01 | New User Registration & Validation | Form validation, password strength, matching confirmation. |
| US-02 | Login Challenge-Response Flow | Challenge code verification, SHA-256 password hashing. |
| US-03 | Account Creation & Balance Ingestion | Savings, cash, credit cards; validation of empty/negative values. |
| US-04 | Income & Expense Logging | Multi-category transaction entries; check totals/balance calculation. |
| US-05 | Inter-Account Transfers | Transfer funds between accounts; verify matching updates. |
| US-06 | Goal Setting & Contributions | Long-term target tracker setup; contributing savings; goal completion. |
| US-07 | Debt & EMI Tracking | Loan creation, interest rate validations, and EMI payment logs. |
| US-08 | To-Do Checklist Management | Personal/shared checklist creation, task manipulation. |
| US-09 | Advisor Directory Browsing | Search query, rating, and specialization filters. |
| US-10 | Consultation Booking | Scheduling preferred date/time slot, topic selection, submission. |

### Advisor Role Scenarios
| Scenario ID | Name | Focus Area |
|-------------|------|------------|
| AD-01 | Advisor Application Submission | PDF document uploads (PAN/Aadhaar) and profile text info. |
| AD-02 | Application Rejection Lifecycle | Rejection flow with compliance notes and state recovery. |
| AD-03 | Compliance Review & Status Activation | Manager verification, document review, and status to ACTIVE. |
| AD-04 | Slot & Calendar Availability Setup | Customizing working days, timings, and timezones. |
| AD-05 | Session Bookings Overview | Reading client booking requests, status validation. |
| AD-06 | Session Notes Logging | Writing detailed notes, private indicators, and action items. |
| AD-07 | Fee Transaction Records | Verifying paid status, currencies, and payment references. |
| AD-08 | Payout Request Handling | Payout creation with bank details, tracking status. |
| AD-09 | Profile Update & Customizations | Updating experience years, certifications, and session fees. |
| AD-10 | Data Isolation & Security Restrictions | Preventing unauthorised actions (IDOR, non-auth blockages). |

---

## 5. Execution & Reporting Strategy
- **Parametrisation**: Tests will accept an array of custom datasets containing valid, invalid, boundary, and localized values.
- **Screenshots & Traces**: Playwright will record screenshots at key milestones and output reports in HTML and JSON formats.
