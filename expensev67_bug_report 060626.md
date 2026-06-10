# Bug Report — expensev67.vercel.app
**HAR Analysis Date:** 2026-06-05  
**Session Duration:** 14:39:55Z – 14:53:08Z (~13 minutes)  
**Total Requests:** 95  
**Severity Levels:** 🔴 Critical · 🟠 High · 🟡 Medium · 🟢 Low

---

## Summary

| ID | Title | Severity | Category |
|----|-------|----------|----------|
| BUG-01 | Plaintext password transmitted in login request body | 🔴 Critical | Security |
| BUG-02 | Supabase publishable API key exposed in client requests | 🔴 Critical | Security |
| BUG-03 | No Authorization header on any API call — session likely stored insecurely | 🔴 Critical | Security |
| BUG-04 | Regular user accesses `/api/v1/admin/*` endpoints without restriction | 🔴 Critical | Security / Access Control |
| BUG-05 | PIN sent as plaintext `{"pin":"123456"}` in request body | 🔴 Critical | Security |
| BUG-06 | Weak PIN accepted (sequential digits, no complexity enforcement) | 🟠 High | Security |
| BUG-07 | User ID and internal UUIDs exposed in API responses | 🟠 High | Security / Privacy |
| BUG-08 | Aggressive polling of admin endpoints (every ~30s, 40 calls in 13 min) | 🟠 High | Performance |
| BUG-09 | All API responses extremely slow (3–8.5s per call) | 🟠 High | Performance |
| BUG-10 | Duplicate data fetching on page load (all endpoints called twice) | 🟡 Medium | Performance |
| BUG-11 | Notifications polled with hardcoded `limit=100` — no pagination | 🟡 Medium | Performance / API Design |
| BUG-12 | Transactions fetched with hardcoded `limit=200` — no pagination | 🟡 Medium | Performance / API Design |
| BUG-13 | CSP allows `unsafe-inline` for styles and broad `https:` for fonts | 🟡 Medium | Security |
| BUG-14 | `cross-origin-resource-policy: cross-origin` on internal API responses | 🟡 Medium | Security |
| BUG-15 | Sensitive PII fields returned in profile response (salary, dateOfBirth, jobType) | 🟡 Medium | Privacy |
| BUG-16 | `/api/v1/pin/key-backup` returns failure state silently — no user feedback | 🟢 Low | UX |
| BUG-17 | Avatar fetched from external third-party CDN (api.dicebear.com) with no integrity check | 🟢 Low | Security |
| BUG-18 | `x-xss-protection: 0` set on all responses | 🟢 Low | Security |
| BUG-19 | Password sent directly to auth endpoint — replace with a mapped numeric code (server assigns real value) | 🔴 Critical | Security — Auth Design |

---

## Detailed Bug Reports

---

### BUG-01 — Plaintext Password Transmitted in Login Request Body
**Severity:** 🔴 Critical  
**Category:** Security — Credential Exposure  
**Endpoint:** `POST https://mmwrckfqeqjfqciymemh.supabase.co/auth/v1/token?grant_type=password`

**Evidence from HAR:**
```json
Request Body: {"email":"user@KANAKU.com","password":"User@2026!k","gotrue_meta_security":{}}
```

**Description:**  
The user's plaintext password is sent in the JSON request body and is fully visible in any HAR capture, browser devtools, or proxy log. While HTTPS encrypts the transport, the password is exposed in:
- Browser network tab (accessible to any extension or XSS payload)
- HAR exports (as demonstrated by this very file)
- Server-side access logs if misconfigured
- Any MITM proxy or debugging session

**Remediation:**
- This is Supabase's default auth flow. Consider switching to OAuth/PKCE or magic links.
- Never share HAR files from authenticated sessions.
- Rotate the password `User@2026!k` immediately — it is now compromised.
- Enforce `SameSite` cookie policies and avoid logging request bodies server-side.

---

