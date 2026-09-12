import React, { useState, useEffect } from 'react';
import {
  ArrowUpRight,
  ArrowDownLeft,
  Mic,
  ArrowLeftRight,
  Users,
  ScanLine,
  Landmark,
  HandCoins,
  Target,
  Calendar,
  RefreshCw,
  BellRing,
  LayoutDashboard,
  TrendingUp,
  BarChart3,
  Wallet,
  Receipt,
  ShieldCheck,
  CheckSquare,
  Settings as SettingsIcon,
} from 'lucide-react';

export interface QuickActionDefinition {
  id: string;
  label: string;
  shortLabel: string;
  description: string;
  category: 'create' | 'tools' | 'navigation';
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  colorClass: string;
  roles?: string[];
  requiresVoice?: boolean;
}

export const ALL_QUICK_ACTIONS: QuickActionDefinition[] = [
  // ─── Row 1: Cashflow & AI ──────────────────────────────────────────────────
  {
    id: 'add-expense',
    label: 'Add Expense',
    shortLabel: 'Expense',
    description: 'Log purchase',
    category: 'create',
    icon: ArrowUpRight,
    colorClass: 'bg-gradient-to-tr from-rose-500 to-red-600 text-white shadow-xs shadow-rose-500/25',
  },
  {
    id: 'add-income',
    label: 'Add Income',
    shortLabel: 'Income',
    description: 'Record earnings',
    category: 'create',
    icon: ArrowDownLeft,
    colorClass: 'bg-gradient-to-tr from-emerald-500 to-teal-600 text-white shadow-xs shadow-emerald-500/25',
  },
  {
    id: 'voice-input',
    label: 'Voice AI Logger',
    shortLabel: 'Voice AI',
    description: 'Speak to log',
    category: 'create',
    icon: Mic,
    colorClass: 'bg-gradient-to-tr from-indigo-500 to-purple-600 text-white shadow-xs shadow-indigo-500/25',
    requiresVoice: true,
  },

  // ─── Row 2: Movement & Bills ──────────────────────────────────────────────
  {
    id: 'transfer',
    label: 'Transfer Money',
    shortLabel: 'Transfer',
    description: 'Move funds',
    category: 'create',
    icon: ArrowLeftRight,
    colorClass: 'bg-gradient-to-tr from-blue-500 to-cyan-600 text-white shadow-xs shadow-blue-500/25',
  },
  {
    id: 'split-bill',
    label: 'Split Bill',
    shortLabel: 'Split Bill',
    description: 'Group expense',
    category: 'create',
    icon: Users,
    colorClass: 'bg-gradient-to-tr from-purple-500 to-indigo-600 text-white shadow-xs shadow-purple-500/25',
  },
  {
    id: 'receipt-scanner',
    label: 'Scan Receipt',
    shortLabel: 'Scan OCR',
    description: 'Camera scanner',
    category: 'create',
    icon: ScanLine,
    colorClass: 'bg-gradient-to-tr from-amber-500 to-orange-600 text-white shadow-xs shadow-amber-500/25',
  },

  // ─── Row 3: Accounts, Debt & Goals ────────────────────────────────────────
  {
    id: 'add-account',
    label: 'Link Account',
    shortLabel: 'New Account',
    description: 'Bank or card',
    category: 'create',
    icon: Landmark,
    colorClass: 'bg-gradient-to-tr from-teal-500 to-emerald-600 text-white shadow-xs shadow-teal-500/25',
  },
  {
    id: 'add-loan',
    label: 'Add Loan',
    shortLabel: 'Add Loan',
    description: 'Borrow or lend',
    category: 'create',
    icon: HandCoins,
    colorClass: 'bg-gradient-to-tr from-orange-500 to-amber-600 text-white shadow-xs shadow-orange-500/25',
  },
  {
    id: 'add-goal',
    label: 'Create Goal',
    shortLabel: 'New Goal',
    description: 'Savings target',
    category: 'create',
    icon: Target,
    colorClass: 'bg-gradient-to-tr from-cyan-500 to-blue-600 text-white shadow-xs shadow-cyan-500/25',
  },

  // ─── Row 4: Tools & Planning ──────────────────────────────────────────────
  {
    id: 'calendar',
    label: 'Financial Calendar',
    shortLabel: 'Calendar',
    description: 'Bills timeline',
    category: 'tools',
    icon: Calendar,
    colorClass: 'bg-gradient-to-tr from-sky-500 to-blue-600 text-white shadow-xs shadow-sky-500/25',
  },
  {
    id: 'recurring-transactions',
    label: 'Recurring & Bills',
    shortLabel: 'Recurring',
    description: 'Subscriptions',
    category: 'tools',
    icon: RefreshCw,
    colorClass: 'bg-gradient-to-tr from-violet-500 to-purple-600 text-white shadow-xs shadow-violet-500/25',
  },
  {
    id: 'budget-alerts',
    label: 'Budget Alerts',
    shortLabel: 'Alerts',
    description: 'Spending caps',
    category: 'tools',
    icon: BellRing,
    colorClass: 'bg-gradient-to-tr from-pink-500 to-rose-600 text-white shadow-xs shadow-pink-500/25',
  },

  // ─── Row 5: Core Intelligence ─────────────────────────────────────────────
  {
    id: 'dashboard',
    label: 'Dashboard',
    shortLabel: 'Dashboard',
    description: 'Net worth & stats',
    category: 'navigation',
    icon: LayoutDashboard,
    colorClass: 'bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-xs shadow-blue-500/25',
  },
  {
    id: 'investments',
    label: 'Investments',
    shortLabel: 'Invest',
    description: 'Stocks & mutual',
    category: 'navigation',
    icon: TrendingUp,
    colorClass: 'bg-gradient-to-tr from-emerald-600 to-teal-600 text-white shadow-xs shadow-emerald-500/25',
  },
  {
    id: 'reports',
    label: 'Reports',
    shortLabel: 'Reports',
    description: 'Visual analytics',
    category: 'navigation',
    icon: BarChart3,
    colorClass: 'bg-gradient-to-tr from-indigo-600 to-purple-600 text-white shadow-xs shadow-indigo-500/25',
  },

  // ─── Additional available shortcuts in Settings ───────────────────────────
  {
    id: 'accounts',
    label: 'Accounts',
    shortLabel: 'Accounts',
    description: 'Banks & cards',
    category: 'navigation',
    icon: Wallet,
    colorClass: 'bg-gradient-to-tr from-teal-600 to-cyan-600 text-white shadow-xs shadow-teal-500/25',
  },
  {
    id: 'transactions',
    label: 'Transactions',
    shortLabel: 'Ledger',
    description: 'Full history',
    category: 'navigation',
    icon: Receipt,
    colorClass: 'bg-gradient-to-tr from-sky-600 to-blue-600 text-white shadow-xs shadow-sky-500/25',
  },
  {
    id: 'groups',
    label: 'Group Expenses',
    shortLabel: 'Groups',
    description: 'Shared balances',
    category: 'navigation',
    icon: Users,
    colorClass: 'bg-gradient-to-tr from-purple-600 to-fuchsia-600 text-white shadow-xs shadow-purple-500/25',
  },
  {
    id: 'book-advisor',
    label: 'Book Advisor',
    shortLabel: 'Advisor',
    description: 'Wealth expert',
    category: 'tools',
    icon: ShieldCheck,
    colorClass: 'bg-gradient-to-tr from-emerald-500 to-cyan-600 text-white shadow-xs shadow-emerald-500/25',
    roles: ['admin', 'user'],
  },
  {
    id: 'todo-lists',
    label: 'Todo Lists',
    shortLabel: 'Todos',
    description: 'Checklists',
    category: 'navigation',
    icon: CheckSquare,
    colorClass: 'bg-gradient-to-tr from-teal-500 to-blue-600 text-white shadow-xs shadow-teal-500/25',
  },
  {
    id: 'settings',
    label: 'Settings',
    shortLabel: 'Settings',
    description: 'Preferences & PIN',
    category: 'navigation',
    icon: SettingsIcon,
    colorClass: 'bg-gradient-to-tr from-slate-600 to-slate-800 text-white shadow-xs shadow-slate-600/25',
  },
];

