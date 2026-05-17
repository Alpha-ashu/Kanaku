# KANKU Project: Master Developer Context & Changelog

This document serves as the single source of truth for the project's architecture, design system, and implementation history. **Any AI assistant or developer working on this project must read this file first to ensure consistency.**

---

##  Core Architecture

KANKU follows a **feature-modular structure** within the frontend to ensure scalability and clarity.

- **Root Directory**: Contains global configuration (`package.json`, `vite.config.ts`, `tsconfig.json`).
- **`frontend/src/app/components/`**: The unified home for all UI components.
  - `core/`: Primary app shells (Dashboard, Accounts, Transactions, BottomNav, TopBar).
  - `auth/`: Authentication flows, login/signup, and onboarding.
  - `transactions/`: AddTransaction, Transfer, PayEMI, StatementImport, ReceiptScanner, BillUpload.
  - `receipt-scanner/`: Shared sub-views for the ReceiptScanner (ReceiptScannerViews.tsx).
  - `features/`: Extended modules (Reports, Calendar, VoiceInput, ToDoLists).
  - `shared/`: Reusable layouts and complex patterns (AppLayout, QuickActionModal, Diagnostics, CenteredLayout).
  - `ui/`: Low-level, reusable atoms (Buttons, Cards, Inputs, Logos).
  - `admin/`: Admin-only modules (AdminDashboard, AdminFeaturePanel, AdminAIDashboard).
  - `manager/`: Manager-only modules (ManagerAdvisorVerification).
- **`frontend/src/lib/`**: Core services, business logic, and API clients.
- **`frontend/src/contexts/`**: Global state management (Auth, App, UI).
- **`frontend/src/services/`**: Domain services (DocumentManagementService, documentIntelligenceService, receiptScannerService, cloudReceiptScanService, permissionService, adminConsoleService).
- **`frontend/src/hooks/`**: Custom hooks (useReceiptScanner, useTransactionCreation).
- **`frontend/src/types/`**: Shared TypeScript types (receipt.types.ts).
- **`docs/`**: Archived documentation and implementation guides.
- **`unused/`**: Deprecated or archived code (do not import from here).

###  Import Conventions
- **Always use absolute aliases**: Use `@/app/components/...` or `@/lib/...`.
- **Avoid relative nesting**: Do not use `../../../`.

---

##  Design System & Theme

KANKU uses a **Premium Glassmorphic Aesthetic**. All new features must adhere to these standards:

### **Color Palette**
- **Primary Gradient**: `#7B4CFF` (Purple) to `#4A9EFF` (Blue).
- **Surface**: High-transparency white/slate backgrounds with `backdrop-blur-xl`.
- **Accents**:
  - Success: Emerald-500
  - Error: Rose-500
  - Warning: Amber-500
  - Bill/Attachment: Orange-400 / Orange-500

### **UI Tokens**
- **Corners**: `rounded-[30px]` for cards, `rounded-2xl` (16px) for inner elements.
- **Glassmorphism (Standard)**: `bg-white/80` or `bg-white/70` with `backdrop-blur-xl` and `border-white/20`.
- **Logos & Branding**: Centralized bank/card logo rendering in `src/app/components/ui/AccountLogos.tsx`. This avoids Vite Fast Refresh conflicts by keeping page components as single-export modules.
- **Shadows**: Premium `shadow-xl shadow-black/5` or `shadow-floating`.
- **Typography**: Modern Sans-Serif (Inter/Outfit). High contrast (font-black) for titles, muted for metadata.

### **Stacking Context (Z-Index)**
- **Backdrops**: `z-[60]`
- **Modals/Drawers**: `z-[61]`
- **Transaction Detail Sheet (mobile)**: `z-[61]`
- **Bill Preview Modal**: `z-[70]`
- **Receipt Scanner Overlay**: `z-[80]`
- **Overlays/Toasts**: `z-[100]`
- **Modal Popups (Mobile)**: `max-w-lg` for a centered "half-size" floating card effect. Must use `z-[101]` for content and `pointer-events-auto`.
- **Transaction Rows**: Use consolidated vertical date blocks and flexible horizontal alignment to prevent text overlap in data-dense views.

###  Database Maintenance Standards
- **Deduplication**: When implementing imports or syncs, use `deduplicateLocalData` to merge redundant records. Soft-matching should use `(date, amount, description)` for transactions.
- **Diagnostics**: All core maintenance tools (Deduplicate, Reset) must be exposed in the `Diagnostics` component with appropriate safeguards (confirmations/spinners).
- **Sync Integrity**: Always prefer `upsert` with `onConflict` (remoteId/cloudId) to prevent upstream duplication during sync cycles.

###  UI Interaction Standards
- **Popups**: Mobile popups must use `max-w-lg` and `pointer-events-auto` on the container to ensure button interactability.
- **Z-Index Hierarchy**: Modal backdrops start at `z-[100]`, content at `z-[101]`. Avoid exceeding `z-[200]` unless for global notifications.

###  Real Mock Credentials (Dev/Staging)
| Role | Email | Password |
| :--- | :--- | :--- |
| **Admin** | `admin@kanku.com` | `Admin@2026!k` |
| **Manager** | `manager@kanku.com` | `Manager@2026!k` |
| **Advisor** | `advisor@kanku.com` | `Advisor@2026!k` |
| **User** | `user@kanku.com` | `User@2026!k` |

> [!IMPORTANT]
> To use these, you MUST first create them in your **Supabase Auth** dashboard, then run the SQL below to map their roles in the `public.users` table.

###  Supabase Role Mapping SQL
```sql
INSERT INTO public.users (id, email, role, name, status)
VALUES 
  ('REPLACE_WITH_AUTH_ID', 'admin@kanku.com', 'admin', 'System Admin', 'active'),
  ('REPLACE_WITH_AUTH_ID', 'manager@kanku.com', 'manager', 'Compliance Manager', 'active'),
  ('REPLACE_WITH_AUTH_ID', 'advisor@kanku.com', 'advisor', 'Senior Advisor', 'active'),
  ('REPLACE_WITH_AUTH_ID', 'user@kanku.com', 'user', 'Premium Client', 'active')
ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role;
```

---

##  Change Log & Evolution

### **2026-05-17 (Evening) — Navigation Registration, Settings Auto-Rearrange & Manager RBAC Stabilization**