### BUG-02 — Supabase Publishable API Key Exposed in Client Requests
**Severity:** 🔴 Critical  
**Category:** Security — Secret Exposure  
**Endpoint:** `POST https://mmwrckfqeqjfqciymemh.supabase.co/auth/v1/token`

**Evidence from HAR:**
```
Request Header: apikey: sb_publishable_QA4aNzLgHR9xanXUJaPpew_XGRicYBq
```

**Description:**  
The Supabase `apikey` (anon/publishable key) is sent as a request header and is exposed in the HAR. While this key is technically intended to be public, its exposure in a HAR file alongside a live session token, user credentials, and session IDs creates a combined attack surface. An attacker with this key can:
- Enumerate public Supabase tables if Row Level Security (RLS) is misconfigured
- Attempt to invoke Supabase Edge Functions or Storage APIs
- Combine with the exposed JWT token for elevated access

**Remediation:**
- Verify all Supabase tables have Row Level Security (RLS) enabled.
- Rotate the API key in Supabase project settings as a precaution.
- Never share HAR files — they contain all headers including API keys.

---

### BUG-03 — No Authorization Header on Any API Call
**Severity:** 🔴 Critical  
**Category:** Security — Authentication Bypass Risk  
**Affected Endpoints:** All 65 `/api/v1/*` requests

**Evidence from HAR:**
All 65 API requests show:
```
auth=False  cookie=False
```
No `Authorization: Bearer <token>`, no `Cookie`, no `X-Auth-Token` on any request.

**Description:**  
After logging in via Supabase (`POST /auth/v1/token`), the returned JWT is not being attached to subsequent API requests via any observable header or cookie. This means either:

1. **The backend is not validating authentication at all** (most severe — all endpoints are publicly accessible), OR
2. **The JWT is being stored and sent via a non-standard mechanism** not visible in the HAR (e.g., embedded in the request body, or via a Vercel-level proxy that injects it)

Given that `/api/v1/admin/features` returns full role-based access configuration to an unauthenticated-appearing request, option 1 is plausible and extremely dangerous.

**Remediation:**
- Confirm all API routes validate the `Authorization: Bearer <jwt>` header server-side.
- Add auth middleware globally and test each endpoint independently without a token.
- Use tools like Burp Suite or curl to test endpoints without the session to verify they return 401.

---

### BUG-04 — Regular User Can Access `/api/v1/admin/*` Endpoints
**Severity:** 🔴 Critical  
**Category:** Security — Broken Access Control (OWASP A01)  
**Affected Endpoints:**
- `GET /api/v1/admin/features` — returns full feature flag + RBAC config (9,850 bytes)
- `GET /api/v1/admin/ai-features` — returns full AI feature config (2,644 bytes)

**Evidence from HAR:**
```json
Response [27] 200 OK — /api/v1/admin/features
{
  "accounts": {
    "enabled": true,
    "roleAccess": { "admin": false, "manager": false, "advisor": true, "user": true },
    "children": {
      "importStatement": { "enabled": false, "roleAccess": {...} },
      "exportData": { "enabled": false, "roleAccess": {...} },
      ...
    }
  }
}
```
The requesting user has `role: "user"` (confirmed from profile response), yet both `/admin/` endpoints return HTTP 200 with full admin configuration payloads.

**Description:**  
Admin endpoints are accessible to regular users with no authorization check. This exposes:
- The complete internal role-based access control matrix
- Feature flag state for all user roles (admin, manager, advisor, user)
- AI feature configuration and capability breakdown
- Internal feature keys that could be manipulated client-side

**Remediation:**
- Add role-based middleware to all `/api/v1/admin/*` routes to reject requests from non-admin roles with HTTP 403.
- Never rely on client-side role checks alone.
- These endpoints should require `role: "admin"` verified server-side from the JWT claims.

---

### BUG-05 — PIN Sent as Plaintext in Request Body
**Severity:** 🔴 Critical  
**Category:** Security — Credential Handling  
**Endpoint:** `POST /api/v1/pin/create`

**Evidence from HAR:**
```json
Request Body: {"pin":"123456"}
```

