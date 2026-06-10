// GoldEntry interface for gold assets
export interface GoldEntry {
  id?: number;
  type: 'gold' | 'jewelry' | 'coin';
  quantity: number;
  unit: 'gram' | 'ounce' | 'kg';
  purchasePrice: number;
  currentPrice: number;
  purchaseDate: Date;
  purityPercentage: number;
  location: string;
  certificateNumber?: string;
  notes?: string;
  createdAt: Date;
  updatedAt?: Date;
}
import Dexie, { Table } from 'dexie';

// Database Interfaces
export type SyncStatus = 'pending' | 'synced' | 'failed';

export interface Account {
  id?: number;
  remoteId?: number;
  cloudId?: string;          // Supabase UUID
  name: string;
  type: 'bank' | 'card' | 'cash' | 'wallet';
  subType?: string;          // e.g. 'visa', 'paytm', 'savings'
  colorId?: string;          // e.g. 'midnight', 'custom'
  customColor?: string;       // hex/hsl
  openingBalance?: number;
  balance: number;
  currency: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt?: Date;
  deletedAt?: Date;
  syncStatus?: SyncStatus;
  version?: number;
}

export interface Friend {
  id?: number;
  remoteId?: number;
  cloudId?: string;
  name: string;
  email?: string;
  phone?: string;
  avatar?: string;
  notes?: string;
  createdAt: Date;
  updatedAt?: Date;
  deletedAt?: Date;
  syncStatus?: SyncStatus;
  version?: number;
}

export interface Transaction {
  id?: number;
  remoteId?: number;
  cloudId?: string;          // Supabase UUID
  type: 'expense' | 'income' | 'transfer';
  amount: number;
  accountId: number;
  category: string;
  subcategory?: string;
  description: string;
  merchant?: string;
  date: Date;
  tags?: string[];
  attachment?: string;
  expenseMode?: 'individual' | 'group' | 'loan';
  groupExpenseId?: number;
  groupName?: string;
  splitType?: 'equal' | 'custom';
  importSource?: string;
  importMetadata?: Record<string, string>;
  originalCategory?: string;
  importedAt?: Date;
  // Loan specific fields on Transaction
  loanType?: 'borrowed' | 'lent';
  contactName?: string;
  interestRate?: number;
  loanCategory?: string;
  bankName?: string;
  tenureMonths?: number;
  emiAmount?: number;
  downPayment?: number;
  receivedAccount?: number;
  emiDeductionAccountId?: number;
  notes?: string;
  // Transfer specific fields
  transferToAccountId?: number;
  transferType?: 'self-transfer' | 'other-transfer'; // self-transfer is between own accounts
  recurrence?: string;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date;
  syncStatus?: SyncStatus;
  version?: number;
}

export interface Loan {
  id?: number;
  remoteId?: number;
  cloudId?: string;
  type: 'borrowed' | 'lent' | 'emi';
  name: string;
  principalAmount: number;
  outstandingBalance: number;
  interestRate?: number;
  totalPayable?: number;
  emiAmount?: number;
  dueDate?: Date;
  loanDate?: Date;
  frequency?: 'monthly' | 'weekly' | 'custom';
  status: 'active' | 'overdue' | 'completed';
  contactPerson?: string;
  friendId?: number; // Reference to Friend
  contactEmail?: string;
  contactPhone?: string;
  accountId?: number;
  bankName?: string;
  tenureMonths?: number;
  downPayment?: number;
  receivedAccountId?: number;
  emiDeductionAccountId?: number;
  loanCategory?: string;
  notes?: string;
  createdAt: Date;
  updatedAt?: Date;
  deletedAt?: Date;
  syncStatus?: SyncStatus;
  version?: number;
}

export interface LoanPayment {
  id?: number;
  loanId: number;
  amount: number;
  accountId: number;
  date: Date;
  notes?: string;
  documentId?: number;
}

export interface Goal {
  id?: number;
  remoteId?: number;
  cloudId?: string;
  name: string;
  description?: string;
  targetAmount: number;
  currentAmount: number;
  monthlySavingPlan?: number;
  targetDate: Date;
  category: string;
  isGroupGoal: boolean;
  members?: GoalMember[];
  milestoneBadges?: string[];
  createdAt: Date;
  updatedAt?: Date;
  deletedAt?: Date;
  syncStatus?: SyncStatus;
  version?: number;
}

export interface GoalMember {
  name: string;
  contactType: 'phone' | 'email' | 'link';
  contactValue: string;
  contribution?: number;
  status?: 'paid' | 'pending';
}

export interface GoalContribution {
  id?: number;
  goalId: number;
  amount: number;
  accountId: number;
  date: Date;
  memberName?: string;
  status?: 'paid' | 'pending';
  notes?: string;
}

