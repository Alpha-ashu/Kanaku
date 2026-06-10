/**
 * Global Type Definitions for KANAKU
 * Centralized type system for consistency across the application
 */

// ==================== User & Authentication ====================

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'admin' | 'advisor';
  createdAt: Date;
  updatedAt?: Date;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
}

// ==================== Account Types ====================

export type AccountType = 'bank' | 'card' | 'cash' | 'wallet';

export interface Account {
  id: string;
  userId: string;
  name: string;
  type: AccountType;
  balance: number;
  currency: string;
  color?: string;
  icon?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt?: Date;
  deletedAt?: Date;
}

// ==================== Transaction Types ====================

export type TransactionType = 'income' | 'expense' | 'transfer';

export interface Transaction {
  id: string;
  userId: string;
  accountId: string;
  type: TransactionType;
  amount: number;
  category: string;
  subcategory?: string;
  description?: string;
  merchant?: string;
  date: Date;
  tags?: string[];
  attachment?: string;
  expenseMode?: 'individual' | 'group';
  groupExpenseId?: string;
  groupName?: string;
  splitType?: 'equal' | 'custom';
  // Transfer specific
  transferToAccountId?: string;
  transferType?: 'self-transfer' | 'other-transfer';
  synced?: boolean;
  createdAt: Date;
  updatedAt?: Date;
  deletedAt?: Date;
}

// ==================== Category System ====================

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  type: 'income' | 'expense';
  subcategories?: Subcategory[];
}

export interface Subcategory {
  id: string;
  name: string;
  categoryId: string;
}

// ==================== Goals ====================

export interface Goal {
  id: string;
  userId: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: Date;
  category?: string;
  icon?: string;
  color?: string;
  isGroupGoal: boolean;
  priority?: number;
  createdAt: Date;
  updatedAt?: Date;
  deletedAt?: Date;
}

export interface GoalContribution {
  id: string;
  goalId: string;
  amount: number;
  accountId: string;
  date: Date;
  notes?: string;
}

// ==================== Loans & EMI ====================

export type LoanType = 'borrowed' | 'lent' | 'emi';
export type LoanStatus = 'active' | 'overdue' | 'completed';
export type PaymentFrequency = 'monthly' | 'weekly' | 'quarterly' | 'custom';

export interface Loan {
  id: string;
  userId: string;
  type: LoanType;
  name: string;
  principalAmount: number;
  outstandingBalance: number;
  interestRate?: number;
  emiAmount?: number;
  dueDate?: Date;
  frequency?: PaymentFrequency;
  status: LoanStatus;
  contactPerson?: string;
  friendId?: string;
  createdAt: Date;
  updatedAt?: Date;
  deletedAt?: Date;
}

export interface LoanPayment {
  id: string;
  loanId: string;
  amount: number;
  accountId: string;
  date: Date;
  notes?: string;
  isPrincipal: boolean;
  interestAmount?: number;
}

// ==================== Investments ====================

export type InvestmentType = 'stocks' | 'crypto' | 'gold' | 'forex' | 'mutual_funds' | 'bonds';

export interface Investment {
  id: string;
  userId: string;
  name: string;
  type: InvestmentType;
  quantity: number;
  purchasePrice: number;
  currentPrice: number;
  purchaseDate: Date;
  notes?: string;
  createdAt: Date;
  updatedAt?: Date;
  deletedAt?: Date;
}

// ==================== Group Expenses ====================

export interface GroupExpense {
  id: string;
  name: string;
  description?: string;
  totalAmount: number;
  paidBy: string; // userId
  date: Date;
  members: GroupMember[];
  category?: string;
  subcategory?: string;
  splitType?: 'equal' | 'custom';
  yourShare?: number;
  expenseTransactionId?: string;
  settled: boolean;
  createdAt: Date;
  updatedAt?: Date;
}

export interface GroupMember {
  userId?: string;
  name: string;
  share: number;
  paid: boolean;
  email?: string;
  phone?: string;
  isCurrentUser?: boolean;
  paymentStatus?: 'pending' | 'partial' | 'paid';
}

// ==================== Reports & Analytics ====================

export interface FinancialSummary {
  totalIncome: number;
  totalExpense: number;
  netSavings: number;
  savingsRate: number;
  period: 'daily' | 'weekly' | 'monthly' | 'yearly';
}

export interface CategoryBreakdown {
  category: string;
  amount: number;
  percentage: number;
  count: number;
}

export interface TrendData {
  date: Date;
  income: number;
  expense: number;
  balance: number;
}