**Description:**  
The user's PIN is transmitted as plaintext JSON. Just like the password in BUG-01, this is captured in full in the HAR. PINs are typically used as a second authentication factor for sensitive financial actions. Exposing them plaintext undermines that purpose entirely.

**Remediation:**
- Hash the PIN client-side before transmission (e.g., SHA-256 with a server-provided nonce).
- Or use HTTPS-only and ensure no server-side logging of request bodies containing PINs.
- Avoid weak PINs — see BUG-06.

---

### BUG-06 — Weak PIN Accepted Without Complexity Enforcement
**Severity:** 🟠 High  
**Category:** Security — Weak Credential Policy  
**Endpoint:** `POST /api/v1/pin/create`

**Evidence from HAR:**
```json
Request Body: {"pin":"123456"}
```
Response: `{"success":false,"message":"PIN already exists. Use update PIN endpoint instead."}`
The server accepted the request format — it failed only because a PIN already exists, not because `123456` was rejected.

**Description:**  
Sequential numeric PINs like `123456` are among the most commonly guessed PINs globally. The server has no visible validation rejecting this value. For a financial app handling transactions, loans, investments, and goals, this is a meaningful security weakness.

**Remediation:**
- Reject commonly used PINs (123456, 000000, 111111, etc.) with a blocklist.
- Enforce minimum complexity (no more than 2 sequential or repeated digits).
- Implement rate limiting and lockout on PIN verification attempts.

---

### BUG-07 — Internal UUIDs and User ID Exposed in API Responses
**Severity:** 🟠 High  
**Category:** Security / Privacy — Information Exposure  
**Affected Endpoints:** `/api/v1/auth/profile`, `/api/v1/settings`

**Evidence from HAR:**
```json
Profile response:
{
  "id": "17fec621-f481-44ae-8597-97e127c0f9a2",
  "email": "user@KANAKU.com",
  "salary": 0,
  "monthlyIncome": 0,
  "dateOfBirth": "",
  "jobType": "",
  "role": "user",
  "isApproved": false
}

Settings response:
{
  "id": "19266929-b652-42ec-b20d-203295be9df6",
  "userId": "17fec621-f481-44ae-8597-97e127c0f9a2"
}
```

**Description:**  
Internal database UUIDs (including the primary `userId`) are returned to the client. Combined with the exposed Supabase project URL and API key (BUG-02), these UUIDs could be used to construct direct Supabase queries targeting this user's records. The `isApproved: false` status also leaks account approval logic.

**Remediation:**
- Do not return internal database primary keys to clients.
- Use opaque tokens or separate public-facing identifiers.
- Omit internal system fields like `isApproved` from profile responses.

---

### BUG-08 — Aggressive Polling of Admin Endpoints Every 30 Seconds
**Severity:** 🟠 High  
**Category:** Performance — Unnecessary Network Load  
**Affected Endpoints:** `/api/v1/admin/features`, `/api/v1/admin/ai-features`, `/api/v1/notifications`

**Evidence from HAR:**
```
admin/features polled 20 times in 13 minutes (~30s interval)
admin/ai-features polled 20 times in 13 minutes (~30s interval)  
notifications polled 6 times (~3 min interval)

Bandwidth consumed per poll cycle:
  /admin/features:    9,850 bytes × 20 = ~192 KB
  /admin/ai-features: 2,644 bytes × 20 = ~51 KB
  Total polling cost: ~243 KB in 13 minutes
```

**Description:**  
The frontend polls two admin configuration endpoints every 30 seconds. Feature flags and AI feature configurations are not user-generated data — they change infrequently (if ever during a session). Polling them this aggressively:
- Wastes server and client bandwidth
- Contributes to Vercel serverless function invocation costs
- Hammers the database on each cold-start invocation
- Consumes rate limit budget (60 req/min window)

**Remediation:**
- Cache feature flags in memory or `localStorage` at session start. Refetch only on page reload or after a configurable TTL (e.g., 5–10 minutes).
- Use WebSockets or Server-Sent Events if real-time flag updates are required.
- Eliminate polling for `/admin/*` endpoints entirely for non-admin users (also fixes BUG-04).

