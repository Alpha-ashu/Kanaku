import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Wallet,
  Receipt,
  Sparkles,
  Users,
  TrendingUp,
  Target,
  BarChart3,
  Calendar,
  Repeat,
  BellRing,
  HandCoins,
  ListTodo,
  Settings as SettingsIcon,
} from 'lucide-react';

export interface BottomNavItemDefinition {
  id: string;
  label: string;
  shortLabel: string;
  description: string;
  category: 'core' | 'finance' | 'tools' | 'system';
  icon: React.ComponentType<{ className?: string; size?: number; strokeWidth?: number }>;
  colorClass: string;
}

export const ALL_BOTTOM_NAV_ITEMS: BottomNavItemDefinition[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    shortLabel: 'Home',
    description: 'Net worth, activity & overview',
    category: 'core',
    icon: LayoutDashboard,
    colorClass: 'from-blue-500 to-indigo-600',
  },
  {
    id: 'accounts',
    label: 'Accounts',
    shortLabel: 'Accounts',
    description: 'Banks, cards & wallet balances',
    category: 'finance',
    icon: Wallet,
    colorClass: 'from-sky-500 to-blue-600',
  },
  {
    id: 'transactions',
    label: 'Transactions',
    shortLabel: 'History',
    description: 'Full cashflow & transaction logs',
    category: 'core',
    icon: Receipt,
    colorClass: 'from-purple-500 to-violet-600',
  },
  {
    id: 'ai-assistant',
    label: 'Kai',
    shortLabel: 'Kai',
    description: 'Your financial AI assistant & conversational insights',
    category: 'tools',
    icon: Sparkles,
    colorClass: 'from-fuchsia-500 to-purple-600',
  },
  {
    id: 'groups',
    label: 'Group Expenses',
    shortLabel: 'Groups',
    description: 'Shared expenses & split bills with friends',
    category: 'finance',
    icon: Users,
    colorClass: 'from-violet-500 to-purple-600',
  },
  {
    id: 'investments',
    label: 'Investments',
    shortLabel: 'Invest',
    description: 'Stocks, mutual funds, gold & assets',
    category: 'finance',
    icon: TrendingUp,
    colorClass: 'from-emerald-500 to-teal-600',
  },
  {
    id: 'goals',
    label: 'Goals',
    shortLabel: 'Goals',
    description: 'Savings targets & progress tracking',
    category: 'finance',
    icon: Target,
    colorClass: 'from-amber-500 to-orange-600',
  },
  {
    id: 'reports',
    label: 'Reports',
    shortLabel: 'Reports',
    description: 'Visual analytics, breakdowns & metrics',
    category: 'tools',
    icon: BarChart3,
    colorClass: 'from-cyan-500 to-blue-600',
  },
  {
    id: 'calendar',
    label: 'Calendar',
    shortLabel: 'Calendar',
    description: 'Bills, recurring schedules & timeline',
    category: 'tools',
    icon: Calendar,
    colorClass: 'from-orange-500 to-red-600',
  },
  {
    id: 'recurring-transactions',
    label: 'Recurring',
    shortLabel: 'Recurring',
    description: 'Active subscriptions & automated bills',
    category: 'finance',
    icon: Repeat,
    colorClass: 'from-purple-500 to-indigo-600',
  },
  {
    id: 'budget-alerts',
    label: 'Budget Alerts',
    shortLabel: 'Budgets',
    description: 'Category spending caps & notifications',
    category: 'finance',
    icon: BellRing,
    colorClass: 'from-rose-500 to-pink-600',
  },
  {
    id: 'loans',
    label: 'Loans & EMI',
    shortLabel: 'Loans',
    description: 'Borrowings, lendings & repayment schedules',
    category: 'finance',
    icon: HandCoins,
    colorClass: 'from-teal-500 to-emerald-600',
  },
  {
    id: 'todo-lists',
    label: 'To-Do Lists',
    shortLabel: 'To-Do',
    description: 'Action items & financial checklist',
    category: 'tools',
    icon: ListTodo,
    colorClass: 'from-indigo-500 to-blue-600',
  },
  {
    id: 'settings',
    label: 'Settings',
    shortLabel: 'Settings',
    description: 'Preferences, security & configuration',
    category: 'system',
    icon: SettingsIcon,
    colorClass: 'from-slate-600 to-slate-800',
  },
];

// Default items as requested: Dashboard, Accounts, Transactions, AI Assistant, Group Expense, Investment
export const DEFAULT_BOTTOM_NAV_IDS: string[] = [
  'dashboard',
  'accounts',
  'transactions',
  'ai-assistant',
  'groups',
  'investments',
];

const STORAGE_KEY = 'KANAKU_bottom_nav_preferences_v1';
const EVENT_KEY = 'KANAKU_bottom_nav_preferences_changed';

export function getBottomNavPreferences(): string[] {
  if (typeof window === 'undefined') return DEFAULT_BOTTOM_NAV_IDS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length >= 3) {
        return parsed.slice(0, 7);
      }
    }
  } catch {
    // Fall back to default
  }
  return DEFAULT_BOTTOM_NAV_IDS;
}

/**
 * Called on first login / app load to seed defaults into localStorage for new
 * users. Existing users who have already customised their preferences are
 * unaffected because we only write when the storage key is absent.
 */
export function initializeDefaultBottomNav(): void {
  if (typeof window === 'undefined') return;
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (!existing) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_BOTTOM_NAV_IDS));
    }
  } catch {
    // Non-fatal — in-memory default will still be used
  }
}

export function setBottomNavPreferences(ids: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    window.dispatchEvent(new Event(EVENT_KEY));
  } catch (err) {
    console.error('Failed to save bottom nav preferences:', err);
  }
}

export function resetToDefaultBottomNav(): string[] {
  setBottomNavPreferences(DEFAULT_BOTTOM_NAV_IDS);
  return DEFAULT_BOTTOM_NAV_IDS;
}

export function useBottomNavPreferences(): [string[], (ids: string[]) => void] {
  const [selectedIds, setSelectedIds] = useState<string[]>(() => getBottomNavPreferences());

  useEffect(() => {
    const handleUpdate = () => {
      setSelectedIds(getBottomNavPreferences());
    };
    window.addEventListener(EVENT_KEY, handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener(EVENT_KEY, handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  const save = (newIds: string[]) => {
    setBottomNavPreferences(newIds);
    setSelectedIds(newIds);
  };

  return [selectedIds, save];
}
