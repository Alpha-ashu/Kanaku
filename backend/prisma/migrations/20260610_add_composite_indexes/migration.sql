-- Performance: Add composite indexes for high-traffic query patterns

-- Transaction: dashboard monthly income/expense queries
CREATE INDEX IF NOT EXISTS "Transaction_userId_type_date_idx"
  ON "Transaction"("userId", "type", "date");

-- Transaction: category breakdown queries
CREATE INDEX IF NOT EXISTS "Transaction_userId_category_date_idx"
  ON "Transaction"("userId", "category", "date");

-- Transaction: account-level transaction queries
CREATE INDEX IF NOT EXISTS "Transaction_userId_accountId_date_idx"
  ON "Transaction"("userId", "accountId", "date");

-- Transaction: soft-delete filtered date queries
CREATE INDEX IF NOT EXISTS "Transaction_userId_deletedAt_date_idx"
  ON "Transaction"("userId", "deletedAt", "date");

-- Notification: unread feed queries
CREATE INDEX IF NOT EXISTS "Notification_userId_isRead_createdAt_idx"
  ON "Notification"("userId", "isRead", "createdAt");

-- Device: active device lookup for push notifications
CREATE INDEX IF NOT EXISTS "Device_userId_isActive_idx"
  ON "Device"("userId", "isActive");

-- User: advisor approval queue
CREATE INDEX IF NOT EXISTS "User_role_isApproved_idx"
  ON "User"("role", "isApproved");
