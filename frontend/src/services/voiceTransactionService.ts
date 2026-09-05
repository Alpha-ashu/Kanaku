import type { ParsedTransaction, ParsedGroupExpense } from '@/services/voiceCommandParser';
import { db } from '@/lib/database';
import { queueRecordUpsertSync } from '@/lib/auth-sync-integration';
import { applyTransactionAccountImpact } from '@/lib/transactionAggregation';
import { backendService } from '@/lib/backend-api';
import { TokenManager } from '@/lib/api';
import { getPinUnlockToken } from '@/lib/pinUnlockCoordinator';

export interface Friend {
  id: string;
  name: string;
}

export interface GroupExpense {
  id?: string | number;
  description: string;
  totalAmount: number;
  location?: string;
  splitType: 'equal' | 'itemized' | 'custom';
  friends: Friend[];
  createdAt?: string;
}

export class VoiceTransactionService {
  private async getTargetAccountId(preferredId?: number): Promise<number> {
    if (preferredId && preferredId > 0) {
      const exists = await db.accounts.get(preferredId);
      if (exists && exists.isActive !== false) return preferredId;
    }
    const defaultAccount = await db.accounts.filter(a => a.isActive !== false && !a.deletedAt).first();
    if (defaultAccount?.id) return defaultAccount.id;
    const anyAccount = await db.accounts.toCollection().first();
    return anyAccount?.id ?? 1;
  }

  /**
   * Create transactions from parsed voice commands with offline-first Dexie persistence,
   * account balance reconciliation, and background cloud sync.
   */
  async createTransactionsFromVoice(
    transactions: ParsedTransaction[],
    accountId?: number,
    userId?: string,
  ): Promise<any[]> {
    const results: any[] = [];
    const targetAccountId = await this.getTargetAccountId(accountId);

    for (const tx of transactions) {
      const now = new Date();
      const amount = Math.abs(Number(tx.amount) || 0);
      if (amount <= 0) continue;

      const txType = (tx.type === 'income' ? 'income' : 'expense') as 'income' | 'expense';
      const category = tx.category?.trim() || (txType === 'income' ? 'Salary' : 'General');
      const description = tx.description?.trim() || (txType === 'income' ? 'Voice logged income' : 'Voice logged expense');

      // 1. Save directly to local Dexie database
      const localRecord = {
        type: txType,
        amount,
        accountId: targetAccountId,
        category,
        description,
        date: now,
        userId: userId || undefined,
        createdAt: now,
        updatedAt: now,
        syncStatus: 'pending' as const,
      };

      const localId = await db.transactions.add(localRecord as any);

      // 2. Adjust local account balance & enqueue sync
      await applyTransactionAccountImpact({ ...localRecord, id: localId as number });
      queueRecordUpsertSync('transactions', localId as number);
      queueRecordUpsertSync('accounts', targetAccountId);

      // 3. Best-effort server-side sync when online
      try {
        const response = await backendService.api.post('/transactions', {
          description,
          amount,
          category,
          type: txType,
          date: now.toISOString(),
          accountId: targetAccountId,
          userId,
        });
        results.push(response.data?.data || response.data || { id: localId, ...localRecord });
      } catch (syncErr) {
        // Safe offline fallback: Dexie + queueRecordUpsertSync guarantees eventual delivery
        results.push({ id: localId, ...localRecord });
      }
    }

    return results;
  }