// Exact 15 default items for 3 columns × 5 rows
export const DEFAULT_QUICK_ACTION_IDS: string[] = [
  'add-expense',
  'add-income',
  'voice-input',
  'transfer',
  'split-bill',
  'receipt-scanner',
  'add-account',
  'add-loan',
  'add-goal',
  'calendar',
  'recurring-transactions',
  'budget-alerts',
  'dashboard',
  'investments',
  'reports',
];

const STORAGE_KEY = 'KANAKU_QUICK_ACTION_ITEMS';
const EVENT_KEY = 'KANAKU_QUICK_ACTIONS_UPDATED';

export function getQuickActionPreferences(): string[] {
  if (typeof window === 'undefined') return DEFAULT_QUICK_ACTION_IDS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.slice(0, 15);
      }
    }
  } catch {
    // Fall back to default
  }
  return DEFAULT_QUICK_ACTION_IDS;
}

/**
 * Called on first login / app load to seed defaults into localStorage for new
 * users. Existing users who have already customised their preferences are
 * unaffected because we only write when the storage key is absent.
 */
export function initializeDefaultQuickActions(): void {
  if (typeof window === 'undefined') return;
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (!existing) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_QUICK_ACTION_IDS));
    }
  } catch {
    // Non-fatal — in-memory default will still be used
  }
}

