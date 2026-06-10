import { db } from './database';
import { encryptData, decryptData } from './encryption';

// Backend API interface for cloud sync functionality
export interface BackendAPI {
  // Authentication
  login(credentials: { email: string; password: string }): Promise<AuthResponse>;
  register(userData: RegisterData): Promise<AuthResponse>;
  refreshToken(): Promise<string>;
  
  // Data synchronization
  syncData(localData: SyncData): Promise<SyncResponse>;
  getLatestData(): Promise<SyncData>;
  
  // User management
  updateProfile(profile: UserProfile): Promise<UserProfile>;
  changePassword(oldPassword: string, newPassword: string): Promise<void>;
  
  // Data operations
  backupData(): Promise<BackupResponse>;
  restoreData(backupId: string): Promise<void>;
}

// Data transfer objects
export interface AuthResponse {
  token: string;
  refreshToken: string;
  user: UserProfile;
  expiresAt: Date;
}

export interface RegisterData {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  preferences: UserPreferences;
  createdAt: Date;
  lastLogin: Date;
}

export interface UserPreferences {
  currency: string;
  language: string;
  theme: 'light' | 'dark' | 'system';
  notifications: boolean;
  biometricAuth: boolean;
  backupFrequency: 'daily' | 'weekly' | 'monthly';
}

export interface SyncData {
  accounts: AccountSync[];
  transactions: TransactionSync[];
  loans: LoanSync[];
  goals: GoalSync[];
  investments: InvestmentSync[];
  categories: CategorySync[];
  budgets: BudgetSync[];
  groups: GroupSync[];
  settings: SettingSync[];
  timestamp: Date;
  version: string;
}

