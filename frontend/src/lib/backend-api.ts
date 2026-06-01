// Backend API Service - Replaces local-only storage with cloud-based persistence
import axios, { AxiosInstance } from 'axios';
import RealtimeDataManager from './realtimeData';
import { db } from './database';
import { createNotificationRecord } from './notifications';
import { categorizeText as localCategorizeText } from './smartCategorization';

const API_BASE_URL = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/+$/, '');
const SHOULD_SKIP_OPTIONAL_BACKEND_REQUESTS = import.meta.env.DEV && !import.meta.env.VITE_API_URL;

function shouldUseLocalFallback(error: unknown) {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = Number((error as { status?: number }).status);
    if (Number.isFinite(status)) {
      return status >= 500;
    }
  }

  if (error && typeof error === 'object' && 'original' in error) {
    const original = (error as { original?: unknown }).original;
    if (original) {
      return shouldUseLocalFallback(original);
    }
  }

  if (!axios.isAxiosError(error)) {
    return false;
  }

  const status = error.response?.status;
  // Only fall back to local data on network errors (no status) or genuine server errors (5xx).
  // A 404 means the resource does not exist - do NOT silently serve stale local data.
  return status == null || status >= 500;
}

function normalizeInvestmentDates<T extends Record<string, any>>(investment: T): T {
  const normalized: Record<string, any> = { ...investment };

  if (normalized.purchaseDate) {
    normalized.purchaseDate = normalized.purchaseDate instanceof Date
      ? normalized.purchaseDate
      : new Date(normalized.purchaseDate);
  }

  if (normalized.lastUpdated) {
    normalized.lastUpdated = normalized.lastUpdated instanceof Date
      ? normalized.lastUpdated
      : new Date(normalized.lastUpdated);
  }

  if (normalized.updatedAt) {
    normalized.updatedAt = normalized.updatedAt instanceof Date
      ? normalized.updatedAt
      : new Date(normalized.updatedAt);
  }

  if (normalized.deletedAt) {
    normalized.deletedAt = normalized.deletedAt instanceof Date
      ? normalized.deletedAt
      : new Date(normalized.deletedAt);
  }

  if (normalized.closedAt) {
    normalized.closedAt = normalized.closedAt instanceof Date
      ? normalized.closedAt
      : new Date(normalized.closedAt);
  }

  return normalized as T;
}

function assertCloudGoalId(id: string) {
  // Local Dexie IDs are numeric; backend goal routes require cloud string IDs.
  if (/^\d+$/.test(id)) {
    throw new Error(
      `Invalid cloud goal id: ${id}. This looks like a local Dexie id. Use local goal sync helpers instead of backend goal CRUD methods.`
    );
  }
}

function assertCloudEntityId(id: string, entityName: string) {
  if (/^\d+$/.test(id)) {
    throw new Error(
      `Invalid cloud ${entityName} id: ${id}. This looks like a local Dexie id. Use local sync helpers for ${entityName} operations.`
    );
  }
}

