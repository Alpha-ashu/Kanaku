import type { ParsedTransaction, ParsedGroupExpense } from '@/services/voiceCommandParser';

interface Friend {
  id: string;
  name: string;
}

interface GroupExpense {
  id?: string;
  description: string;
  totalAmount: number;
  location?: string;
  splitType: 'equal' | 'itemized' | 'custom';
  friends: Friend[];
  createdAt?: string;
}

interface Transaction {
  description: string;
  amount: number;
  category: string;
  date?: string;
  accountId?: number;
  userId?: string;
}

export class VoiceTransactionService {
  /**
   * Create transactions from parsed voice commands
   */
  async createTransactionsFromVoice(
    transactions: ParsedTransaction[],
    accountId?: number,
    userId?: string,
  ): Promise<any[]> {
    const results = [];

    for (const tx of transactions) {
      try {
        const response = await fetch('/api/v1/transactions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            description: tx.description,
            amount: tx.amount,
            category: tx.category,
            type: tx.type,
            date: new Date().toISOString(),
            accountId,
            userId,
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to create transaction: ${response.statusText}`);
        }

        const created = await response.json();
        results.push(created);
      } catch (err) {
        console.error('Error creating transaction from voice:', err);
        throw err;
      }
    }

    return results;
  }

  /**
   * Create group expense and manage friend list
   */
  async createGroupExpenseFromVoice(
    expense: ParsedGroupExpense,
    userId?: string,
  ): Promise<GroupExpense> {
    // First, ensure all friends exist in the system
    const friends = await this.ensureFriendsExist(expense.friends);

    // Create or get group expense record
    const groupExpense: GroupExpense = {
      description: expense.description,
      totalAmount: expense.totalAmount,
      location: expense.location,
      splitType: expense.splitType,
      friends,
    };

    try {
      // Create group expense
      const response = await fetch('/api/v1/group-expenses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...groupExpense,
          userId,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to create group expense: ${response.statusText}`);
      }

      const created = await response.json();

      // Create individual transactions for each participant (equal split)
      const amountPerPerson = expense.totalAmount / friends.length;
      for (const friend of friends) {
        try {
          await fetch('/api/v1/transactions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              description: `${expense.description} - Split with ${friend.name}`,
              amount: amountPerPerson,
              category: 'group-expense',
              type: 'shared-expense',
              date: new Date().toISOString(),
              groupExpenseId: created.id,
              participantId: friend.id,
              userId,
            }),
          });
        } catch (err) {
          console.error(`Error creating transaction for ${friend.name}:`, err);
        }
      }

      return created;
    } catch (err) {
      console.error('Error creating group expense from voice:', err);
      throw err;
    }
  }

  /**
   * Ensure friends exist in the system, creating them if necessary
   */
  private async ensureFriendsExist(friendNames: string[]): Promise<Friend[]> {
    const friends: Friend[] = [];

    for (const name of friendNames) {
      try {
        // Try to get existing friend
        const searchResponse = await fetch(`/api/v1/friends/search?name=${encodeURIComponent(name)}`);

        if (searchResponse.ok) {
          const searchResults = await searchResponse.json();
          if (searchResults && searchResults.length > 0) {
            friends.push(searchResults[0]);
            continue;
          }
        }

        // Create new friend if not found
        const createResponse = await fetch('/api/v1/friends', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: name.trim(),
            email: `${name.toLowerCase().replace(/\s+/g, '.')}@friend.local`,
          }),
        });

        if (createResponse.ok) {
          const friend = await createResponse.json();
          friends.push(friend);
        } else {
          console.warn(`Failed to create/find friend: ${name}`);
          // Add a temporary friend object
          friends.push({
            id: `temp-${Date.now()}`,
            name: name.trim(),
          });
        }
      } catch (err) {
        console.error(`Error processing friend ${name}:`, err);
        // Add as temporary friend
        friends.push({
          id: `temp-${Date.now()}-${Math.random()}`,
          name: name.trim(),
        });
      }
    }

    return friends;
  }

  /**
   * Get recent friends for autocomplete/suggestions
   */
  async getRecentFriends(limit: number = 5): Promise<Friend[]> {
    try {
      const response = await fetch(`/api/v1/friends/recent?limit=${limit}`);
      if (response.ok) {
        return await response.json();
      }
    } catch (err) {
      console.error('Error fetching recent friends:', err);
    }
    return [];
  }
}

export const voiceTransactionService = new VoiceTransactionService();