---

### BUG-09 — Extremely High API Response Latency (3–8.5 Seconds)
**Severity:** 🟠 High  
**Category:** Performance — Cold Start / No Caching  
**Affected Endpoints:** All `/api/v1/*` endpoints

**Evidence from HAR:**
```
/api/v1/auth/profile         → 8,572ms
/api/v1/loans                → 8,411ms (second call)
/api/v1/goals                → 7,977ms (second call)
/api/v1/investments          → 8,232ms (second call)
/api/v1/admin/features       → 7,419ms (first call)
/api/v1/settings (PUT)       → 7,226ms
Average across all API calls: ~4,500ms
```

**Description:**  
Every API call takes between 3 and 8.5 seconds to respond. For a financial dashboard that loads 10+ endpoints simultaneously on page load, this translates to a perceived load time exceeding 8 seconds. This strongly suggests Vercel serverless cold starts on every request — indicating the backend is not keeping functions warm or using edge caching effectively.

**Remediation:**
- Enable Vercel Edge Functions or use Vercel's fluid compute to keep functions warm.
- Add database connection pooling (e.g., PgBouncer / Supabase connection pooler) if queries are slow.
- Profile slow endpoints with `EXPLAIN ANALYZE` on the underlying queries.
- Add response caching at the edge for read-heavy, user-specific endpoints where appropriate.

---

### BUG-10 — All Data Endpoints Fetched Twice on Page Load
**Severity:** 🟡 Medium  
**Category:** Performance — Duplicate Requests  
**Affected Endpoints:** All 7 primary data endpoints

**Evidence from HAR:**
```
[33] GET /api/v1/accounts     200  ~3,119ms
[40] GET /api/v1/accounts     304  ~7,595ms   ← duplicate

[35] GET /api/v1/transactions 200  ~4,067ms
[42] GET /api/v1/transactions 304  ~7,545ms   ← duplicate

(same pattern for friends, loans, goals, investments, groups)
```

**Description:**  
All 7 primary data endpoints are called twice in rapid succession during initial page load. The second call returns 304 (not modified) indicating data hasn't changed, but the request still hits the server and incurs cold-start latency. This is likely caused by a React component re-mounting or a state management issue triggering duplicate `useEffect` calls.

**Remediation:**
- Deduplicate API calls using React Query, SWR, or a global state manager (Redux, Zustand).
- Use `useEffect` with proper dependency arrays or `StrictMode` awareness.
- Implement a request deduplication layer in your API client.

---

### BUG-11 — Notifications Fetched With Hardcoded `limit=100`
**Severity:** 🟡 Medium  
**Category:** Performance / API Design — No Pagination  
**Endpoint:** `GET /api/v1/notifications?limit=100`

**Description:**  
The notifications endpoint uses a hardcoded limit of 100 with no pagination parameters (`page`, `cursor`, `offset`). As user notification volume grows, this will:
- Over-fetch data the user will never scroll to
- Slow down the API response
- Transfer unnecessary payload over the network

The endpoint returned `[]` in this session, but the design issue remains.

**Remediation:**
- Implement cursor-based or offset pagination: `/notifications?limit=20&cursor=<id>`
- Default the page size to 20–50, not 100.
- Load additional notifications on scroll (infinite scroll) or on demand.

---

### BUG-12 — Transactions Fetched With Hardcoded `limit=200`
**Severity:** 🟡 Medium  
**Category:** Performance / API Design — No Pagination  
**Endpoint:** `GET /api/v1/transactions?limit=200`

**Description:**  
The transaction list endpoint hardcodes `limit=200` — fetching up to 200 transactions on every page load and on every polling cycle. For active users with high transaction volumes, this will degrade performance significantly and transfer large payloads unnecessarily. The response schema does include pagination metadata (`page`, `totalPages`) but the client ignores it by always requesting 200.