export interface GroupExpense {
  id?: number;
  remoteId?: number;
  cloudId?: string;
  name: string;
  totalAmount: number;
  paidBy: number; // accountId
  date: Date;
  members: GroupMember[];
  items?: GroupItem[];
  description?: string;
  category?: string;
  subcategory?: string;
  splitType?: 'equal' | 'custom';
  yourShare?: number;
  expenseTransactionId?: number;
  createdBy?: string;
  createdByName?: string;
  status?: 'pending' | 'settled';
  notificationStatus?: 'pending' | 'partial' | 'sent' | 'failed';
  createdAt: Date;
  updatedAt?: Date;
  deletedAt?: Date;
  syncStatus?: SyncStatus;
  version?: number;
}

export interface GroupMember {
  name: string;
  share: number;
  paid: boolean;
  friendId?: number;
  email?: string;
  phone?: string;
  isCurrentUser?: boolean;
  paidAmount?: number;
  paymentStatus?: 'pending' | 'partial' | 'paid';
  reminderSentAt?: Date;
}

export interface GroupItem {
  name: string;
  amount: number;
  sharedBy: string[]; // member names
}

export interface Investment {
  id?: number;
  remoteId?: number;
  cloudId?: string;
  assetType: 'stock' | 'crypto' | 'forex' | 'gold' | 'silver' | 'platinum' | 'bronze' | 'real_estate' | 'business' | 'other';
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
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date;
  syncStatus?: SyncStatus;
  version?: number;
}

export interface Notification {
  id?: number;
  type: 'emi' | 'loan' | 'goal' | 'group' | 'booking' | 'message' | 'session' | 'friend_request' | 'friend_accepted' | 'todo_shared';
  title: string;
  message: string;
  dueDate?: Date;
  isRead: boolean;
  relatedId?: number;
  createdAt: Date;
  userId?: string;
  deepLink?: string; // e.g., "/calendar?session=123"
  remoteId?: string;
  category?: string;
  readAt?: Date;
  source?: 'local' | 'supabase';
  metadata?: Record<string, string>;
}

export interface TaxCalculation {
  id?: number;
  year: number;
  totalIncome: number;
  totalExpense: number;
  netProfit: number;
  taxableIncome: number;
  estimatedTax: number;
  taxRate: number;
  deductions: number;
  currency: string;
  notes?: string;
  createdAt: Date;
  updatedAt?: Date;
}

export interface FinanceAdvisor {
  id?: number;
  userId: string; // Linked to auth user
  name: string;
  email: string;
  phone: string;
  photo?: string;
  bio?: string;
  specialization: string[]; // tax, accounting, investment, business, etc.
  experience: number; // years
  qualifications: string[];
  rating: number; // 1-5
  totalReviews: number;
  clientsCompleted: number;
  activeClients: number;
  socialLinks?: {
    linkedin?: string;
    twitter?: string;
    website?: string;
  };
  availability: boolean; // ON/OFF toggle
  hourlyRate: number;
  verified: boolean;
  createdAt: Date;
}

export interface AdvisorSession {
  id?: number;
  advisorId: string;
  userId: string;
  date: Date;
  duration: number; // minutes
  type: 'video' | 'audio' | 'chat';
  status: 'scheduled' | 'completed' | 'cancelled' | 'rescheduled';
  notes?: string;
  meetingLink?: string;
  amount: number;
  createdAt: Date;
  updatedAt?: Date;
}

export interface ExpenseCategory {
  id?: string;
  name: string;
  subcategories: string[];
  icon?: string;
  color?: string;
  type: 'expense' | 'income';
}

export interface AppCategory {
  id: string;
  name: string;
  type: 'expense' | 'income';
  color: string;
  icon: string;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date;
  userId?: string;
  createdFromImport?: boolean;
}

export interface ImportHistory {
  id?: number;
  fileName: string;
  fileType: 'csv' | 'json';
  sourceKind: 'third-party' | 'backup';
  totalRecords: number;
  importedRecords: number;
  skippedRecords: number;
  duplicateRecords: number;
  createdCategories: string[];
  errors: string[];
  createdAt: Date;
  userId?: string;
  metadata?: {
    restoredBackup?: boolean;
    exportedAt?: string;
    version?: string;
    fallbackAccountId?: number;
    createdAccounts?: string[];
    createdGoals?: string[];
    updatedGoals?: string[];
    createdGroupExpenses?: number;
  };
}

export interface ExpenseBill {
  id?: number;
  transactionId: number;
  fileName: string;
  fileType: string; // 'image/jpeg', 'application/pdf', etc.
  fileSize: number;
  fileData: Blob; // Store file as blob in Dexie
  uploadedAt: Date;
  notes?: string;
}

export interface MerchantProfile {
  id?: number;
  merchantName: string;
  normalizedName: string;
  suggestedCategory: string;
  country?: string;
  confidenceScore: number;
  usageCount: number;
  userId?: string;
  createdAt: Date;
  updatedAt?: Date;
  lastSeenAt?: Date;
}

export interface UserCategoryPreference {
  id?: number;
  userId?: string;
  merchantKey?: string;
  keywordKey?: string;
  category: string;
  confidenceScore: number;
  usageCount: number;
  createdAt: Date;
  updatedAt?: Date;
  lastUsedAt?: Date;
}