export function setQuickActionPreferences(ids: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    window.dispatchEvent(new Event(EVENT_KEY));
  } catch (err) {
    console.error('Failed to save quick action preferences:', err);
  }
}

export function resetToDefaultQuickActions(): string[] {
  setQuickActionPreferences(DEFAULT_QUICK_ACTION_IDS);
  return DEFAULT_QUICK_ACTION_IDS;
}

export function useQuickActionPreferences(): [string[], (ids: string[]) => void] {
  const [selectedIds, setSelectedIds] = useState<string[]>(() => getQuickActionPreferences());

  useEffect(() => {
    const handleUpdate = () => {
      setSelectedIds(getQuickActionPreferences());
    };
    window.addEventListener(EVENT_KEY, handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener(EVENT_KEY, handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  const save = (newIds: string[]) => {
    setQuickActionPreferences(newIds);
    setSelectedIds(newIds);
  };

  return [selectedIds, save];
}

export function executeQuickAction(
  action: string,
  setCurrentPage: (page: string) => void,
  incrementQuickActionKey?: () => void
): void {
  switch (action) {
    case 'add-expense':
      try {
        localStorage.setItem('quickFormType', 'expense');
        localStorage.setItem('quickExpenseMode', 'individual');
        localStorage.setItem('quickBackPage', 'transactions');
      } catch {}
      setCurrentPage('add-transaction');
      incrementQuickActionKey?.();
      break;
    case 'add-income':
      try {
        localStorage.setItem('quickFormType', 'income');
        localStorage.removeItem('quickExpenseMode');
        localStorage.setItem('quickBackPage', 'transactions');
      } catch {}
      setCurrentPage('add-transaction');
      incrementQuickActionKey?.();
      break;
    case 'pay-emi':
      setCurrentPage('pay-emi');
      break;
    case 'split-bill':
      try {
        localStorage.setItem('quickFormType', 'expense');
        localStorage.setItem('quickExpenseMode', 'group');
        localStorage.setItem('quickBackPage', 'groups');
      } catch {}
      setCurrentPage('add-transaction');
      incrementQuickActionKey?.();
      break;
    case 'add-loan':
    case 'loans':
      setCurrentPage('loans');
      break;
    case 'add-account':
      setCurrentPage('add-account');
      break;
    case 'add-goal':
    case 'goals':
      setCurrentPage('goals');
      break;
    case 'transfer':
      try {
        localStorage.setItem('quickFormType', 'transfer');
        localStorage.removeItem('quickExpenseMode');
        localStorage.setItem('quickBackPage', 'transactions');
      } catch {}
      setCurrentPage('add-transaction');
      incrementQuickActionKey?.();
      break;
    case 'todo-lists':
      setCurrentPage('todo-lists');
      break;
    case 'voice-entry':
    case 'voice-input':
      setCurrentPage('voice-input');
      break;
    case 'calendar':
      setCurrentPage('calendar');
      break;
    case 'dashboard':
      setCurrentPage('dashboard');
      break;
    case 'accounts':
      setCurrentPage('accounts');
      break;
    case 'transactions':
      setCurrentPage('transactions');
      break;
    case 'investments':
      setCurrentPage('investments');
      break;
    case 'groups':
      setCurrentPage('groups');
      break;
    case 'reports':
      setCurrentPage('reports');
      break;
    case 'book-advisor':
      setCurrentPage('book-advisor');
      break;
    case 'receipt-scanner':
      setCurrentPage('receipt-scanner');
      break;
    case 'notifications':
      setCurrentPage('notifications');
      break;
    case 'recurring-transactions':
      setCurrentPage('recurring-transactions');
      break;
    case 'budget-alerts':
      setCurrentPage('budget-alerts');
      break;
    case 'settings':
      setCurrentPage('settings');
      break;
    default:
      setCurrentPage(action);
      break;
  }
}
