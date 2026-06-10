/**
 * Application Constants
 * Centralized configuration and constant values
 */

// ==================== Colors ====================

export const COLORS = {
  primary: '#3B82F6',
  secondary: '#8B5CF6',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  info: '#3B82F6',
  
  // Account type colors
  bank: '#3B82F6',
  card: '#8B5CF6',
  cash: '#10B981',
  wallet: '#F59E0B',
  
  // Chart colors
  chart: [
    '#3B82F6',
    '#8B5CF6',
    '#10B981',
    '#F59E0B',
    '#EF4444',
    '#EC4899',
    '#14B8A6',
    '#F97316',
  ],
  
  // Status colors
  active: '#10B981',
  pending: '#F59E0B',
  overdue: '#EF4444',
  completed: '#6B7280',
};

// ==================== Account Types ====================

export const ACCOUNT_TYPES = [
  { value: 'bank', label: 'Bank Account', icon: '', color: COLORS.bank },
  { value: 'card', label: 'Credit Card', icon: '', color: COLORS.card },
  { value: 'cash', label: 'Cash', icon: '', color: COLORS.cash },
  { value: 'wallet', label: 'Digital Wallet', icon: '', color: COLORS.wallet },
];

// ==================== Transaction Categories ====================

export const EXPENSE_CATEGORIES = [
  {
    id: 'food',
    name: 'Food & Dining',
    icon: '',
    color: '#EF4444',
    subcategories: [
      'Groceries',
      'Restaurants',
      'Coffee Shops',
      'Fast Food',
      'Delivery',
    ],
  },
  {
    id: 'transport',
    name: 'Transportation',
    icon: '',
    color: '#3B82F6',
    subcategories: [
      'Fuel',
      'Public Transport',
      'Taxi/Ride-share',
      'Parking',
      'Vehicle Maintenance',
    ],
  },
  {
    id: 'shopping',
    name: 'Shopping',
    icon: '',
    color: '#8B5CF6',
    subcategories: [
      'Clothing',
      'Electronics',
      'Home & Garden',
      'Personal Care',
      'Gifts',
    ],
  },
  {
    id: 'bills',
    name: 'Bills & Utilities',
    icon: '',
    color: '#F59E0B',
    subcategories: [
      'Electricity',
      'Water',
      'Internet',
      'Phone',
      'Rent/Mortgage',
    ],
  },
  {
    id: 'health',
    name: 'Health & Fitness',
    icon: '',
    color: '#10B981',
    subcategories: [
      'Doctor',
      'Pharmacy',
      'Gym',
      'Sports',
      'Insurance',
    ],
  },
  {
    id: 'entertainment',
    name: 'Entertainment',
    icon: '',
    color: '#EC4899',
    subcategories: [
      'Movies',
      'Streaming',
      'Games',
      'Hobbies',
      'Events',
    ],
  },
  {
    id: 'education',
    name: 'Education',
    icon: '',
    color: '#14B8A6',
    subcategories: [
      'Tuition',
      'Books',
      'Courses',
      'Supplies',
      'Training',
    ],
  },
  {
    id: 'travel',
    name: 'Travel',
    icon: '',
    color: '#F97316',
    subcategories: [
      'Flights',
      'Hotels',
      'Activities',
      'Car Rental',
      'Travel Insurance',
    ],
  },
  {
    id: 'personal',
    name: 'Personal',
    icon: '',
    color: '#6366F1',
    subcategories: [
      'Clothing',
      'Haircare',
      'Beauty',
      'Accessories',
      'Other',
    ],
  },
  {
    id: 'other',
    name: 'Other',
    icon: '',
    color: '#6B7280',
    subcategories: [
      'Miscellaneous',
    ],
  },
];

export const INCOME_CATEGORIES = [
  {
    id: 'salary',
    name: 'Salary',
    icon: '',
    color: '#10B981',
  },
  {
    id: 'freelance',
    name: 'Freelance',
    icon: '',
    color: '#3B82F6',
  },
  {
    id: 'business',
    name: 'Business',
    icon: '',
    color: '#8B5CF6',
  },
  {
    id: 'investment',
    name: 'Investment',
    icon: '',
    color: '#F59E0B',
  },
  {
    id: 'rental',
    name: 'Rental Income',
    icon: '',
    color: '#EC4899',
  },
  {
    id: 'refund',
    name: 'Refund',
    icon: '',
    color: '#14B8A6',
  },
  {
    id: 'gift',
    name: 'Gift',
    icon: '',
    color: '#F97316',
  },
  {
    id: 'other',
    name: 'Other Income',
    icon: '',
    color: '#6B7280',
  },
];