export interface DocumentRecord {
  id?: number;
  userId?: string;
  documentType: 'receipt' | 'statement';
  fileName: string;
  fileType: string;
  fileSize: number;
  fileData?: Blob;
  fileHash?: string;
  filePath?: string;
  uploadDate: Date;
  processingStatus: 'queued' | 'processing' | 'preview' | 'completed' | 'failed';
  linkedTransactionId?: number;
  accountId?: number;
  extractedCurrency?: string;
  sourceAccountName?: string;
  notes?: string;
  metadata?: Record<string, string>;
  createdAt: Date;
  updatedAt?: Date;
}

export interface SmsDetectedTransaction {
  id?: number;
  userId?: string;
  amount: number;
  merchant: string;
  bankName?: string;
  accountLast4?: string;
  transactionType: 'expense' | 'income';
  currencyCode?: string;
  date: Date;
  balance?: number;
  sourceSmsId: string;
  sourceAddress?: string;
  sourceChannel?: string;
  messagePreview?: string;
  matchedAccountId?: number;
  suggestedCategory?: string;
  suggestedSubcategory?: string;
  duplicateTransactionId?: number;
  linkedTransactionId?: number;
  status: 'detected' | 'imported' | 'ignored';
  confidenceScore: number;
  detectedAt: Date;
  createdAt: Date;
  updatedAt?: Date;
}

export interface ToDoList {
  id?: number;
  cloudId?: string;
  name: string;
  description?: string;
  ownerId: string; // Could be userId or identifier
  createdAt: Date;
  updatedAt?: Date;
  archived: boolean;
  syncStatus?: SyncStatus;
  version?: number;
}

export interface ToDoItem {
  id?: number;
  cloudId?: string;
  listId: number;
  title: string;
  description?: string;
  completed: boolean;
  priority: 'low' | 'medium' | 'high';
  dueDate?: Date;
  createdBy: string;
  createdAt: Date;
  updatedAt?: Date;
  completedAt?: Date;
  syncStatus?: SyncStatus;
  version?: number;
}

export interface ToDoListShare {
  id?: number;
  cloudId?: string;
  listId: number;
  sharedWithUserId: string;
  permission: 'view' | 'edit';
  sharedAt: Date;
  sharedBy: string;
  syncStatus?: SyncStatus;
}

export interface AdvisorAssignment {
  id?: number;
  advisorId: string; // Supabase user ID
  userId: string; // Supabase user ID
  assignedAt: Date;
  notes?: string;
  status: 'active' | 'inactive';
}

export interface ChatConversation {
  id?: number;
  conversationId: string; // advisorId_userId  
  advisorId: string;
  userId: string;
  advisorInitiated?: boolean;
  lastMessage?: string;
  lastMessageTime?: Date;
  unreadCount?: number;
  createdAt?: Date;
}

export interface ChatMessage {
  id?: number;
  conversationId: string; // advisorId_userId
  senderId: string; // Supabase user ID
  senderRole: 'advisor' | 'user';
  message: string;
  timestamp: Date;
  isRead: boolean;
  attachmentUrl?: string;
}

export interface BookingRequest {
  id?: number;
  advisorId: string; // Supabase user ID
  userId: string; // Supabase user ID
  advisorName: string;
  userEmail: string;
  requestedDate?: Date;
  preferredTime?: string;
  topic?: string;
  message?: string;
  status: 'pending' | 'accepted' | 'rejected' | 'completed' | 'reschedule';
  sessionType: 'video' | 'audio' | 'chat';
  responseMessage?: string; // Advisor's response (e.g., for reschedule)
  createdAt: Date;
  respondedAt?: Date;
  sequenceNumber?: number; // For sorting
}

export interface Notification {
  id?: number;
  type: 'emi' | 'loan' | 'goal' | 'group' | 'booking' | 'message' | 'session' | 'friend_request' | 'friend_accepted' | 'todo_shared';
  title: string;
  message: string;
  dueDate?: Date;
  isRead: boolean;
  relatedId?: number;
  createdAt: Date;
  userId?: string;
  deepLink?: string; // e.g., "/calendar?session=123"
  remoteId?: string;
  category?: string;
  readAt?: Date;
  source?: 'local' | 'supabase';
  metadata?: Record<string, string>;
}

// Database Class
export class KANAKUDB extends Dexie {
  accounts!: Table<Account>;
  friends!: Table<Friend>;
  transactions!: Table<Transaction>;
  loans!: Table<Loan>;
  loanPayments!: Table<LoanPayment>;
  goals!: Table<Goal>;
  goalContributions!: Table<GoalContribution>;
  groupExpenses!: Table<GroupExpense>;
  investments!: Table<Investment>;
  notifications!: Table<Notification>;

