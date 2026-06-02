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
  'admin': 'adminPanel',
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
  if (!featureKey) return true;
  return features[featureKey] !== false;
}

// ─────────────────────────────────────────────────────────────────────────────
// LEVEL 2: Sub-Feature (Child) System
// ─────────────────────────────────────────────────────────────────────────────

/** Role access map — same shape as module-level roleAccess */
export interface SubFeatureRoleAccess {
  admin: boolean;
  manager: boolean;
  advisor: boolean;
  user: boolean;
}

/** Runtime state for one child feature */
export interface SubFeatureState {
  name: string;
  key: string;
  enabled: boolean;
  roleAccess: SubFeatureRoleAccess;
}

/** All children for a module, keyed by child key */
export type ModuleSubFeatures = Record<string, SubFeatureState>;

/** Hardcoded default definitions for all modules */
export const SUB_FEATURE_DEFINITIONS: Record<string, ModuleSubFeatures> = {
  accounts: {
    importStatement: { name: 'Import Bank Statement', key: 'importStatement', enabled: true, roleAccess: { admin: true, manager: true,  advisor: true,  user: true  } },
    exportData:      { name: 'Export Data',            key: 'exportData',      enabled: true, roleAccess: { admin: true, manager: true,  advisor: true,  user: true  } },
    createAccount:   { name: 'Create Account',         key: 'createAccount',   enabled: true, roleAccess: { admin: true, manager: true,  advisor: true,  user: true  } },
    editAccount:     { name: 'Edit Account',           key: 'editAccount',     enabled: true, roleAccess: { admin: true, manager: true,  advisor: true,  user: true  } },
    deleteAccount:   { name: 'Delete Account',         key: 'deleteAccount',   enabled: true, roleAccess: { admin: true, manager: true,  advisor: false, user: false } },
    accountTransfer: { name: 'Account Transfer',       key: 'accountTransfer', enabled: true, roleAccess: { admin: true, manager: true,  advisor: true,  user: true  } },
    reconciliation:  { name: 'Reconciliation',         key: 'reconciliation',  enabled: true, roleAccess: { admin: true, manager: true,  advisor: true,  user: true  } },
  },
  transactions: {
    addTransaction:    { name: 'Add Transaction',    key: 'addTransaction',    enabled: true, roleAccess: { admin: true, manager: true,  advisor: true,  user: true  } },
    editTransaction:   { name: 'Edit Transaction',   key: 'editTransaction',   enabled: true, roleAccess: { admin: true, manager: true,  advisor: true,  user: true  } },
    deleteTransaction: { name: 'Delete Transaction', key: 'deleteTransaction', enabled: true, roleAccess: { admin: true, manager: true,  advisor: false, user: false } },
    importStatement:   { name: 'Import Statement',   key: 'importStatement',   enabled: true, roleAccess: { admin: true, manager: true,  advisor: true,  user: true  } },
    exportStatement:   { name: 'Export Statement',   key: 'exportStatement',   enabled: true, roleAccess: { admin: true, manager: true,  advisor: true,  user: true  } },
    attachBill:        { name: 'Attach Bill',        key: 'attachBill',        enabled: true, roleAccess: { admin: true, manager: true,  advisor: true,  user: true  } },
  },
  settings: {
    importThirdPartyData: { name: 'Import Third Party Financial Data', key: 'importThirdPartyData', enabled: true, roleAccess: { admin: true, manager: true, advisor: true, user: true } },
  },
  goals: {
    createGoal:  { name: 'Create Goal',  key: 'createGoal',  enabled: true, roleAccess: { admin: true, manager: true,  advisor: true,  user: true } },
    editGoal:    { name: 'Edit Goal',    key: 'editGoal',    enabled: true, roleAccess: { admin: true, manager: true,  advisor: true,  user: true } },
    deleteGoal:  { name: 'Delete Goal',  key: 'deleteGoal',  enabled: true, roleAccess: { admin: true, manager: true,  advisor: false, user: true } },
    groupGoals:  { name: 'Group Goals',  key: 'groupGoals',  enabled: true, roleAccess: { admin: true, manager: true,  advisor: true,  user: true } },
    goalSharing: { name: 'Goal Sharing', key: 'goalSharing', enabled: true, roleAccess: { admin: true, manager: false, advisor: true,  user: true } },
  },
  loans: {
    borrowMoney:    { name: 'Borrow Money',    key: 'borrowMoney',    enabled: true, roleAccess: { admin: true, manager: true,  advisor: true,  user: true } },
    lendMoney:      { name: 'Lend Money',      key: 'lendMoney',      enabled: true, roleAccess: { admin: true, manager: true,  advisor: true,  user: true } },
    emiReminder:    { name: 'EMI Reminder',    key: 'emiReminder',    enabled: true, roleAccess: { admin: true, manager: true,  advisor: true,  user: true } },
    loanSettlement: { name: 'Loan Settlement', key: 'loanSettlement', enabled: true, roleAccess: { admin: true, manager: true,  advisor: false, user: true } },
  },
  investments: {
    addInvestment:      { name: 'Add Investment',      key: 'addInvestment',      enabled: true, roleAccess: { admin: true, manager: true,  advisor: true,  user: true  } },
    portfolioAnalytics: { name: 'Portfolio Analytics', key: 'portfolioAnalytics', enabled: true, roleAccess: { admin: true, manager: true,  advisor: true,  user: true  } },
    sipTracking:        { name: 'SIP Tracking',        key: 'sipTracking',        enabled: true, roleAccess: { admin: true, manager: false, advisor: true,  user: true  } },
    groupInvestments:   { name: 'Group Investments',   key: 'groupInvestments',   enabled: true, roleAccess: { admin: true, manager: true,  advisor: true,  user: false } },
  },
  reports: {
    pdfExport:       { name: 'PDF Export',    key: 'pdfExport',       enabled: true, roleAccess: { admin: true, manager: true,  advisor: true,  user: true  } },
    excelExport:     { name: 'Excel Export',  key: 'excelExport',     enabled: true, roleAccess: { admin: true, manager: true,  advisor: true,  user: true  } },
    csvExport:       { name: 'CSV Export',    key: 'csvExport',       enabled: true, roleAccess: { admin: true, manager: true,  advisor: true,  user: true  } },
    aiInsightsReport:{ name: 'AI Insights',   key: 'aiInsightsReport',enabled: true, roleAccess: { admin: true, manager: false, advisor: true,  user: true  } },
    forecasting:     { name: 'Forecasting',   key: 'forecasting',     enabled: true, roleAccess: { admin: true, manager: true,  advisor: true,  user: false } },
  },
  bookAdvisor: {
    createBooking:    { name: 'Create Booking',    key: 'createBooking',    enabled: true,  roleAccess: { admin: true, manager: false, advisor: false, user: true  } },
    chat:             { name: 'Chat',              key: 'chat',             enabled: true,  roleAccess: { admin: true, manager: true,  advisor: true,  user: true  } },
    reviews:          { name: 'Reviews',           key: 'reviews',          enabled: true,  roleAccess: { admin: true, manager: false, advisor: false, user: true  } },
    ratings:          { name: 'Ratings',           key: 'ratings',          enabled: true,  roleAccess: { admin: true, manager: false, advisor: false, user: true  } },
    sessionRecording: { name: 'Session Recording', key: 'sessionRecording', enabled: false, roleAccess: { admin: true, manager: false, advisor: false, user: false } },
  },
  groups: {
    createGroup:   { name: 'Create Group',   key: 'createGroup',   enabled: true, roleAccess: { admin: true, manager: true,  advisor: true,  user: true } },
    editGroup:     { name: 'Edit Group',     key: 'editGroup',     enabled: true, roleAccess: { admin: true, manager: true,  advisor: true,  user: true } },
    addMember:     { name: 'Add Member',     key: 'addMember',     enabled: true, roleAccess: { admin: true, manager: true,  advisor: true,  user: true } },
    settleExpense: { name: 'Settle Expense', key: 'settleExpense', enabled: true, roleAccess: { admin: true, manager: true,  advisor: false, user: true } },
  },
  dashboard: {
    quickActions:   { name: 'Quick Actions',   key: 'quickActions',   enabled: true, roleAccess: { admin: true, manager: true,  advisor: true, user: true } },
    aiSummary:      { name: 'AI Summary',      key: 'aiSummary',      enabled: true, roleAccess: { admin: true, manager: false, advisor: true, user: true } },
    recentActivity: { name: 'Recent Activity', key: 'recentActivity', enabled: true, roleAccess: { admin: true, manager: true,  advisor: true, user: true } },
  },
  notifications: {
    pushNotifications:  { name: 'Push Notifications',   key: 'pushNotifications',  enabled: true, roleAccess: { admin: true, manager: true, advisor: true, user: true } },
    emailNotifications: { name: 'Email Notifications',  key: 'emailNotifications', enabled: true, roleAccess: { admin: true, manager: true, advisor: true, user: true } },
    inAppNotifications: { name: 'In-App Notifications', key: 'inAppNotifications', enabled: true, roleAccess: { admin: true, manager: true, advisor: true, user: true } },
  },
};

