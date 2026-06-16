-- Friend Management overhaul: link GroupExpenseMember rows back to a Friend
-- record so the friend profile screen can aggregate expense history and
-- outstanding amounts, and so editing a friend can propagate across expenses.

ALTER TABLE "GroupExpenseMember" ADD COLUMN IF NOT EXISTS "friendId" TEXT;

ALTER TABLE "GroupExpenseMember"
  ADD CONSTRAINT "GroupExpenseMember_friendId_fkey"
  FOREIGN KEY ("friendId") REFERENCES "Friend"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "GroupExpenseMember_friendId_idx" ON "GroupExpenseMember"("friendId");