  constructor() {
    super('KANAKUDB');
    this.version(1).stores({
      accounts: '++id, type, isActive',
      transactions: '++id, type, accountId, category, date',
      loans: '++id, type, status, dueDate',
      loanPayments: '++id, loanId, date',
      goals: '++id, isGroupGoal, targetDate',
      goalContributions: '++id, goalId, date',
      groupExpenses: '++id, date',
      investments: '++id, assetType',
      notifications: '++id, type, dueDate, isRead',
    });
    // Add friends table in version 2
    this.version(2).stores({
      accounts: '++id, type, isActive',
      friends: '++id, name, createdAt',
      transactions: '++id, type, accountId, category, date',
      loans: '++id, type, status, dueDate, friendId',
      loanPayments: '++id, loanId, date',
      goals: '++id, isGroupGoal, targetDate',
      goalContributions: '++id, goalId, date',
      groupExpenses: '++id, date',
      investments: '++id, assetType',
      notifications: '++id, type, dueDate, isRead',
    });
  }
}

// Add additional tables for production features
export class ProductionDB extends KANAKUDB {
    gold!: Table<GoldEntry>;
  logs!: Table<{ id: string; level: string; message: string; timestamp: Date }>;
  errorReports!: Table<{ id: string; report: string; timestamp: Date }>;
  backups!: Table<{ id: string; data: string; timestamp: Date; size: number }>;
  settings!: Table<{ key: string; value: any; timestamp: Date }>;
  categories!: Table<AppCategory>;
  importHistories!: Table<ImportHistory>;
  budgets!: Table<{ id: string; category: string; amount: number; period: string; spent: number; createdAt: Date }>;
  groups!: Table<{ id: string; name: string; members: string[]; createdAt: Date }>;
  taxCalculations!: Table<TaxCalculation>;
  financeAdvisors!: Table<FinanceAdvisor>;
  advisorSessions!: Table<AdvisorSession>;
  expenseCategories!: Table<ExpenseCategory>;
  expenseBills!: Table<ExpenseBill>;
  toDoLists!: Table<ToDoList>;
  toDoItems!: Table<ToDoItem>;
  toDoListShares!: Table<ToDoListShare>;
  advisorAssignments!: Table<AdvisorAssignment>;
  chatMessages!: Table<ChatMessage>;
  chatConversations!: Table<ChatConversation>;
  bookingRequests!: Table<BookingRequest>;
  merchantProfiles!: Table<MerchantProfile>;
  userCategoryPreferences!: Table<UserCategoryPreference>;
  documents!: Table<DocumentRecord>;
  smsTransactions!: Table<SmsDetectedTransaction>;

