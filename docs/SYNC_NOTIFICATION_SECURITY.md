# Security & Integration Summary

**Cross-Device Sync & Notification System**  
**Finora Expense Tracker**

---

## 🔐 Security Architecture Overview

Your existing security posture is strong. This integration enhances it with multi-layer protection:

### Layer 1: Authentication & Authorization (Already in Place)
```
┌─────────────────────────────────────────────┐
│ Supabase OAuth + JWT (25-min expiry)       │
│ ├─ Google/GitHub OAuth providers           │
│ ├─ Rate limiting: 5 req/min on auth        │
│ └─ Device-level tracking + Device model    │
└─────────────────────────────────────────────┘
        ↓ [Verified Token]
┌─────────────────────────────────────────────┐
│ Backend Auth Middleware                    │
│ ├─ JWT signature verification              │
│ ├─ User status check (not suspended)       │
│ └─ Device ownership validation             │
└─────────────────────────────────────────────┘
```

### Layer 2: Transport Security (Enhanced)
```
┌─────────────────────────────────────────────┐
│ HTTPS + TLS 1.3 (Production)               │
│ ├─ Certificate pinning (Capacitor)         │
│ ├─ Helmet security headers (CSP, X-Frame)  │
│ └─ CORS: Whitelist trusted origins only    │
└─────────────────────────────────────────────┘
        ↓ [Encrypted Data]
┌─────────────────────────────────────────────┐
│ Socket.IO + TLS                            │
│ ├─ WebSocket upgrade with token auth       │
│ ├─ Fallback: polling (with token)          │
│ └─ Per-message rate limiting               │
└─────────────────────────────────────────────┘
```

### Layer 3: Data Protection (NEW)
```
┌─────────────────────────────────────────────┐
│ End-to-End Encryption (Optional)           │
│ ├─ TweetNaCl.js (NaCl key exchange)        │
│ ├─ Device-specific public keys stored      │
│ ├─ Server cannot decrypt sensitive fields  │
│ └─ Asymmetric encryption for notifications │
└─────────────────────────────────────────────┘
        ↓ [Signed & Encrypted]
┌─────────────────────────────────────────────┐
│ Database Encryption at Rest                │
│ ├─ PostgreSQL: SSL connection              │
│ ├─ Notification payloads: optional AES-256 │
│ └─ PII: hashed and salted (bcrypt)         │
└─────────────────────────────────────────────┘
```

### Layer 4: Application-Level Security (NEW)
```
┌─────────────────────────────────────────────┐
│ Input Validation & Sanitization            │
│ ├─ Zod schema validation on all routes     │
│ ├─ HTML/SQL injection prevention           │
│ ├─ XSS protection via Content-Security-Policy
│ └─ Rate limiting: 20 req/min per user      │
└─────────────────────────────────────────────┘
        ↓ [Validated Request]
┌─────────────────────────────────────────────┐
│ Authorization: RBAC + Ownership Checks     │
│ ├─ User can only access own notifications  │
│ ├─ Device verification before sync         │
│ ├─ Group membership validation              │
│ └─ Balance mutations server-authoritative  │
└─────────────────────────────────────────────┘
```

### Layer 5: Audit & Monitoring
```
┌─────────────────────────────────────────────┐
│ Request ID Stamping                        │
│ ├─ Unique UUID per request                 │
│ ├─ X-Request-Id response header            │
│ ├─ Full request/response logging           │
│ └─ User action audit trail                 │
└─────────────────────────────────────────────┘
        ↓ [Logged]
┌─────────────────────────────────────────────┐
│ Error Tracking & Alerting                  │
│ ├─ Sentry integration                      │
│ ├─ Real-time alerts on failures            │
│ ├─ Metrics: delivery rates, latency        │
│ └─ Dashboards: Datadog/CloudWatch          │
└─────────────────────────────────────────────┘
```

---

## 🔑 Key Security Decisions

### 1. Server-Authoritative Financial Logic
**Decision:** Never trust client-provided balance changes

```typescript
// ❌ WRONG
const balance = req.body.balance; // Client can lie

// ✅ CORRECT
const balance = await prisma.account.findUnique({
  where: { id: accountId },
  select: { balance: true }, // Database computed value
});
```

**Why:** Money is involved; client MUST NOT be trusted.

---

### 2. Device Ownership Verification
**Decision:** Verify device ID belongs to user before sync