// ==================== Todo Lists ====================

export interface TodoList {
  id: string;
  title: string;
  description?: string;
  userId: string;
  isShared: boolean;
  createdAt: Date;
  updatedAt?: Date;
}

export interface TodoItem {
  id: string;
  listId: string;
  title: string;
  description?: string;
  completed: boolean;
  priority: 'low' | 'medium' | 'high';
  dueDate?: Date;
  createdAt: Date;
  updatedAt?: Date;
}

export interface TodoListShare {
  id: string;
  listId: string;
  userId: string;
  permission: 'view' | 'edit';
  createdAt: Date;
}

// ==================== Advisor System ====================

export interface FinanceAdvisor {
  id: string;
  userId: string;
  name: string;
  email: string;
  phone?: string;
  specialization: string[];
  experience: number;
  rating: number;
  reviewCount: number;
  hourlyRate: number;
  bio?: string;
  qualifications: string[];
  availability: AdvisorAvailability[];
  isAvailable: boolean;
  createdAt: Date;
}

export interface AdvisorAvailability {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

export interface AdvisorBooking {
  id: string;
  advisorId: string;
  userId: string;
  date: Date;
  time: string;
  duration: number;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  notes?: string;
  createdAt: Date;
  updatedAt?: Date;
}

export interface AdvisorReview {
  id: string;
  advisorId: string;
  userId: string;
  rating: number;
  comment?: string;
  createdAt: Date;
}

// ==================== Notifications ====================

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'error';
  read: boolean;
  actionUrl?: string;
  createdAt: Date;
}

// ==================== Feature Flags ====================

export interface FeatureFlag {
  id: string;
  name: string;
  enabled: boolean;
  description?: string;
  requiredRole?: 'user' | 'admin' | 'advisor';
}

// ==================== Settings ====================

export interface UserSettings {
  id: string;
  userId: string;
  currency: string;
  language: string;
  theme: 'light' | 'dark' | 'auto';
  notifications: NotificationSettings;
  security: SecuritySettings;
}

export interface NotificationSettings {
  email: boolean;
  push: boolean;
  emiReminders: boolean;
  goalReminders: boolean;
  transactionAlerts: boolean;
}

export interface SecuritySettings {
  pinEnabled: boolean;
  twoFactorEnabled: boolean;
  biometricEnabled: boolean;
}

// ==================== API Response Types ====================

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: ApiError;
  message?: string;
}

export interface ApiError {
  code: string;
  message: string;
  details?: any;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ==================== Filter & Sort Types ====================

export interface FilterOptions {
  accountId?: string;
  category?: string;
  type?: TransactionType;
  startDate?: Date;
  endDate?: Date;
  minAmount?: number;
  maxAmount?: number;
  tags?: string[];
}

export interface SortOptions {
  field: string;
  order: 'asc' | 'desc';
}

// ==================== Form Types ====================

export interface LoginForm {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface RegisterForm {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export interface TransactionForm {
  type: TransactionType;
  amount: number;
  accountId: string;
  category: string;
  subcategory?: string;
  description?: string;
  merchant?: string;
  date: Date;
  tags?: string[];
}

export interface AccountForm {
  name: string;
  type: AccountType;
  balance: number;
  currency: string;
  color?: string;
}

// ==================== Utility Types ====================

export type Pagination = {
  page: number;
  pageSize: number;
  total: number;
};

export type DateRange = {
  startDate: Date;
  endDate: Date;
};

export type TimeRange = '7d' | '30d' | '90d' | '1y' | 'custom';

export type ExportFormat = 'pdf' | 'excel' | 'csv';

export type ChartType = 'line' | 'bar' | 'pie' | 'area';

// ==================== Context Types ====================

export interface AppContextType {
  currentPage: string;
  setCurrentPage: (page: string) => void;
  currency: string;
  theme: 'light' | 'dark';
  accounts: Account[];
  transactions: Transaction[];
  goals: Goal[];
  loans: Loan[];
  investments: Investment[];
  visibleFeatures: string[];
  loading: boolean;
}

export interface AuthContextType {
  user: User | null;
  role: 'user' | 'admin' | 'advisor';
  loading: boolean;
  login: (credentials: LoginForm) => Promise<void>;
  logout: () => Promise<void>;
  register: (data: RegisterForm) => Promise<void>;
}

export interface SecurityContextType {
  isAuthenticated: boolean;
  isPinRequired: boolean;
  setAuthenticated: (value: boolean) => void;
  verifyPin: (pin: string) => boolean;
  setPin: (pin: string) => void;
}

