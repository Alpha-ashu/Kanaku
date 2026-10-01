import { SUB_FEATURE_DEFINITIONS, type UserRole } from '@/lib/featureFlags';

/**
 * What the admin Feature Panel can switch, per module and per role.
 *
 * DENY-BY-DEFAULT: Admin is the single source of truth. Application modules
 * start with role-appropriate access, and the admin grants or revokes the rest
 * in the panel. Structural shell features (panels, profile, settings,
 * notifications, dashboard) keep role-appropriate access so the app shell is
 * usable before anything is configured.
 *
 * Some switches cannot really be turned off, and the panel shows them locked:
 *   - personal-finance basics (CORE_FEATURE_KEYS) — neither the API nor the app
 *     lets a role toggle take away someone's own accounts and transactions;
 *   - an admin's own workspaces — the app always shows them to admins, and an
 *     admin switching off the Admin Console would lock everyone out of this panel.
 */

export const ROLES: readonly UserRole[] = ['admin', 'manager', 'advisor', 'user'];

export type RoleAccess = Record<UserRole, boolean>;

export type FeatureSection = 'workspace' | 'app';

export interface FeatureControlBase {
  name: string;
  key: string;
  description: string;
  section: FeatureSection;
  /** Roles this module means anything to. Others are not shown a switch. */
  appliesTo?: readonly UserRole[];
  /** Roles whose access cannot be switched off. */
  lockedOn?: readonly UserRole[];
  /** The module's master switch cannot be turned off. */
  masterLocked?: boolean;
}

/**
 * Mirrors CORE_PERSONAL_FINANCE_FEATURES (AppContext) and
 * CORE_PERSONAL_FINANCE_MODULES (backend featureGate): never revoked per role.
 */
export const CORE_FEATURE_KEYS: readonly string[] = ['dashboard', 'accounts', 'accountSetup', 'transactions', 'transfer'];

export const FEATURE_DEFAULT_ROLE_ACCESS: Record<string, RoleAccess> = {
  // ── Structural (shell) features — role-appropriate access maintained ──
  dashboard:              { admin: true, manager: true,  advisor: true,  user: true  },
  userProfile:            { admin: true, manager: true,  advisor: true,  user: true  },
  settings:               { admin: true, manager: true,  advisor: true,  user: true  },
  notifications:          { admin: true, manager: true,  advisor: true,  user: true  },
  adminPanel:             { admin: true, manager: false, advisor: false, user: false },
  managerPanel:           { admin: true, manager: true,  advisor: false, user: false },
  advisorPanel:           { admin: true, manager: false, advisor: true,  user: false },
  aiManagement:           { admin: true, manager: false, advisor: false, user: false },
  // ── Application features — role-appropriate baseline matching DEFAULT_MODULE_ACCESS ──
  accounts:               { admin: true, manager: true,  advisor: true,  user: true  },
  accountSetup:           { admin: true, manager: true,  advisor: true,  user: true  },
  transactions:           { admin: true, manager: true,  advisor: true,  user: true  },
  transfer:               { admin: true, manager: true,  advisor: true,  user: true  },
  loans:                  { admin: true, manager: true,  advisor: true,  user: true  },
  goals:                  { admin: true, manager: true,  advisor: true,  user: true  },
  groups:                 { admin: true, manager: true,  advisor: true,  user: true  },
  calendar:               { admin: true, manager: true,  advisor: true,  user: true  },
  reports:                { admin: true, manager: true,  advisor: true,  user: true  },
  todoLists:              { admin: true, manager: true,  advisor: true,  user: true  },
  investments:            { admin: true, manager: true,  advisor: true,  user: true  },
  vault:                  { admin: true, manager: true,  advisor: true,  user: true  },
  bookAdvisor:            { admin: true, manager: false, advisor: false, user: true  },
  payments:               { admin: true, manager: false, advisor: false, user: false },
  clientManagement:       { admin: true, manager: true,  advisor: true,  user: false },
  aiInsights:             { admin: true, manager: false, advisor: true,  user: true  },
  recurringTransactions:  { admin: true, manager: true,  advisor: true,  user: true  },
  budgetAlerts:           { admin: true, manager: true,  advisor: true,  user: true  },
  wallet:                 { admin: true, manager: false, advisor: true,  user: true  },
};