  /**
   * Create group expense and manage friend list with offline-first Dexie storage
   * and sync to backend /groups endpoint.
   */
  async createGroupExpenseFromVoice(
    expense: ParsedGroupExpense,
    userId?: string,
  ): Promise<GroupExpense> {
    const friends = await this.ensureFriendsExist(expense.friends);
    const targetAccountId = await this.getTargetAccountId();
    const now = new Date();
    const totalAmount = Math.abs(Number(expense.totalAmount) || 0);

    // Compute fair equal split shares
    const shareCount = Math.max(1, friends.length + 1);
    const share = Math.round((totalAmount / shareCount) * 100) / 100;

    const members = [
      { name: 'You', share, paid: true, isCurrentUser: true },
      ...friends.map(f => ({
        name: f.name,
        share,
        paid: false,
        friendId: Number(f.id) || undefined,
      })),
    ];

    // 1. Save group expense to local Dexie
    const groupExpenseRecord = {
      name: expense.description?.trim() || `Group Expense with ${friends.map(f => f.name).slice(0, 3).join(', ')}`,
      totalAmount,
      paidBy: targetAccountId,
      date: now,
      members,
      description: expense.description || 'Voice Group Expense',
      category: 'Group Expense',
      splitType: (expense.splitType === 'custom' ? 'custom' : 'equal') as 'equal' | 'custom',
      yourShare: share,
      status: 'pending' as const,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending' as const,
    };

    const groupExpenseId = await db.groupExpenses.add(groupExpenseRecord as any);
    queueRecordUpsertSync('group_expenses', groupExpenseId as number);

    // 2. Fronting the bill: record the expense transaction on payer's account
    const parentTx = {
      type: 'expense' as const,
      amount: totalAmount,
      accountId: targetAccountId,
      category: 'Group Expense',
      description: `${expense.description} (split with ${friends.map(f => f.name).join(', ')})`,
      date: now,
      groupExpenseId: groupExpenseId as number,
      tags: ['group-expense', 'voice-input'],
      userId: userId || undefined,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending' as const,
    };

    const parentTxId = await db.transactions.add(parentTx as any);
    await applyTransactionAccountImpact({ ...parentTx, id: parentTxId as number });
    queueRecordUpsertSync('transactions', parentTxId as number);
    queueRecordUpsertSync('accounts', targetAccountId);

    // 3. Best-effort sync to canonical backend endpoint: /groups (replacing broken /group-expenses)
    try {
      await backendService.api.post('/groups', {
        name: groupExpenseRecord.name,
        totalAmount,
        paidBy: targetAccountId,
        date: now.toISOString(),
        members,
        description: groupExpenseRecord.description,
        category: groupExpenseRecord.category,
        splitType: groupExpenseRecord.splitType,
        yourShare: share,
        status: 'pending',
      });
    } catch (syncErr) {
      // Eventual consistency via Dexie sync queue
    }

    return {
      id: groupExpenseId,
      description: expense.description,
      totalAmount,
      location: expense.location,
      splitType: expense.splitType,
      friends,
      createdAt: now.toISOString(),
    };
  }

  /**
   * Ensure friends exist in local Dexie and sync with backend
   */
  private async ensureFriendsExist(friendNames: string[]): Promise<Friend[]> {
    const friends: Friend[] = [];
    const now = new Date();

    for (const rawName of friendNames) {
      const cleanName = rawName.trim();
      if (!cleanName) continue;

      let friend = await db.friends
        .filter(f => !f.deletedAt && f.name.toLowerCase() === cleanName.toLowerCase())
        .first();

      if (!friend) {
        const newId = await db.friends.add({
          name: cleanName,
          createdAt: now,
          updatedAt: now,
          syncStatus: 'pending',
        } as any);
        queueRecordUpsertSync('friends', newId as number);
        friend = await db.friends.get(newId as number);

        // Best effort backend sync
        try {
          await backendService.api.post('/friends', { name: cleanName });
        } catch {
          // Handled by sync queue
        }
      }

      if (friend) {
        friends.push({ id: String(friend.id), name: friend.name });
      }
    }

    return friends;
  }

  /**
   * Get recent friends from local database for autocomplete/suggestions
   */
  async getRecentFriends(limit: number = 5): Promise<Friend[]> {
    try {
      const localFriends = await db.friends
        .filter(f => !f.deletedAt)
        .limit(limit)
        .toArray();
      return localFriends.map(f => ({ id: String(f.id), name: f.name }));
    } catch (err) {
      console.error('Error fetching recent friends from Dexie:', err);
      return [];
    }
  }
}

export const voiceTransactionService = new VoiceTransactionService();
