import {
  LayoutDashboard,
  Wallet,
  Receipt,
  CreditCard,
  Target,
  Users,
  TrendingUp,
  BarChart3,
  Settings,
  Calendar,
  Bell,
  User,
  CheckSquare,
  BookOpen,
  ShieldCheck,
  ShieldAlert,
  Brain,
  Calculator,
  Sparkles,
  Download,
  RefreshCw,
  BellRing,
  FolderKanban,
} from 'lucide-react';

export type UserRole = 'admin' | 'manager' | 'advisor' | 'user';

export interface NavigationItem {
  id: string;
  label: string;
  icon: any;
  feature: string; // RBAC feature name to check
  roles?: UserRole[]; // If undefined, accessible by all. If defined, only these roles can see it
}

export const headerMenuItems: NavigationItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, feature: 'dashboard' },
  { id: 'accounts', label: 'Accounts', icon: Wallet, feature: 'accounts' },
  { id: 'transactions', label: 'Transactions', icon: Receipt, feature: 'transactions' },
  { id: 'loans', label: 'Loans & EMIs', icon: CreditCard, feature: 'loans' },
  { id: 'goals', label: 'Goals', icon: Target, feature: 'goals' },
  { id: 'groups', label: 'Group Expenses', icon: Users, feature: 'groups' },
  { id: 'investments', label: 'Investments', icon: TrendingUp, feature: 'investments' },
  { id: 'calendar', label: 'Calendar', icon: Calendar, feature: 'calendar' },
  { id: 'reports', label: 'Reports', icon: BarChart3, feature: 'reports' },
  { id: 'todo-lists', label: 'Todo Lists', icon: CheckSquare, feature: 'todoLists' },
  { id: 'book-advisor', label: 'Book Advisor', icon: BookOpen, feature: 'bookAdvisor' },
  { id: 'notifications', label: 'Notifications', icon: Bell, feature: 'notifications' },
  { id: 'user-profile', label: 'Profile', icon: User, feature: 'userProfile' },
  { id: 'settings', label: 'Settings', icon: Settings, feature: 'settings' },
  // Advanced features
  { id: 'tax-calculator', label: 'Tax Calculator', icon: Calculator, feature: 'taxCalculator' },
  { id: 'ai-insights', label: 'AI Insights', icon: Sparkles, feature: 'aiInsights' },
  { id: 'data-export', label: 'Data Export', icon: Download, feature: 'dataExport' },
  { id: 'recurring-transactions', label: 'Recurring', icon: RefreshCw, feature: 'recurringTransactions' },
  { id: 'budget-alerts', label: 'Budget Alerts', icon: BellRing, feature: 'budgetAlerts' },
  { id: 'client-management', label: 'Client Management', icon: FolderKanban, feature: 'clientManagement', roles: ['admin', 'manager', 'advisor'] },
  // Admin/Manager items
  { id: 'admin', label: 'Admin Console', icon: ShieldAlert, feature: 'adminPanel', roles: ['admin'] },
  { id: 'admin-feature-panel', label: 'Feature Panel', icon: Settings, feature: 'adminPanel', roles: ['admin'] },
  { id: 'ai-management', label: 'AI Management', icon: Brain, feature: 'aiManagement', roles: ['admin'] },
  { id: 'advisor-verification', label: 'Advisor Verification', icon: ShieldCheck, feature: 'managerPanel', roles: ['admin', 'manager'] },
];

export const sidebarMenuItems: NavigationItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, feature: 'dashboard' },
  { id: 'accounts', label: 'Accounts', icon: Wallet, feature: 'accounts' },
  { id: 'transactions', label: 'Transactions', icon: Receipt, feature: 'transactions' },
  { id: 'calendar', label: 'Calendar', icon: Calendar, feature: 'calendar' },
  { id: 'investments', label: 'Investments', icon: TrendingUp, feature: 'investments' },
  { id: 'loans', label: 'Loans', icon: CreditCard, feature: 'loans' },
  { id: 'goals', label: 'Goals', icon: Target, feature: 'goals' },
  { id: 'groups', label: 'Group Expenses', icon: Users, feature: 'groups' },
  { id: 'reports', label: 'Reports', icon: BarChart3, feature: 'reports' },
  { id: 'todo-lists', label: 'Todo Lists', icon: CheckSquare, feature: 'todoLists' },
  { id: 'book-advisor', label: 'Book Advisor', icon: BookOpen, feature: 'bookAdvisor' },
  // Advanced features — visible when enabled by admin
  { id: 'tax-calculator', label: 'Tax Calculator', icon: Calculator, feature: 'taxCalculator' },
  { id: 'ai-insights', label: 'AI Insights', icon: Sparkles, feature: 'aiInsights' },
  { id: 'data-export', label: 'Data Export', icon: Download, feature: 'dataExport' },
  { id: 'recurring-transactions', label: 'Recurring', icon: RefreshCw, feature: 'recurringTransactions' },
  { id: 'budget-alerts', label: 'Budget Alerts', icon: BellRing, feature: 'budgetAlerts' },
  { id: 'client-management', label: 'Clients', icon: FolderKanban, feature: 'clientManagement', roles: ['admin', 'manager', 'advisor'] },
  { id: 'settings', label: 'Settings', icon: Settings, feature: 'settings' },
  // Admin-only items
  { id: 'admin', label: 'Admin Console', icon: ShieldAlert, feature: 'adminPanel', roles: ['admin'] },
  { id: 'admin-feature-panel', label: 'Feature Panel', icon: Settings, feature: 'adminPanel', roles: ['admin'] },
  { id: 'ai-management', label: 'AI Management', icon: Brain, feature: 'aiManagement', roles: ['admin'] },
  // Manager-only items
  { id: 'advisor-verification', label: 'Advisor Verification', icon: ShieldCheck, feature: 'managerPanel', roles: ['manager', 'admin'] },
  // Advisor-only items
  { id: 'advisor-panel', label: 'Advisor Panel', icon: Users, feature: 'advisorPanel', roles: ['advisor'] },
];

