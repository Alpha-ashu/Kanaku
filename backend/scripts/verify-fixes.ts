import { transactionRepository } from '../src/features/transactions/transaction.repository';
import { getBudgetPeriodBounds } from '../src/features/budgets/budget.listener';
import { calculateNextDueDate } from '../src/workers/recurring.worker';
import assert from 'assert';

async function runVerification() {
  console.log('=== RUNNING VERIFICATION TEST SUITE ===\n');

  // Test 1: Deduplication Hash Logic
  console.log('Test 1: Transaction dedupHash generation & namespaces...');
  const userId = 'user-test-123';
  const amount = 500;
  const date = new Date('2026-08-30T12:00:00Z');
  const description = 'Lunch at Cafe';

  const hash1 = transactionRepository.generateDedupHash(userId, amount, date, description);
  const hash2 = transactionRepository.generateDedupHash(userId, amount, date, description);
  assert.strictEqual(hash1, hash2, 'Identical transaction inputs must produce identical dedupHash');

  // Recurring rule hash namespace
  const recurringRuleId = 'rule-abc-789';
  const recurringHash = transactionRepository.generateDedupHash(userId, amount, date, description, recurringRuleId);
  assert.notStrictEqual(hash1, recurringHash, 'Recurring transaction hash must be namespaced and not collide with manual transaction');

  const differentRuleHash = transactionRepository.generateDedupHash(userId, amount, date, description, 'rule-xyz-999');
  assert.notStrictEqual(recurringHash, differentRuleHash, 'Two different recurring rules must produce distinct hashes');
  console.log('  ✔ dedupHash tests passed (idempotent, namespaced, collision-free)\n');

  // Test 2: Budget Period Bounds & Keys
  console.log('Test 2: Budget period bounds calculation...');
  const testDate = new Date('2026-08-15T15:30:00Z');

  const monthlyBounds = getBudgetPeriodBounds(testDate, 'monthly');
  assert.strictEqual(monthlyBounds.startDate.getDate(), 1, 'Monthly start must be day 1');
  assert.strictEqual(monthlyBounds.startDate.getMonth(), 7, 'Month must be August (index 7)');
  assert.strictEqual(monthlyBounds.endDate.getDate(), 31, 'August has 31 days');

  const weeklyBounds = getBudgetPeriodBounds(testDate, 'weekly');
  assert(weeklyBounds.startDate.getTime() <= testDate.getTime(), 'Weekly start <= testDate');
  assert(weeklyBounds.endDate.getTime() >= testDate.getTime(), 'Weekly end >= testDate');

  const yearlyBounds = getBudgetPeriodBounds(testDate, 'yearly');
  assert.strictEqual(yearlyBounds.startDate.getMonth(), 0, 'Yearly start must be Jan 1');
  assert.strictEqual(yearlyBounds.endDate.getMonth(), 11, 'Yearly end must be Dec 31');
  console.log('  ✔ Budget period bounds tests passed\n');

  // Test 3: Recurring Interval Next Due Date
  console.log('Test 3: Recurring nextDueDate calculation...');
  const baseDate = new Date('2026-08-01T00:00:00Z');

  const nextMonthly = calculateNextDueDate(baseDate, 'monthly');
  assert.strictEqual(nextMonthly.getMonth(), 8, 'Next monthly must be September (index 8)');

  const nextWeekly = calculateNextDueDate(baseDate, 'weekly');
  assert.strictEqual(nextWeekly.getDate(), 8, 'Next weekly must be +7 days (Aug 8)');

  const nextDaily = calculateNextDueDate(baseDate, 'daily');
  assert.strictEqual(nextDaily.getDate(), 2, 'Next daily must be +1 day (Aug 2)');

  const nextYearly = calculateNextDueDate(baseDate, 'yearly');
  assert.strictEqual(nextYearly.getFullYear(), 2027, 'Next yearly must be 2027');
  console.log('  ✔ Recurring nextDueDate calculations passed\n');

  console.log('========================================');
  console.log('ALL VERIFICATION UNIT TESTS PASSED (3/3)!');
  console.log('========================================\n');
}

runVerification().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
