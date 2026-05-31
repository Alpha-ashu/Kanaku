# Quick Reference: Sync & Notification System Implementation Checklist

**Duration:** 6-8 weeks (Phases 1-6)  
**Team Size:** 2-3 developers  
**Dependencies:** Redis, Firebase Cloud Messaging, Email service (SendGrid/Mailgun)

---

## 📋 Phase Breakdown & Timeline

### Phase 1: Foundation (Week 1-2)
**Objective:** Database schema + core services setup

- [ ] **Week 1, Day 1-2:** Dependencies & Environment
  - [ ] Run `npm install bull bullmq redis firebase-admin`
  - [ ] Create `.env` with Redis, Firebase, email config
  - [ ] Initialize Firebase Admin SDK in `config/firebase.ts`
  - [ ] Test Redis connection: `redis-cli ping`

- [ ] **Week 1, Day 3-5:** Database Schema
  - [ ] Update `prisma/schema.prisma` (Device + Notification + SyncQueue fields)
  - [ ] Run migration: `npx prisma migrate dev --name add_sync_notifications_fields`
  - [ ] Verify schema with `npx prisma studio`
  - [ ] Test schema in PostgreSQL directly

- [ ] **Week 2, Day 1-3:** Core Services
  - [ ] Create `modules/notifications/notification.service.ts`
  - [ ] Create `workers/email.worker.ts`
  - [ ] Create `workers/push.worker.ts`
  - [ ] Test service functions with unit tests

- [ ] **Week 2, Day 4-5:** Integration
  - [ ] Update `sockets/index.ts` with sync event handlers
  - [ ] Update `app.ts` to start workers
  - [ ] Test Socket.IO with manual client
  - [ ] Deploy to staging; verify logs

---

### Phase 2: Event Triggers (Week 2-3)
**Objective:** Friend requests + Group expenses + Loan reminders

- [ ] **Week 2, Days 6-7 / Week 3, Day 1-2:** Friend Requests
  - [ ] Create `modules/friends/friend.controller.ts`
  - [ ] Add friend request route: `POST /api/v1/friends/request`
  - [ ] Trigger notification in `createNotification()` call
  - [ ] Write integration test
  - [ ] Manual test: send friend request → receive notification

- [ ] **Week 3, Day 3-4:** Group Expenses
  - [ ] Update `modules/groups/group.controller.ts`
  - [ ] Trigger notifications for group members on expense creation
  - [ ] Test with multiple group members
  - [ ] Verify member notification delivery

- [ ] **Week 3, Day 5-6:** Loan Reminders
  - [ ] Create `jobs/loan-reminders.job.ts` (cron-based)
  - [ ] Set up node-cron schedule (daily at 8 PM UTC)
  - [ ] Test with fake due dates
  - [ ] Monitor job logs for 24 hours

---

### Phase 3: Multi-Channel Delivery (Week 3-4)
**Objective:** Email + Push notifications working end-to-end

- [ ] **Week 3, Day 7 / Week 4, Day 1-2:** Email Delivery
  - [ ] Configure SendGrid API key
  - [ ] Test email queue job processing
  - [ ] Create email templates (HTML)
  - [ ] Test 10 emails sequentially → check delivery
  - [ ] Monitor bounce/failure rates

- [ ] **Week 4, Day 3-5:** Push Notifications
  - [ ] Download Firebase Admin SDK credentials JSON
  - [ ] Create `POST /api/v1/auth/devices/register` route
  - [ ] Test device registration with sample token
  - [ ] Send 10 test push notifications
  - [ ] Verify delivery on Android/iOS/Web
  - [ ] Set up failed token cleanup

- [ ] **Week 4, Day 6-7:** Channel Orchestration
  - [ ] Implement `queueNotificationDelivery()` to handle all channels
  - [ ] Test notification with channels=['app', 'email', 'push']
  - [ ] Verify all three channels triggered simultaneously
  - [ ] Load test with 1000 notifications/hour

---

### Phase 4: Frontend Integration (Week 4-5)
**Objective:** React + Dexie sync + real-time updates

- [ ] **Week 4, Day 8 / Week 5, Day 1-2:** Dexie Setup
  - [ ] Update `lib/db.ts` schema (notifications + syncQueue)
  - [ ] Test local DB operations
  - [ ] Implement `db.notifications.add()` flow

