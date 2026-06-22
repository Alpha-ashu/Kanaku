# Finora / Kanaku — Communication Sequence Diagrams

How the pieces actually talk to each other, for the four core flows.
See [ARCHITECTURE.md](./ARCHITECTURE.md) for the component view.

Conventions: `Bearer JWT` = the backend‑issued HS256 access token. `Redis` means
the cache‑with‑failover layer (which falls back to an in‑memory store on error).

---

## 1. Login (backend‑managed / BFF)

The client authenticates against our backend, which verifies the password (local
bcrypt or, for unmigrated accounts, Supabase) and issues **only** a backend JWT.
Login is a 2‑step challenge; the SHA‑256 attempt is a DevTools‑hygiene probe that
falls back to plain when the account verifies server‑side.

```mermaid
sequenceDiagram
  autonumber
  actor U as User
  participant C as Client
  participant BE as Backend /auth
  participant R as Redis / memory
  participant DB as Postgres
  participant SB as Supabase Auth

  U->>C: enter email + password
  Note over C: SHA-256(password) — keep raw pwd out of DevTools
  C->>BE: POST /auth/login/challenge  (x-pw-encoding: sha256)
  BE->>DB: load user by email
  alt local bcrypt account
    BE->>BE: bcrypt.compare(digest, hash) → fails for a digest
  else supabase-managed account
    BE->>SB: signInWithPassword(digest) → fails
  end
  BE-->>C: 401 INVALID_CREDENTIALS
  Note over C: fall back to the plain password
  C->>BE: POST /auth/login/challenge  (x-pw-encoding: plain)
  BE->>DB: verifyPasswordOnly (bcrypt OR Supabase)
  BE->>R: store challenge code (EX 60s)
  Note over BE,R: if Redis errors/over-quota → store in memory cache
  BE-->>C: 200 {challengeId, code}

  C->>BE: POST /auth/login {email, challengeCode}
  BE->>R: read + delete challenge, validate code
  BE->>DB: load user (role/approval)
  BE->>BE: generateTokens — HS256 access 15m + refresh 7d
  BE->>R: establishIdleSession
  BE-->>C: 200 {accessToken, refreshToken, user}<br/>Authorization + x-refresh-token + Set-Cookie (HttpOnly refresh)
  C->>C: TokenManager stores JWT · dispatch KANAKU_AUTH_CHANGE
  Note over C: AuthContext builds the session →<br/>app advances to the PIN screen (still locked)
```

**Refresh (later):** `POST /auth/refresh` (HttpOnly cookie / `x-refresh-token`) →
backend verifies, rotates the pair, slides the idle window, returns new tokens.

---

## 2. PIN unlock (server‑enforced)

The PIN screen blocks the app until the PIN is verified **server‑side**, which
records a sliding "PIN unlocked" marker. Financial routes and private profile
fields then require that marker (when `PIN_GATE_ENABLED=true`).

```mermaid
sequenceDiagram
  autonumber
  actor U as User
  participant C as Client / PINAuth
  participant BE as Backend /pin
  participant R as Redis / memory
  participant DB as Postgres

  Note over C: authenticated but LOCKED (App.tsx Gate 2)
  U->>C: enter 6-digit PIN
  Note over C: SHA-256(pin)
  C->>BE: POST /pin/verify {pin}
  BE->>DB: load UserPin · bcrypt.compare(pinHash)
  alt PIN valid
    BE->>DB: set lastVerifiedAt
    BE->>R: establishPinUnlock (sliding TTL marker)
    BE-->>C: 200 success
    C->>C: persist verified · api.clearCache()
    C->>C: setAuthenticated → unlock UI + decryption key
    C->>BE: triggerDataSync (now passes the PIN gate)
  else PIN invalid
    BE-->>C: 401 (increment failed attempts / lockout)
  end

  Note over C,BE: any later financial request is gated
  C->>BE: GET /accounts  (Bearer JWT)
  BE->>R: evaluatePinUnlock?
  alt unlocked (within window)
    BE-->>C: 200 data
  else expired / locked
    BE-->>C: 403 PIN_VERIFICATION_REQUIRED
    C->>C: KANAKU_FORCE_PIN_LOCK → re-lock to PIN screen
  end
```