**Remediation:**
- Default to a sensible page size (20–50 transactions).
- Implement server-side pagination and fetch additional pages only when the user scrolls or requests more.
- Consider virtual list rendering for large transaction sets.

---

### BUG-13 — Content Security Policy Allows `unsafe-inline` Styles and Broad `https:` Font Sources
**Severity:** 🟡 Medium  
**Category:** Security — Weak CSP  

**Evidence from HAR:**
```
content-security-policy: default-src 'self';
  style-src 'self' https: 'unsafe-inline';
  font-src 'self' https: data:;
  img-src 'self' data: https://*.supabase.co;
  connect-src 'self' https://*.supabase.co
```

**Description:**  
- `style-src` includes `'unsafe-inline'`, allowing inline `<style>` tags and `style=` attributes — this can be abused in CSS injection attacks and weakens XSS mitigations.
- `font-src https:` permits fonts from **any HTTPS domain**, opening a data exfiltration channel via CSS font-face timing attacks.
- `img-src data:` allows data URIs in images, which can be used for XSS in older browsers.

**Remediation:**
- Replace `'unsafe-inline'` in `style-src` with a hash-based or nonce-based policy.
- Restrict `font-src` to specific trusted domains (`fonts.gstatic.com` if using Google Fonts, or self-hosted only).
- Remove `data:` from `img-src` unless strictly necessary.

---

### BUG-14 — `cross-origin-resource-policy: cross-origin` on Internal API Responses
**Severity:** 🟡 Medium  
**Category:** Security — Misconfigured CORP Header  

**Evidence from HAR:**
```
cross-origin-resource-policy: cross-origin   (on /api/v1/admin/features and other API routes)
```

**Description:**  
`cross-origin-resource-policy: cross-origin` explicitly allows any cross-origin site to embed or `fetch` these API responses. For internal API endpoints returning user data and admin configuration, this should be `same-origin` or `same-site`. The current setting allows malicious third-party pages to read these responses if CORS is ever misconfigured.

**Remediation:**
- Set `cross-origin-resource-policy: same-origin` on all `/api/v1/*` endpoints.
- Reserve `cross-origin` only for genuinely public assets (fonts, images).

---

### BUG-15 — Profile Endpoint Returns Sensitive Financial PII Fields
**Severity:** 🟡 Medium  
**Category:** Privacy — Unnecessary Data Exposure  
**Endpoint:** `GET /api/v1/auth/profile`

**Evidence from HAR:**
```json
{
  "salary": 0,
  "monthlyIncome": 0,
  "dateOfBirth": "",
  "jobType": "",
  "isApproved": false,
  "role": "user"
}
```

**Description:**  
The profile endpoint returns financial fields (`salary`, `monthlyIncome`) and PII fields (`dateOfBirth`, `jobType`) as part of the default profile payload — even when empty. As users populate these fields, they will be exposed in every profile fetch (including HAR captures, proxy logs, etc.). The `role` and `isApproved` fields also leak internal authorization state.

**Remediation:**
- Split the profile response into a public profile (name, avatar, currency) and a separate private/settings endpoint for financial data.
- Omit `isApproved`, `role`, and empty fields from the default profile payload.
- Apply field-level access control so only the relevant UI sections request the data they need.

---

### BUG-16 — `/api/v1/pin/key-backup` Silently Returns Failure With No User-Visible Feedback
**Severity:** 🟢 Low  
**Category:** UX — Silent Error State  
**Endpoint:** `GET /api/v1/pin/key-backup`

**Evidence from HAR:**
```json
Response: {"success":false,"message":"No PIN key backup found"}  HTTP 200
```

**Description:**  
The endpoint returns a `success: false` response with HTTP 200 instead of an appropriate 4xx status code. This makes it harder to distinguish errors from success at the network layer and may cause silent failures if the client checks only the HTTP status. The user likely has no indication that PIN key backup is not configured.

**Remediation:**
- Return HTTP 404 when no backup is found.
- Surface this state in the UI (e.g., a prompt to set up key backup for account recovery).
- Standardize error responses to use appropriate HTTP status codes throughout the API.

---

