# KANKU - Feature Inventory & Specifications

This document catalogs every functional feature of Kanku (Finora), explaining the business value, user journeys, technical flows, and dependencies.

---

## 1. Authentication & Security Gateways

### 1.1 Multi-Mode Identity Setup
- **Purpose**: Authenticates system access and creates user profiles.
- **Business Value**: Protects private user financial data from unauthorized access.
- **User Flow**: User signs up with email/password, completes onboarding preferences, and logs in.
- **Technical Flow**: Interacts with Supabase Auth. The API transport uses headers (\`Authorization\` and \`x-refresh-token\`) instead of response bodies.
- **Dependencies**: Supabase Authentication Service, PostgreSQL.
- **Future Enhancements**: Integrate OAuth (Google, Apple Sign-in) and biometric passkeys.

### 1.2 User PIN Setup & Authentication Gate
- **Purpose**: Access gate to secure dashboard views.
- **Business Value**: Prevents local device shoulder-surfing or unauthorized app usage.
- **User Flow**: Post-onboarding, user must set up a 4-to-6 digit PIN. App redirects to PIN gate on every fresh start.
- **Technical Flow**: PIN hashes are stored in \`UserPin\` table. Checks block route rendering in \`App.tsx\` if \`isAuthenticated\` is false.
- **Dependencies**: local \`localStorage\`, \`UserPin\` database table.
- **Future Enhancements**: Biometric fallback (FaceID/Fingerprint) via Capacitor plugins.

---

## 2. Wealth & Expense Tracking

### 2.1 Accounts & Cash Ledgers
- **Purpose**: Replicates real-world banking, investment, and cash holdings.
- **Business Value**: Provides a single source of truth for total net worth calculation.
- **User Flow**: User creates accounts (e.g. Bank, Cash, Credit Card) with name, type, and opening balance.
- **Technical Flow**: Implements separated Controller/Service architecture (\`account.controller.ts\` -> \`account.service.ts\`). Checks name uniqueness.
- **Dependencies**: Prisma ORM, Redis (cache invalidation).
- **Future Enhancements**: Open Banking API integration to pull live balances automatically.

### 2.2 Transactions Ledger
- **Purpose**: Logs financial inflows, outflows, and transfers.
- **Business Value**: Tracks habits, calculates cash flow, and feeds reporting models.
- **User Flow**: User clicks "+" -> inputs amount, category, date, payment method, and description.
- **Technical Flow**: Balance modifications and transaction entries are wrapped in atomic database transactions (\`prisma.$transaction\`).
- **Dependencies**: \`Account\`, \`Transaction\` models.
- **Future Enhancements**: Smart categorization learning based on user corrections.

---

## 3. Collaborative & P2P Finance

### 3.1 Shared Peer-to-Peer Expenses (Bill Splits)
- **Purpose**: Split group bills and track collective payments.
- **User Journey**: User adds friend -> creates a group expense -> splits equally or by percentage -> friends receive push/app notifications.
- **Technical Flow**: Manages relational inserts on \`GroupExpenseMember\` to map registered user accounts. Emits live WebSockets on edits.
- **Dependencies**: \`Friend\`, \`GroupExpense\`, \`GroupExpenseMember\` models.
- **Future Enhancements**: Settle split expenses via mobile payment gateways.

### 3.2 Collaborative To-Do Lists
- **Purpose**: Peer sharing of task lists, budgets, or shopping lists.
- **User Journey**: User creates a list -> shares it via email -> list appears in shared users\' dashboards.
- **Technical Flow**: Executes raw queries (\`$queryRawUnsafe\`) for Supabase-backed relational lists to bypass default key constraints.
- **Dependencies**: \`db.toDoListShares\`, \`db.toDoLists\` local Dexie storage.
- **Future Enhancements**: Real-time collaborative typing or check-off indicators.

---

## 4. Intelligent Automation Systems

### 4.1 Hybrid Receipt OCR Scanner
- **Purpose**: Auto-fills expense attributes from a photo of a receipt.
- **Business Value**: Reduces entry friction, encouraging consistent expense logging.
- **User Flow**: User uploads image -> text is parsed -> user confirms auto-filled details -> expense is saved with receipt attached.
- **Technical Flow**: Tesseract.js extracts OCR text -> Gemini 1.5 Flash structures JSON -> links image to transaction.
- **Dependencies**: Gemini Flash API key, local filesystem storage or Supabase storage buckets.
- **Future Enhancements**: Automated matching of scanned receipts with imported bank transactions.

### 4.2 Voice AI Expense Logging
- **Purpose**: Allows hands-free audio expense logging.
- **Business Value**: Extremely high accessibility and frictionless entry on mobile devices.
- **User Flow**: User taps mic -> speaks command -> AI processes and adds the transaction.
- **Technical Flow**: Text-to-speech conversion routed to Gemini NLP parser to identify Amount, Category, and Date.
- **Dependencies**: Browser Web Speech API, Gemini Flash model.
- **Future Enhancements**: Offline Voice NLP engine for device-only processing.

---

## 5. Advisory Cooperative

### 5.1 Financial Advisor Bookings
- **Purpose**: Book planning sessions with verified advisors.
- **User Journey**: Client views verified advisors list -> books a slot -> conducts chat session.
- **Technical Flow**: Manages availability slots via \`AdvisorAvailability\` and schedules \`AdvisorSession\` entries.
- **Dependencies**: \`User\` roles, Socket.IO channels.
- **Future Enhancements**: Integrated video call rooms within the app shell.

### 5.2 Dynamic Client Workspace
- **Purpose**: Dashboard for advisors to audit client portfolios.
- **User Journey**: Advisor opens Client Management page -> views client list derived from active sessions -> calculates asset valuation based on shared client salary.
- **Technical Flow**: Deduplicates and maps clients via session SQL joins, adding client phone mapping from profiles.
- **Dependencies**: \`profiles\` table join, \`AdvisorSession\` mapping.
- **Future Enhancements**: Structured financial advice generator tool.