const ALL_ROLES_LOCKED = { lockedOn: ROLES };

export const FEATURES_BASE: FeatureControlBase[] = [
  // ── Staff and advisor workspaces ──────────────────────────────────────────
  {
    name: 'Admin Console & Feature Panel', key: 'adminPanel', section: 'workspace',
    description: 'Admin Console (users, approvals, audit logs) and this Feature Panel. Always on for admins, so the panel can never lock itself out.',
    appliesTo: ['admin'], lockedOn: ['admin'], masterLocked: true,
  },
  {
    name: 'Manager workspace', key: 'managerPanel', section: 'workspace',
    description: 'Advisor Verification, My Team and Payments & Wallets. Managers see finance data only with the permissions granted in Payments & Wallets → Staff.',
    appliesTo: ['admin', 'manager'], lockedOn: ['admin'],
  },
  {
    name: 'AI Management', key: 'aiManagement', section: 'workspace',
    description: 'Centralized control panel for AI models and insights.',
    appliesTo: ['admin'], lockedOn: ['admin'],
  },
  {
    name: 'Advisor Panel', key: 'advisorPanel', section: 'workspace',
    description: 'The advisor workspace: bookings, sessions, availability and posts.',
    appliesTo: ['admin', 'advisor'],
  },
  {
    name: 'Client Management', key: 'clientManagement', section: 'workspace',
    description: 'Advisors and managers manage their assigned clients.',
    appliesTo: ['admin', 'manager', 'advisor'],
  },
  // ── Application features ───────────────────────────────────────────────────
  { name: 'Dashboard', key: 'dashboard', section: 'app', description: 'Main overview with financial summary and quick actions', ...ALL_ROLES_LOCKED },
  { name: 'Accounts', key: 'accounts', section: 'app', description: 'Bank accounts, wallets, and financial account management', ...ALL_ROLES_LOCKED },
  { name: 'Account Setup', key: 'accountSetup', section: 'app', description: 'Permission to add, create, and configure new financial accounts', ...ALL_ROLES_LOCKED },
  { name: 'Transactions', key: 'transactions', section: 'app', description: 'Income and expense tracking with categorization', ...ALL_ROLES_LOCKED },
  { name: 'Transfers', key: 'transfer', section: 'app', description: 'Moving money between your own accounts', ...ALL_ROLES_LOCKED },
  { name: 'Loans & EMIs', key: 'loans', section: 'app', description: 'Loan tracking, EMI calculations, and payment schedules' },
  { name: 'Goals', key: 'goals', section: 'app', description: 'Financial goal setting and progress tracking' },
  { name: 'Group Expenses', key: 'groups', section: 'app', description: 'Split bills and manage shared expenses with friends' },
  { name: 'Investments', key: 'investments', section: 'app', description: 'Portfolio tracking for stocks, crypto, and mutual funds' },
  { name: 'Calendar', key: 'calendar', section: 'app', description: 'Visual calendar view of transactions and recurring payments' },
  { name: 'Reports', key: 'reports', section: 'app', description: 'Financial reports and analytics with charts' },
  { name: 'Todo Lists', key: 'todoLists', section: 'app', description: 'Task management and collaboration features' },
  { name: 'Vault', key: 'vault', section: 'app', description: 'Encrypted document vault for bills, IDs and statements' },
  { name: 'Book Advisor', key: 'bookAdvisor', section: 'app', description: 'Users can book financial advisors for sessions' },
  { name: 'Payments', key: 'payments', section: 'app', description: 'In-app payments for advisor sessions and subscriptions (deferred — Phase 4)' },
  { name: 'Notifications', key: 'notifications', section: 'app', description: 'Alerts for bills, budgets, and financial reminders' },
  { name: 'User Profile', key: 'userProfile', section: 'app', description: 'Personal profile and account settings' },
  { name: 'Settings', key: 'settings', section: 'app', description: 'App preferences, currency, and theme settings' },
  { name: 'AI Insights', key: 'aiInsights', section: 'app', description: 'AI-powered spending insights and recommendations' },
  { name: 'Recurring Transactions', key: 'recurringTransactions', section: 'app', description: 'Automatic recurring income and expense entries' },
  { name: 'Budget Alerts', key: 'budgetAlerts', section: 'app', description: 'Notifications when spending exceeds budget limits' },
  { name: 'Coin Wallet', key: 'wallet', section: 'app', description: 'Buy coins, pay for advisor sessions from the wallet, advisor earnings and withdrawals. Turning this on also starts charging coins for new bookings.' },
];