#### 1. Navigation Menu Registration & Flow Integration (`navigation.ts`, `useSharedMenu.ts`)
- **Menu Items Populated**: Registered all 7 new feature pages (Tax Calculator, AI Insights, Data Export, Recurring Transactions, Budget Alerts, Client Management, AI Management) inside both the desktop `sidebarMenuItems` and the mobile `headerMenuItems` in `navigation.ts`.
- **RBAC Role Filtering**: Assigned correct icons (`lucide-react`) and customized role restrictions for premium advisor tools like `client-management` (restricted to admin, manager, advisor roles).
- **Admin Routing Bypass**: Updated the `useSharedMenu` hook bypass list to include both `ai-management` and `advisor-verification` route IDs, ensuring administrators always have access regardless of local feature state.

#### 2. Dynamic Settings Page Rearrangement (`Settings.tsx`)
- **Data-Driven Sections**: Re-engineered the Settings page to use a structured, data-driven section definitions array (`SettingsSection[]`).
- **Real-time Feature Auto-Hiding**: Each settings card declares its dependency on a specific `featureKey`. If an administrator disables a feature (e.g. `dataExport` or `notifications`), the corresponding settings card immediately hides from both the mobile stack and desktop grid in real-time.
- **Dynamic 3-Column Column Balancing**: Configured a `useMemo` hooks-based grid builder that dynamically splits the filtered, visible sections evenly across 3 desktop columns using round-robin distribution. Disabling a feature reflows the grid dynamically, leaving no empty slots or broken column gaps.

#### 3. Manager RBAC Route Stabilization & 403 Forbidden Fixes (`rbac.ts`, `advisor.routes.ts`, `AdminFeaturePanel.tsx`)
- **Backend Role Support**: Added the `'manager'` role type to `UserRole` union in the backend RBAC middleware (`rbac.ts`), aligning with the database's string-based role capabilities.
- **403 Forbidden Resolved**: Updated the backend advisor routes (`advisor.routes.ts`) for approving, rejecting, and viewing pending advisor applications (`/admin/applications`) to allow both `'admin'` and `'manager'` roles (`requireRole(['admin', 'manager'])`). Compliance managers can now successfully access the application verification panel without server denial.
- **Compiler Type Safety**: Resolved strict TypeScript compilation errors in `AdminFeaturePanel.tsx` by declaring a base `FeatureControlBase` array and mapping it to the final `FEATURES: FeatureControl[]` type, preventing string-to-union literal mismatches on `readiness` settings. Corrected a type mismatch on `visibleFeatures` inside `useSharedMenu.ts` with a safe `FeatureVisibility` cast.
- **Global Settings Preservation**: Solved the feature matrix reset on user logout. Wiped all user-specific credentials during `localStorage.clear()` but preserved `admin_global_feature_settings` along with the PIN keys (`KANKU_encrypted_key` and `KANKU_salt`) across all signout methods in `encryption.ts`, `Settings.tsx`, and `SecurityContext.tsx`. The Master Feature Matrix configuration is now persistent and consistent.

#### 4. Sidebar Panel Navigation Stabilization & Admin Role Assignment Console (`navigation.ts`, `useSharedMenu.ts`, `AdminDashboard.tsx`, `admin.routes.ts`)
- **Admin Console Registered**: Created and registered the main `'admin'` page (`Admin Dashboard`) in `sidebarMenuItems` and `headerMenuItems` with a distinctive `ShieldAlert` icon, separate from `'admin-feature-panel'` (Feature Panel).
- **Core Panels Always Visible**: Modified the `useSharedMenu` filtering hook so that crucial Administrative and Management panels (`admin`, `admin-feature-panel`, `ai-management`, and `advisor-verification`) always bypass the client-side active flags for their respective roles. `admin` and `manager` roles will never be locked out or experience empty slots for core panels.
- **Team Role Assignment Feature**: Solved the capability gap when new team members join. Added a dynamic User Role selector dropdown (`<select>`) right next to the user block/unblock control inside the `AdminDashboard` UI, allowing administrators to change roles (`'admin' | 'manager' | 'advisor' | 'user'`) dynamically in real-time.
- **Backend Endpoints & Type Safety**: Registered `/api/v1/admin/users/:userId/role` endpoint in `admin.routes.ts` and `admin.controller.ts` with database integration, user notifications, and full parameter type safety. Cleared a pre-existing Prisma empty `include` object typing error inside `syncQueue` queries to ensure 100% compilation safety.
- **Sidebar Auto-Resizing & Scrollability**: Resolved layout issues when many features are enabled. Converted the sidebar navigation element in `Sidebar.tsx` to a flexible, scrollable container (`flex-1 min-h-0 overflow-y-auto scrollbar-hide pb-4`) instead of `shrink-0`. The sidebar card now dynamically resizes its height to fit the features list up to a maximum of `90vh`, smoothly handling scrolling inside the panel when exceeded without spillover.

---

### **2026-05-17 (Late Afternoon) — App-Wide CenteredLayout Standardization & Role Visibility Propagation**

#### 1. Dynamic Feature Visibility Propagation to Navigation & Page Controls
- **Global Context Propagation**: Fully propagated `visibleFeatures` dynamically updated from the database role overrides down to the key navigation shells and account/profile controls.
- **TopBar & Header Overhaul (`TopBar.tsx`, `Header.tsx`)**:
  - Dynamically hides the **Notification Bell** button in the TopBar and Page Header if the `notifications` feature flag is administratively disabled (`visibleFeatures?.notifications === false`).
  - Conditionally displays the **Profile Avatar** action button in the TopBar only when the `userProfile` feature flag is active (`visibleFeatures?.userProfile !== false`).
- **Feature Disabled View (`UserProfile.tsx`)**:
  - Implemented an elegant system-wide fallback screen for the User Profile. If `visibleFeatures?.userProfile === false`, the page renders a high-fidelity glassmorphic card presenting a **Lock icon**, clear notifications detailing that the feature is system-disabled, and a quick navigation action to safely return to the Dashboard.
- **Settings Visibility Gates (`Settings.tsx`)**:
  - Configured the entire **Notification Settings** control panel to automatically mount/unmount based on `visibleFeatures?.notifications !== false`, ensuring the user settings menu reflects actual system permissions.