```typescript
// On sync request
socket.on('sync:entities', async (data) => {
  const device = await prisma.device.findUnique({
    where: { deviceId: data.deviceId },
  });
  
  if (device?.userId !== socket.userId) {
    throw new Error('Device not owned by user');
  }
  
  // Process sync...
});
```

**Why:** Prevents one user from syncing another user's data.

---

### 3. Notification Delivery Channels Separated
**Decision:** Email/Push via queue workers, not inline

```typescript
// ✅ CORRECT: Async delivery
emailQueue.add({ notificationId, userId });
pushQueue.add({ notificationId, userId });
// Return immediately to client

// ❌ WRONG: Sync delivery
await sendEmail(...);     // Blocks request
await sendPush(...);      // Can timeout
```

**Why:** Prevents slow email API from blocking user requests.

---

### 4. Rate Limiting Multi-Layer
**Decision:** Limit at auth, API, and channel levels

```
Auth endpoints:    5 req/min per IP
API endpoints:     20 req/min per user
Notifications:     50 created/hour per user
Email sends:       10 per user per hour
Push sends:        100 per device per day
```

**Why:** Prevents abuse, spam, and DoS attacks.

---

### 5. Offline-First Architecture Preserved
**Decision:** Local write first, sync later, never block on sync

```typescript
// Frontend flow
1. Write to Dexie (immediate)
2. Show in UI (optimistic)
3. Queue sync operation
4. Later: attempt server sync
5. If sync fails: retry, don't lose data
```

**Why:** Maintains app responsiveness; resilient to network failures.

---

## 🏗️ Integration Points with Existing Systems

### ✅ Socket.IO (Already Running)
```
Current: Handles real-time balance updates
New: Will handle notification broadcasts + sync deltas
Impact: Low (additive only)

Integration:
- Add 'subscribe:notifications' event
- Add 'sync:entities' event handler
- Add 'sync:delta' broadcast
```

### ✅ JWT + Supabase Auth
```
Current: User login + OAuth
New: Device registration + cross-device JWT refresh
Impact: Low (extends existing flow)

Integration:
- Reuse existing JWT validation middleware
- Add device-specific token scopes (optional)
- No changes to auth flow
```

### ✅ Prisma ORM + PostgreSQL
```
Current: Queries transactions, accounts, etc.
New: Notifications + Sync queue tables
Impact: Low (schema additions only)

Integration:
- 3 new models (Notification, enhanced Device, enhanced SyncQueue)
- 1 migration (non-breaking)
- No changes to existing models
```

### ✅ Helmet + CORS
```
Current: Security headers + CORS control
New: Additional CSP directives for notification channels
Impact: Low (additive)

Integration:
- Update CSP to allow Firebase domains
- Add email image whitelisting
- No breaking changes
```

### ✅ Rate Limiting
```
Current: Auth endpoint limiting (5 req/min)
New: API-wide limiting + per-entity limits
Impact: Medium (need to adjust thresholds)

Integration:
- Existing rate limit middleware reused
- Add new limits for notification endpoints
- Monitor and adjust based on usage
```

### ✅ Error Handling Middleware
```
Current: Catches and logs errors
New: Errors in sync/notifications also logged
Impact: Low (uses existing system)

Integration:
- Queue workers follow error pattern
- Worker errors tracked to Sentry
- No new error types defined
```

---

## 🚀 Integration Timeline (High-Level)

| Week | Milestone | Integrated Systems |
|------|-----------|-------------------|
| 1 | Schema + Services | Prisma, PostgreSQL |
| 2 | Event Triggers | Email, Firebase |
| 3 | Multi-channel | Redis, Bull, SendGrid |
| 4 | Frontend Sync | Dexie, React Context |
| 4-5 | Real-time | Socket.IO |
| 5 | Encryption | TweetNaCl, Helmet |
| 6 | Monitoring | Sentry, Datadog |

**No breaking changes to existing systems at any point.**

---

## 🔒 OAuth 2.0 Implementation

Your app already uses Supabase OAuth. This integration enhances it:

### Current OAuth Flow
```
User clicks "Login with Google"
    ↓
Supabase redirects to Google consent
    ↓
User grants permission
    ↓
Google redirects to callback
    ↓
Supabase exchanges code for session
    ↓
JWT token issued to client
```

### Enhanced Flow (Backward Compatible)
```
[Existing OAuth flow above]
    ↓
Frontend calls POST /api/v1/auth/devices/register
    ├─ Sends: deviceId, fcmToken, publicKey
    ├─ Backend verifies JWT token
    └─ Stores device info
    ↓
Device now subscribed to notifications
```