- [ ] **Week 5, Day 3-4:** Context & Hooks
  - [ ] Create `contexts/NotificationContext.tsx`
  - [ ] Create `hooks/useRealtimeSocket.ts`
  - [ ] Create `hooks/useSyncWorker.ts`
  - [ ] Create `hooks/useDeviceRegistration.ts`
  - [ ] Test each hook in isolation

- [ ] **Week 5, Day 5-6:** UI Components
  - [ ] Create `NotificationBadge` component
  - [ ] Create `NotificationPanel` component
  - [ ] Integrate into app header
  - [ ] Test UI with 50 notifications

- [ ] **Week 5, Day 7:** End-to-End Frontend
  - [ ] Verify Socket.IO connection on app load
  - [ ] Send test notification from backend
  - [ ] Observe real-time delivery to frontend
  - [ ] Mark as read → sync to backend → other devices

---

### Phase 5: Security & Encryption (Week 5-6)
**Objective:** OAuth 2.0 + E2E encryption + rate limiting

- [ ] **Week 5, Day 8 / Week 6, Day 1-2:** OAuth 2.0
  - [ ] Verify Supabase OAuth providers configured
  - [ ] Test OAuth login flow (Google/GitHub)
  - [ ] Verify JWT token generation
  - [ ] Add rate limiting to OAuth endpoints

- [ ] **Week 6, Day 3-4:** Encryption
  - [ ] Implement TweetNaCl key pair generation
  - [ ] Add `publicKey` field to Device model
  - [ ] Implement `encryptForDevice()` function
  - [ ] Test E2E encryption/decryption
  - [ ] Update notification service to use encryption

- [ ] **Week 6, Day 5-6:** Rate Limiting
  - [ ] Verify Helmet + CORS headers in production
  - [ ] Add rate limiting to notification endpoints
  - [ ] Test rate limit thresholds
  - [ ] Verify 429 response on limit breach

- [ ] **Week 6, Day 7:** Security Audit
  - [ ] Review all API routes for auth checks
  - [ ] Verify HTTPS in production
  - [ ] Check for hardcoded secrets
  - [ ] Run OWASP ZAP security scan

---

### Phase 6: Testing & Monitoring (Week 6-7)
**Objective:** Comprehensive testing + production readiness

- [ ] **Week 6, Day 8 / Week 7, Day 1-2:** Unit & Integration Tests
  - [ ] Write unit tests: `notification.service.test.ts`
  - [ ] Write API tests: `notification.routes.test.ts`
  - [ ] Write worker tests: `email.worker.test.ts`
  - [ ] Achieve >80% code coverage
  - [ ] Run full test suite: `npm test`

- [ ] **Week 7, Day 3-4:** Load & Stress Testing
  - [ ] Simulate 1000 concurrent connections
  - [ ] Send 10,000 notifications/hour
  - [ ] Monitor CPU, memory, Redis usage
  - [ ] Identify and fix bottlenecks

- [ ] **Week 7, Day 5-6:** Monitoring & Alerting
  - [ ] Set up Sentry for error tracking
  - [ ] Create CloudWatch/Datadog dashboards
  - [ ] Set alerts: >5% delivery failure, >30s sync latency
  - [ ] Configure log aggregation (ELK/Datadog)

- [ ] **Week 7, Day 7:** Production Deployment
  - [ ] Deploy backend changes to staging
  - [ ] Deploy frontend changes to staging
  - [ ] Smoke test all notification flows
  - [ ] Deploy to production
  - [ ] Monitor first 24 hours closely

---

## 🔑 Key Files to Create/Modify

### Backend Files (to create)

```
backend/src/
├── config/
│   ├── firebase.ts (NEW)
│   └── queue.ts (NEW)
├── modules/
│   ├── notifications/
│   │   ├── notification.service.ts (NEW)
│   │   ├── notification.controller.ts (UPDATE)
│   │   └── notification.routes.ts (UPDATE)
│   ├── friends/
│   │   └── friend.controller.ts (UPDATE - add notifications)
│   ├── groups/
│   │   └── group.controller.ts (UPDATE - add notifications)
│   ├── auth/
│   │   └── device.routes.ts (NEW)
│   └── loans/
│       └── loan.controller.ts (UPDATE - add reminders)
├── workers/
│   ├── email.worker.ts (NEW)
│   └── push.worker.ts (NEW)
├── jobs/
│   └── loan-reminders.job.ts (NEW)
├── utils/
│   ├── encryption.ts (NEW)
│   └── circuitBreaker.ts (UPDATE)
├── sockets/
│   └── index.ts (UPDATE - add sync events)
└── app.ts (UPDATE - start workers)
```