- **Global Search & Actions Palette (`TopBar.tsx`)**: Replaced the static, non-functional search input with a highly responsive, premium, and unified app-wide Command & Search engine that works dynamically for all user roles.
  - **Dynamic Multimodal Queries**: Connects natively to IndexedDB and App Context to query in real-time across **Navigation & Tools** (auto-adjusting to the user's role, e.g. hiding admin routes for normal users), **Assets & Accounts** (matching by names, balance, subtypes), and **Recent Transactions** (matching by description, category, and amounts).
  - **Interactive Keyboard Controls**: Integrated native keyboard navigation and focus shortcut (`⌘K` / `Ctrl+K`) that automatically selects the search bar from anywhere on the screen, with full support for `Escape` key close actions.
  - **First-Class Mobile Experience**: Added a dedicated search toggle icon for mobile headers that opens a gorgeous, full-screen floating glassmorphic overlay for swift query and tap-to-navigate flows.

#### 2. System-wide Responsive Grid Normalization (`CenteredLayout.tsx`)
- **CenteredLayout Adoption**: Standardized layout wrapping across **13 core components and viewports** to eliminate visual drift, container offset gaps, and scrollbar reflow anomalies.
- **Redundant Layout Cleanup**:
  - Replaced legacy, nested outer wrappers (such as `w-full min-h-screen max-w-[100vw] bg-transparent` and double scroll-safe boundaries) with a unified `<CenteredLayout>` component in the main return blocks.
  - Trimmed duplicate horizontal and vertical padding classes (`px-4 sm:px-6 lg:px-8 xl:px-12 pt-6 lg:pt-8`) from inner elements, centralizing layout margins, safe-area notches, and responsive breakpoints in a single component.
- **Normalized Pages**:
  - Core Shell: `Header.tsx`, `TopBar.tsx`
  - Main Pages: `Dashboard.tsx`, `Accounts.tsx`, `Transactions.tsx`, `Settings.tsx`, `UserProfile.tsx`, `Reports.tsx`
  - Modules: `Goals.tsx`, `GoalDetail.tsx`, `Loans.tsx`, `Investments.tsx`, `Groups.tsx`

---

### **2026-05-17 (Afternoon) — Master Feature Matrix & Role Visibility Toggles**

#### 1. Routing Deadlock Fix (`App.tsx`)
- **Problem**: The 'Manage Feature Matrix' button in the Admin Console incorrectly loaded the `<AdminDashboard />` instead of `<AdminFeaturePanel />` due to a duplicate switch fallthrough bug.
- **Fix**: Separated the switch statements to explicitly return `<AdminFeaturePanel />` for the `'admin-feature-panel'` route.

#### 2. Premium UI Aesthetic Overhaul (`AdminFeaturePanel.tsx`)
- Transformed the flat, legacy feature management cards into the high-end **Premium Glassmorphic Aesthetic**.
- Implemented deep drop shadows, hover-scale animations, `bg-gradient-to-r` headers, and `backdrop-blur-md` containers.
- Replaced standard typography with native-style `font-black uppercase tracking-widest` for pills, status indicators, and headers.

#### 3. Explicit Role Visibility Overrides (`AdminFeaturePanel.tsx`, `AppContext.tsx`)
- **Problem**: Feature access was strictly derived from high-level generic Readiness states (e.g., Unreleased, Beta). There was no way to individually toggle access per specific role.
- **Solution**: 
  - Restructured `FeatureControl` to include an explicit `roleAccess: { admin: boolean, manager: boolean, advisor: boolean, user: boolean }` mapping.
  - Implemented a "Role Visibility Override" matrix inside every feature card. Administrators can now manually toggle access for each individual role explicitly.
  - Modified `computeVisibleFeatures` in `AppContext.tsx` to read the `roleAccess` explicit override from `admin_global_feature_settings` broadcast/cache. If an override is set, it overrides the hardcoded readiness logic and updates the active context globally.

---

### **2026-05-17 — Admin Dashboard Stabilization & Auth Race Condition Fixes**

#### 1. Administrative Route Guard & Role Resolution (`App.tsx`, `AuthContext.tsx`, `permissionService.ts`)

**Problem**: Admin users were being redirected away from pages like `admin-ai` with `[Route Guard] Redirecting from disabled page (Role: user)`. The app also got stuck on the loading screen indefinitely.

**Root Causes**:
- `resolveUserRole()` always returned `'user'` unconditionally — no fallback to local cache.
- The Route Guard executed before the backend confirmed the user's real role.
- `setLoading(false)` was never called in scenarios where no `isFreshLogin` or `isAppLoad` condition was met (e.g., `INITIAL_SESSION` for an already-logged-in user when none of the if/else branches matched).

**Fixes Applied**:

1. **`AuthContext.tsx` — Permission-first loading with hard timeout**: The handler now awaits the permission fetch using `Promise.race` with a **5-second timeout**. Loading screen clears in the `finally` block, guaranteeing it always resolves. Cloud sync continues in the background.

2. **`AuthContext.tsx` — Role caching in `resolveUserRole()`**:
   - Added `role?: string` field to the `LocalProfile` type.
   - `resolveUserRole()` now reads from `localStorage` (`user_profile.role`) as a startup hint, preventing a `'user'` flash before the backend responds.

3. **`AuthContext.tsx` — Exhaustive `setLoading(false)` coverage**:
   - Added `else { if (isMounted) setLoading(false); }` for the "no user, not signed out" case (covers `INITIAL_SESSION` with no session).
   - Added `if (isMounted) setLoading(false)` directly in the `catch` block.

4. **`permissionService.ts` — Manager role permissions**: Added full default permissions map for the `manager` role. Previously missing, causing `undefined` access errors.

5. **`App.tsx` — Route Guard bypass for admin/manager**: Introduced explicit bypass so pages in `isSystemAdminPage` (e.g., `admin-dashboard`, `admin-ai`, `admin-feature-panel`) skip all feature-gate checks for `admin` and `manager` roles.

6. **`App.tsx` — Rules of Hooks fix**: Moved `useAuth()` and `useSecurity()` to the very top of `AppContent`, before the `if (!appContext)` early return. This resolves the React "change in the order of Hooks" warning that caused Fast Refresh instability.

#### 2. AdminDashboard 500 Error Fix (`AdminDashboard.tsx`)

**Problem**: The Admin Dashboard failed to load with `500 Internal Server Error` from the Vite dev server (`Failed to fetch dynamically imported module`).

**Root Cause**: A missing `</div>` closing tag for the Infrastructure/Server Metrics section container created an unbalanced JSX tree, crashing the Vite TypeScript compiler.

**Fix**: Restored the missing closing `</div>` tag and added optional chaining to all stats display paths.

**Type-Safety Fixes**:
- `setStats(s)` → `if (s) setStats(s)` — prevents `undefined` in `SetStateAction<SystemStatsDto | null>`.
- `setUsers(u)` → `if (u) setUsers(u)` — prevents `undefined` in `SetStateAction<AdminUserDto[]>`.
- `setUserActivity(activity)` → `if (activity) setUserActivity(activity)` — prevents `undefined` in `SetStateAction<UserActivityDto | null>`.

#### 3. AdminFeaturePanel Syntax Error (`AdminFeaturePanel.tsx`)

**Problem**: ~30 cascading TypeScript lint errors (missing commas, undeclared `key`, `readiness`, `description`, `lastUpdated`).

**Root Cause**: Missing opening `{` for the `'Client Management'` feature entry in the `FEATURES` array.

**Fix**: Added `{` before `name: 'Client Management'`.

#### 4. CenteredLayout Shared Component (`CenteredLayout.tsx`)

- Created `frontend/src/app/components/shared/CenteredLayout.tsx`.
- Provides the standard page container: `w-full mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 pt-4 sm:pt-5 lg:pt-6 pb-24 lg:pb-10 flex-1`.
- Use this instead of duplicating the class string across admin and settings pages.

---

### **2026-05-16  Account Import Stability, AI Auth & UI Overhaul**

1. **Deduplication Engine Integration**:
   - Integrated `deduplicateLocalData()` into the `syncUserDataFromBackend` cycle and the primary `AppContext` mount effect.
   - This prevents duplicate accounts and transactions from appearing during cloud-to-local merges, specifically matching by name, type, and currency.
2. **Admin AI Authentication Stabilization**:
   - Standardized `TokenManager` in `frontend/src/lib/api.ts` to use `auth_token` consistently with fallback support for legacy keys.
   - Refactored `adminAIService.ts` to utilize the centralized `apiClient`, ensuring automatic token resolution from Supabase sessions and robust async error handling.
   - Synchronized `backend/.env` with project-root Supabase credentials to resolve 401 Unauthorized errors on protected AI endpoints.
3. **Feature Visibility & Settings UI Overhaul**:
   - Completely redesigned the "Feature Visibility" grid in `Settings.tsx` to resolve text-icon overlap and alignment regressions.
   - Introduced a premium icon suite (Lucide) for all features and implemented `min-w-0` + `truncate` logic for robust responsiveness on mobile and desktop.
   - Standardized feature card aesthetics with `bg-black/5` active states and consistent spacing.
4. **Modularized Branding System**:
   - Decoupled 400+ lines of SVG-heavy logo rendering logic into a dedicated utility: `src/app/components/ui/AccountLogos.tsx`.
   - This resolved persistent Vite Fast Refresh errors (`Duplicate declaration` and `export incompatible`) across core page modules.
5. **Statement Import Modal Finalization**:
   - Overhauled the `StatementImport.tsx` UI with a high-fidelity "half-size" glassmorphic popup (`max-w-lg`).
   - Resolved header collisions and text overlapping in the transaction review grid.
6. **Account Action Consistency**:
   - Restricted the "Import" button visibility to only `bank` and `card` account types, removing it from `cash` and `digital` accounts.
   - Standardized the placement of account management actions across `Accounts.tsx` and `Dashboard.tsx`.

---

### **2026-05-14  AddTransaction Workflow & UI Finalization**

1. **Transaction Type Header Restructuring**:
   - Merged the separate transaction type tabs (`Expense`, `Income`, `Transfer`) into the primary top header bar for a compact, single-row design matching the requested pill-style layout.
   - Streamlined mobile layout by hiding the title and exposing only the back arrow and tabs.
2. **Transfer Mode Refinements**:
   - Added a `transferMethod` state (`bank` vs. `cash`) below the Self/Others sub-mode.
   - **Bank Transfer**: Shows the standard "To Account" selection.
   - **Cash Transfer**: Hides the account selection and shows an amber banner acknowledging a direct cash handover.
   - **Others Selection**: Added a full `Friends` picker (pill chips) for selecting external recipients quickly, combined with a manual text input.
3. **Loan Form Simplification**:
   - Institutional loans (`Consumer Loan`, `Personal Loan`, `Home Loan`, `Vehicle Loan`, `Education Loan`, `Credit Card`, `Overdraft`) now automatically hide the individual "Person / Participants" picker, prioritizing the Bank/NBFC dropdown.
   - Fixed conditional visibility so `Overdraft` behaves correctly as an institutional loan.
4. **General UI Polish**:
   - Removed the cluttering "Ref # (Optional)" input field from all modes.
   - "Date" field now spans the full width of its container.
   - **Note**: The AddTransaction page layout and logic flow are now finalized and frozen.

---

### **2026-05-13 (Afternoon)  Receipt & Transaction UX Overhaul**

#### 1. Receipt Scanner  Dual-Mode Flow (`ReceiptScanner.tsx`, `ReceiptScannerViews.tsx`, `receipt.types.ts`)

**Problem**: Camera and gallery both triggered OCR automatically. No way to just attach a file without running OCR.

**Solution**: Introduced a step-machine with two clearly separated workflows:

| Mode | Flow | OCR? |
|------|------|------|
| **Scan Receipt** | Mode  Source (Camera/Gallery)  Preview  OCR  Results |  Yes |
| **Add Attachment** | Mode  Source (Camera/Gallery)  Save doc  Done |  No |

**New components in `ReceiptScannerViews.tsx`**:
- `ModeSelectionView`  Two large action cards: "Scan Receipt" (dark) and "Add Attachment" (light).
- `SourcePickerView`  Camera / Gallery sub-picker reused by both modes. Shows amber info strip in attachment mode.

**Step machine in `ReceiptScanner.tsx`**:
- `mode`  `source-scan` / `source-attach`  `preview-scan` / `attaching`  `results`
- Attachment path: `createDocumentRecord`  `updateDocumentStatus('completed')`  `onAttachmentSaved(docId)`. **Zero OCR.**
- Scan path: existing OCR pipeline unchanged.
- Supports `initialMode` prop to skip mode selection.

**New props on `ReceiptScannerProps`** (in `receipt.types.ts`):
- `onAttachmentSaved?: (documentId: number) => void`  called when attachment-only save completes.
- `initialMode?: 'scan' | 'attachment' | null`  skips mode picker, goes straight to source picker.

---

#### 2. AddTransaction  Inline Receipt Section (`AddTransaction.tsx`)

**Changes**:
-  Removed standalone camera button from the header.
-  Added a **"Receipt" card** in the right column (`lg:col-span-5`) with two buttons:
  - **Scan Receipt** (dark, `ScanLine` icon)  opens scanner in scan mode.
  - **Add Attachment** (light, `Paperclip` icon)  opens scanner in attachment mode.
-  Added `attachmentDocumentId` state alongside existing `scanDocumentId`.
-  On save: links whichever doc ID is set (`scanDocumentId ?? attachmentDocumentId`) to the transaction via `DocumentManagementService.linkTransaction()`.
-  Shows a green "Attached" badge + removable confirmation row when a receipt/attachment is linked.
-  `scannerMode` state (`'scan' | 'attachment' | null`) passed as `initialMode` to `ReceiptScanner`.

**Document linking**: The `attachment` field on the transaction is set to `document:{id}` and `importMetadata['Document Id']` is also set. This is how `Transactions.tsx` detects a linked bill to show the Eye icon.

---

#### 3. Transactions Page  Responsive List & View Bill (`Transactions.tsx`)

**Problem**: Single table layout broke on mobile. Eye (View Bill) icon was hidden behind hover. No mobile detail view.

**Solution**:

**Desktop (lg+)**:
- All 4 columns visible: Details, Category, Account, Amount + Actions.
- **Eye icon** (`text-orange-400`)  **always visible** (not hover-gated) when a bill is attached.
- Edit/Delete icons remain hover-only (`opacity-0 group-hover:opacity-100`).
- "Bill attached" shown as orange `Paperclip` badge in Details cell.

**Mobile (< lg)**:
- Card-based list showing **Details + Amount** only.
- Orange `Paperclip` "Bill" badge shown inline when bill exists.
- `ChevronRight` arrow signals tappable row.
- Tapping any row opens the **Transaction Detail Bottom Sheet**.

**Mobile Detail Sheet** (`motion.div`, `z-[61]`):
- Spring-animated slide-up drawer.
- Drag handle, header with icon + description + date.
- **Amount hero** with transaction type badge.
- Full detail rows: Category, Account, Date, Tax Amount, Notes.
- **"View Attached Bill"**  full-width orange button, always visible when bill attached.
- **Edit** and **Delete** action buttons (2-column grid).
- Backdrop tap to close.

---

### **2026-05-12 (Evening)  Sync Stabilization & User Profile Finalization**

1. **Synchronization Engine Stabilization**:
   - Standardized `cloudId` (camelCase) indexing across `backend-sync-service.ts`, `sync-service.ts`, and `offline-sync-engine.ts`.
   - Resolved persistent `SchemaError` by aligning codebase field names with Dexie Version 11 schema.
2. **User Profile Finalization**:
   - Implemented a modernized **Avatar Gallery** with 28 curated high-quality characters (DiceBear).
   - Fixed selection persistence and preview updates in the profile editor.
   - Standardized date formatting to `DD-MMM-YYYY` (e.g., 25-Aug-1996) using a custom Popover/Calendar component.
   - Applied precision rounding (`Math.round`) to all monthly income calculations to resolve floating-point display errors.
   - **Update Logic Stabilization**: Refactored `avatar-gallery.ts` resolution logic to handle external URLs with query parameters correctly and simplified the `UserProfile` preview logic to use a single-source state (`tempData`), ensuring zero-latency UI updates during selection.
   - **Note**: The User Profile page is now considered "Perfect" and is frozen for future changes.

---

### **2026-05-12 (Morning)  Account Module Finalization & Design Standardization**

1. **Account Module Stabilization**:
   - The **Account Page** and **Add Account** sub-page have been finalized with a premium responsive layout.
   - Standardized glassmorphic cards, balance entry, and brand-specific iconography (Bank/Credit Card/Wallet).
   - **Note**: These pages are considered "Perfect" and should not be edited unless explicitly requested.

---

### **2026-05-11  Unified Component Architecture & Project De-cluttering**

1. **Directory Consolidation**:
   - Eliminated `src/components/`. All active components moved to `src/app/components/`.
   - Merged `onboarding` into `src/app/components/auth/onboarding/`.
   - Standardized `shared/` layout components (`AppLayout`, `LimitedModeBanner`).
2. **Project Root Cleanup**:
   - Moved 70+ standalone documentation files to the `docs/` folder.
   - Moved truly dead code to `frontend/src/unused/`. (Note: `realTime.ts` and `enhanced-sync.ts` were restored to `src/lib/` after being identified as dependencies)
3. **Path Stabilization**:
   - Fixed lazy-loading paths in `App.tsx` (standardized on feature-folders).
   - Resolved Vite build errors regarding broken relative imports in `AuthFlow.tsx`.
4. **Mobile UX Fixes**:
   - Restructured `AddTransaction` header for mobile responsiveness.
   - Standardized mobile back button placement (left of title) to avoid burger-menu overlap.
   - Optimized bottom navigation spacing for "safe-area" (notch) devices.

---

##  Core Intelligence Systems
- **OCR Bill Scanner**: Cloud OCR (Google Gemini Vision) primary, Tesseract.js on-device fallback. Privacy mode toggle preserves user data locally. Two separate modes: **Scan Receipt** (OCR-enabled) and **Add Attachment** (OCR-disabled).
- **Bank Statement Parser**: Regex-based engine for PDF/Image bank statements (extracts account details & transactions).
- **Voice Assistant**: Web Speech API integrated with custom NLP for hands-free expense entry.
- **AI Categorization**: `backendService.categorizeText()`  auto-categorizes from merchant/description with confidence scoring (>0.45 threshold).
- *Reference*: [INTELLIGENCE_SYSTEMS.md](./docs/intelligence/INTELLIGENCE_SYSTEMS.md)

---

##  Document & Attachment System

Documents are stored in the **Dexie `documents` table** (`DocumentRecord`).

### How a bill gets linked to a transaction:
1. **Scan mode**: `useReceiptScanner` calls `DocumentManagementService.createDocumentRecord()` during scan  `linkTransaction(docId, txId)` sets `attachment: 'document:{id}'` and `importMetadata['Document Id']` on the transaction.
2. **Attachment mode**: `ReceiptScanner` calls `createDocumentRecord()`  `updateDocumentStatus('completed')`  returns `docId` via `onAttachmentSaved`. `AddTransaction` stores it in `attachmentDocumentId` and links it on save.

### How to detect a linked bill:
```ts
const getDocumentIdFromTransaction = (tx) => {
  const match = tx.attachment?.match(/^document:(\d+)$/);
  if (match) return parseInt(match[1]);
  const id = parseInt(tx.importMetadata?.['Document Id'] || '');
  return isFinite(id) ? id : null;
};
```
- If `attachedDocumentId` is truthy  show **Eye (View Bill)** icon.
- `DocumentManagementService.getDocument(id)`  `fileData`  `URL.createObjectURL()` for preview.

---

### **2026-05-17 (Evening) — Dynamic Global Feature Flag Database Synchronization**

#### 1. Database-Backed Persistent Feature Matrix Settings (`admin.controller.ts`, `admin.routes.ts`)
- **Backend Persistence**: Implemented database-backed feature flags storage in `/api/v1/admin/features` and `/api/v1/admin/features/toggle`. The feature overrides settings map is stored inside the `UserSettings` row (under the JSON key `admin_global_feature_settings`) for the system's administrator, avoiding schema alterations while maintaining structured configuration across devices.
- **Cross-Role Feature Retrieval**: Modified routes in `admin.routes.ts` so that `GET /api/v1/admin/features` is positioned before the `requireRole('admin')` middleware. This enables other roles (such as Managers) to retrieve administrative feature override updates, while preserving `POST /api/v1/admin/features/toggle` as restricted strictly to `admin` role.

#### 2. Live Synchronization & startup propagation (`AppContext.tsx`, `backend-api.ts`)
- **Startup Fetch Effect**: Created a `useEffect` startup fetch hook in `AppContext.tsx` that calls `backendService.getGlobalFeatureFlags()` when a user session becomes active (`user?.id` and `dataReady`). It merges and populates local storage `admin_global_feature_settings` with the active database values, then triggers `computeVisibleFeatures()` to align menus and view ports immediately.
- **Save on Mutation**: Integrated backend saving inside `AdminFeaturePanel.tsx`'s `saveAndBroadcastFeatures` handler via `backendService.saveGlobalFeatureFlags(settingsToSave)`, assuring modifications made on the matrix are stored database-side in real-time.

#### 3. Grid Toggle and Checkbox Alignment (`AdminFeaturePanel.tsx`, `featureFlags.ts`)
- **Defaults Alignment**: Exported the master role defaults `ROLE_FEATURES` from `featureFlags.ts`. Configured `getDefaultRoleAccess` inside `AdminFeaturePanel.tsx` to read permissions directly from `ROLE_FEATURES` instead of readiness fallbacks, ensuring the master matrix checkbox states accurately reflect the hardcoded permissions out-of-the-box (e.g. `dataExport` and `dashboard` as active for manager role initially, allowing the administrator to toggle them off).

#### 4. Hardened Role Defaults & Fail-safe Security (`featureFlags.ts`, `AppContext.tsx`)
- **Strict Least-Privilege Defaults**: Set `dashboard: false` and `dataExport: false` as defaults for the `manager` role in `featureFlags.ts`. This ensures that even in the case of network timeouts, empty database states, or cold starts, the manager is locked out of sensitive views by default.
- **Dynamic Database Override**: The admin can still dynamically grant or revoke these permissions via the Admin Panel. When granted, the backend's persistent JSON settings override the default to `true` dynamically on login, achieving a secure, fail-safe architecture.

#### 5. Premium Glassmorphic Feature Matrix Filtering (`AdminFeaturePanel.tsx`)
- **Real-Time Interactive Filtering**: Integrated a highly responsive, glassmorphic filter controls dashboard right above the Master Feature Matrix grid.
- **Multi-Dimension Filtering capabilities**:
  - *Full-text Search*: Real-time filtering matching feature names or descriptions dynamically.
  - *Readiness Filters*: Instantly filters by state (`All`, `Unreleased`, `Beta`, `Released`, `Deprecated`).
  - *Role Visibility Access Filters*: Instantly isolates features by permitted role visibility (`All`, `Admin`, `Manager`, `Advisor`, `User` visibility).
- **Match Tracker & Empty State**: Features dynamic match count counters ("Showing X of Y matches") and a premium styled Empty State illustration with a "Clear Filters" interactive button to guarantee seamless user navigation.

---

##  Project Documentation
- [Frontend Architecture](./frontend/FRONTEND_ARCHITECTURE.md)

---

##  Tech Stack Details
- **Frontend**: React + Vite + TypeScript.
- **Styling**: Tailwind CSS (Glassmorphism focus).
- **Backend/Auth**: Supabase.
- **Database**: Dexie.js (Local-first) + Supabase (Sync).
- **Mobile Support**: PWA (Service Workers) + Capacitor-ready.
- **Animations**: Framer Motion (`motion.div`, `AnimatePresence`, spring transitions).

---

##  Developer Instructions for New Features
1. **Reuse UI**: Check `src/app/components/ui/` before creating new primitive elements.
2. **Standard Headers**: Use `PageHeader` from UI for consistency across modules.
3. **Standard Page Container**: Use `CenteredLayout` from `shared/` for the page-level padding/max-width wrapper instead of duplicating the class string.
4. **Local-First**: Always ensure data is saved to `localStorage` or `Dexie` before syncing to the cloud.
5. **Theme Check**: If a component looks like "Standard Tailwind/Bootstrap," it is wrong. Apply glassmorphism and the primary gradient.
6. **Frozen Pages**: The **Account Page**, **Add Account** sub-page, **User Profile** page, and **Add Transaction** page are finalized. **DO NOT** modify their layout, logic, or features unless the user specifically requests changes to them.
7. **Receipt/Bill System**: When adding receipt support to any new module, use `DocumentManagementService` directly. Do NOT reinvent document storage. Pass `initialMode` to `ReceiptScanner` to pre-select the workflow.
8. **Mobile Responsiveness**: Every list/table must have a mobile card view. Use `hidden lg:block` for desktop tables and `lg:hidden` for mobile card lists. Tapping a row should open a bottom-sheet detail view.
9. **View Bill Icon**: Always use `Eye` icon from `lucide-react` in `text-orange-400` color. It must be **always visible** (not hover-gated) when `attachedDocumentId` is truthy.
10. **Hooks Rule**: Never call `useAuth()`, `useSecurity()`, or any hook after a conditional `return`. Always place all hook calls at the top of the component, before any guard clauses.
11. **Auth Loading**: The `AuthContext` clears `loading` after a permission fetch with a **5-second hard timeout**. If the backend is unreachable, the app falls back to the locally-cached role from `localStorage`. Do not add any logic that waits for `loading === false` AND `dataReady === true` — this will cause hangs.
12. **Route Guard**: The feature-gate check in `App.tsx` now requires `dataReady === true` before enforcing. The stale-path redirect (login→dashboard) is exempt and runs before `dataReady`. Never move the `!dataReady` guard below the stale-path check or role-based redirects will fire with the provisional role.
13. **Permission Service**: `permissionService` uses a **cache-first** strategy. The role is read from `localStorage` (`auth_role_cache`) on first call, returned immediately, and then refreshed from the backend in the background. Do NOT add code that waits for the permission service to complete before rendering — it resolves synchronously from cache on all repeat loads.
14. **useSharedMenu**: This hook derives `visibleMenuItems` purely from `visibleFeatures` (AppContext) and `role` (AuthContext). Do NOT add `updateTrigger` counters, `adminFeatureUpdate` listeners, or `BroadcastChannel` listeners here — AppContext already handles all flag synchronization and the useMemo recomputes automatically when `visibleFeatures` changes.
15. **AdminFeaturePanel — applyFeatureVisibility**: Always use the functional updater form `setVisibleFeatures(prev => ({ ...prev, ...newVisibility }))`. Never close over `visibleFeatures` state directly in this callback's `useCallback` deps — it will create a new function reference on every render and trigger re-render loops.

---

### **2026-05-18 — Global Feature Flag Sync Stabilization: Infinite Loop & Permission Timeout Fixes**

This session resolved a cascade of interconnected reactivity bugs that caused infinite console spam, wrong role redirects, and persistent permission timeout warnings on every page load.

---

#### 1. Root Cause: Infinite Re-render Loop in `AdminFeaturePanel.tsx` (`applyFeatureVisibility`)

**Problem**: The `adminFeatureUpdate` CustomEvent was being dispatched 50+ times per second, and `useSharedMenu.ts` was logging `"Admin feature update detected, refreshing menu"` hundreds of times on every load.

**Root Cause — `applyFeatureVisibility` closed over `visibleFeatures`:**

```typescript
// BEFORE (broken): visibleFeatures in deps → function recreates on every render
const applyFeatureVisibility = useCallback((featureList) => {
  ...
  setVisibleFeatures({ ...visibleFeatures, ...newVisibility }); // stale closure
}, [role, setVisibleFeatures, visibleFeatures]); // visibleFeatures triggers re-creation
```

Every time `setVisibleFeatures` was called → `visibleFeatures` state changed → `applyFeatureVisibility` was recreated → `useEffect`s that depended on it re-ran → more `setItem` to localStorage → more StorageEvents → infinite loop.

**Fix (`AdminFeaturePanel.tsx` line ~310)**:
```typescript
// AFTER (fixed): functional updater, no stale closure
const applyFeatureVisibility = useCallback((featureList) => {
  ...
  setVisibleFeatures((prev: any) => ({ ...prev, ...newVisibility })); // no closure over visibleFeatures
}, [role, setVisibleFeatures]); // visibleFeatures removed from deps
```

---

#### 2. `AdminFeaturePanel.tsx` — useEffect Dependency Loops (3 effects)

**Problem**: Three `useEffect` hooks in `AdminFeaturePanel` had `applyFeatureVisibility` in their dependency arrays. Since `applyFeatureVisibility` was recreated on every render (due to bug #1), these effects would re-run infinitely.

**Effects fixed:**

| Effect | Old dep array | New dep array |
|---|---|---|
| `loadFromDb` (DB mount fetch) | `[applyFeatureVisibility]` | `[]` (run once on mount) |
| BroadcastChannel message listener | `[broadcastChannel, applyFeatureVisibility]` | `[broadcastChannel]` |
| `StorageEvent` listener | `[applyFeatureVisibility]` | `[]` (run once on mount) |

All three now use `// eslint-disable-next-line react-hooks/exhaustive-deps` with explanatory comments.

---

#### 3. `useSharedMenu.ts` — Removed Redundant `updateTrigger` Mechanism

**Problem**: The hook maintained a separate `updateTrigger: number` state counter and had a 35-line `useEffect` that listened to `adminFeatureUpdate`, `StorageEvent`, and `BroadcastChannel`. On every feature flag change event, it called `setUpdateTrigger(prev => prev + 1)`, which forced all 3 consumers (Sidebar, TopBar, Header) to re-render simultaneously.

**Why it was wrong**: `visibleFeatures` from AppContext is already in the `useMemo([role, visibleFeatures])` dependency array. When AppContext updates `visibleFeatures` state (which it correctly does via `computeVisibleFeatures`), React automatically triggers the memo recomputation in all consumers — no external trigger needed.

**Fix**: Removed the entire `updateTrigger` state, the entire 35-line listener `useEffect`, and removed `updateTrigger` from the `useMemo` dependency array.

> ⚠️ **NOTE**: During this edit, the `orderedItems` state declaration was accidentally deleted (it was on the adjacent line). This caused `ReferenceError: orderedItems is not defined` in Sidebar and TopBar. It was immediately restored.

**Final clean state of `useSharedMenu.ts`**:
- `const [orderedItems, setOrderedItems] = useState<NavigationItem[]>([])` ✅ present
- No `updateTrigger` state ✅
- No `adminFeatureUpdate` event listener ✅  
- No BroadcastChannel in this hook ✅
- `useMemo` deps: `[role, visibleFeatures]` ✅

---

#### 4. `App.tsx` — Route Guard Race Condition with Provisional Role

**Problem**: Two wrong redirects happened on every admin login:
1. `[Route Guard] Redirecting from disabled page: admin-feature-panel (Role: user)` — provisional role 'user' blocked admin pages
2. `[Route Guard] Redirecting from disabled page: dashboard (Role: admin)` — real admin role arrived but `visibleFeatures` was stale from provisional computation

**Root Cause**: The route guard `useEffect` ran as soon as `authLoading === false`. But `authLoading` becomes false after the 5-second permission timeout fires — at which point the role is still the provisional `'user'` (set from Supabase metadata, not from the backend profile). The real role arrives later via `setDataReady(true)` when `syncFromSupabase` completes.

**Fix (`App.tsx`, route guard useEffect)**:
```typescript
// BEFORE: ran with provisional role
if (!user || authLoading) return;
// ... feature gate check (fired with wrong provisional role)

// AFTER: waits for backend-confirmed role
if (!user || authLoading) return;
// Stale-path redirects (login→dashboard) are safe before dataReady ✅
if (staleAuthPaths.has(currentPage)) { ... return; }

// Feature-gate check ONLY after role is confirmed from backend
if (!dataReady) return; // ← NEW: blocks premature gate evaluation
// ...rest of gate checks
```

`dataReady` is added to the `useEffect` dependency array: `[user, authLoading, dataReady, currentPage, setCurrentPage, visibleFeatures, role]`.

---

#### 5. `permissionService.ts` — Permission Fetch Timeout (every page load)

**Problem**: `AuthContext` warned `"Permission fetch failed/timed out, using provisional role"` on every single app load.

**Root Cause — Mismatched timeout budgets**:
- `AuthContext` outer race: **5000ms**  
- `permissionService` inner timeout (`PROFILE_LOOKUP_TIMEOUT_MS`): **15000ms**

The inner timeout was 3× longer than the outer race. The outer race always fired first, hard-rejecting with the timeout error. The inner request continued running silently in the background consuming 15 additional seconds.

**Fix — Three-part solution**:

**Part A — Reduce inner timeout to 3500ms** (shorter than outer 5000ms budget):
```typescript
// BEFORE
const PROFILE_LOOKUP_TIMEOUT_MS = 15000;
// AFTER
const PROFILE_LOOKUP_TIMEOUT_MS = 3500; // must be < AuthContext's 5000ms outer race
```

**Part B — Add localStorage role cache (`auth_role_cache`)**:
- `getCachedRole()` now checks `localStorage` first (as a second tier after in-memory map). This means any app load after the very first login reads the role synchronously from localStorage — no network request needed.
- `rememberResolvedRole()` now writes the resolved role + `userId` to `localStorage.setItem('auth_role_cache', ...)` after every successful backend fetch.
- `clearPermissions()` (called on sign-out) now also calls `localStorage.removeItem('auth_role_cache')` to prevent a different user from inheriting the previous user's cached role.

**Part C — Cache-first strategy in `loadUserRole()`**:
```typescript
// BEFORE: always waited for network
private async loadUserRole(userId, fallbackRole) {
  const cachedRole = this.getCachedRole(userId);
  // ... always fetched from backend, only using cache as fallback on error
}

// AFTER: return cache immediately, refresh in background
private async loadUserRole(userId, fallbackRole) {
  const cachedRole = this.getCachedRole(userId);
  if (cachedRole) {
    void this.refreshRoleInBackground(userId, safeFallback); // non-blocking
    return cachedRole; // instant return — completes in <1ms
  }
  // No cache: first-ever login, must wait for network
  return this.fetchRoleFromNetwork(userId, safeFallback);
}
```

`refreshRoleInBackground()` fetches the role from the backend, and if the role changed (e.g., admin promoted a user), calls `notifyListeners()` to propagate the update. The new `fetchRoleFromNetwork()` method is the extracted body of the old `loadUserRole`.

**Expected outcome after these fixes**:
- **First login ever**: Single network fetch (up to 3.5s), role cached to localStorage.
- **All subsequent loads**: Role resolved from localStorage in <1ms. No timeout warning. Background refresh validates against backend silently.
- **Sign-out**: Cache cleared. Next user gets a fresh fetch.

---

#### Files Changed in This Session

| File | Change |
|---|---|
| `frontend/src/app/components/admin/AdminFeaturePanel.tsx` | Fixed `applyFeatureVisibility` closure; removed `applyFeatureVisibility` from 3 useEffect dep arrays; deep-merged `roleAccess` with `getDefaultRoleAccess` in all 3 localStorage parsing locations |
| `frontend/src/contexts/AppContext.tsx` | Added `roleAccess` fallback for roles missing from older saved state; kept `computeVisibleFeatures` stable via `useCallback([role])` |
| `frontend/src/hooks/useSharedMenu.ts` | Removed `updateTrigger` state and its 35-line listener `useEffect`; restored `orderedItems` state; `useMemo` deps now `[role, visibleFeatures]` only |
| `frontend/src/contexts/AuthContext.tsx` | Changed inner timeout to 8500ms so it doesn't abort before `permissionService` finishes on a cold boot. |
| `frontend/src/lib/api.ts` | Added `ignoreAuthErrors` to `RequestConfig` to bypass aggressive `401` interceptor logouts; awaited `supabase.auth.signOut()` before redirect to fix infinite loop. |
| `frontend/src/lib/backend-api.ts` | Added `{ ignoreAuthErrors: true }` to `/admin/features` polling request to stop backend cold-start failures from logging the user out. |
| `frontend/src/app/App.tsx` | Route guard now requires `dataReady === true` before enforcing feature gates; stale-path redirect still runs before `dataReady` check |
| `frontend/src/services/permissionService.ts` | Increased REST API timeout to 8000ms to tolerate Vercel cold-starts on first production load. Added `auth_role_cache` localStorage persistence for instant subsequent loads. Removed Supabase direct query fallback due to RLS 403 errors. |

---

#### 6. `CartoonCategoryIcons.tsx` — SVG Icons Blank on Mobile (Production)

**Problem**: Quick Action modal icons and all category cartoon icons rendered correctly in local dev but appeared **completely blank** after deployment on real mobile devices (iOS Safari, Android Chrome).

**Root Cause — Broken cross-SVG `url(#id)` references**:

Every icon SVG referenced two IDs defined in a *separate, never-mounted* `<Gradients />` component:
- `filter="url(#softShadow)"` — a drop-shadow filter
- `fill="url(#glossGradient)"` — a white gloss overlay gradient

SVG `url(#id)` lookups are **document-scoped** (not SVG-scoped). Desktop Chrome is lenient and silently skips missing filter/gradient references. Mobile browsers (WebKit/Safari on iOS, Chrome on Android) are strict — they drop the **entire element** when a referenced ID is absent, causing icons to render as empty circles or nothing at all.

The `Gradients` component was exported but **never rendered** anywhere in the component tree, so `#softShadow` and `#glossGradient` never existed in the DOM.

**Fix (`CartoonCategoryIcons.tsx`)** — Two global replacements across all 22 icons:

```diff
- <g filter="url(#softShadow)">   // cross-SVG ref → broken on mobile
+ <g>                              // plain group, no external dep

- <circle ... fill="url(#glossGradient)" opacity="0.2" />   // cross-SVG ref → broken
+ <circle ... fill="white"          opacity="0.15" />        // inline, self-contained
```

Every icon is now **fully self-contained** — zero external ID dependencies, guaranteed to render on all browsers including iOS Safari and Android Chrome in production PWA builds.

> ⚠️ **Rule**: Never use `url(#id)` in SVG components that reference IDs defined in a *separate* SVG element. Either embed `<defs>` inside each SVG with unique IDs, or use inline attribute values. Cross-SVG ID references are unreliable across all mobile browsers.

**Affected component**: `frontend/src/app/components/ui/CartoonCategoryIcons.tsx` (all 22 icon exports + `getCategoryCartoonIcon` mapper)