### BUG-17 — Avatar Loaded From External CDN Without Subresource Integrity
**Severity:** 🟢 Low  
**Category:** Security — Third-Party Dependency Risk  
**Endpoint:** `GET https://api.dicebear.com/7.x/avataaars/svg?seed=Xavier`

**Description:**  
User avatars are loaded from `api.dicebear.com`, a third-party CDN. If this service is compromised or returns malicious SVG content, it could be used for XSS or data exfiltration. The CSP `img-src` whitelist does not include `api.dicebear.com`, though the image loaded successfully — suggesting either the CSP is not enforced or the directive is missing an entry.

**Remediation:**
- Proxy avatar generation through your own backend or cache the SVGs in Supabase Storage.
- If the external CDN must be used, add `api.dicebear.com` explicitly to `img-src` and restrict wildcard origins.
- Consider using SVG sanitization if user-controlled seeds influence the output.

---

### BUG-18 — `x-xss-protection: 0` Disables Legacy XSS Filter
**Severity:** 🟢 Low  
**Category:** Security — Missing Browser Protection  

**Evidence from HAR:**
```
x-xss-protection: 0  (on all responses)
```

**Description:**  
Setting `x-xss-protection: 0` intentionally disables the browser's built-in XSS auditor. While this header is deprecated in modern browsers and the XSS auditor had its own bypass vulnerabilities, explicitly setting it to `0` is unusual for a production financial app and should be documented as intentional. If the intent is to rely solely on CSP, the CSP must be tighter (see BUG-13).

**Remediation:**
- If disabling intentionally due to auditor bypass risks, document this decision.
- Ensure CSP is strict enough to compensate (requires fixing BUG-13 first).
- Alternatively, set `x-xss-protection: 1; mode=block` for legacy browser coverage.

---

## Credentials Compromised in This HAR

> ⚠️ **Immediate action required.** The following credentials are exposed in plain text in this HAR file and should be rotated immediately.

| Credential | Value | Action |
|-----------|-------|--------|
| User Password | `User@2026!k` | **Change immediately** |
| Supabase API Key | `sb_publishable_QA4aNzLgHR9xanXUJaPpew_XGRicYBq` | **Rotate in Supabase dashboard** |
| Session JWT | (in auth response, ~1hr TTL) | **Revoke session** |
| User PIN | `123456` | **Change to a strong PIN** |
| Supabase Project URL | `mmwrckfqeqjfqciymemh.supabase.co` | **Enable RLS on all tables** |

---

## OWASP Top 10 Mapping

| Bug | OWASP Category |
|-----|----------------|
| BUG-01, BUG-05 | A02 — Cryptographic Failures |
| BUG-03, BUG-04 | A01 — Broken Access Control |
| BUG-02, BUG-07 | A02 — Cryptographic Failures / Information Exposure |
| BUG-06 | A07 — Identification and Authentication Failures |
| BUG-13, BUG-14 | A05 — Security Misconfiguration |
| BUG-15 | A04 — Insecure Design |
| BUG-17 | A06 — Vulnerable and Outdated Components |

---

### BUG-19 — Password Sent Directly to Auth Endpoint; Should Use a Mapped Numeric Code
**Severity:** 🔴 Critical  
**Category:** Security — Authentication Design  
**Endpoint:** `POST https://mmwrckfqeqjfqciymemh.supabase.co/auth/v1/token?grant_type=password`

**Evidence from HAR:**
```json
Request Body: {"email":"user@KANAKU.com","password":"User@2026!k"}
```
JWT claims also reveal:
```json
"aud": "authenticated",
"role": "authenticated",
"amr": [{"method": "password", "timestamp": 1780670396}]
```
The `amr` (Authentication Method Reference) field confirms the backend is receiving and evaluating the raw password string directly.

**Description:**  
The client sends the actual plaintext password to the authentication endpoint. This means the real credential travels over the network on every login — visible in HAR exports, browser devtools, proxy logs, and server-side access logs if misconfigured.