### Frontend Files (to create)

```
frontend/src/
├── contexts/
│   └── NotificationContext.tsx (NEW)
├── hooks/
│   ├── useRealtimeSocket.ts (NEW)
│   ├── useSyncWorker.ts (NEW)
│   └── useDeviceRegistration.ts (NEW)
├── components/
│   ├── NotificationBadge.tsx (NEW)
│   ├── NotificationBadge.module.css (NEW)
│   ├── NotificationPanel.tsx (NEW)
│   └── NotificationPanel.module.css (NEW)
├── lib/
│   └── db.ts (UPDATE - add notifications schema)
├── services/
│   └── api.ts (UPDATE - add new endpoints)
└── App.tsx (UPDATE - add providers)
```

### Database Files

```
backend/
├── prisma/
│   └── schema.prisma (UPDATE - 3 models)
└── migrations/
    └── YYYYMMDDHHMMSS_add_sync_notifications/
        └── migration.sql (AUTO-GENERATED)
```

---

## 🧪 Testing Scenarios

### Scenario 1: Friend Request Notification
```
1. User A sends friend request to User B (via API)
2. Backend creates notification entry
3. Email queued (check queue UI)
4. Push notification queued
5. User B receives:
   - ✅ In-app notification (Socket.IO)
   - ✅ Email within 5 minutes
   - ✅ Push notification
6. User B marks as read
7. User A's other device syncs the read status
```

**Expected Result:** All 3 channels deliver within 5 minutes; cross-device sync works.

### Scenario 2: Group Expense with 4 Members
```
1. User A creates group expense with Users B, C, D
2. Check backend logs for 3 notifications queued
3. Each member receives notification with:
   - ✅ Correct share amount
   - ✅ Deep link to expense
   - ✅ Sender name (User A)
4. All members mark as read
5. Verify delivery status in Admin dashboard
```

**Expected Result:** All 3 members get notification; delivery < 10 seconds.

### Scenario 3: Offline Sync
```
1. Device A: Go offline
2. Device A: Create transaction (stored in Dexie)
3. Device A: Offline indicator shows
4. Device A: Go online
5. Check sync queue: shows pending items
6. Wait 30 seconds (sync interval)
7. Verify transaction synced to backend
8. Device B receives sync delta
9. Device B shows new transaction
```

**Expected Result:** Cross-device sync works after reconnection; no data loss.

### Scenario 4: Loan Due Date Reminder
```
1. Create loan with dueDate = tomorrow at 5 PM
2. Wait for cron job (daily 8 PM UTC)
3. Check notification table: reminder created
4. User receives email + push
5. Notification has type='loan_due'
6. Deep link navigates to loan detail
```

**Expected Result:** Reminder fires at scheduled time; correct link works.

### Scenario 5: Notification Rate Limiting
```
1. Rapidly send 100 notifications to 1 user
2. Observe queue behavior (should batch)
3. Monitor email service: no more than 10/second
4. Check rate limiter response: 429 after threshold
5. Verify backoff strategy activates
```

**Expected Result:** Rate limiting prevents email/push spam; graceful degradation.

---

## 📊 Success Metrics

| Metric | Target | Threshold |
|--------|--------|-----------|
| In-app notification latency | < 1 second | ✅ < 5s acceptable |
| Email delivery rate | > 98% | ⚠️ < 95% investigate |
| Push notification success | > 99% | ⚠️ < 95% investigate |
| Sync latency (cross-device) | < 5 seconds | ⚠️ < 30s acceptable |
| Uptime (notification system) | 99.9% | ⚠️ < 99% investigate |
| Failed job retry success | > 95% | ⚠️ < 80% investigate |
| Queue processing time | < 2 seconds | ⚠️ < 10s acceptable |

---

## 🚨 Common Issues & Fixes

### Issue: Email notifications not sending
```bash
# Check 1: Redis connection
redis-cli ping

# Check 2: Email queue status
npm run queue:inspect

# Check 3: SendGrid API key validity
echo $SENDGRID_API_KEY

# Check 4: Email job logs
tail -f backend/logs/email-worker.log

# Fix: Restart email worker
npm run worker:email:restart
```

