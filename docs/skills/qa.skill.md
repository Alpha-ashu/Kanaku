# QA & Testing Skill Reference  KANAKU

This document provides the standard quality assurance and testing protocols for the KANAKUproject.

---

## 1. Testing Environments
- **Web (Development)**: `http://localhost:5173`
- **PWA (Production)**: Vercel deployment URL.
- **Mobile (Emulator)**: Android Studio / Xcode Capacitor builds.

## 2. Core Testing Flows

### Authentication & Security
- [ ] **Login/Signup**: Verify email verification and custom JWT issuance.
- [ ] **PIN Setup**: Test the 6-digit PIN creation and confirm flow.
- [ ] **PIN Lockout**: Verify that 5 failed attempts lock the app for 15 minutes.
- [ ] **Biometrics**: (Native) Test FaceID/Fingerprint integration.

### Financial Transactions
- [ ] **CRUD Operations**: Add, Edit, Delete transactions across different accounts.
- [ ] **Balance Sync**: Ensure account balances update immediately after a transaction.
- [ ] **Deduplication**: Attempt to add identical transactions to verify the SHA256 hash prevention.
- [ ] **Multi-Currency**: Test exchange rate conversions and symbol displays.

### AI Features
- [ ] **Receipt Scanning**: Test JPG/PNG uploads with varied lighting and text quality.
- [ ] **Voice Input**: Test transaction parsing with natural language ("Spent 500 on dinner").
- [ ] **Insights**: Verify that spending charts accurately reflect the last 30 days of data.

### Offline & Sync
- [ ] **Airplane Mode**: Add transactions while offline and verify they save to Dexie.
- [ ] **Reconnection**: Go back online and verify background sync to Supabase.
- [ ] **Conflict Resolution**: Simulate simultaneous edits on two devices and verify timestamp-based wins.
- [ ] **Brand Migration**: Verify that local storage keys are correctly migrated from `KANAKU` to `KANAKU` namespace without data loss.

### AI Engine Reliability
- [ ] **Tesseract Fallback**: Disable Gemini API key and verify that the heuristic engine still extracts Merchant/Amount/GST correctly.
- [ ] **Voice Ambiguity**: Test voice inputs with ambiguous phrasing and verify that Gemini refinement (if active) provides higher confidence results.
- [ ] **PDF Statement Scanner**: Upload digital bank statements and verify text-layer extraction accuracy.

## 3. UI/UX Regression Checklist
- [ ] **Mobile Notch**: Check for safe-area-inset padding on iPhone headers and bottom navs.
- [ ] **Dark Mode**: Toggle theme and check for text contrast issues.
- [ ] **Glassmorphism**: Ensure background blurs don't cause performance lag on older mobile devices.
- [ ] **Navigation**: Verify that the Android back button closes modals before exiting the app.

## 4. Performance Benchmarks
- **Lighthouse Score**: Aim for 90+ in Accessibility and SEO.
- **First Contentful Paint**: < 1.2s on mobile.
- **Bundle Size**: Monitor `dist/` size to keep the main chunk under 500KB.

