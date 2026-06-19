# Acceptance Criteria — Kanaku

Written in Given/When/Then for QA testability.

## Authentication
### AC-Login-Valid
- **Given** a registered user with correct credentials
- **When** they submit the login form
- **Then** a session + backend JWT is issued and they land on the Dashboard.

### AC-Login-Invalid
- **Given** wrong credentials
- **When** they submit
- **Then** a clear error is shown, no token issued, no stack trace leaked.

### AC-Token-Expired
- **Given** an expired JWT
- **When** a protected API call is made
- **Then** the API returns 401 and the client triggers re-auth.

## Transactions
### AC-Create-Offline
- **Given** the device is offline
- **When** a user adds an expense
- **Then** it is stored locally, marked `sync pending`, and appears instantly.

### AC-Sync-Online
- **Given** pending local writes
- **When** connectivity returns
- **Then** writes sync in background, idempotently, with no duplicates.

### AC-Balance-Atomicity
- **Given** a transaction creation that changes a balance
- **When** it is persisted
- **Then** balance update and transaction insert occur in one DB transaction (all-or-nothing).

### AC-Ownership
- **Given** a transaction owned by user A
- **When** user B requests it
- **Then** the API returns 403/404 (no cross-user access).

## Validation
### AC-Validation-Middleware
- **Given** any `/api/v1` route
- **When** a request hits it
- **Then** params/query/body are validated by zod; invalid input returns 400 with field errors.

## Receipts
### AC-Receipt-LowConfidence
- **Given** a low-confidence OCR parse
- **When** the draft is generated
- **Then** the user must confirm/edit before saving.