### Issue: Push notifications not received
```bash
# Check 1: Firebase credentials
cat backend/src/config/firebase.ts

# Check 2: Device FCM tokens
SELECT * FROM public."Device" WHERE "fcmToken" IS NOT NULL;

# Check 3: FCM API quota
Check Firebase Console → Cloud Messaging → Quota tab

# Fix: Regenerate Firebase credentials
Download new JSON from Firebase Console
Update .env with new FIREBASE_PRIVATE_KEY
Restart push worker
```

### Issue: Socket.IO connection timeouts
```bash
# Check 1: WebSocket support
curl -i -N -H "Connection: Upgrade" http://localhost:3000

# Check 2: CORS configuration
Check backend/src/app.ts CORS settings

# Check 3: Network firewall
Verify port 3000 (or configured port) is open

# Fix: Enable polling fallback
In useRealtimeSocket.ts: transports: ['websocket', 'polling']
```

### Issue: Cross-device sync not working
```bash
# Check 1: SyncQueue table
SELECT COUNT(*) FROM public."SyncQueue" WHERE status='pending';

# Check 2: Socket.IO rooms
socket.rooms (in browser console)

# Check 3: Device registration
SELECT * FROM public."Device" WHERE "userId" = 'your-user-id';

# Fix: Re-register device
localStorage.clear()
Reload app
Wait for device registration to complete
```

---

## 📖 Documentation Reference

### For Architects
- [SYNC_NOTIFICATION_ARCHITECTURE.md](./SYNC_NOTIFICATION_ARCHITECTURE.md) - Full system design

### For Developers (Backend)
- [SYNC_NOTIFICATION_SETUP.md](./SYNC_NOTIFICATION_SETUP.md) - Step-by-step setup

### For Developers (Frontend)
- [SYNC_NOTIFICATION_FRONTEND.md](./SYNC_NOTIFICATION_FRONTEND.md) - React integration

### API Reference
```bash
# List notifications
GET /api/v1/notifications?limit=20&offset=0

# Mark as read
PATCH /api/v1/notifications/{id}/read

# Mark all read
PATCH /api/v1/notifications/read-all

# Register device
POST /api/v1/auth/devices/register

# Get devices
GET /api/v1/auth/devices

# Sync batch
POST /api/v1/sync/batch
```

---

## 📝 Sign-Off Checklist

**Before Staging Deployment:**
- [ ] All Phase 1-3 code reviewed by 2+ team members
- [ ] Unit test coverage > 80%
- [ ] Integration tests passing (100%)
- [ ] No console errors/warnings in production build
- [ ] Security audit completed (no HIGH/CRITICAL findings)
- [ ] Performance benchmarks meet targets
- [ ] Documentation updated
- [ ] Rollback plan documented

**Before Production Deployment:**
- [ ] 2-week staging soak test passed
- [ ] Monitoring & alerting configured
- [ ] On-call rotation established
- [ ] Incident response plan documented
- [ ] Team trained on troubleshooting
- [ ] Customer communication drafted
- [ ] Rollback tested in production-like environment
- [ ] Feature flag configured (for gradual rollout)

---

## 🎯 Success Criteria

**System is production-ready when:**

1. ✅ All 6 phases completed on schedule
2. ✅ 100% of integration tests passing
3. ✅ 99.5% notification delivery rate achieved
4. ✅ <5 second cross-device sync latency
5. ✅ Zero critical security findings
6. ✅ < 2 second p95 response time for all endpoints
7. ✅ All team members trained & comfortable with system
8. ✅ 24/7 on-call rotation established
9. ✅ Monitoring dashboards live & alerts functional
10. ✅ Disaster recovery plan tested & verified

---

## 🔗 Related Resources

- [Supabase Auth Docs](https://supabase.com/docs/guides/auth)
- [Firebase Cloud Messaging](https://firebase.google.com/docs/cloud-messaging)
- [SendGrid API Reference](https://docs.sendgrid.com/)
- [Socket.IO Documentation](https://socket.io/docs/)
- [Prisma Documentation](https://www.prisma.io/docs/)
- [Dexie.js Guide](https://dexie.org/docs)
- [Bull Job Queue](https://docs.bullmq.io/)
- [TweetNaCl Encryption](https://tweetnacl.js.org/)

---

**Last Updated:** May 2026  
**Maintained By:** [Your Team]  
**Status:** 🟢 Implementation Ready
