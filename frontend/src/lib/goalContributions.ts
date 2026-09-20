import { db, type Account, type Goal } from '@/lib/database';
import { backendService } from '@/lib/backend-api';
import { applyAccountBalanceDeltas } from '@/lib/transactionAggregation';
import { processPendingSyncQueue, queueRecordUpsertSync } from '@/lib/auth-sync-integration';

export interface GoalContributionInput {
  goal: Goal;
  account: Account;
  amount: number;
  notes?: string;
  /** Group goals only: who paid this share. */
  memberName?: string;
  status?: 'paid';
}

/**
 * Moves money from an account into a savings goal — the one path shared by the
 * Goals list, the goal detail screen and KAI chat. Throws a user-readable error
 * when the input can't be saved.
 */
export async function addGoalContribution({ goal, account, amount, notes, memberName, status }: GoalContributionInput): Promise<void> {
  if (!goal.id) throw new Error('Goal not found');
  if (!account.id) throw new Error('Select an account for this contribution');
  if (!(amount > 0)) throw new Error('Enter a valid contribution amount');
  if (Number(account.balance) < amount) throw new Error('Selected account does not have enough balance');

  const trimmedNotes = notes?.trim() || undefined;

  if (goal.cloudId && account.cloudId && navigator.onLine) {
    // Minted once, before the request, so every replay of THIS request carries
    // the same key — notably the 401-refresh interceptor, which re-sends the
    // original request after rotating the token. The server matches it against
    // GoalContribution.clientRequestId and returns the first result instead of
    // debiting the account and advancing the goal a second time.
    //
    // Deliberately not minted inside the API client: a key generated per
    // attempt is a new key on every retry, which collapses nothing.
    const clientRequestId = crypto.randomUUID();
    try {
      await backendService.api.post(`/goals/${goal.cloudId}/contribute`, {
        amount,
        accountId: account.cloudId,
        memberName,
        notes: trimmedNotes,
        clientRequestId,
      });
    } catch (backendError) {
      console.warn('[goalContributions] Direct contribution sync failed; relying on sync queue', backendError);
    }
  }

  await db.goalContributions.add({
    goalId: goal.id,
    amount,
    accountId: account.id,
    date: new Date(),
    memberName,
    status,
    notes: trimmedNotes,
  });

  // Re-read so a stale in-memory goal can't overwrite a newer total.
  const latest = await db.goals.get(goal.id);
  await db.goals.update(goal.id, {
    currentAmount: Number(latest?.currentAmount ?? goal.currentAmount) + amount,
    updatedAt: new Date(),
  });

  await applyAccountBalanceDeltas(new Map([[account.id, -amount]]));

  queueRecordUpsertSync('goals', goal.id);
  queueRecordUpsertSync('accounts', account.id);
  void processPendingSyncQueue();
}