---

## 3. Sync (offline‑first)

After PIN unlock, the client pulls changes into the encrypted Dexie store and
pushes local edits back. Both directions are PIN‑gated; pushes are idempotent.

```mermaid
sequenceDiagram
  autonumber
  participant C as Client / sync engine
  participant Dx as Dexie (encrypted)
  participant BE as Backend /sync
  participant R as Redis / memory
  participant PG as Postgres

  Note over C: fires after PIN unlock (App.tsx triggerDataSync)
  C->>BE: POST /sync/pull {deviceId, lastSyncedAt, entityTypes}  (Bearer JWT)
  BE->>BE: authMiddleware
  BE->>R: pinGate · evaluatePinUnlock?
  alt no live PIN unlock
    BE-->>C: 403 PIN_VERIFICATION_REQUIRED
  else unlocked
    BE->>PG: select rows changed since lastSyncedAt (per entity)
    BE-->>C: 200 {entities, serverTime}
    C->>Dx: merge (encrypted) → UI updates
  end

  Note over C,Dx: user edits locally → enqueued in the sync queue
  C->>BE: POST /sync/push {deviceId, entities}  (Bearer JWT)
  BE->>BE: authMiddleware · pinGate · idempotency
  BE->>PG: upsert (allow-listed fields, conflict resolution, balance recompute)
  BE-->>C: 200 {results, syncStatus}
  C->>Dx: mark records synced
```

---

## 4. Account Aggregator (RBI · Setu)

RBI‑compliant bank‑data linking. Consent creation requires a recent OTP. Setu
notifies the backend via **HMAC‑signed** webhooks (no user JWT). Fetched financial
data is decrypted (AES‑256‑GCM) and stored.

```mermaid
sequenceDiagram
  autonumber
  actor U as User
  participant C as Client
  participant BE as Backend /aa
  participant Setu as Setu (AA / TSP)
  participant AAapp as AA consent app
  participant DB as Postgres

  Note over C,BE: RBI compliance — recent OTP (purpose aa_consent) required
  U->>C: link bank accounts
  C->>BE: POST /otp/verify (purpose aa_consent)
  C->>BE: POST /aa/consent {vua, fiTypes, consentTypes, purpose, dataRange}
  BE->>BE: assert recent aa_consent OTP
  BE->>Setu: create consent
  Setu-->>BE: {consentHandle, redirect url}
  BE-->>C: 201 {consentHandle, url}
  C->>AAapp: redirect — user approves consent at their AA
  Setu-->>BE: POST /aa/notification (HMAC x-setu-signature) — consent ACTIVE
  BE->>DB: update consent status + store artifact
  C->>BE: GET /aa/consent/status/{consentHandle}  (poll)
  BE-->>C: ACTIVE + consentId

  C->>BE: POST /aa/data/session {consentId}
  BE->>Setu: create FI data request
  Setu-->>BE: {sessionId}
  Setu-->>BE: POST /aa/notification — data READY
  C->>BE: GET /aa/data/fetch/{sessionId}
  BE->>Setu: fetch FI data
  Setu-->>BE: encrypted financial data
  BE->>BE: decrypt (AES-256-GCM, AA_ENCRYPTION_ROOT_KEY)
  BE->>DB: store AaFinancialData / AaTransaction
  BE-->>C: 200 {summary}
  C->>BE: GET /aa/financial-summary
  Note over U,BE: user may later POST /aa/consent/revoke/{consentId}
```

---

### Cross‑cutting notes

- **Every protected request** runs `authMiddleware` (verify backend JWT, role from
  DB snapshot — never token metadata) then the idle‑session check.
- **Rate limits:** login 5/min, refresh 10/min, OTP 5/10min, AA 20/min.
- **Webhooks** (Setu AA, payments) are verified by HMAC‑SHA256 over the raw body —
  they sit *before* `authMiddleware` because they're machine‑to‑machine.
