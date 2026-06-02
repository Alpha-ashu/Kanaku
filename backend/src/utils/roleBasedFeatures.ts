/**
 * Role-Based Feature Access Control
 * Mirrors frontend featureFlags.ts but for strict backend enforcement
 * Ensures no feature is accessible by a role unless explicitly defined
 */

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

export interface FeatureVisibility extends Record<FeatureKey, boolean> {}

/**
 * STRICT role-based feature access matrix.
 * Only explicitly true features are accessible to each role.
 * No feature should be visible to other roles unless defined here.
 */
export const ROLE_FEATURES: Record<UserRole, Partial<Record<FeatureKey, boolean>>> = {
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
    bookAdvisor: false,
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

/**
 * Sub-feature role access matrix
 * Defines which sub-features are accessible to which roles
 */
export interface SubFeatureRoleAccess {
  admin: boolean;
  manager: boolean;
  advisor: boolean;
  user: boolean;
}

export interface SubFeature {
  name: string;
  key: string;
  enabled: boolean;
  roleAccess: SubFeatureRoleAccess;
}

/**
 * Comprehensive sub-feature definitions with role-based access
 */
export const SUB_FEATURES: Record<string, Record<string, SubFeature>> = {
  accounts: {
    importStatement: {
      name: 'Import Bank Statement',
      key: 'importStatement',
      enabled: true,
      roleAccess: { admin: true, manager: true, advisor: true, user: true },
    },
    exportData: {
      name: 'Export Data',
      key: 'exportData',
      enabled: true,
      roleAccess: { admin: true, manager: true, advisor: true, user: true },
    },
    createAccount: {
      name: 'Create Account',
      key: 'createAccount',
      enabled: true,
      roleAccess: { admin: true, manager: true, advisor: true, user: true },
    },
    editAccount: {
      name: 'Edit Account',
      key: 'editAccount',
      enabled: true,
      roleAccess: { admin: true, manager: true, advisor: true, user: true },
    },
    deleteAccount: {
      name: 'Delete Account',
      key: 'deleteAccount',
      enabled: true,
      roleAccess: { admin: true, manager: true, advisor: false, user: false },
    },
    accountTransfer: {
      name: 'Account Transfer',
      key: 'accountTransfer',
      enabled: true,
      roleAccess: { admin: true, manager: true, advisor: true, user: true },
    },
    reconciliation: {
      name: 'Reconciliation',
      key: 'reconciliation',
      enabled: true,
      roleAccess: { admin: true, manager: true, advisor: true, user: true },
    },
  },
  transactions: {
    addTransaction: {
      name: 'Add Transaction',
      key: 'addTransaction',
      enabled: true,
      roleAccess: { admin: true, manager: true, advisor: true, user: true },
    },
    editTransaction: {
      name: 'Edit Transaction',
      key: 'editTransaction',
      enabled: true,
      roleAccess: { admin: true, manager: true, advisor: true, user: true },
    },
    deleteTransaction: {
      name: 'Delete Transaction',
      key: 'deleteTransaction',
      enabled: true,
      roleAccess: { admin: true, manager: true, advisor: false, user: false },
    },
    importStatement: {
      name: 'Import Statement',
      key: 'importStatement',
      enabled: true,
      roleAccess: { admin: true, manager: true, advisor: true, user: true },
    },
    exportStatement: {
      name: 'Export Statement',
      key: 'exportStatement',
      enabled: true,
      roleAccess: { admin: true, manager: true, advisor: true, user: true },
    },
    attachBill: {
      name: 'Attach Bill',
      key: 'attachBill',
      enabled: true,
      roleAccess: { admin: true, manager: true, advisor: true, user: true },
    },
    importThirdPartyData: {
      name: 'Import Third Party Financial Data',
      key: 'importThirdPartyData',
      enabled: true,
      roleAccess: { admin: true, manager: true, advisor: true, user: true },
    },
  },
  goals: {
    createGoal: {
      name: 'Create Goal',
      key: 'createGoal',
      enabled: true,
      roleAccess: { admin: true, manager: true, advisor: true, user: true },
    },
    editGoal: {
      name: 'Edit Goal',
      key: 'editGoal',
      enabled: true,
      roleAccess: { admin: true, manager: true, advisor: true, user: true },
    },
    deleteGoal: {
      name: 'Delete Goal',
      key: 'deleteGoal',
      enabled: true,
      roleAccess: { admin: true, manager: true, advisor: false, user: true },
    },
    groupGoals: {
      name: 'Group Goals',
      key: 'groupGoals',
      enabled: true,
      roleAccess: { admin: true, manager: true, advisor: true, user: true },
    },
    goalSharing: {
      name: 'Goal Sharing',
      key: 'goalSharing',
      enabled: true,
      roleAccess: { admin: true, manager: false, advisor: true, user: true },
    },
  },
  loans: {
    borrowMoney: {
      name: 'Borrow Money',
      key: 'borrowMoney',
      enabled: true,
      roleAccess: { admin: true, manager: true, advisor: true, user: true },
    },
    lendMoney: {
      name: 'Lend Money',
      key: 'lendMoney',
      enabled: true,
      roleAccess: { admin: true, manager: true, advisor: true, user: true },
    },
    emiReminder: {
      name: 'EMI Reminder',
      key: 'emiReminder',
      enabled: true,
      roleAccess: { admin: true, manager: true, advisor: true, user: true },
    },
    loanSettlement: {
      name: 'Loan Settlement',
      key: 'loanSettlement',
      enabled: true,
      roleAccess: { admin: true, manager: true, advisor: false, user: true },
    },
  },
  investments: {
    addInvestment: {
      name: 'Add Investment',
      key: 'addInvestment',
      enabled: true,
      roleAccess: { admin: true, manager: true, advisor: true, user: true },
    },
    portfolioAnalytics: {
      name: 'Portfolio Analytics',
      key: 'portfolioAnalytics',
      enabled: true,
      roleAccess: { admin: true, manager: true, advisor: true, user: true },
    },
    sipTracking: {
      name: 'SIP Tracking',
      key: 'sipTracking',
      enabled: true,
      roleAccess: { admin: true, manager: false, advisor: true, user: true },
    },
    groupInvestments: {
      name: 'Group Investments',
      key: 'groupInvestments',
      enabled: true,
      roleAccess: { admin: true, manager: true, advisor: true, user: false },
    },
  },
  reports: {
    pdfExport: {
      name: 'PDF Export',
      key: 'pdfExport',
      enabled: true,
      roleAccess: { admin: true, manager: true, advisor: true, user: true },
    },
    excelExport: {
      name: 'Excel Export',
      key: 'excelExport',
      enabled: true,
      roleAccess: { admin: true, manager: true, advisor: true, user: true },
    },
    csvExport: {
      name: 'CSV Export',
      key: 'csvExport',
      enabled: true,
      roleAccess: { admin: true, manager: true, advisor: true, user: true },
    },
    aiInsightsReport: {
      name: 'AI Insights',
      key: 'aiInsightsReport',
      enabled: true,
      roleAccess: { admin: true, manager: false, advisor: true, user: true },
    },
    forecasting: {
      name: 'Forecasting',
      key: 'forecasting',
      enabled: true,
      roleAccess: { admin: true, manager: true, advisor: true, user: false },
    },
  },
  bookAdvisor: {
    createBooking: {
      name: 'Create Booking',
      key: 'createBooking',
      enabled: true,
      roleAccess: { admin: true, manager: false, advisor: false, user: true },
    },
    chat: {
      name: 'Chat',
      key: 'chat',
      enabled: true,
      roleAccess: { admin: true, manager: true, advisor: true, user: true },
    },
    reviews: {
      name: 'Reviews',
      key: 'reviews',
      enabled: true,
      roleAccess: { admin: true, manager: false, advisor: false, user: true },
    },
  },
};

/**
 * Get visible features for a specific role
 * STRICT: Only returns features explicitly marked as true for the role
 */
export function getVisibleFeaturesForRole(
  role: UserRole,
): Record<string, boolean> {
  const roleFeatures = ROLE_FEATURES[role] || {};
  
  // Build complete feature map with strict defaults (false unless explicitly true)
  const result: Record<string, boolean> = {};
  
  // All possible features default to false
  const allFeatures: FeatureKey[] = [
    'accounts',
    'transactions',
    'loans',
    'goals',
    'groups',
    'investments',
    'reports',
    'calendar',
    'todoLists',
    'transfer',
    'taxCalculator',
    'bookAdvisor',
    'adminPanel',
    'managerPanel',
    'advisorPanel',
    'notifications',
    'userProfile',
    'settings',
    'clientManagement',
    'aiManagement',
    'dashboard',
    'aiInsights',
    'dataExport',
    'recurringTransactions',
    'budgetAlerts',
  ];
  
  allFeatures.forEach(feature => {
    result[feature] = roleFeatures[feature] === true ? true : false;
  });
  
  return result;
}

/**
 * Get accessible sub-features for a role
 * STRICT: Only returns sub-features where roleAccess[role] === true
 */
export function getAccessibleSubFeatures(
  role: UserRole,
): Record<string, Record<string, SubFeature>> {
  const result: Record<string, Record<string, SubFeature>> = {};
  
  Object.entries(SUB_FEATURES).forEach(([module, features]) => {
    const accessibleFeatures: Record<string, SubFeature> = {};
    
    Object.entries(features).forEach(([key, feature]) => {
      // STRICT: Only include if role has explicit access
      if (feature.roleAccess[role] === true) {
        accessibleFeatures[key] = feature;
      }
    });
    
    result[module] = accessibleFeatures;
  });
  
  return result;
}

/**
 * Check if a specific feature is accessible to a role
 */
export function isFeatureAccessible(
  role: UserRole,
  featureKey: FeatureKey,
): boolean {
  const roleFeatures = ROLE_FEATURES[role];
  return roleFeatures?.[featureKey] === true;
}

/**
 * Check if a specific sub-feature is accessible to a role
 */
export function isSubFeatureAccessible(
  role: UserRole,
  module: string,
  subFeatureKey: string,
): boolean {
  const moduleFeatures = SUB_FEATURES[module];
  if (!moduleFeatures) return false;
  
  const subFeature = moduleFeatures[subFeatureKey];
  if (!subFeature) return false;
  
  return subFeature.roleAccess[role] === true;
}