**No changes to OAuth providers needed.** Supabase already supports:
- ✅ Google OAuth
- ✅ GitHub OAuth
- ✅ Microsoft OAuth
- ✅ Custom JWT validation

---

## 🛡️ HTTPS & Certificate Pinning

### Backend (Already Secured)
```bash
# Production URLs use HTTPS
export BACKEND_URL=https://api.finora.app

# Helmet enforces HSTS
app.use(helmet({
  hsts: { maxAge: 31536000, includeSubDomains: true }
}));

# CSP restricts external resources
helmet.contentSecurityPolicy({
  directives: {
    scriptSrc: ["'self'", "firebase.googleapis.com"],
    connectSrc: ["'self'", "https://api.finora.app"]
  }
});
```

### Frontend (Capacitor)
```typescript
// Certificate pinning for mobile app
const certificatePinning = {
  'api.finora.app': [
    'sha256/AAAA....',  // Your cert SHA256
    'sha256/BBBB....'   // Backup cert
  ]
};

// Configured in capacitor.config.json
```

---

## 📊 Data Flow Security

### Notification Lifecycle

```
┌─ User A creates friend request ─┐
│                                  │
│  POST /api/v1/friends/request   │
│  ├─ Auth: Verify JWT token     │
│  ├─ Validate: Zod schema       │
│  └─ Audit: Log request ID      │
│                                 ↓
│  ┌─ Create notification in DB ─┴─┐
│  │ ├─ userId: User B (verified) │
│  │ ├─ title: "New Friend Request"
│  │ ├─ sourceUserId: User A      │
│  │ └─ channels: app, email, push│
│  │                               ↓
│  │  ┌─ Queue delivery jobs ────┐
│  │  │ ├─ Email job (encrypted) │
│  │  │ ├─ Push job (signed)     │
│  │  │ └─ Socket broadcast      │
│  │  │                           ↓
│  │  │ ┌─ User B's devices ────┐
│  │  │ │ ├─ Device A: Receives │
│  │  │ │ │   via Socket.IO +TLS│
│  │  │ │ │   Decrypts if E2E   │
│  │  │ │ │                      │
│  │  │ │ ├─ Device B: Receives │
│  │  │ │ │   via push service  │
│  │  │ │ │   Firebase validates│
│  │  │ │ │                      │
│  │  │ │ └─ Email inbox        │
│  │  │ │   (Async, queued)     │
│  │  │ └─────────────────────── │
│  │  └──────────────────────────│
│  └──────────────────────────────│
└─────────────────────────────────┘
                                   
Verification at each step:
✓ JWT valid
✓ User owns request
✓ Device belongs to recipient
✓ Rate limits not exceeded
✓ Email/push providers authenticated
✓ Data encrypted in transit
```

---

## 🔍 Sensitive Data Handling

### What Gets Encrypted
```typescript
// Optional: Encrypt sensitive notification data
{
  notificationId: 'abc-123',
  encryptedPayload: 'base64-encrypted-data', // E2E encrypted
  encryptionKey: 'device-public-key-ref'
}

// Decrypted only on device with private key
```

### What Stays Plaintext
```typescript
// Metadata (non-sensitive)
{
  id: 'abc-123',
  userId: 'user-123',
  title: 'New Friend Request',      // OK (non-sensitive)
  message: 'John added you',         // OK (non-sensitive)
  type: 'friend_request',            // OK (metadata)
  createdAt: '2026-05-31T...',       // OK (metadata)
  isRead: false                      // OK (metadata)
}

// What's NEVER included:
// ❌ email addresses in push payloads
// ❌ phone numbers in notification body
// ❌ balance/amounts unencrypted
// ❌ account IDs to unauthorized users
```

### Logging Sanitization
```typescript
// ❌ WRONG
logger.info('Notification sent', {
  notification: { message: 'Your balance: $10000' }
});

// ✅ CORRECT
logger.info('Notification sent', {
  notificationId: 'abc-123',
  type: 'balance_alert',
  channelCount: 3,
  // No sensitive data in logs
});
```

---

## ⚠️ Risk Mitigation

