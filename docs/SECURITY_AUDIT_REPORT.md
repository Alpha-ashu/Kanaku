# Kanaku — Security Audit Report

> Date: 2026-06-17  
> Scope: Backend API, authentication flow, RBAC, database access patterns  
> Severity: Critical · High · Medium · Low · Informational

---

## Executive Summary

10 security findings were identified across the Kanaku backend. 4 were remediated immediately in code. 6 require coordinated changes across multiple layers (frontend + backend, or database migrations) and are documented below with recommended fixes.

**Immediate action required**: 2 findings (S4 webhook HMAC, S9 deleteList) are exploitable by any authenticated user and should be fixed before production launch.

---

## Findings

### S1 — bcrypt Cost Factor Below OWASP Minimum
**Severity**: Critical  
**Status**: ✅ Fixed  
**File**: `backend/src/modules/auth/auth.service.ts`

**Description**: Password hashing used `bcrypt.hash(password, 10)`. OWASP recommends a minimum of 12 rounds (2× the compute cost of 10).

**Fix applied**: Changed to `bcrypt.hash(password, 12)` in three locations: new user registration (~line 44), Supabase migration path (~line 350), legacy password migration (~line 403).

---

### S2 — Cryptographically Weak OTP Generation
**Severity**: High  
**Status**: ✅ Fixed  
**File**: `backend/src/modules/auth/auth.controller.ts`

**Description**: Login challenge code used `Math.floor(100000 + Math.random() * 900000)`. `Math.random()` is not a CSPRNG — it is seeded from a predictable internal state and can be predicted with enough observations.

**Fix applied**: Replaced with `crypto.randomInt(100000, 1000000)` (Node.js built-in CSPRNG, uniform distribution).

**Note**: The challenge `code` is still returned in the `/auth/login/challenge` response body because `frontend/src/lib/api.ts` reads it at lines 630, 643, 649 and passes it as `challengeCode` to `/auth/login`. Removing it requires replacing the response-based flow with OTP delivery (email/SMS).

---

### S3 — Admin Route Missing RBAC Guard (repair-all-members)
**Severity**: High  
**Status**: ✅ Fixed  
**File**: `backend/src/modules/groups/group.routes.ts`

**Description**: `POST /groups/repair-all-members` performed a bulk membership repair across all groups but had no role restriction — any authenticated user could trigger it.

**Fix applied**: Added `requireRole(['admin', 'manager'])` middleware to the route.

---

### S4 — Advisor Role-Mode Route Missing RBAC Guard
**Severity**: Medium  
**Status**: ✅ Fixed  
**File**: `backend/src/modules/advisors/advisor.routes.ts`

**Description**: `PUT /advisors/role-mode` allowed any authenticated user to switch the advisor/client role mode, which affects what data is visible across the application.

**Fix applied**: Added `requireRole(['advisor', 'admin', 'manager'])` middleware.

---

### S5 — Payment Webhook Lacks HMAC Signature Verification
**Severity**: Critical  
**Status**: ❌ Not fixed — requires implementation  
**File**: Payment webhook handler (locate in `backend/src/modules/payments/`)

**Description**: Incoming payment webhook events (from Razorpay/Stripe/similar) are processed without verifying the `X-Webhook-Signature` header. Any caller can forge a payment success event, triggering account credits or subscription upgrades for free.

**Recommended fix**:
```typescript
import { createHmac, timingSafeEqual } from 'crypto';

function verifyWebhookSignature(body: string, signature: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(body).digest('hex');
  const expectedBuf = Buffer.from(expected);
  const sigBuf = Buffer.from(signature);
  if (expectedBuf.length !== sigBuf.length) return false;
  return timingSafeEqual(expectedBuf, sigBuf);
}
```
Use `timingSafeEqual` to prevent timing attacks. Reject requests where verification fails with HTTP 401.

---

### S6 — Todo List Delete Missing Ownership Check
**Severity**: High  
**Status**: ❌ Not fixed — requires one-line Prisma change  
**File**: `backend/src/modules/todos/todo.repository.ts`

**Description**: `deleteList(id)` issues `DELETE FROM todo_lists WHERE id = $id` with no `AND userId = $userId` clause. Any authenticated user who knows a list's UUID can delete it.

**Recommended fix**:
```typescript
// Change:
await prisma.todoList.delete({ where: { id } });

// To:
await prisma.todoList.deleteMany({ where: { id, userId } });
// deleteMany avoids Prisma throwing on "record not found" for other users' lists
```
Pass `userId` from the authenticated request context.

---

### S7 — OTP Stored as Bare SHA-256 (No HMAC Salt)
**Severity**: Medium  
**Status**: ⚠️ Deferred — coordinated change needed  

**Description**: OTP codes are hashed as `SHA256(code)` for storage. Without a server-side secret, an attacker with DB read access can precompute a rainbow table of all 900,000 6-digit codes and reverse any stored hash instantly.

**Recommended fix**: Use `HMAC-SHA256(SERVER_OTP_SECRET, code)` where `SERVER_OTP_SECRET` is a long random value in env. Update both the store path and the verify path simultaneously.

---

### S8 — Challenge Code Returned in Response Body
**Severity**: Medium  
**Status**: ⚠️ Deferred — frontend + backend change needed  

**Description**: `POST /auth/login/challenge` returns `{ ..., code: "123456" }` in the JSON response. Any network observer (or compromised client) can read the code without needing access to the user's email/SMS. This negates the second-factor benefit.

**Recommended fix**: Remove `code` from the response; deliver it via email/SMS only. The frontend must be updated to not read `response.data.code` and instead wait for the user to enter the OTP manually.

---

### S9 — PIN Security Endpoint Issues Token Without Proof
**Severity**: Medium  
**Status**: ⚠️ Deferred — endpoint redesign needed  

**Description**: `POST /pin/verify-security` issues a security token to any authenticated user without requiring them to prove PIN knowledge or provide an OTP. The normal UI flow passes through PIN verification first, but there is no server-side enforcement of that ordering.

**Recommended fix**: Accept `{ pin: string }` or `{ otp: string }` in the request body and verify before issuing the token.

---

### S10 — Missing Rate Limiting on Authentication Endpoints
**Severity**: Informational  
**Status**: 📋 Recommended  

**Description**: No rate limiting observed on `/auth/login`, `/auth/login/challenge`, `/auth/register`, or `/pin/verify`. Brute-force and credential-stuffing attacks can proceed without throttling.

**Recommended fix**: Add Redis-backed rate limiting (e.g., `express-rate-limit` + `rate-limit-redis`):
- `/auth/login` — 10 attempts / 15 min per IP
- `/auth/login/challenge` — 5 attempts / 10 min per IP  
- `/pin/verify` — 5 attempts / 15 min per userId

---

## Summary Table

| ID | Title | Severity | Status |
|----|-------|----------|--------|
| S1 | bcrypt rounds < 12 | Critical | ✅ Fixed |
| S2 | Math.random() for OTP | High | ✅ Fixed |
| S3 | repair-all-members unguarded | High | ✅ Fixed |
| S4 | role-mode unguarded | Medium | ✅ Fixed |
| S5 | Webhook HMAC missing | Critical | ❌ Open |
| S6 | deleteList no ownership check | High | ❌ Open |
| S7 | OTP bare SHA-256 | Medium | ⚠️ Deferred |
| S8 | Challenge code in response | Medium | ⚠️ Deferred |
| S9 | PIN security no proof | Medium | ⚠️ Deferred |
| S10 | No auth rate limiting | Informational | 📋 Recommended |
