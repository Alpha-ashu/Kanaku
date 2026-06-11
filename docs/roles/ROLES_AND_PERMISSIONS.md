# KANAKU - Role-Based Governance, Permissions & Workflows

This document establishes the user roles, security access levels, functional workflows, and authorization permissions within the KANAKU (KANAKU) ecosystem.

---

## 1. System Roles Overview

KANAKU classifies users into four distinct roles:
1. **Admin**: Platform governance, security administration, and global overrides.
2. **Advisor**: Verified financial planners conducting client consultative audits.
3. **Client**: Collaborative platform users working with financial advisors.
4. **End User**: Standard standalone platform users.

---

## 2. Permission Matrix

The following matrix defines the granular access control for each role:

| Module / Action | End User | Client | Advisor | Admin |
|---|---|---|---|---|
| Create Accounts / Transactions | ✅ | ✅ | ❌ | ❌ |
| View Own Financial Reports | ✅ | ✅ | ✅ (Shared) | ❌ |
| Scan Receipts / Voice NLP | ✅ | ✅ | ❌ | ❌ |
| Split Bills / Manage Friends | ✅ | ✅ | ❌ | ❌ |
| Book Planning Sessions | ❌ | ✅ | ❌ | ❌ |
| Accept Bookings / View Clients | ❌ | ❌ | ✅ | ❌ |
| Calculate Portfolios / Read Salaries | ❌ | ❌ | ✅ (Clients Only) | ❌ |
| Global Feature Flags Override | ❌ | ❌ | ❌ | ✅ |
| Verify & Approve Advisors | ❌ | ❌ | ❌ | ✅ |
| Access Sync Diagnostics Console | ❌ | ❌ | ❌ | ✅ |

---

## 3. Role Details & Workflows

### 3.1 Admin Workflow
- **Access Level**: Full global system configuration access.
- **Responsibilities**: Approving financial advisors, managing global application settings, toggling feature availability, and auditing sync pipelines.
- **Core Journey**:
  1. Authenticates through standard login.
  2. Accesses the Admin Dashboard panel.
  3. Reviews pending advisor registration requests. Approving a request triggers a notification event and changes the user\'s role to "advisor".
  4. Configures system-wide feature flags (e.g. disabling Voice Assistant globally if the API quota is near limits).
  5. Monitors system queues via the Sync Monitor Dashboard.

### 3.2 Advisor Workflow
- **Access Level**: Professional Workspace access. Cannot create financial transactions or accounts but has read-only access to booked clients\' net worth and salary metrics.
- **Responsibilities**: Providing verified financial advice, scheduling slot availabilities, and analyzing client-shared data.
- **Core Journey**:
  1. Advisor registers and gets approved by an Administrator.
  2. Sets weekly schedule slots (saved in \`AdvisorAvailability\` table).
  3. Receives session requests from Clients. Accepting creates an active \`AdvisorSession\`.
  4. Uses the Client Management Dashboard to track active clients. Client salary details are automatically mapped to calculate investment portfolio metrics.
  5. Uses the Secure chat room inside the session window to consult with the client.

### 3.3 Client Workflow
- **Access Level**: Collaborative personal finance tracker.
- **Responsibilities**: Managing personal finances and cooperating with financial advisors.
- **Core Journey**:
  1. Client signs up and navigates to the Advisor booking screen.
  2. Books a slot with a verified Advisor.
  3. Conducts chat sessions and grants data reports access.
  4. Views joint budgets or saving goals established with the advisor.

### 3.4 End User Workflow
- **Access Level**: Standard private finance tracker.
- **Responsibilities**: Standalone tracking of accounts, cards, investments, budgets, and bills.
- **Core Journey**:
  1. End User signs up, completes onboarding, and sets up local PIN protection.
  2. Track daily transactions, logs account balances, and creates goals.
  3. Scans physical bills or uses Voice AI to log expenses.
  4. Operates local-first (data is synced in the background to the cloud).