/** Returns hardcoded default sub-features for a module */
export function getSubFeatureDefaults(moduleKey: string): ModuleSubFeatures {
  return SUB_FEATURE_DEFINITIONS[moduleKey] ?? {};
}

/**
 * Resolves whether a specific sub-feature is accessible for the current role.
 * Resolution: moduleEnabled(role) && child.enabled && child.roleAccess[role]
 */
export function isSubFeatureEnabled(
  moduleKey: string,
  childKey: string,
  role: UserRole,
  savedSettings?: Record<string, any> | null,
): boolean {
  // Step 1: check if parent module is enabled for this role
  if (savedSettings) {
    const mod = savedSettings[moduleKey];
    if (mod) {
      if (typeof mod.enabled === 'boolean' && !mod.enabled) return false;
      const r = mod.readiness;
      if (r === 'deprecated') return false;
      if (r === 'unreleased' && role !== 'admin') return false;
      if (mod.roleAccess && typeof mod.roleAccess[role] === 'boolean') {
        if (!mod.roleAccess[role]) return false;
      }
    }
  }

  // Step 2: look up the child definition
  const moduleDefs = SUB_FEATURE_DEFINITIONS[moduleKey];
  if (!moduleDefs) return true;
  const childDef = moduleDefs[childKey];
  if (!childDef) return true;

  // Step 3: overlay saved child settings
  let childEnabled = childDef.enabled;
  let childRoleAccess = { ...childDef.roleAccess };

  if (savedSettings) {
    const saved = savedSettings[moduleKey]?.children?.[childKey];
    if (saved) {
      if (typeof saved.enabled === 'boolean') childEnabled = saved.enabled;
      if (saved.roleAccess) childRoleAccess = { ...childRoleAccess, ...saved.roleAccess };
    }
  }

  return childEnabled && (childRoleAccess[role] ?? true);
}