export const SECTION_TITLES: Record<FeatureSection, string> = {
  workspace: 'Admin, manager & advisor workspaces',
  app: 'App features',
};

/**
 * Modules that start switched OFF in the panel. Every other module defaults to
 * enabled, so without this the first save of the panel for any reason would
 * silently launch coin purchases and paid sessions.
 */
export const DEFAULT_DISABLED_MODULES = new Set(['wallet']);

const BASE_BY_KEY = new Map(FEATURES_BASE.map((f) => [f.key, f]));

export const defaultRoleAccess = (key: string): RoleAccess =>
  ({ ...(FEATURE_DEFAULT_ROLE_ACCESS[key] ?? { admin: true, manager: true, advisor: true, user: true }) });

export const appliesToRole = (key: string, role: UserRole): boolean => {
  const base = BASE_BY_KEY.get(key);
  return !base?.appliesTo || base.appliesTo.includes(role);
};

export const isRoleLocked = (key: string, role: UserRole): boolean =>
  Boolean(BASE_BY_KEY.get(key)?.lockedOn?.includes(role));

export const isMasterLocked = (key: string): boolean => Boolean(BASE_BY_KEY.get(key)?.masterLocked);

interface SwitchableChild {
  roleAccess: RoleAccess;
}

interface SwitchableFeature {
  key: string;
  enabled: boolean;
  roleAccess: RoleAccess;
  lastUpdated: Date;
  /** Sub-features (actions inside a page): Import statement, Add transaction… */
  children?: Record<string, SwitchableChild>;
}

/** Default access to one sub-feature for a role, or undefined if it has no default. */
export const defaultChildAccess = (moduleKey: string, childKey: string, role: UserRole): boolean | undefined =>
  SUB_FEATURE_DEFINITIONS[moduleKey]?.[childKey]?.roleAccess[role];

/** Sub-features of a module whose access for `role` differs from the default. */
export const childrenOffDefault = (feature: { key: string; children?: Record<string, SwitchableChild> }, role: UserRole): string[] =>
  Object.entries(feature.children ?? {})
    .filter(([childKey, child]) => {
      const wanted = defaultChildAccess(feature.key, childKey, role);
      return wanted !== undefined && child.roleAccess[role] !== wanted;
    })
    .map(([childKey]) => childKey);

/** Locked switches are saved as on, whatever an older save or a stale tab says. */
export function enforceLocks<T extends SwitchableFeature>(features: T[]): T[] {
  return features.map((f) => {
    const base = BASE_BY_KEY.get(f.key);
    if (!base?.lockedOn?.length && !base?.masterLocked) return f;
    const roleAccess = { ...f.roleAccess };
    for (const role of base.lockedOn ?? []) roleAccess[role] = true;
    return { ...f, enabled: base.masterLocked ? true : f.enabled, roleAccess };
  });
}

/**
 * Puts one role's access back to the defaults above, for every module and
 * every sub-feature inside it (Import statement, Add transaction…), and leaves
 * the other roles and each module's master switch as they are.
 */
export function restoreRoleDefaults<T extends SwitchableFeature>(features: T[], role: UserRole, now = new Date()): T[] {
  return enforceLocks(features.map((f) => {
    const wanted = defaultRoleAccess(f.key)[role];
    const offChildren = childrenOffDefault(f, role);
    if (f.roleAccess[role] === wanted && offChildren.length === 0) return f;
    const children = f.children && offChildren.length > 0
      ? Object.fromEntries(Object.entries(f.children).map(([childKey, child]) => (
        offChildren.includes(childKey)
          ? [childKey, { ...child, roleAccess: { ...child.roleAccess, [role]: defaultChildAccess(f.key, childKey, role) as boolean } }]
          : [childKey, child]
      )))
      : f.children;
    return { ...f, roleAccess: { ...f.roleAccess, [role]: wanted }, children, lastUpdated: now };
  }));
}

/** Modules a role can see right now: master switch on and the role granted. */
export const isOnForRole = (f: SwitchableFeature, role: UserRole) => f.enabled && (isRoleLocked(f.key, role) || f.roleAccess[role] === true);