**Proposed Architecture — Numeric Code Mapping:**  
Instead of sending the real password, the client sends a short numeric code. The server maps that code to the actual credential internally:

```
Step 1: Client requests a challenge
  GET /api/v1/auth/challenge
  Response: { "challengeId": "ch_abc123", "code": 74829 }   ← one-time numeric code

Step 2: Client sends only the numeric code
  POST /auth/v1/token
  Body: { "email": "user@KANAKU.com", "challengeCode": 74829 }

Step 3: Server looks up challengeId → maps to real password → authenticates → discards code
```

This means:
- The real password **never leaves the server**
- The numeric code is **single-use and time-limited** (e.g., 60-second TTL)
- Even if the HAR is captured, the code is already expired and useless
- Brute-force is prevented because the code space is small but the TTL is tight

**Alternative (simpler) approach — SRP (Secure Remote Password):**  
Use the SRP protocol so the server can verify the password without the client ever transmitting it. Libraries exist for both JS and Node.js (`secure-remote-password` npm package).

**Remediation:**
- Implement a challenge-response flow or SRP so passwords are never transmitted.
- At minimum, migrate to magic-link or OAuth/PKCE (Supabase supports both natively).
- The `method: "password"` value in the JWT `amr` claim is a signal to auditors that raw-password auth is in use — replacing it with `"method": "otp"` or `"method": "oauth"` signals a more secure flow.

---

---

## OWASP Top 10 Checklist — Actions Required

> These are the specific OWASP checks you need to perform on this application based on what was observed in the HAR. Each item is a concrete test, not just a category.

---

### A01 — Broken Access Control

- [ ] Test `/api/v1/admin/features` and `/api/v1/admin/ai-features` with a `role: "user"` JWT — should return **403**, currently returns **200**
- [ ] Test all `/api/v1/*` endpoints with **no token at all** — every endpoint should return **401**
- [ ] Test all endpoints with a **different user's JWT** — ensure user A cannot read user B's transactions, loans, goals, investments
- [ ] Verify the PIN endpoints (`/pin/status`, `/pin/create`, `/pin/key-backup`) require a valid authenticated session
- [ ] Test `PUT /api/v1/settings` with another user's `userId` in the body — should be rejected
- [ ] Ensure IDOR (Insecure Direct Object Reference) is not possible via the exposed UUIDs in profile/settings responses

---

### A02 — Cryptographic Failures

- [ ] Confirm passwords are hashed with bcrypt/argon2 (not MD5/SHA1) in the Supabase auth database
- [ ] Confirm PINs are hashed before storage — not stored plaintext
- [ ] Verify the Supabase JWT secret is rotated and not the default
- [ ] Check that the `sb_publishable` API key does not have write access to any Supabase tables without RLS
- [ ] Verify all Supabase tables have **Row Level Security (RLS) enabled** — unauthenticated Supabase key + no RLS = full table read access
- [ ] Ensure no sensitive fields (password, PIN, salary, dateOfBirth) are logged server-side

---

### A03 — Injection

- [ ] Test all query parameters (`?limit=200`, `?seed=Xavier`) for SQL injection: try `' OR 1=1--`, `; DROP TABLE--`
- [ ] Test request body fields (email, currency, language in settings PUT) for NoSQL/SQL injection
- [ ] Test the avatar seed parameter (`?seed=<payload>`) for SVG-based XSS — DiceBear SVGs can embed scripts
- [ ] Test the PIN field for numeric injection (e.g., sending `{"pin": "1 OR 1=1"}`)

---

### A04 — Insecure Design

- [ ] Review whether the challenge-code auth flow (BUG-19) or SRP can replace raw password transmission
- [ ] Confirm there is a PIN attempt lockout — test submitting wrong PINs 5–10 times in a row
- [ ] Confirm there is an account lockout after repeated failed login attempts
- [ ] Review whether financial fields (salary, monthlyIncome) should ever be stored client-side or included in JWT claims

---

### A05 — Security Misconfiguration