/**
 * Computes the full sub-feature visibility map for a role.
 * Returns: { accounts: { deleteAccount: false, ... }, goals: { createGoal: true, ... }, ... }
 */
export function computeSubFeatureMap(
  role: UserRole,
  savedSettings?: Record<string, any> | null,
): Record<string, Record<string, boolean>> {
  const result: Record<string, Record<string, boolean>> = {};
  for (const moduleKey of Object.keys(SUB_FEATURE_DEFINITIONS)) {
    result[moduleKey] = {};
    for (const childKey of Object.keys(SUB_FEATURE_DEFINITIONS[moduleKey])) {
      result[moduleKey][childKey] = isSubFeatureEnabled(moduleKey, childKey, role, savedSettings);
    }
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// LEVEL 3: AI Feature (Capability) Management System
// ─────────────────────────────────────────────────────────────────────────────

export type AIModuleKey = 'ocrEngine' | 'voiceAssistant' | 'aiAutomation';

export interface AICapabilityDef {
  name: string;
  key: string;
  enabled: boolean;
  roleAccess: Record<UserRole, boolean>;
}

export interface AIModuleDef {
  name: string;
  key: AIModuleKey;
  enabled: boolean;
  capabilities: Record<string, AICapabilityDef>;
  roleAccess: Record<UserRole, boolean>;
}

export const AI_MODULE_DEFINITIONS: Record<AIModuleKey, AIModuleDef> = {
  ocrEngine: {
    name: 'OCR Engine',
    key: 'ocrEngine',
    enabled: true,
    roleAccess: { admin: true, manager: true, advisor: true, user: true },
    capabilities: {
      transactionOCR:   { name: 'Transaction OCR',    key: 'transactionOCR',   enabled: true, roleAccess: { admin: true, manager: true, advisor: true, user: true } },
      expenseOCR:       { name: 'Expense OCR',        key: 'expenseOCR',       enabled: true, roleAccess: { admin: true, manager: true, advisor: true, user: true } },
      incomeOCR:        { name: 'Income OCR',         key: 'incomeOCR',        enabled: true, roleAccess: { admin: true, manager: true, advisor: true, user: true } },
      goalOCR:          { name: 'Goal OCR',           key: 'goalOCR',          enabled: true, roleAccess: { admin: true, manager: true, advisor: true, user: true } },
      investmentOCR:    { name: 'Investment OCR',     key: 'investmentOCR',    enabled: true, roleAccess: { admin: true, manager: true, advisor: true, user: true } },
      loanOCR:          { name: 'Loan OCR',           key: 'loanOCR',          enabled: true, roleAccess: { admin: true, manager: true, advisor: true, user: true } },
      bankStatementOCR: { name: 'Bank Statement OCR', key: 'bankStatementOCR', enabled: true, roleAccess: { admin: true, manager: true, advisor: true, user: true } },
    },
  },
  voiceAssistant: {
    name: 'Voice Assistant',
    key: 'voiceAssistant',
    enabled: true,
    roleAccess: { admin: true, manager: true, advisor: true, user: true },
    capabilities: {
      voiceLogging: { name: 'Voice Expense Logging', key: 'voiceLogging', enabled: true, roleAccess: { admin: true, manager: true, advisor: true, user: true } },
      voiceQueries: { name: 'Natural Language Queries', key: 'voiceQueries', enabled: true, roleAccess: { admin: true, manager: true, advisor: true, user: true } },
      intentClassification: { name: 'Intent Classification', key: 'intentClassification', enabled: true, roleAccess: { admin: true, manager: true, advisor: true, user: true } },
    },
  },
  aiAutomation: {
    name: 'AI Automation',
    key: 'aiAutomation',
    enabled: true,
    roleAccess: { admin: true, manager: true, advisor: true, user: true },
    capabilities: {
      smartCategorization: { name: 'Smart Categorization', key: 'smartCategorization', enabled: true, roleAccess: { admin: true, manager: true, advisor: true, user: true } },
      subscriptionDetection: { name: 'Recurring Subscription Detection', key: 'subscriptionDetection', enabled: true, roleAccess: { admin: true, manager: true, advisor: true, user: true } },
      healthScoring: { name: 'Financial Health Scoring', key: 'healthScoring', enabled: true, roleAccess: { admin: true, manager: true, advisor: true, user: true } },
      anomalyDetection: { name: 'Fraud/Anomaly Detection', key: 'anomalyDetection', enabled: true, roleAccess: { admin: true, manager: true, advisor: true, user: true } },
    },
  },
};

/**
 * Resolves whether a specific AI capability is enabled.
 */
export function isAICapabilityEnabled(
  moduleKey: AIModuleKey,
  capabilityKey: string,
  role: UserRole,
  savedSettings?: Record<string, any> | null,
): boolean {
  const defaultDef = AI_MODULE_DEFINITIONS[moduleKey];
  let moduleEnabled = defaultDef ? defaultDef.enabled : true;
  let moduleRoleAccess = defaultDef ? { ...defaultDef.roleAccess } : { admin: true, manager: true, advisor: true, user: true };

  if (savedSettings && savedSettings[moduleKey]) {
    const savedMod = savedSettings[moduleKey];
    if (typeof savedMod.enabled === 'boolean') moduleEnabled = savedMod.enabled;
    if (savedMod.roleAccess) moduleRoleAccess = { ...moduleRoleAccess, ...savedMod.roleAccess };
  }

  if (!moduleEnabled) return false;
  if (!moduleRoleAccess[role]) return false;

  const defaultCap = defaultDef?.capabilities?.[capabilityKey];
  let capabilityEnabled = defaultCap ? defaultCap.enabled : true;
  let capabilityRoleAccess = defaultCap ? { ...defaultCap.roleAccess } : { admin: true, manager: true, advisor: true, user: true };

  if (savedSettings && savedSettings[moduleKey]?.capabilities?.[capabilityKey]) {
    const savedCap = savedSettings[moduleKey].capabilities[capabilityKey];
    if (typeof savedCap.enabled === 'boolean') capabilityEnabled = savedCap.enabled;
    if (savedCap.roleAccess) capabilityRoleAccess = { ...capabilityRoleAccess, ...savedCap.roleAccess };
  }

  return capabilityEnabled && capabilityRoleAccess[role];
}

/**
 * Computes the full AI capability visibility map for a role.
 */
export function computeAICapabilityMap(
  role: UserRole,
  savedSettings?: Record<string, any> | null,
): Record<string, Record<string, boolean>> {
  const result: Record<string, Record<string, boolean>> = {};
  for (const moduleKey of Object.keys(AI_MODULE_DEFINITIONS) as AIModuleKey[]) {
    result[moduleKey] = {};
    
    const defaultDef = AI_MODULE_DEFINITIONS[moduleKey];
    let moduleEnabled = defaultDef ? defaultDef.enabled : true;
    let moduleRoleAccess = defaultDef ? { ...defaultDef.roleAccess } : { admin: true, manager: true, advisor: true, user: true };

    if (savedSettings && savedSettings[moduleKey]) {
      const savedMod = savedSettings[moduleKey];
      if (typeof savedMod.enabled === 'boolean') moduleEnabled = savedMod.enabled;
      if (savedMod.roleAccess) moduleRoleAccess = { ...moduleRoleAccess, ...savedMod.roleAccess };
    }

    const isMasterEnabled = moduleEnabled && moduleRoleAccess[role];
    result[moduleKey]['enabled'] = isMasterEnabled;
    
    for (const capabilityKey of Object.keys(defaultDef.capabilities)) {
      result[moduleKey][capabilityKey] = isMasterEnabled && isAICapabilityEnabled(moduleKey, capabilityKey, role, savedSettings);
    }
  }
  return result;
}

