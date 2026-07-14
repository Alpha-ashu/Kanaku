import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Database Mocking (Simulating Dexie In-Memory using Hoisted Mocks) ──────────
const { mockAccounts, mockTransactions, mockGoals } = vi.hoisted(() => {
  const createMockTable = () => {
    let store: any[] = [];
    return {
      clear: vi.fn(async () => { store = []; }),
      add: vi.fn(async (item: any) => {
        const id = item.id || Math.floor(Math.random() * 1000000);
        const record = { ...item, id };
        store.push(record);
        return id;
      }),
      get: vi.fn(async (id: any) => {
        return store.find(x => x.id === Number(id) || x.cloudId === id) || null;
      }),
      update: vi.fn(async (id: any, updates: any) => {
        const record = store.find(x => x.id === Number(id));
        if (record) {
          Object.assign(record, updates);
        }
      }),
      toArray: vi.fn(async () => [...store]),
      where: vi.fn((field: string) => ({
        equals: vi.fn((val: any) => ({
          first: vi.fn(async () => store.find(x => x[field] === val) || null),
          toArray: vi.fn(async () => store.filter(x => x[field] === val)),
        })),
      })),
      hook: vi.fn(),
    };
  };

  return {
    mockAccounts: createMockTable(),
    mockTransactions: createMockTable(),
    mockGoals: createMockTable(),
  };
});

vi.mock('@/lib/database', () => {
  const createFallbackMockTable = () => ({
    clear: vi.fn(async () => {}),
    add: vi.fn(async (item: any) => item.id || 1),
    get: vi.fn(async () => null),
    update: vi.fn(async () => {}),
    toArray: vi.fn(async () => []),
    where: vi.fn(() => ({
      equals: vi.fn(() => ({
        first: vi.fn(async () => null),
        toArray: vi.fn(async () => []),
      })),
    })),
    hook: vi.fn(),
  });

  return {
    db: {
      accounts: mockAccounts,
      transactions: mockTransactions,
      goals: mockGoals,
      friends: createFallbackMockTable(),
      loans: createFallbackMockTable(),
      groupExpenses: createFallbackMockTable(),
      investments: createFallbackMockTable(),
      toDoLists: createFallbackMockTable(),
      toDoItems: createFallbackMockTable(),
      toDoListShares: createFallbackMockTable(),
      transaction: vi.fn(async (mode: string, tables: any[], cb: () => Promise<any>) => {
        return await cb();
      }),
    },
  };
});

// Mock Sonner toast
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

// Import subject under test
import { db } from '@/lib/database';
import { apiClient, TokenManager } from '@/lib/api';
import {
  saveTransactionAndUpdateAccountWithBackendSync,
  processPendingSyncQueue,
} from '@/lib/auth-sync-integration';

describe('Frontend Synchronization & Queue Processing', () => {
  beforeEach(async () => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    
    // Clear localStorage
    const store = new Map<string, string>();
    const mockLocalStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, String(value)); },
      removeItem: (key: string) => { store.delete(key); },
      clear: () => { store.clear(); },
    };
    vi.stubGlobal('localStorage', mockLocalStorage);
    localStorage.clear();

    // Reset TokenManager & set up a valid mock JWT token (3 parts with base64 encoded payload)
    // Payload contains {"userId": "user-b"}
    TokenManager.clearTokens();
    const mockJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c2VyLWIifQ.signature';
    TokenManager.setAccessToken(mockJwt);

    // Reset mock tables
    await db.accounts.clear();
    await db.transactions.clear();
    await db.goals.clear();

    // Seed dummy account in the mock database
    await db.accounts.add({
      id: 1,
      name: 'Cash Account',
      type: 'bank',
      balance: 1000,
      openingBalance: 1000,
      currency: 'USD',
      isActive: true,
      syncStatus: 'synced',
      cloudId: 'cloud-account-uuid',
    });
  });

  describe('saveTransactionAndUpdateAccountWithBackendSync (API-First Fix)', () => {
    it('calls the backend POST /transactions endpoint and updates Dexie locally', async () => {
      // Mock apiClient.post for transaction creation
      const mockPost = vi.spyOn(apiClient, 'post').mockResolvedValue({
        data: {
          id: 'cloud-transaction-uuid',
          accountId: 'cloud-account-uuid',
          type: 'expense',
          amount: 50,
          category: 'food',
          date: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: 1,
        },
      });

      const txPayload = {
        accountId: 1,
        type: 'expense',
        amount: 50,
        category: 'food',
        date: new Date(),
        description: 'Dinner',
      };

      const result = await saveTransactionAndUpdateAccountWithBackendSync(txPayload, 1, 950);

      // Verify API was called
      expect(mockPost).toHaveBeenCalledWith('/transactions', expect.objectContaining({
        accountId: 'cloud-account-uuid',
        amount: 50,
        type: 'expense',
        category: 'food',
      }), expect.any(Object));

      // Verify Dexie state got updated with cloud ID and synced status
      const transactions = await db.transactions.toArray();
      expect(transactions).toHaveLength(1);
      expect(transactions[0].cloudId).toBe('cloud-transaction-uuid');
      expect(transactions[0].syncStatus).toBe('synced');

      // Verify returned result matches the saved record
      expect(result.cloudId).toBe('cloud-transaction-uuid');
    });
  });

  describe('processPendingSyncQueue (Backend-First Queue Processor)', () => {
    it('correctly processes enqueued offline creations via REST API', async () => {
      // Mock navigator to simulate online state
      vi.stubGlobal('navigator', { onLine: true });

      // Mock apiClient POST for creating a goal enqueued while offline
      const mockPost = vi.spyOn(apiClient, 'post').mockResolvedValue({
        data: {
          id: 'cloud-goal-uuid',
          name: 'Buy Laptop',
          targetAmount: 1500,
          currentAmount: 0,
          category: 'tech',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });

      // Clear goals table and add a pending goal
      await db.goals.clear();
      const localGoalId = await db.goals.add({
        name: 'Buy Laptop',
        targetAmount: 1500,
        currentAmount: 0,
        category: 'tech',
        syncStatus: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Add to localStorage sync queue manually to simulate offline queue addition
      const syncItem = {
        key: `goals-${localGoalId}-upsert`,
        table: 'goals' as const,
        operation: 'upsert' as const,
        localId: localGoalId,
        queuedAt: new Date().toISOString(),
      };
      localStorage.setItem('KANAKU_sync_queue_v3', JSON.stringify([syncItem]));

      // Trigger sync queue drain
      await processPendingSyncQueue();

      // Verify API POST request was fired
      expect(mockPost).toHaveBeenCalledWith('/goals', expect.objectContaining({
        name: 'Buy Laptop',
        targetAmount: 1500,
      }), expect.any(Object));

      // Verify Local goal state got updated to synced with cloudId
      const goals = await db.goals.toArray();
      expect(goals).toHaveLength(1);
      expect(goals[0].cloudId).toBe('cloud-goal-uuid');
      expect(goals[0].syncStatus).toBe('synced');

      // Verify the queue is now empty
      const updatedQueue = JSON.parse(localStorage.getItem('KANAKU_sync_queue_v3') || '[]');
      expect(updatedQueue).toHaveLength(0);
    });
  });
});