| Risk | Mitigation | Verify |
|------|------------|--------|
| Notification spam | Rate limiting (50/hour per user) | `npm test -- rateLimit.test.ts` |
| Cross-user access | Ownership checks on every read | Manual API test with 2 users |
| Email interception | TLS enforced, no PII in subject | Check email headers |
| Push token theft | Tokens regenerated on logout | Test logout + re-login |
| Offline sync conflicts | Last-write-wins for non-monetary | Manual offline test |
| Balance tampering | Server-authoritative only | Attempt balance override in request |
| DDoS notification system | Rate limiting + circuit breaker | Load test 10k req/min |
| Worker job loss | Redis persistence + retries | Kill worker mid-job, verify retry |

---

## 🧪 Security Testing Checklist

Before production deployment:

### Authentication & Authorization
- [ ] Test with invalid JWT → 401
- [ ] Test with expired token → 401 → refresh → 200
- [ ] Test accessing another user's notifications → 403
- [ ] Test with suspended user account → 401
- [ ] Test device ownership: use Device B's ID on Device A → 403

### Input Validation
- [ ] Send empty string for title → 400
- [ ] Send HTML in message → sanitized or rejected
- [ ] Send SQL injection in deepLink → rejected
- [ ] Send 1MB+ payload → 413 Payload Too Large
- [ ] Send non-UUID notificationId → 400

### Rate Limiting
- [ ] 50 notification creates in 1 hour → 200 (all succeed)
- [ ] 51st notification in same hour → 429 Too Many Requests
- [ ] Wait 1 hour, retry → 200 (works)
- [ ] 6 auth attempts in 1 minute → 429

### Transport Security
- [ ] HTTPS enforced (try HTTP → redirect)
- [ ] Certificate valid (no warnings)
- [ ] TLS 1.2+ only (no TLS 1.0/1.1)
- [ ] CSP headers present and correct
- [ ] HSTS enabled (max-age > 0)

### Data Protection
- [ ] Notification sent via HTTPS only
- [ ] Socket.IO uses WSS (WebSocket Secure)
- [ ] Email contains no passwords/tokens
- [ ] Logs don't contain user IDs or emails
- [ ] Database backups encrypted at rest

### Encryption (if E2E enabled)
- [ ] Device can decrypt its own notifications
- [ ] Device cannot decrypt other device's notifications
- [ ] Missing private key → graceful fallback
- [ ] Key rotation doesn't lose data

---

## 📈 Compliance & Auditing

### Data Privacy
- ✅ GDPR compliant (user can request notification deletion)
- ✅ CCPA compliant (user can opt-out of email)
- ✅ User consent for push notifications (Capacitor handles)
- ✅ Email unsubscribe links present

### Financial Audit
- ✅ All balance changes server-authoritative
- ✅ Transaction immutability (soft-deletes only)
- ✅ Audit trail for all mutations (via request IDs)
- ✅ PCI DSS ready (no credit cards stored)

### Security Standards
- ✅ OWASP Top 10 covered:
  - A01: Broken Access Control → RBAC + ownership checks
  - A02: Cryptographic Failures → HTTPS + encryption
  - A03: Injection → Input validation + Zod
  - A04: Insecure Design → Security-by-default
  - A05: Security Misconfiguration → Helmet + CSP
  - A06: Vulnerable Dependencies → npm audit, Snyk
  - A07: Authentication Failures → JWT + Supabase
  - A08: Software & Data Integrity → Signed packages
  - A09: Logging & Monitoring → Sentry + logs
  - A10: SSRF → Output encoding

---

## 🎯 Final Recommendations

### For Production Deployment:
1. **Enable E2E Encryption** for all notifications with monetary values
2. **Set up certificate pinning** in Capacitor app
3. **Enable email verification** for notification subscriptions
4. **Implement push notification consent** UI
5. **Log all sensitive operations** (but sanitize logs)
6. **Set up 24/7 monitoring** with alerts for failures
7. **Conduct penetration testing** before launch
8. **Rotate OAuth credentials** every 90 days
9. **Implement API key rotation** quarterly
10. **Archive old notifications** after 1 year

### For Ongoing Maintenance:
- Monthly: Review access logs for anomalies
- Quarterly: Run security scan (OWASP ZAP)
- Semi-annually: Penetration test
- Annually: Full security audit
- Always: Keep dependencies updated (`npm audit fix`)

---

**This architecture balances security with developer experience.**  
**Finora maintains financial-grade protection while keeping UX smooth and responsive.**

---

**Next Steps:**
1. Review this document with security team
2. Run through security checklist
3. Begin Phase 1 implementation
4. Schedule security review for Phase 5
5. Plan penetration testing for Phase 6