// ==================== Investment Types ====================

export const INVESTMENT_TYPES = [
  { value: 'stocks', label: 'Stocks', icon: '', color: '#3B82F6' },
  { value: 'crypto', label: 'Cryptocurrency', icon: '', color: '#F7931A' },
  { value: 'gold', label: 'Gold', icon: '', color: '#FFD700' },
  { value: 'forex', label: 'Forex', icon: '', color: '#10B981' },
  { value: 'mutual_funds', label: 'Mutual Funds', icon: '', color: '#8B5CF6' },
  { value: 'bonds', label: 'Bonds', icon: '', color: '#6B7280' },
];

// ==================== Loan Types ====================

export const LOAN_TYPES = [
  { value: 'borrowed', label: 'Borrowed (I owe)', icon: '', color: '#EF4444' },
  { value: 'lent', label: 'Lent (They owe me)', icon: '', color: '#10B981' },
  { value: 'emi', label: 'EMI/Installment', icon: '', color: '#3B82F6' },
];

export const PAYMENT_FREQUENCIES = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'custom', label: 'Custom' },
];

// ==================== Time Ranges ====================

export const TIME_RANGES = [
  { value: '7d', label: 'Last 7 Days' },
  { value: '30d', label: 'Last 30 Days' },
  { value: '90d', label: 'Last 90 Days' },
  { value: '1y', label: 'Last Year' },
  { value: 'custom', label: 'Custom Range' },
];

// ==================== Currencies ====================

export const CURRENCIES = [
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: 'EUR', name: 'Euro' },
  { code: 'GBP', symbol: 'GBP', name: 'British Pound' },
  { code: 'INR', symbol: 'INR', name: 'Indian Rupee' },
  { code: 'JPY', symbol: '', name: 'Japanese Yen' },
  { code: 'CNY', symbol: '', name: 'Chinese Yuan' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
  { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar' },
];

// ==================== User Roles ====================

export const USER_ROLES = {
  USER: 'user',
  ADMIN: 'admin',
  ADVISOR: 'advisor',
};

// ==================== Priority Levels ====================

export const PRIORITY_LEVELS = [
  { value: 'low', label: 'Low', color: '#6B7280' },
  { value: 'medium', label: 'Medium', color: '#F59E0B' },
  { value: 'high', label: 'High', color: '#EF4444' },
];

// ==================== Status Options ====================

export const TRANSACTION_STATUSES = [
  { value: 'completed', label: 'Completed', color: '#10B981' },
  { value: 'pending', label: 'Pending', color: '#F59E0B' },
  { value: 'failed', label: 'Failed', color: '#EF4444' },
];

export const LOAN_STATUSES = [
  { value: 'active', label: 'Active', color: '#10B981' },
  { value: 'overdue', label: 'Overdue', color: '#EF4444' },
  { value: 'completed', label: 'Completed', color: '#6B7280' },
];

export const BOOKING_STATUSES = [
  { value: 'pending', label: 'Pending', color: '#F59E0B' },
  { value: 'confirmed', label: 'Confirmed', color: '#3B82F6' },
  { value: 'completed', label: 'Completed', color: '#10B981' },
  { value: 'cancelled', label: 'Cancelled', color: '#6B7280' },
];

// ==================== Pagination ====================

export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 20,
  PAGE_SIZE_OPTIONS: [10, 20, 50, 100],
};

// ==================== Validation ====================

export const VALIDATION = {
  PASSWORD_MIN_LENGTH: 8,
  PIN_LENGTH: 6,
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  ALLOWED_DOCUMENT_TYPES: ['application/pdf', 'image/jpeg', 'image/png'],
};

// ==================== LocalStorage Keys ====================

export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'accessToken',
  REFRESH_TOKEN: 'refreshToken',
  USER: 'user',
  THEME: 'theme',
  CURRENCY: 'currency',
  LANGUAGE: 'language',
  PIN: 'pin',
  FEATURE_FLAGS: 'featureFlags',
  LAST_SYNC: 'lastSync',
};

// ==================== API Configuration ====================

export const API_CONFIG = {
  BASE_URL: import.meta.env.VITE_API_URL || '/api/v1',
  TIMEOUT: 30000,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000,
};

// ==================== Supabase Configuration ====================

export const SUPABASE_CONFIG = {
  URL: import.meta.env.VITE_SUPABASE_URL,
  ANON_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY,
};

// ==================== App Configuration ====================

export const APP_CONFIG = {
  NAME: 'KANAKU',
  VERSION: '1.0.0',
  DESCRIPTION: 'Personal Finance Management Platform',
  SUPPORT_EMAIL: 'support@expensetracker.app',
  THEME_COLOR: '#3B82F6',
  MAX_ACCOUNTS: 10,
  MAX_GOALS: 20,
  MAX_LOANS: 50,
};