class BackendService {
  // ===== GOLD =====
  async createGold(gold: {
    type: string;
    quantity: number;
    unit: string;
    purchasePrice: number;
    currentPrice: number;
    purchaseDate: Date;
    purityPercentage: number;
    location: string;
    certificateNumber?: string;
    notes?: string;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const response = await this.api.post('/gold', {
      ...gold,
      purchaseDate: gold.purchaseDate.toISOString(),
      createdAt: gold.createdAt.toISOString(),
      updatedAt: gold.updatedAt.toISOString(),
    });
    return response.data;
  }

  // ===== GROUPS =====
  async createGroup(group: {
    id?: string;
    name: string;
    members: string[];
    createdAt: Date;
    description?: string;
    totalAmount?: number;
    amountPerPerson?: number;
    category?: string;
    date?: Date;
  }) {
    const localGroup = {
      name: group.name,
      totalAmount: group.totalAmount ?? 0,
      paidBy: 0,
      date: group.date ?? group.createdAt,
      members: group.members.map((member) => ({
        name: member,
        share: group.amountPerPerson ?? 0,
        paid: false,
        paymentStatus: 'pending' as const,
      })),
      description: group.description,
      category: group.category,
      splitType: 'equal' as const,
      yourShare: group.amountPerPerson ?? 0,
      status: (group.amountPerPerson ?? 0) > 0 ? 'pending' as const : 'settled' as const,
      createdAt: group.createdAt,
      updatedAt: group.createdAt,
    };

    const saveLocalGroup = async () => {
      const localId = group.id ? Number(group.id) : Number.NaN;
      if (Number.isFinite(localId)) {
        const existing = await db.groupExpenses.get(localId);
        if (existing) {
          return {
            id: localId,
            ...existing,
            storage: 'local' as const,
          };
        }
      }

      const id = await RealtimeDataManager.addGroupExpense(localGroup);
      console.info(' Groups API unavailable - saved group locally.');
      return {
        id,
        ...localGroup,
        storage: 'local' as const,
      };
    };

    if (SHOULD_SKIP_OPTIONAL_BACKEND_REQUESTS) {
      return saveLocalGroup();
    }

    try {
      const response = await this.api.post('/groups', {
        ...group,
        createdAt: group.createdAt.toISOString(),
        date: group.date ? group.date.toISOString() : undefined,
      });
      return response.data;
    } catch (error) {
      if (!shouldUseLocalFallback(error)) {
        throw error;
      }

      return saveLocalGroup();
    }
  }

  // ===== INVESTMENTS =====
  async createInvestment(investment: {
    assetType: string;
    assetName: string;
    quantity: number;
    buyPrice: number;
    currentPrice: number;
    totalInvested: number;
    currentValue: number;
    profitLoss: number;
    purchaseDate: Date;
    lastUpdated: Date;
    updatedAt: Date;
    deletedAt?: Date;
    broker?: string;
    description?: string;
    assetCurrency?: string;
    baseCurrency?: string;
    buyFxRate?: number;
    lastKnownFxRate?: number;
    totalInvestedNative?: number;
    currentValueNative?: number;
    valuationVersion?: number;
    positionStatus?: 'open' | 'closed';
    closedAt?: Date;
    closePrice?: number;
    closeFxRate?: number;
    grossSaleValue?: number;
    netSaleValue?: number;
    fundingAccountId?: number;
    purchaseFees?: number;
    purchaseTransactionId?: number;
    purchaseFeeTransactionId?: number;
    saleTransactionId?: number;
    saleFeeTransactionId?: number;
    closingFees?: number;
    realizedProfitLoss?: number;
    settlementAccountId?: number;
    closeNotes?: string;
    metadata?: Record<string, any>;
  }) {
    const localInvestment = normalizeInvestmentDates(investment);

    try {
      const response = await this.api.post('/investments', {
        ...investment,
        purchaseDate: investment.purchaseDate.toISOString(),
        lastUpdated: investment.lastUpdated.toISOString(),
        updatedAt: investment.updatedAt.toISOString(),
        deletedAt: investment.deletedAt ? investment.deletedAt.toISOString() : undefined,
        closedAt: investment.closedAt ? investment.closedAt.toISOString() : undefined,
      });

      const responsePayload = normalizeInvestmentDates(response.data?.data ?? response.data);
      const localId = await RealtimeDataManager.addInvestment({
        ...localInvestment,
        ...responsePayload,
        cloudId: responsePayload?.id,
        syncStatus: 'synced',
      });
      return {
        ...responsePayload,
        localId,
      };
    } catch (error) {
      if (!shouldUseLocalFallback(error)) {
        throw error;
      }

      const id = await RealtimeDataManager.addInvestment(localInvestment);

      console.info(' Investments API unavailable - saved investment locally.');
      return {
        id,
        ...localInvestment,
        storage: 'local' as const,
      };
    }
  }
   public api: AxiosInstance;
  private token: string | null = null;

  constructor() {
    this.api = axios.create({
      baseURL: API_BASE_URL,
    });

    // Add token to every request
    this.api.interceptors.request.use((config) => {
      let token = this.token;

      if (!token) {
        // Dynamic fallback: Try to resolve the token directly from the Supabase session stored in localStorage
        try {
          const sbKey = Object.keys(localStorage).find(
            (key) => key.startsWith('sb-') && key.endsWith('-auth-token')
          );
          if (sbKey) {
            const sessionData = localStorage.getItem(sbKey);
            if (sessionData) {
              const session = JSON.parse(sessionData);
              token = session?.access_token || null;
            }
          }
        } catch (e) {
          // Ignore localStorage parsing issues
        }
      }

      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // Normalize error responses so callers always receive a clean Error message
    this.api.interceptors.response.use(
      (response) => response,
      (error) => {
        if (!axios.isAxiosError(error)) return Promise.reject(error);

        const status = error.response?.status;
        const serverMessage = error.response?.data?.error;

        if (!error.response) {
          const wrappedError = new Error('No internet connection. Please check your network.') as Error & {
            status?: number;
            original?: unknown;
          };
          wrappedError.original = error;
          return Promise.reject(wrappedError);
        }

        const wrapWithStatus = (message: string) => {
          const wrappedError = new Error(message) as Error & {
            status?: number;
            original?: unknown;
          };
          wrappedError.status = status;
          wrappedError.original = error;
          return wrappedError;
        };

        if (status === 401) {
          return Promise.reject(wrapWithStatus('Your session has expired. Please sign in again.'));
        }

        if (status === 403) {
          return Promise.reject(wrapWithStatus('You do not have access to this feature.'));
        }

        if (status === 429) {
          return Promise.reject(wrapWithStatus('Too many requests. Please wait a moment and try again.'));
        }

        if (status != null && status >= 500) {
          return Promise.reject(wrapWithStatus('Something went wrong. Please try again later.'));
        }

        // 4xx with a server-supplied message - safe to show
        if (serverMessage) {
          return Promise.reject(wrapWithStatus(serverMessage));
        }

        return Promise.reject(wrapWithStatus('An unexpected error occurred.'));
      }
    );
  }
  
  // Generic HTTP Methods
  async get<T = any>(url: string, config?: any): Promise<T> {
    const response = await this.api.get<T>(url, config);
    return response.data;
  }

  async post<T = any>(url: string, data?: any, config?: any): Promise<T> {
    const response = await this.api.post<T>(url, data, config);
    return response.data;
  }

  async put<T = any>(url: string, data?: any, config?: any): Promise<T> {
    const response = await this.api.put<T>(url, data, config);
    return response.data;
  }

  async delete<T = any>(url: string, config?: any): Promise<T> {
    const response = await this.api.delete<T>(url, config);
    return response.data;
  }

  // Auth Methods
  setToken(token: string) {
    this.token = token;
  }

  clearToken() {
    this.token = null;
  }

  // ===== TRANSACTIONS =====
  async getTransactions(filters?: {
    accountId?: string;
    startDate?: Date;
    endDate?: Date;
    category?: string;
  }) {
    const params = new URLSearchParams();
    if (filters?.accountId) params.append('accountId', filters.accountId);
    if (filters?.startDate) params.append('startDate', filters.startDate.toISOString());
    if (filters?.endDate) params.append('endDate', filters.endDate.toISOString());
    if (filters?.category) params.append('category', filters.category);

    const response = await this.api.get('/transactions', { params });
    return response.data;
  }

  async createTransaction(transaction: {
    accountId: string;
    type: 'expense' | 'income' | 'transfer';
    amount: number;
    category: string;
    subcategory?: string;
    description?: string;
    merchant?: string;
    date: Date;
    tags?: string[];
    transferToAccountId?: string;
    transferType?: string;
  }) {
    const response = await this.api.post('/transactions', {
      ...transaction,
      date: transaction.date.toISOString(),
    });
    return response.data;
  }

  async categorizeText(text: string): Promise<{
    category: string;
    subcategory: string;
    confidence: number;
    matchedBy?: string;
  }> {
    try {
      const response = await this.api.post('/categorize', { text });
      return response.data?.data ?? response.data;
    } catch (error) {
      console.warn('Backend categorization failed, falling back to local categorization engine.');
      return localCategorizeText(text);
    }
  }

  async learnCategorization(payload: {
    text: string;
    category: string;
    subcategory?: string;
  }) {
    const response = await this.api.post('/learn', payload);
    return response.data;
  }

  async updateTransaction(id: string, updates: any) {
    const response = await this.api.put(`/transactions/${id}`, updates);
    return response.data;
  }

  async deleteTransaction(id: string) {
    await this.api.delete(`/transactions/${id}`);
  }

  async getAccountTransactions(accountId: string) {
    const response = await this.api.get(`/transactions/account/${accountId}`);
    return response.data;
  }

  // ===== ACCOUNTS =====
  async getAccounts() {
    const response = await this.api.get('/accounts');
    return response.data;
  }

  async createAccount(account: {
    name: string;
    type: string;
    balance?: number;
    currency?: string;
  }) {
    const response = await this.api.post('/accounts', account);
    return response.data;
  }

  async getAccount(id: string) {
    assertCloudEntityId(id, 'account');
    const response = await this.api.get(`/accounts/${id}`);
    return response.data;
  }

  async updateAccount(id: string, updates: any) {
    assertCloudEntityId(id, 'account');
    const response = await this.api.put(`/accounts/${id}`, updates);
    return response.data;
  }

  async deleteAccount(id: string) {
    assertCloudEntityId(id, 'account');
    await this.api.delete(`/accounts/${id}`);
  }

  // ===== GOALS =====
  async getGoals() {
    const response = await this.api.get('/goals');
    return response.data;
  }

  async createGoal(goal: {
    name: string;
    targetAmount: number;
    currentAmount?: number;
    targetDate: Date;
    category?: string;
    isGroupGoal?: boolean;
  }) {
    const response = await this.api.post('/goals', {
      ...goal,
      targetDate: goal.targetDate.toISOString(),
    });
    return response.data;
  }

  async getGoal(id: string) {
    assertCloudGoalId(id);
    const response = await this.api.get(`/goals/${id}`);
    return response.data;
  }

  async updateGoal(id: string, updates: any) {
    assertCloudGoalId(id);
    const response = await this.api.put(`/goals/${id}`, updates);
    return response.data;
  }

  async deleteGoal(id: string) {
    assertCloudGoalId(id);
    await this.api.delete(`/goals/${id}`);
  }

  // ===== LOANS =====
  async getLoans() {
    const response = await this.api.get('/loans');
    return response.data;
  }

  async createLoan(loan: {
    type: string;
    name: string;
    principalAmount: number;
    outstandingBalance?: number;
    interestRate?: number;
    emiAmount?: number;
    dueDate?: Date;
    frequency?: string;
    contactPerson?: string;
    friendId?: string;
    status?: string;
    createdAt?: Date;
    updatedAt?: Date;
    deletedAt?: Date;
  }) {
    const response = await this.api.post('/loans', {
      ...loan,
      dueDate: loan.dueDate?.toISOString(),
    });
    return response.data;
  }

  async getLoan(id: string) {
    assertCloudEntityId(id, 'loan');
    const response = await this.api.get(`/loans/${id}`);
    return response.data;
  }

  async updateLoan(id: string, updates: any) {
    assertCloudEntityId(id, 'loan');
    const response = await this.api.put(`/loans/${id}`, updates);
    return response.data;
  }

  async deleteLoan(id: string) {
    assertCloudEntityId(id, 'loan');
    await this.api.delete(`/loans/${id}`);
  }

  async addLoanPayment(loanId: string, payment: {
    amount: number;
    accountId?: string;
    notes?: string;
  }) {
    const response = await this.api.post(`/loans/${loanId}/payment`, payment);
    return response.data;
  }

  // ===== SETTINGS =====
  async getSettings() {
    const response = await this.api.get('/settings');
    return response.data;
  }

  async updateSettings(settings: {
    theme?: string;
    language?: string;
    currency?: string;
    timezone?: string;
    settings?: Record<string, any>;
  }) {
    const response = await this.api.put('/settings', settings);
    return response.data;
  }

  // ===== GLOBAL FEATURE FLAGS =====
  async getGlobalFeatureFlags() {
    try {
      const response = await this.api.get('/admin/features');
      return response.data;
    } catch (error) {
      console.warn('Failed to fetch global feature flags from backend:', error);
      return null;
    }
  }

  async saveGlobalFeatureFlags(features: any) {
    const response = await this.api.post('/admin/features/toggle', { features });
    return response.data;
  }

  // ===== AI FEATURE FLAGS =====
  async getAIFeatureFlags() {
    try {
      const response = await this.api.get('/admin/ai-features');
      return response.data;
    } catch (error) {
      console.warn('Failed to fetch AI feature flags from backend:', error);
      return null;
    }
  }

  async saveAIFeatureFlags(features: any) {
    const response = await this.api.post('/admin/ai-features/toggle', { features });
    return response.data;
  }

  // ===== FRIENDS =====
  async createFriend(friend: {
    name: string;
    email?: string;
    phone?: string;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const localFriend = {
      name: friend.name,
      email: friend.email?.trim() || undefined,
      phone: friend.phone?.trim() || undefined,
      createdAt: friend.createdAt,
      updatedAt: friend.updatedAt,
    };

    const saveLocalFriend = async () => {
      const id = await RealtimeDataManager.addFriend(localFriend);
      console.info(' Friends API unavailable - saved friend locally.');

      return {
        id,
        ...localFriend,
        storage: 'local' as const,
      };
    };

    if (SHOULD_SKIP_OPTIONAL_BACKEND_REQUESTS) {
      return saveLocalFriend();
    }

    try {
      const response = await this.api.post('/friends', {
        ...localFriend,
        createdAt: friend.createdAt.toISOString(),
        updatedAt: friend.updatedAt.toISOString(),
      });

      const localId = await RealtimeDataManager.addFriend(localFriend);

      const responsePayload = response.data?.data ?? response.data;
      return {
        ...responsePayload,
        localId,
      };
    } catch (error) {
      if (!shouldUseLocalFallback(error)) {
        throw error;
      }

      return saveLocalFriend();
    }
  }

  // ===== INVESTMENTS =====
  async updateInvestment(id: string, updates: any) {
    const localId = Number(updates?.localId ?? id);
    const localUpdates = normalizeInvestmentDates(updates);

    try {
      const response = await this.api.put(`/investments/${id}`, updates);
      const responsePayload = normalizeInvestmentDates(response.data?.data ?? response.data);

      if (Number.isFinite(localId)) {
        await RealtimeDataManager.updateInvestment(localId, {
          ...localUpdates,
          ...responsePayload,
          cloudId: responsePayload?.id ?? updates?.cloudId,
          syncStatus: 'synced',
        });
      }

      return responsePayload;
    } catch (error) {
      if (!shouldUseLocalFallback(error) || !Number.isFinite(localId)) {
        throw error;
      }

      await RealtimeDataManager.updateInvestment(localId, localUpdates);
      console.info(' Investments API unavailable - updated investment locally.');

      return {
        id: localId,
        ...localUpdates,
        storage: 'local' as const,
      };
    }
  }

  async deleteInvestment(id: string) {
    try {
      await this.api.delete(`/investments/${id}`);
    } catch (error) {
      if (!shouldUseLocalFallback(error)) {
        throw error;
      }

      console.info(' Investments API unavailable - removed investment locally only.');
    }
  }

  // ===== BILLS =====
  async getExpenseBills(transactionId?: string) {
    const url = transactionId ? `/bills?transactionId=${transactionId}` : '/bills';
    try {
      const response = await this.api.get(url);
      return response.data;
    } catch (error) {
      console.warn('Failed to fetch bills:', error);
      return [];
    }
  }

  async uploadExpenseBill(payload: { transactionId?: string | number; file: File }) {
    const formData = new FormData();
    if (payload.transactionId !== undefined) {
      formData.append('transactionId', String(payload.transactionId));
    }
    formData.append('file', payload.file);

    const response = await this.api.post('/bills', formData);
    return response.data;
  }

  async deleteExpenseBill(id: string) {
    await this.api.delete(`/bills/${id}`);
  }

  // ===== ADVISOR =====
  async getAdvisorProfile(advisorId?: string) {
    const url = advisorId ? `/advisors/${advisorId}` : '/advisors';
    const response = await this.api.get(url);
    return response.data;
  }

  async getAdvisorAssignments(advisorId?: string) {
    const url = '/advisors/me/sessions';
    const response = await this.api.get(url);
    const sessions = Array.isArray(response.data) ? response.data : [];
    return sessions.map((session: any) => ({
      id: session.id,
      sessionId: session.id,
      userId: session.client?.id,
      userName: session.client?.name,
      userEmail: session.client?.email,
      status: session.status,
      notes: session.notes,
      sessionType: session.sessionType,
      startTime: session.startTime,
    }));
  }

  async getAdvisorBookingRequests(advisorId?: string) {
    const url = '/bookings?role=advisor';
    const response = await this.api.get(url);
    const bookings = Array.isArray(response.data) ? response.data : [];
    return bookings.map((booking: any) => ({
      id: booking.id,
      userId: booking.client?.id,
      userName: booking.client?.name,
      userEmail: booking.client?.email,
      topic: booking.description || '',
      message: booking.description || '',
      sessionType: booking.sessionType,
      preferredDate: booking.proposedDate,
      preferredTime: `${new Date(booking.proposedDate).toLocaleDateString()} ${booking.proposedTime}`,
      status: booking.status,
      responseMessage: booking.rejectionReason || '',
      amount: booking.amount,
      duration: booking.duration,
    }));
  }

  async getBookingRequest(id: string) {
    const response = await this.api.get(`/bookings/${id}`);
    return response.data;
  }

  async updateBookingRequest(id: string, updates: any) {
    if (updates?.status === 'accepted') {
      const response = await this.api.put(`/bookings/${id}/accept`, {});
      return response.data;
    }

    if (updates?.status === 'rejected') {
      const response = await this.api.put(`/bookings/${id}/reject`, {
        reason: updates?.responseMessage || updates?.reason || '',
      });
      return response.data;
    }

    if (updates?.status === 'cancelled') {
      const response = await this.api.put(`/bookings/${id}/cancel`, {});
      return response.data;
    }

    if (updates?.status === 'reschedule') {
      const response = await this.api.put(`/bookings/${id}/reschedule`, {
        proposedDate: updates?.proposedDate,
        proposedTime: updates?.proposedTime,
        reason: updates?.responseMessage || updates?.reason || '',
      });
      return response.data;
    }

    throw new Error(`Unsupported booking update status: ${String(updates?.status || 'unknown')}`);
  }

  async createBookingRequest(booking: any) {
    const descriptionParts = [booking?.topic, booking?.message].filter(Boolean);
    const response = await this.api.post('/bookings', {
      advisorId: booking.advisorId,
      sessionType: booking.sessionType,
      description: descriptionParts.join('\n\n').trim(),
      proposedDate: booking.proposedDate,
      proposedTime: booking.proposedTime,
      duration: Number(booking.duration || 60),
      amount: Number(booking.amount || 0),
    });
    return response.data?.id || response.data;
  }

  async getChatMessages(conversationId: string, advisorId?: string) {
    const url = `/sessions/${conversationId}/messages`;
    const response = await this.api.get(url);
    return response.data;
  }

  async sendChatMessage(conversationId: string, message: any, advisorId?: string) {
    const response = await this.api.post(`/sessions/${conversationId}/messages`, {
      message: typeof message === 'string' ? message : message?.message,
    });
    return response.data;
  }

  async createOrUpdateChatConversation(conversation: any, advisorId?: string) {
    return conversation;
  }

  async updateAdvisorAvailability(availability: any, advisorId?: string) {
    const response = await this.api.put('/advisors/availability/status', availability);
    return response.data;
  }

  async createNotification(notification: any, advisorId?: string) {
    const url = advisorId ? `/notifications/${advisorId}` : '/notifications';

    const saveLocalNotification = async () => {
      const canStoreInApp = !notification?.email && !notification?.phone
        && notification?.type
        && notification?.title
        && notification?.message;

      if (canStoreInApp) {
        const localNotification = {
          type: notification.type,
          title: notification.title,
          message: notification.message,
          dueDate: notification.dueDate ? new Date(notification.dueDate) : undefined,
          isRead: Boolean(notification.isRead),
          relatedId: notification.relatedId,
          createdAt: notification.createdAt ? new Date(notification.createdAt) : new Date(),
          userId: notification.userId,
          deepLink: notification.deepLink,
        };

        const id = await createNotificationRecord(localNotification);
        console.info(' Notifications API unavailable - saved notification locally.');

        return {
          id,
          ...localNotification,
          storage: 'local' as const,
          delivery: 'local' as const,
        };
      }

      console.info(' Notifications API unavailable - skipped external notification delivery.');
      return {
        storage: 'local' as const,
        delivery: 'skipped' as const,
      };
    };

    if (SHOULD_SKIP_OPTIONAL_BACKEND_REQUESTS) {
      return saveLocalNotification();
    }

    try {
      const response = await this.api.post(url, notification);
      return response.data;
    } catch (error) {
      if (!shouldUseLocalFallback(error)) {
        throw error;
      }

      return saveLocalNotification();
    }
  }
}

export const backendService = new BackendService();