  constructor() {
    super();
    this.version(3).stores({
      accounts: '++id, type, isActive',
      friends: '++id, name, createdAt',
      transactions: '++id, type, accountId, category, date',
      loans: '++id, type, status, dueDate, friendId',
      loanPayments: '++id, loanId, date',
      goals: '++id, isGroupGoal, targetDate',
      goalContributions: '++id, goalId, date',
      groupExpenses: '++id, date',
      investments: '++id, assetType',
      notifications: '++id, type, userId, isRead, createdAt',
      gold: '++id, type, unit, purchaseDate',
      logs: 'id, level, timestamp',
      errorReports: 'id, timestamp',
      backups: 'id, timestamp',
      settings: 'key',
      categories: 'id, type',
      budgets: 'id, category, period',
      groups: 'id',
      taxCalculations: '++id, year',
      financeAdvisors: '++id, verified, rating',
      advisorSessions: '++id, advisorId, date, status',
      expenseCategories: 'id, type',
      expenseBills: '++id, transactionId, uploadedAt',
      toDoLists: '++id, ownerId, createdAt, archived',
      toDoItems: '++id, listId, completed, dueDate, priority',
      toDoListShares: '++id, listId, sharedWithUserId',
      advisorAssignments: '++id, advisorId, userId, status',
      chatMessages: '++id, conversationId, timestamp, isRead',
      chatConversations: '++id, conversationId, advisorId, userId',
      bookingRequests: '++id, advisorId, userId, status, createdAt, sequenceNumber',
    });
    
    this.version(4).stores({
      accounts: '++id, type, isActive',
      friends: '++id, name, createdAt',
      transactions: '++id, type, accountId, category, date',
      loans: '++id, type, status, dueDate, friendId',
      loanPayments: '++id, loanId, date',
      goals: '++id, isGroupGoal, targetDate',
      goalContributions: '++id, goalId, date',
      groupExpenses: '++id, date',
      investments: '++id, assetType',
      notifications: '++id, type, userId, isRead, createdAt',
      gold: '++id, type, unit, purchaseDate',
      logs: 'id, level, timestamp',
      errorReports: 'id, timestamp',
      backups: 'id, timestamp',
      settings: 'key',
      categories: 'id, type',
      budgets: 'id, category, period',
      groups: 'id',
      taxCalculations: '++id, year',
      financeAdvisors: '++id, verified, rating',
      advisorSessions: '++id, advisorId, date, status',
      expenseCategories: 'id, type',
      expenseBills: '++id, transactionId, uploadedAt',
      toDoLists: '++id, ownerId, createdAt, archived',
      toDoItems: '++id, listId, completed, dueDate, priority',
      toDoListShares: '++id, listId, sharedWithUserId',
      advisorAssignments: '++id, advisorId, userId, status',
      chatMessages: '++id, conversationId, timestamp, isRead',
      chatConversations: '++id, conversationId, advisorId, userId',
      bookingRequests: '++id, advisorId, userId, status, createdAt, sequenceNumber',
    });

    this.version(5).stores({
      accounts: '++id, type, isActive',
      friends: '++id, name, createdAt',
      transactions: '++id, type, accountId, category, date',
      loans: '++id, type, status, dueDate, friendId',
      loanPayments: '++id, loanId, date',
      goals: '++id, isGroupGoal, targetDate',
      goalContributions: '++id, goalId, date',
      groupExpenses: '++id, date',
      investments: '++id, assetType, positionStatus, assetCurrency, baseCurrency',
      notifications: '++id, type, userId, isRead, createdAt',
      gold: '++id, type, unit, purchaseDate',
      logs: 'id, level, timestamp',
      errorReports: 'id, timestamp',
      backups: 'id, timestamp',
      settings: 'key',
      categories: 'id, type',
      budgets: 'id, category, period',
      groups: 'id',
      taxCalculations: '++id, year',
      financeAdvisors: '++id, verified, rating',
      advisorSessions: '++id, advisorId, date, status',
      expenseCategories: 'id, type',
      expenseBills: '++id, transactionId, uploadedAt',
      toDoLists: '++id, ownerId, createdAt, archived',
      toDoItems: '++id, listId, completed, dueDate, priority',
      toDoListShares: '++id, listId, sharedWithUserId',
      advisorAssignments: '++id, advisorId, userId, status',
      chatMessages: '++id, conversationId, timestamp, isRead',
      chatConversations: '++id, conversationId, advisorId, userId',
      bookingRequests: '++id, advisorId, userId, status, createdAt, sequenceNumber',
    }).upgrade(async (tx) => {
      const investmentTable = tx.table('investments');
      const legacyInvestments = await investmentTable.toArray();

      for (const record of legacyInvestments as Array<Record<string, any>>) {
        const assetName = String(record.assetName || '').toUpperCase();
        const assetType = String(record.assetType || '').toLowerCase();
        let inferredCurrency = 'USD';

        if (assetName.endsWith('.NS') || assetName.endsWith('.BO')) {
          inferredCurrency = 'INR';
        } else if (assetName.endsWith('-USD') || assetType === 'crypto') {
          inferredCurrency = 'USD';
        } else if (assetName.endsWith('=X') && assetName.length >= 6) {
          inferredCurrency = assetName.slice(3, 6);
        } else if (assetType === 'gold' || assetType === 'silver' || assetType === 'other') {
          inferredCurrency = record.baseCurrency || 'USD';
        }

        await investmentTable.put({
          ...record,
          broker: record.broker ?? '',
          description: record.description ?? '',
          assetCurrency: record.assetCurrency ?? inferredCurrency,
          baseCurrency: record.baseCurrency ?? inferredCurrency,
          buyFxRate: record.buyFxRate ?? 1,
          lastKnownFxRate: record.lastKnownFxRate ?? 1,
          totalInvestedNative: record.totalInvestedNative ?? (Number(record.buyPrice) || 0) * (Number(record.quantity) || 0),
          currentValueNative: record.currentValueNative ?? (Number(record.currentPrice) || 0) * (Number(record.quantity) || 0),
          positionStatus: record.positionStatus ?? 'open',
          fundingAccountId: record.fundingAccountId ?? undefined,
          purchaseFees: record.purchaseFees ?? 0,
          purchaseTransactionId: record.purchaseTransactionId ?? undefined,
          purchaseFeeTransactionId: record.purchaseFeeTransactionId ?? undefined,
          saleTransactionId: record.saleTransactionId ?? undefined,
          saleFeeTransactionId: record.saleFeeTransactionId ?? undefined,
          closeNotes: record.closeNotes ?? '',
        });
      }
    });

    this.version(6).stores({
      accounts: '++id, type, isActive',
      friends: '++id, name, createdAt',
      transactions: '++id, type, accountId, category, date',
      loans: '++id, type, status, dueDate, friendId',
      loanPayments: '++id, loanId, date',
      goals: '++id, isGroupGoal, targetDate',
      goalContributions: '++id, goalId, date',
      groupExpenses: '++id, date',
      investments: '++id, assetType, positionStatus, assetCurrency, baseCurrency',
      notifications: '++id, type, userId, isRead, createdAt',
      gold: '++id, type, unit, purchaseDate',
      logs: 'id, level, timestamp',
      errorReports: 'id, timestamp',
      backups: 'id, timestamp',
      settings: 'key',
      categories: 'id, type',
      importHistories: '++id, createdAt, fileType, sourceKind, userId',
      budgets: 'id, category, period',
      groups: 'id',
      taxCalculations: '++id, year',
      financeAdvisors: '++id, verified, rating',
      advisorSessions: '++id, advisorId, date, status',
      expenseCategories: 'id, type',
      expenseBills: '++id, transactionId, uploadedAt',
      toDoLists: '++id, ownerId, createdAt, archived',
      toDoItems: '++id, listId, completed, dueDate, priority',
      toDoListShares: '++id, listId, sharedWithUserId',
      advisorAssignments: '++id, advisorId, userId, status',
      chatMessages: '++id, conversationId, timestamp, isRead',
      chatConversations: '++id, conversationId, advisorId, userId',
      bookingRequests: '++id, advisorId, userId, status, createdAt, sequenceNumber',
    });

    this.version(7).stores({
      accounts: '++id, type, isActive',
      friends: '++id, name, createdAt',
      transactions: '++id, type, accountId, category, date',
      loans: '++id, type, status, dueDate, friendId',
      loanPayments: '++id, loanId, date',
      goals: '++id, isGroupGoal, targetDate',
      goalContributions: '++id, goalId, date',
      groupExpenses: '++id, date',
      investments: '++id, assetType, positionStatus, assetCurrency, baseCurrency',
      notifications: '++id, type, userId, isRead, createdAt, remoteId',
      gold: '++id, type, unit, purchaseDate',
      logs: 'id, level, timestamp',
      errorReports: 'id, timestamp',
      backups: 'id, timestamp',
      settings: 'key',
      categories: 'id, type',
      importHistories: '++id, createdAt, fileType, sourceKind, userId',
      budgets: 'id, category, period',
      groups: 'id',
      taxCalculations: '++id, year',
      financeAdvisors: '++id, verified, rating',
      advisorSessions: '++id, advisorId, date, status',
      expenseCategories: 'id, type',
      expenseBills: '++id, transactionId, uploadedAt',
      toDoLists: '++id, ownerId, createdAt, archived',
      toDoItems: '++id, listId, completed, dueDate, priority',
      toDoListShares: '++id, listId, sharedWithUserId',
      advisorAssignments: '++id, advisorId, userId, status',
      chatMessages: '++id, conversationId, timestamp, isRead',
      chatConversations: '++id, conversationId, advisorId, userId',
      bookingRequests: '++id, advisorId, userId, status, createdAt, sequenceNumber',
      merchantProfiles: '++id, normalizedName, suggestedCategory, userId, updatedAt',
      userCategoryPreferences: '++id, merchantKey, keywordKey, userId, updatedAt',
      documents: '++id, documentType, userId, processingStatus, uploadDate, accountId',
    });

    this.version(8).stores({
      accounts: '++id, remoteId, type, isActive',
      friends: '++id, remoteId, name, createdAt',
      transactions: '++id, remoteId, type, accountId, category, date',
      loans: '++id, remoteId, type, status, dueDate, friendId',
      loanPayments: '++id, loanId, date',
      goals: '++id, remoteId, isGroupGoal, targetDate',
      goalContributions: '++id, goalId, date',
      groupExpenses: '++id, remoteId, date',
      investments: '++id, remoteId, assetType, positionStatus, assetCurrency, baseCurrency',
      notifications: '++id, type, userId, isRead, createdAt, remoteId',
      gold: '++id, type, unit, purchaseDate',
      logs: 'id, level, timestamp',
      errorReports: 'id, timestamp',
      backups: 'id, timestamp',
      settings: 'key',
      categories: 'id, type',
      importHistories: '++id, createdAt, fileType, sourceKind, userId',
      budgets: 'id, category, period',
      groups: 'id',
      taxCalculations: '++id, year',
      financeAdvisors: '++id, verified, rating',
      advisorSessions: '++id, advisorId, date, status',
      expenseCategories: 'id, type',
      expenseBills: '++id, transactionId, uploadedAt',
      toDoLists: '++id, ownerId, createdAt, archived',
      toDoItems: '++id, listId, completed, dueDate, priority',
      toDoListShares: '++id, listId, sharedWithUserId',
      advisorAssignments: '++id, advisorId, userId, status',
      chatMessages: '++id, conversationId, timestamp, isRead',
      chatConversations: '++id, conversationId, advisorId, userId',
      bookingRequests: '++id, advisorId, userId, status, createdAt, sequenceNumber',
      merchantProfiles: '++id, normalizedName, suggestedCategory, userId, updatedAt',
      userCategoryPreferences: '++id, merchantKey, keywordKey, userId, updatedAt',
      documents: '++id, documentType, userId, processingStatus, uploadDate, accountId',
    });

    this.version(9).stores({
      accounts: '++id, remoteId, type, isActive',
      friends: '++id, remoteId, name, createdAt',
      transactions: '++id, remoteId, type, accountId, category, date',
      loans: '++id, remoteId, type, status, dueDate, friendId',
      loanPayments: '++id, loanId, date',
      goals: '++id, remoteId, isGroupGoal, targetDate',
      goalContributions: '++id, goalId, date',
      groupExpenses: '++id, remoteId, date',
      investments: '++id, remoteId, assetType, positionStatus, assetCurrency, baseCurrency',
      notifications: '++id, type, userId, isRead, createdAt, remoteId',
      gold: '++id, type, unit, purchaseDate',
      logs: 'id, level, timestamp',
      errorReports: 'id, timestamp',
      backups: 'id, timestamp',
      settings: 'key',
      categories: 'id, type',
      importHistories: '++id, createdAt, fileType, sourceKind, userId',
      budgets: 'id, category, period',
      groups: 'id',
      taxCalculations: '++id, year',
      financeAdvisors: '++id, verified, rating',
      advisorSessions: '++id, advisorId, date, status',
      expenseCategories: 'id, type',
      expenseBills: '++id, transactionId, uploadedAt',
      toDoLists: '++id, ownerId, createdAt, archived',
      toDoItems: '++id, listId, completed, dueDate, priority',
      toDoListShares: '++id, listId, sharedWithUserId',
      advisorAssignments: '++id, advisorId, userId, status',
      chatMessages: '++id, conversationId, timestamp, isRead',
      chatConversations: '++id, conversationId, advisorId, userId',
      bookingRequests: '++id, advisorId, userId, status, createdAt, sequenceNumber',
      merchantProfiles: '++id, normalizedName, suggestedCategory, userId, updatedAt',
      userCategoryPreferences: '++id, merchantKey, keywordKey, userId, updatedAt',
      documents: '++id, documentType, userId, processingStatus, uploadDate, accountId',
      smsTransactions: '++id, &sourceSmsId, userId, status, transactionType, date, matchedAccountId, linkedTransactionId, detectedAt',
    });
  }
}