// ==================== Date Formats ====================

export const DATE_FORMATS = {
  DISPLAY: 'MMM DD, YYYY',
  FULL: 'MMMM DD, YYYY HH:mm',
  SHORT: 'MM/DD/YY',
  ISO: 'YYYY-MM-DD',
  TIME: 'HH:mm',
};

// ==================== Animation Durations ====================

export const ANIMATION = {
  DURATION: {
    FAST: 150,
    NORMAL: 300,
    SLOW: 500,
  },
  EASING: 'cubic-bezier(0.4, 0, 0.2, 1)',
};

// ==================== Breakpoints ====================

export const BREAKPOINTS = {
  XS: 480,
  SM: 640,
  MD: 768,
  LG: 1024,
  XL: 1280,
  '2XL': 1536,
};

// ==================== Chart Configuration ====================

export const CHART_CONFIG = {
  HEIGHT: 300,
  MARGIN: { top: 20, right: 30, left: 0, bottom: 0 },
  COLORS: COLORS.chart,
  ANIMATION_DURATION: 500,
};

// ==================== Feature Flags ====================

export const FEATURES = {
  VOICE_INPUT: 'voice_input',
  OCR_SCANNER: 'ocr_scanner',
  ADVISOR_BOOKING: 'advisor_booking',
  GROUP_EXPENSES: 'group_expenses',
  INVESTMENTS: 'investments',
  TAX_CALCULATOR: 'tax_calculator',
  TODO_LISTS: 'todo_lists',
  EXPORT_REPORTS: 'export_reports',
  NOTIFICATIONS: 'notifications',
  DARK_MODE: 'dark_mode',
  PIN_LOCK: 'pin_lock',
  TWO_FACTOR: 'two_factor',
};

// ==================== Quick Actions ====================

export const QUICK_ACTIONS = [
  {
    id: 'add_expense',
    label: 'Add Expense',
    icon: '',
    color: COLORS.danger,
    route: 'add-transaction',
    params: { type: 'expense' },
  },
  {
    id: 'add_income',
    label: 'Add Income',
    icon: '',
    color: COLORS.success,
    route: 'add-transaction',
    params: { type: 'income' },
  },
  {
    id: 'transfer',
    label: 'Transfer',
    icon: '',
    color: COLORS.primary,
    route: 'transfer',
  },
  {
    id: 'voice_input',
    label: 'Voice Input',
    icon: '',
    color: COLORS.secondary,
    route: 'voice-input',
  },
];

// ==================== Navigation Items ====================

export const NAVIGATION = {
  MAIN: [
    { id: 'dashboard', label: 'Dashboard', icon: 'home', route: 'dashboard' },
    { id: 'accounts', label: 'Accounts', icon: 'wallet', route: 'accounts' },
    { id: 'transactions', label: 'Transactions', icon: 'receipt', route: 'transactions' },
    { id: 'goals', label: 'Goals', icon: 'target', route: 'goals' },
    { id: 'reports', label: 'Reports', icon: 'chart', route: 'reports' },
  ],
  SECONDARY: [
    { id: 'loans', label: 'Loans & EMI', icon: 'credit-card', route: 'loans' },
    { id: 'investments', label: 'Investments', icon: 'trending-up', route: 'investments' },
    { id: 'groups', label: 'Group Expenses', icon: 'users', route: 'groups' },
    { id: 'calendar', label: 'Calendar', icon: 'calendar', route: 'calendar' },
  ],
  UTILITY: [
    { id: 'settings', label: 'Settings', icon: 'settings', route: 'settings' },
    { id: 'help', label: 'Help & Support', icon: 'help-circle', route: 'help' },
  ],
};

// ==================== Export All ====================

export default {
  COLORS,
  ACCOUNT_TYPES,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  INVESTMENT_TYPES,
  LOAN_TYPES,
  PAYMENT_FREQUENCIES,
  TIME_RANGES,
  CURRENCIES,
  USER_ROLES,
  PRIORITY_LEVELS,
  TRANSACTION_STATUSES,
  LOAN_STATUSES,
  BOOKING_STATUSES,
  PAGINATION,
  VALIDATION,
  STORAGE_KEYS,
  API_CONFIG,
  SUPABASE_CONFIG,
  APP_CONFIG,
  DATE_FORMATS,
  ANIMATION,
  BREAKPOINTS,
  CHART_CONFIG,
  FEATURES,
  QUICK_ACTIONS,
  NAVIGATION,
};

