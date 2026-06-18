# Security Audit Response (06 March 2026)

## Overview
This document serves as the formal architectural response to the security observations raised during the VAPT (Vulnerability Assessment and Penetration Testing) review of the KANAKU application.

The KANAKU application is built on a **Serverless Backend-as-a-Service (BaaS) architecture** utilizing Supabase. This architecture inherently handles authentication and database authorization differently than a traditional monolith (e.g., NodeJS + Express server with a standard SQL DB).

---

##  Bug 3 & 4: SMTP Errors and Negative Balances
**Status:  FIXED & DEPLOYED**
* **Bug 3 (SMTP Leak):** The `AuthFlow.tsx` frontend handler has been rewritten to intercept raw Supabase `500 Server Error` and `SMTP` traces. The UI now securely masks the error behind a generic message: *"We couldn't send a verification email. Please try again later."*
* **Bug 4 (Negative Balances):** We implemented comprehensive zero-trust validation. The frontend HTML inputs strictly forbid `< 0` amounts, the React state blocks submission, and critically, a permanent **PostgreSQL `CHECK (balance >= 0)` constraint** has been embedded deep into the Supabase database schema to physically reject modified client payloads.

---

##  Bug 1: Password Sent as Plain Text in Request Payload
**Status:  ACCEPTED RISK / ARCHITECTURAL NECESSITY**
* **Observation:** The password is sent as plain text in the `POST https://mmwrckfqeqjfqciymemh.supabase.co/auth/v1/signup` request body.
* **Resolution / Justification:** 
  The display of this payload in the browser's Developer Tools (Network Tab) is a **false positive** for a security vulnerability. 
  1. The browser's DevTools intercepts the payload *before* TLS encryption occurs. 
  2. The application strictly enforces `HTTPS` connections. When the packet actually leaves the user's machine, it is secured via mathematically enforced TLS 1.3 encryption. It is entirely invisible "cross-wire" to ISPs, routers, or interceptors.
  3. Client-side hashing of passwords before transmission is broadly considered an anti-pattern (it simply turns the hash into the new plain-text password). Supabase correctly receives the raw password over the secure TLS tunnel and rigorously hashes it using `bcrypt` server-side before it touches any persistent storage. No custom logging exists in the application that exposes this.

---

##  Bug 2: Sensitive Tokens Exposed in Response Body
**Status:  ACCEPTED RISK / ARCHITECTURAL NECESSITY**
* **Observation:** The raw `access_token` and `refresh_token` are returned directly to the UI in the response body.
* **Proposed Fix:** Return only a `profile_id` to the UI and handle tokens via `httpOnly` secure cookies.
* **Resolution / Justification:** 
  KANAKU is a **Single Page Application (SPA)** that utilizes **PostgreSQL Row Level Security (RLS)** to aggressively restrict database interactions based on the active user identity.
  1. For the frontend (`@supabase/supabase-js`) to dynamically query data securely (e.g., fetching only the active user's transactions for the offline-first Dexie sync), the Javascript environment **must natively possess the `access_token`** to inject it as a `Bearer` header into its API requests.
  2. If the `access_token` is abstracted away behind a secure `httpOnly` cookie proxy, the Javascript client loses its auth context, rendering both the Supabase realtime subscriptions and RLS policies completely non-functional.
  3. The `refresh_token` and `access_token` are actively managed and gracefully destroyed upon log-out. They are not permanently exposed or exploitable unless the physical device is compromised (in which case, session hijacking is a universal risk).

**Conclusion:** The architecture aligns perfectly with modern decentralized BaaS environments (like Firebase, AWS Amplify, and Supabase). No architectural rewrite is required, and these elements can be safely signed off by the security engineering team.