//  Sync Queue Interface 
export interface SyncQueueItem {
  id?: number;
  userId: string;
  table: string;
  operation: 'create' | 'update' | 'delete';
  localId: number;
  cloudId?: string;          // Supabase UUID (undefined for new creates)
  payload: string;           // JSON-serialised local record
  createdAt: Date;
  retries: number;
  status: 'pending' | 'processing' | 'succeeded' | 'failed';
  errorMessage?: string;
  version: number;           // local version counter for conflict resolution
}

//  Sync Event Log Interface (for admin monitoring) 
export interface SyncEventLog {
  id?: number;
  userId: string;
  eventType: 'sync_start' | 'sync_success' | 'sync_failure' | 'conflict' | 'queue_flush';
  affectedTable?: string;
  recordsProcessed?: number;
  errorMessage?: string;
  timestamp: Date;
  durationMs?: number;
}

export class OfflineSyncDB extends ProductionDB {
  syncQueue!: Table<SyncQueueItem>;
  syncEventLogs!: Table<SyncEventLog>;

  constructor() {
    super();

    // Version 10: Offline-first sync queue + indexed syncStatus on core tables
    this.version(10).stores({
      // Core entity tables - add syncStatus index for fast pending-record queries
      accounts:     '++id, remoteId, type, isActive, syncStatus',
      friends:      '++id, remoteId, name, createdAt, syncStatus',
      transactions: '++id, remoteId, type, accountId, category, date, syncStatus',
      loans:        '++id, remoteId, type, status, dueDate, friendId, syncStatus',
      loanPayments: '++id, loanId, date',
      goals:        '++id, remoteId, isGroupGoal, targetDate, syncStatus',
      goalContributions: '++id, goalId, date',
      groupExpenses:'++id, remoteId, date, syncStatus',
      investments:  '++id, remoteId, assetType, positionStatus, assetCurrency, baseCurrency, syncStatus',
      notifications:'++id, type, userId, isRead, createdAt, remoteId',
      gold:         '++id, type, unit, purchaseDate',
      logs:         'id, level, timestamp',
      errorReports: 'id, timestamp',
      backups:      'id, timestamp',
      settings:     'key',
      categories:   'id, type',
      importHistories: '++id, createdAt, fileType, sourceKind, userId',
      budgets:      'id, category, period',
      groups:       'id',
      taxCalculations: '++id, year',
      financeAdvisors: '++id, verified, rating',
      advisorSessions: '++id, advisorId, date, status',
      expenseCategories: 'id, type',
      expenseBills:    '++id, transactionId, uploadedAt',
      toDoLists:       '++id, ownerId, createdAt, archived, syncStatus',
      toDoItems:       '++id, listId, completed, dueDate, priority, syncStatus',
      toDoListShares:  '++id, listId, sharedWithUserId',
      advisorAssignments: '++id, advisorId, userId, status',
      chatMessages:    '++id, conversationId, timestamp, isRead',
      chatConversations: '++id, conversationId, advisorId, userId',
      bookingRequests: '++id, advisorId, userId, status, createdAt, sequenceNumber',
      merchantProfiles: '++id, normalizedName, suggestedCategory, userId, updatedAt',
      userCategoryPreferences: '++id, merchantKey, keywordKey, userId, updatedAt',
      documents:       '++id, documentType, userId, processingStatus, uploadDate, accountId',
      smsTransactions: '++id, &sourceSmsId, userId, status, transactionType, date, matchedAccountId, linkedTransactionId, detectedAt',
      // New tables for offline-first sync infrastructure
      syncQueue:     '++id, userId, table, status, createdAt',
      syncEventLogs: '++id, userId, eventType, timestamp',
    });

    // Version 11: Indexing cloudId for fast sync lookups
    this.version(11).stores({
      accounts:     '++id, remoteId, cloudId, type, isActive, syncStatus',
      friends:      '++id, remoteId, cloudId, name, createdAt, syncStatus',
      transactions: '++id, remoteId, cloudId, type, accountId, category, date, syncStatus',
      loans:        '++id, remoteId, cloudId, type, status, dueDate, friendId, syncStatus',
      goals:        '++id, remoteId, cloudId, isGroupGoal, targetDate, syncStatus',
      groupExpenses:'++id, remoteId, cloudId, date, syncStatus',
      investments:  '++id, remoteId, cloudId, assetType, positionStatus, assetCurrency, baseCurrency, syncStatus',
      toDoLists:       '++id, cloudId, ownerId, createdAt, archived, syncStatus',
      toDoItems:       '++id, cloudId, listId, completed, dueDate, priority, syncStatus',
      // Keep other tables same as version 10
      loanPayments: '++id, loanId, date',
      goalContributions: '++id, goalId, date',
      notifications:'++id, type, userId, isRead, createdAt, remoteId',
      gold:         '++id, type, unit, purchaseDate',
      logs:         'id, level, timestamp',
      errorReports: 'id, timestamp',
      backups:      'id, timestamp',
      settings:     'key',
      categories:   'id, type',
      importHistories: '++id, createdAt, fileType, sourceKind, userId',
      budgets:      'id, category, period',
      groups:       'id',
      taxCalculations: '++id, year',
      financeAdvisors: '++id, verified, rating',
      advisorSessions: '++id, advisorId, date, status',
      expenseCategories: 'id, type',
      expenseBills:    '++id, transactionId, uploadedAt',
      toDoListShares:  '++id, listId, sharedWithUserId',
      advisorAssignments: '++id, advisorId, userId, status',
      chatMessages:    '++id, conversationId, timestamp, isRead',
      chatConversations: '++id, conversationId, advisorId, userId',
      bookingRequests: '++id, advisorId, userId, status, createdAt, sequenceNumber',
      merchantProfiles: '++id, normalizedName, suggestedCategory, userId, updatedAt',
      userCategoryPreferences: '++id, merchantKey, keywordKey, userId, updatedAt',
      documents:       '++id, documentType, userId, processingStatus, uploadDate, accountId',
      smsTransactions: '++id, &sourceSmsId, userId, status, transactionType, date, matchedAccountId, linkedTransactionId, detectedAt',
      syncQueue:     '++id, userId, table, status, createdAt',
      syncEventLogs: '++id, userId, eventType, timestamp',
    });

    // Version 12: No index changes, just bump for Family Wealth Vault schema alignment
    this.version(12).stores({
      accounts:     '++id, remoteId, cloudId, type, isActive, syncStatus',
      friends:      '++id, remoteId, cloudId, name, createdAt, syncStatus',
      transactions: '++id, remoteId, cloudId, type, accountId, category, date, syncStatus',
      loans:        '++id, remoteId, cloudId, type, status, dueDate, friendId, syncStatus',
      goals:        '++id, remoteId, cloudId, isGroupGoal, targetDate, syncStatus',
      groupExpenses:'++id, remoteId, cloudId, date, syncStatus',
      investments:  '++id, remoteId, cloudId, assetType, positionStatus, assetCurrency, baseCurrency, syncStatus',
      toDoLists:       '++id, cloudId, ownerId, createdAt, archived, syncStatus',
      toDoItems:       '++id, cloudId, listId, completed, dueDate, priority, syncStatus',
      loanPayments: '++id, loanId, date',
      goalContributions: '++id, goalId, date',
      notifications:'++id, type, userId, isRead, createdAt, remoteId',
      gold:         '++id, type, unit, purchaseDate',
      logs:         'id, level, timestamp',
      errorReports: 'id, timestamp',
      backups:      'id, timestamp',
      settings:     'key',
      categories:   'id, type',
      importHistories: '++id, createdAt, fileType, sourceKind, userId',
      budgets:      'id, category, period',
      groups:       'id',
      taxCalculations: '++id, year',
      financeAdvisors: '++id, verified, rating',
      advisorSessions: '++id, advisorId, date, status',
      expenseCategories: 'id, type',
      expenseBills:    '++id, transactionId, uploadedAt',
      toDoListShares:  '++id, listId, sharedWithUserId',
      advisorAssignments: '++id, advisorId, userId, status',
      chatMessages:    '++id, conversationId, timestamp, isRead',
      chatConversations: '++id, conversationId, advisorId, userId',
      bookingRequests: '++id, advisorId, userId, status, createdAt, sequenceNumber',
      merchantProfiles: '++id, normalizedName, suggestedCategory, userId, updatedAt',
      userCategoryPreferences: '++id, merchantKey, keywordKey, userId, updatedAt',
      documents:       '++id, documentType, userId, processingStatus, uploadDate, accountId',
      smsTransactions: '++id, &sourceSmsId, userId, status, transactionType, date, matchedAccountId, linkedTransactionId, detectedAt',
      syncQueue:     '++id, userId, table, status, createdAt',
      syncEventLogs: '++id, userId, eventType, timestamp',
    });
  }
}

export const db = new OfflineSyncDB();