export interface AccountSync {
  id: string;
  name: string;
  type: string;
  balance: number;
  currency: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export interface TransactionSync {
  id: string;
  type: string;
  amount: number;
  accountId: string;
  category: string;
  subcategory?: string;
  description: string;
  merchant?: string;
  date: Date;
  tags?: string[];
  attachment?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export interface LoanSync {
  id: string;
  type: string;
  name: string;
  principalAmount: number;
  outstandingBalance: number;
  interestRate?: number;
  emiAmount?: number;
  dueDate?: Date;
  frequency?: string;
  status: string;
  contactPerson?: string;
  friendId?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export interface GoalSync {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: Date;
  category: string;
  isGroupGoal: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export interface InvestmentSync {
  id: string;
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
  fundingAccountId?: string;
  purchaseFees?: number;
  purchaseTransactionId?: string;
  purchaseFeeTransactionId?: string;
  saleTransactionId?: string;
  saleFeeTransactionId?: string;
  closingFees?: number;
  realizedProfitLoss?: number;
  settlementAccountId?: string;
  closeNotes?: string;
  deletedAt?: Date;
}

export interface CategorySync {
  id: string;
  name: string;
  type: string;
  color: string;
  icon: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export interface BudgetSync {
  id: string;
  category: string;
  amount: number;
  period: string;
  spent: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export interface GroupSync {
  id: string;
  name: string;
  members: string[];
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export interface SettingSync {
  key: string;
  value: any;
  timestamp: Date;
}

export interface SyncResponse {
  success: boolean;
  conflicts: Conflict[];
  serverData: SyncData;
  timestamp: Date;
}

export interface Conflict {
  type: 'local' | 'server' | 'merge';
  localData: any;
  serverData: any;
  resolvedData: any;
  timestamp: Date;
}

export interface BackupResponse {
  backupId: string;
  size: number;
  createdAt: Date;
  checksum: string;
}

// Cloud sync service implementation
export class CloudSyncService {
  private static instance: CloudSyncService;
  private apiEndpoint: string;
  private authToken: string | null = null;
  private syncInterval: NodeJS.Timeout | null = null;
  private isSyncing: boolean = false;

  static getInstance(): CloudSyncService {
    if (!CloudSyncService.instance) {
      CloudSyncService.instance = new CloudSyncService();
    }
    return CloudSyncService.instance;
  }

  constructor() {
    this.apiEndpoint = process.env.VITE_API_BASE_URL || 'https://api.KANAKU.app';
    this.authToken = localStorage.getItem('auth_token');
  }

  // Initialize sync service
  async initialize(): Promise<void> {
    if (!process.env.VITE_FEATURE_CLOUD_SYNC || process.env.VITE_FEATURE_CLOUD_SYNC !== 'true') {
      console.log('Cloud sync is disabled');
      return;
    }

    try {
      // Start periodic sync
      this.startPeriodicSync();
      
      // Perform initial sync
      await this.sync();
    } catch (error) {
      console.error('Failed to initialize cloud sync:', error);
    }
  }

  // Start periodic synchronization
  private startPeriodicSync(): void {
    const syncInterval = 15 * 60 * 1000; // 15 minutes
    
    this.syncInterval = setInterval(async () => {
      try {
        await this.sync();
      } catch (error) {
        console.error('Periodic sync failed:', error);
      }
    }, syncInterval);
  }

  // Stop periodic synchronization
  stopPeriodicSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  // Main sync function
  async sync(): Promise<void> {
    if (this.isSyncing) {
      console.log('Sync already in progress');
      return;
    }

    this.isSyncing = true;

    try {
      // Get local changes
      const localData = await this.getLocalChanges();
      
      // Sync with server
      const response = await this.syncWithServer(localData);
      
      // Apply server changes
      if (response.success) {
        await this.applyServerChanges(response.serverData);
      }
      
      console.log('Sync completed successfully');
    } catch (error) {
      console.error('Sync failed:', error);
      throw error;
    } finally {
      this.isSyncing = false;
    }
  }

  // Get local changes since last sync
  private async getLocalChanges(): Promise<SyncData> {
    const lastSyncTime = await this.getLastSyncTime();
    
    return {
      accounts: await this.getChangedAccounts(lastSyncTime),
      transactions: await this.getChangedTransactions(lastSyncTime),
      loans: await this.getChangedLoans(lastSyncTime),
      goals: await this.getChangedGoals(lastSyncTime),
      investments: await this.getChangedInvestments(lastSyncTime),
      categories: await this.getChangedCategories(lastSyncTime),
      budgets: await this.getChangedBudgets(lastSyncTime),
      groups: await this.getChangedGroups(lastSyncTime),
      settings: await this.getChangedSettings(lastSyncTime),
      timestamp: new Date(),
      version: '1.0.0'
    };
  }

  // Get changed accounts
  private async getChangedAccounts(since: Date): Promise<AccountSync[]> {
    const accounts = await db.accounts
      .filter(acc => !!((acc.createdAt && acc.createdAt > since) || (acc.updatedAt && acc.updatedAt > since)))
      .toArray();

    return accounts.map(acc => ({
      id: acc.id?.toString() || '',
      name: acc.name,
      type: acc.type,
      balance: acc.balance,
      currency: acc.currency,
      isActive: acc.isActive,
      createdAt: acc.createdAt || new Date(),
      updatedAt: acc.updatedAt || acc.createdAt || new Date(),
      deletedAt: acc.deletedAt
    }));
  }

  // Get changed transactions
  private async getChangedTransactions(since: Date): Promise<TransactionSync[]> {
    const transactions = await db.transactions
      .filter(tx => !!((tx.createdAt && tx.createdAt > since) || (tx.updatedAt && tx.updatedAt > since)))
      .toArray();

    return transactions.map(tx => ({
      id: tx.id?.toString() || '',
      type: tx.type,
      amount: tx.amount,
      accountId: tx.accountId.toString(),
      category: tx.category,
      subcategory: tx.subcategory,
      description: tx.description,
      merchant: tx.merchant,
      date: tx.date,
      tags: tx.tags,
      attachment: tx.attachment,
      createdAt: tx.createdAt || new Date(),
      updatedAt: tx.updatedAt || tx.createdAt || new Date(),
      deletedAt: tx.deletedAt
    }));
  }

  // Similar methods for other entities...
  private async getChangedLoans(since: Date): Promise<LoanSync[]> {
    const loans = await db.loans
      .filter(loan => !!((loan.createdAt && loan.createdAt > since) || (loan.updatedAt && loan.updatedAt > since)))
      .toArray();

    return loans.map(loan => ({
      id: loan.id?.toString() || '',
      type: loan.type,
      name: loan.name,
      principalAmount: loan.principalAmount,
      outstandingBalance: loan.outstandingBalance,
      interestRate: loan.interestRate,
      emiAmount: loan.emiAmount,
      dueDate: loan.dueDate,
      frequency: loan.frequency,
      status: loan.status,
      contactPerson: loan.contactPerson,
      friendId: loan.friendId?.toString(),
      createdAt: loan.createdAt || new Date(),
      updatedAt: loan.updatedAt || loan.createdAt || new Date(),
      deletedAt: loan.deletedAt
    }));
  }

  private async getChangedGoals(since: Date): Promise<GoalSync[]> {
    const goals = await db.goals
      .filter(goal => !!((goal.createdAt && goal.createdAt > since) || (goal.updatedAt && goal.updatedAt > since)))
      .toArray();

    return goals.map(goal => ({
      id: goal.id?.toString() || '',
      name: goal.name,
      targetAmount: goal.targetAmount,
      currentAmount: goal.currentAmount,
      targetDate: goal.targetDate,
      category: goal.category,
      isGroupGoal: goal.isGroupGoal,
      createdAt: goal.createdAt || new Date(),
      updatedAt: goal.updatedAt || goal.createdAt || new Date(),
      deletedAt: goal.deletedAt
    }));
  }

  private async getChangedInvestments(since: Date): Promise<InvestmentSync[]> {
    const investments = await db.investments
      .filter(inv => inv.purchaseDate > since || inv.lastUpdated > since)
      .toArray();

    return investments.map(inv => ({
      id: inv.id?.toString() || '',
      assetType: inv.assetType,
      assetName: inv.assetName,
      quantity: inv.quantity,
      buyPrice: inv.buyPrice,
      currentPrice: inv.currentPrice,
      totalInvested: inv.totalInvested,
      currentValue: inv.currentValue,
      profitLoss: inv.profitLoss,
      purchaseDate: inv.purchaseDate,
      lastUpdated: inv.lastUpdated,
      broker: inv.broker,
      description: inv.description,
      assetCurrency: inv.assetCurrency,
      baseCurrency: inv.baseCurrency,
      buyFxRate: inv.buyFxRate,
      lastKnownFxRate: inv.lastKnownFxRate,
      totalInvestedNative: inv.totalInvestedNative,
      currentValueNative: inv.currentValueNative,
      valuationVersion: inv.valuationVersion,
      positionStatus: inv.positionStatus,
      closedAt: inv.closedAt,
      closePrice: inv.closePrice,
      closeFxRate: inv.closeFxRate,
      grossSaleValue: inv.grossSaleValue,
      netSaleValue: inv.netSaleValue,
      fundingAccountId: inv.fundingAccountId?.toString(),
      purchaseFees: inv.purchaseFees,
      purchaseTransactionId: inv.purchaseTransactionId?.toString(),
      purchaseFeeTransactionId: inv.purchaseFeeTransactionId?.toString(),
      saleTransactionId: inv.saleTransactionId?.toString(),
      saleFeeTransactionId: inv.saleFeeTransactionId?.toString(),
      closingFees: inv.closingFees,
      realizedProfitLoss: inv.realizedProfitLoss,
      settlementAccountId: inv.settlementAccountId?.toString(),
      closeNotes: inv.closeNotes,
      deletedAt: inv.deletedAt
    }));
  }

  private async getChangedCategories(since: Date): Promise<CategorySync[]> {
    const categories = await db.categories
      .filter(cat => (cat as any).createdAt > since || (cat as any).updatedAt > since)
      .toArray();

    return categories.map(cat => ({
      id: cat.id,
      name: cat.name,
      type: cat.type,
      color: cat.color,
      icon: cat.icon,
      createdAt: (cat as any).createdAt || new Date(),
      updatedAt: (cat as any).updatedAt || (cat as any).createdAt || new Date(),
      deletedAt: (cat as any).deletedAt
    }));
  }

  private async getChangedBudgets(since: Date): Promise<BudgetSync[]> {
    const budgets = await db.budgets
      .filter(budget => budget.createdAt > since || (budget as any).updatedAt > since)
      .toArray();

    return budgets.map(budget => ({
      id: budget.id,
      category: budget.category,
      amount: budget.amount,
      period: budget.period,
      spent: budget.spent,
      createdAt: budget.createdAt,
      updatedAt: (budget as any).updatedAt || budget.createdAt,
      deletedAt: (budget as any).deletedAt
    }));
  }

  private async getChangedGroups(since: Date): Promise<GroupSync[]> {
    const groups = await db.groups
      .filter(group => group.createdAt > since || (group as any).updatedAt > since)
      .toArray();

    return groups.map(group => ({
      id: group.id,
      name: group.name,
      members: group.members,
      createdAt: group.createdAt,
      updatedAt: (group as any).updatedAt || group.createdAt,
      deletedAt: (group as any).deletedAt
    }));
  }

  private async getChangedSettings(since: Date): Promise<SettingSync[]> {
    const settings = await db.settings
      .filter(setting => setting.timestamp > since)
      .toArray();

    return settings.map(setting => ({
      key: setting.key,
      value: setting.value,
      timestamp: setting.timestamp
    }));
  }

  // Get last sync time
  private async getLastSyncTime(): Promise<Date> {
    const lastSync = await db.settings.get('last_sync_time');
    return lastSync ? new Date(lastSync.value) : new Date(0);
  }

  // Update last sync time
  private async updateLastSyncTime(time: Date): Promise<void> {
    await db.settings.put({
      key: 'last_sync_time',
      value: time.toISOString(),
      timestamp: time
    });
  }

  // Sync with server
  private async syncWithServer(localData: SyncData): Promise<SyncResponse> {
    const response = await fetch(`${this.apiEndpoint}/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.authToken}`
      },
      body: JSON.stringify(localData)
    });

    if (!response.ok) {
      throw new Error(`Sync failed: ${response.status}`);
    }

    const result = await response.json();
    return result;
  }

  // Apply server changes
  private async applyServerChanges(serverData: SyncData): Promise<void> {
    // Update local database with server data
    // This would involve merging changes and resolving conflicts
    
    await this.updateLastSyncTime(serverData.timestamp);
  }

  // Manual sync trigger
  async manualSync(): Promise<void> {
    console.log('Starting manual sync...');
    await this.sync();
    console.log('Manual sync completed');
  }

  // Backup data to cloud
  async backup(): Promise<BackupResponse> {
    const backupData = await this.getLocalChanges();
    const encryptedData = encryptData(backupData, process.env.VITE_DB_ENCRYPTION_KEY || 'default-key');

    const response = await fetch(`${this.apiEndpoint}/backup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.authToken}`
      },
      body: JSON.stringify({
        data: encryptedData,
        timestamp: new Date().toISOString()
      })
    });

    if (!response.ok) {
      throw new Error('Backup failed');
    }

    return await response.json();
  }

  // Restore data from cloud
  async restore(backupId: string): Promise<void> {
    const response = await fetch(`${this.apiEndpoint}/backup/${backupId}`, {
      headers: {
        'Authorization': `Bearer ${this.authToken}`
      }
    });

    if (!response.ok) {
      throw new Error('Restore failed');
    }

    const backupData = await response.json();
    const decryptedData = decryptData(backupData.data, process.env.VITE_DB_ENCRYPTION_KEY || 'default-key');
    const data = JSON.parse(decryptedData);

    // Restore data to local database
    await this.applyServerChanges(data);
  }

  // Set authentication token
  setAuthToken(token: string): void {
    this.authToken = token;
    localStorage.setItem('auth_token', token);
  }

  // Clear authentication
  clearAuth(): void {
    this.authToken = null;
    localStorage.removeItem('auth_token');
    this.stopPeriodicSync();
  }
}

// Export singleton instance
export const cloudSyncService = CloudSyncService.getInstance();

