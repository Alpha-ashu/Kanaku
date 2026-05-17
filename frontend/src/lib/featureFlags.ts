export type UserRole = 'admin' | 'manager' | 'advisor' | 'user';

export type FeatureKey =
  | 'accounts'
  | 'transactions'
  | 'loans'
  | 'goals'
  | 'groups'
  | 'investments'
  | 'reports'
  | 'calendar'
  | 'todoLists'
  | 'transfer'
  | 'taxCalculator'
  | 'bookAdvisor'
  | 'adminPanel'
  | 'managerPanel'
  | 'advisorPanel'
  | 'notifications'
  | 'userProfile'
  | 'settings'
  | 'clientManagement'
  | 'aiManagement'
  | 'dashboard'
  | 'aiInsights'
  | 'dataExport'
  | 'recurringTransactions'
  | 'budgetAlerts';

export interface FeatureVisibility extends Record<FeatureKey, boolean> {
  accounts: boolean;
  transactions: boolean;
  loans: boolean;
  goals: boolean;
  groups: boolean;
  investments: boolean;
  reports: boolean;
  calendar: boolean;
  todoLists: boolean;
  transfer: boolean;
  taxCalculator: boolean;
  bookAdvisor: boolean;
  adminPanel: boolean;
  managerPanel: boolean;
  advisorPanel: boolean;
  notifications: boolean;
  userProfile: boolean;
  settings: boolean;
  clientManagement: boolean;
  aiManagement: boolean;
  dashboard: boolean;
  aiInsights: boolean;
  dataExport: boolean;
  recurringTransactions: boolean;
  budgetAlerts: boolean;
}

const DEFAULT_FEATURES: FeatureVisibility = {
  accounts: true,
  transactions: true,
  loans: true,
  goals: true,
  groups: true,
  investments: true,
  reports: true,
  calendar: true,
  todoLists: true,
  transfer: true,
  taxCalculator: true,
  bookAdvisor: true,
  adminPanel: true,
  managerPanel: true,
  advisorPanel: true,
  notifications: true,
  userProfile: true,
  settings: true,
  clientManagement: true,
  aiManagement: true,
  dashboard: true,
  aiInsights: true,
  dataExport: true,
  recurringTransactions: true,
  budgetAlerts: true,
};

export const ROLE_FEATURES: Record<UserRole, FeatureVisibility> = {
  admin: {
    accounts: true,
    transactions: true,
    loans: true,
    goals: true,
    groups: true,
    investments: true,
    reports: true,
    calendar: true,
    todoLists: true,
    transfer: true,
    taxCalculator: true,
    bookAdvisor: true,
    adminPanel: true,
    managerPanel: true,
    advisorPanel: false,
    notifications: true,
    userProfile: true,
    settings: true,
    clientManagement: true,
    aiManagement: true,
    dashboard: true,
    aiInsights: true,
    dataExport: true,
    recurringTransactions: true,
    budgetAlerts: true,
  },
  manager: {
    // Manager baseline: only their workspace features. Admin can unlock more via Feature Panel.
    accounts: true,
    transactions: true,
    loans: true,
    goals: true,
    groups: true,
    investments: true,
    reports: true,
    calendar: true,
    todoLists: true,
    transfer: true,
    taxCalculator: false,
    bookAdvisor: false,
    adminPanel: false,
    managerPanel: true,
    advisorPanel: false,
    notifications: true,
    userProfile: true,
    settings: true,
    clientManagement: true,
    aiManagement: false,
    dashboard: true,
    aiInsights: false,
    dataExport: true,
    recurringTransactions: false,
    budgetAlerts: true,
  },
  advisor: {
    // Advisor baseline: all core financial features enabled. Admin can toggle individual ones.
    accounts: true,
    transactions: true,
    loans: true,
    goals: true,
    groups: true,
    investments: true,
    reports: true,
    calendar: true,
    todoLists: true,
    transfer: true,
    taxCalculator: true,
    bookAdvisor: false, // Advisors provide sessions, they don't book themselves
    adminPanel: false,
    managerPanel: false,
    advisorPanel: true,
    notifications: true,
    userProfile: true,
    settings: true,
    clientManagement: true,
    aiManagement: false,
    dashboard: true,
    aiInsights: true,
    dataExport: true,
    recurringTransactions: true,
    budgetAlerts: true,
  },
  user: {
    // User baseline: all core features on. Client management off by default (advisor-specific).
    accounts: true,
    transactions: true,
    loans: true,
    goals: true,
    groups: true,
    investments: true,
    reports: true,
    calendar: true,
    todoLists: true,
    transfer: true,
    taxCalculator: true,
    bookAdvisor: true,
    adminPanel: false,
    managerPanel: false,
    advisorPanel: false,
    notifications: true,
    userProfile: true,
    settings: true,
    clientManagement: false,
    aiManagement: false,
    dashboard: true,
    aiInsights: true,
    dataExport: true,
    recurringTransactions: true,
    budgetAlerts: true,
  },
};

export function normalizeFeatures(
  features?: Partial<Record<FeatureKey, boolean>>,
): FeatureVisibility {
  return {
    ...DEFAULT_FEATURES,
    ...(features || {}),
  } as FeatureVisibility;
}

export function getVisibleFeaturesForRole(
  role: UserRole,
  env = 'development',
): FeatureVisibility {
  const base = ROLE_FEATURES[role] || ROLE_FEATURES.user;

  // In production, all roles have access to bookAdvisor
  return base;
}

export function mergeVisibleFeatures(
  base: FeatureVisibility,
  roleFeatures: FeatureVisibility,
): FeatureVisibility {
  const result: Partial<FeatureVisibility> = {};

  (Object.keys(base) as FeatureKey[]).forEach((key) => {
    result[key] = Boolean(base[key]) && Boolean(roleFeatures[key]);
  });

  return result as FeatureVisibility;
}

export const PAGE_TO_FEATURE_MAPPING: Record<string, FeatureKey> = {
  'dashboard': 'dashboard',
  'accounts': 'accounts',
  'transactions': 'transactions',
  'loans': 'loans',
  'goals': 'goals',
  'groups': 'groups',
  'investments': 'investments',
  'reports': 'reports',
  'calendar': 'calendar',
  'todo-lists': 'todoLists',
  'book-advisor': 'bookAdvisor',
  'admin-feature-panel': 'adminPanel',
  'advisor-panel': 'advisorPanel',
  'settings': 'settings',
  'notifications': 'notifications',
  'user-profile': 'userProfile',
  'transfer': 'transfer',
  'tax-calculator': 'taxCalculator',
  'admin-ai': 'aiManagement',
  'ai-management': 'aiManagement',
  'manager-advisor-verification': 'managerPanel',
  'advisor-verification': 'managerPanel',
  'ai-insights': 'aiInsights',
  'export-reports': 'dataExport',
  'data-export': 'dataExport',
  'recurring-transactions': 'recurringTransactions',
  'budget-alerts': 'budgetAlerts',
  'client-management': 'clientManagement',
};

export function canAccessPage(page: string, features: FeatureVisibility): boolean {
  const featureKey = PAGE_TO_FEATURE_MAPPING[page];
  if (!featureKey) return true; // If not mapped, assume public/essential
  return features[featureKey] !== false;
}