- [ ] Tighten CSP: remove `'unsafe-inline'` from `style-src`, restrict `font-src` to specific domains
- [ ] Change `cross-origin-resource-policy` on API routes from `cross-origin` to `same-origin`
- [ ] Verify Vercel environment variables (DB URLs, secrets) are not exposed in client-side JS bundles — inspect the built `.js` files
- [ ] Confirm the Supabase project does not have the **Studio** (admin dashboard) exposed to public internet
- [ ] Check that `/api/v1/admin/*` routes are not accidentally cached at the Vercel CDN layer (cache-control shows `public` — this is wrong for admin data)

---

### A06 — Vulnerable and Outdated Components

- [ ] Audit `supabase-js` version — HAR shows `supabase-js-web/2.95.1`; check for known CVEs against this version
- [ ] Audit DiceBear (`api.dicebear.com/7.x`) — check if v7 has any known SVG injection vulnerabilities
- [ ] Run `npm audit` on the frontend and backend dependency trees
- [ ] Check Vercel runtime version and Node.js version for known vulnerabilities

---

### A07 — Identification and Authentication Failures

- [ ] Verify there is **rate limiting on the login endpoint** — currently only 60 req/min global; test if login can be brute-forced in a separate window
- [ ] Test that the session JWT is **invalidated on the server after logout** (not just cleared client-side)
- [ ] Confirm JWT expiry (`exp`) is enforced server-side — test replaying an expired token
- [ ] Verify there is no **account enumeration** — does `POST /auth/v1/token` return a different error for "email not found" vs "wrong password"?
- [ ] Test the PIN flow: is there a lockout after N wrong attempts? Is the PIN TTL (`expiresAt: 2026-08-16`) enforced server-side?
- [ ] Confirm refresh tokens are rotated on each use and invalidated on logout

---

### A08 — Software and Data Integrity Failures

- [ ] Verify the Supabase JWT secret cannot be guessed or brute-forced (should be 256-bit random)
- [ ] Inspect client-side JS bundles for hardcoded secrets, API keys, or environment variables leaked at build time
- [ ] Confirm the feature flag responses from `/api/v1/admin/features` are **not trusted client-side** for access control decisions — all enforcement must be server-side
- [ ] Check that the `role` field in the JWT cannot be self-assigned by a user during signup or profile update

---

### A09 — Security Logging and Monitoring Failures

- [ ] Confirm failed login attempts are logged with IP, timestamp, and user identifier
- [ ] Confirm PIN failures are logged and trigger alerts after threshold breaches
- [ ] Verify that access to `/api/v1/admin/*` by non-admin users generates an alert/log entry
- [ ] Check that request bodies containing passwords/PINs are **excluded** from logs
- [ ] Confirm there is alerting on unusual polling patterns or sudden spikes in API calls

---

### A10 — Server-Side Request Forgery (SSRF)

- [ ] Test any endpoint that accepts a URL as input (e.g., avatar URL, receipt scanner image URL) for SSRF — try `http://169.254.169.254/latest/meta-data/` (AWS metadata endpoint)
- [ ] The receipt scanner (`ReceiptScanner-BklrCR8l.js` is loaded) likely accepts image URLs or file uploads — test for SSRF and path traversal
- [ ] If the OCR engine calls external URLs to process images, ensure it is restricted to allowlisted domains only

---

## Quick Priority Order

| Priority | Bugs / Checks to fix first |
|----------|---------------------------|
| **Do today** | BUG-01, BUG-19 (auth redesign), BUG-03 (verify auth enforcement), BUG-04 (admin endpoint access), A02 RLS check |
| **This week** | BUG-05 (PIN hashing), BUG-06 (PIN policy), A07 (brute force/lockout), A01 (IDOR tests) |
| **This sprint** | BUG-08/09/10 (performance), BUG-13/14 (CSP/CORP), A05 (misconfiguration sweep) |
| **Backlog** | BUG-11/12 (pagination), BUG-15 (PII trimming), A06 (dependency audit), A09 (logging) |

---

*Report generated from HAR file: `expensev67_vercel_app_06062026.har`*
