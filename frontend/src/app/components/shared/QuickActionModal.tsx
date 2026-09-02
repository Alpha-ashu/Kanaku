import React, { useState, useMemo } from 'react';
import {
  X,
  Search,
  Sparkles,
  PlusCircle,
  LayoutGrid,
  Wrench,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';
import { cn } from '@/lib/utils';
import { Button } from '@/app/components/ui/button';
import { getCategoryCartoonIcon } from '@/app/components/ui/CartoonCategoryIcons';
import { useAICapability, useOptionalApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { canAccessPage, FeatureVisibility } from '@/lib/featureFlags';

interface QuickActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAction: (action: string) => void;
}

export interface QuickActionItem {
  id: string;
  label: string;
  icon: string;
  description: string;
  category: 'create' | 'navigation' | 'tools';
  roles?: string[];
  requiresVoice?: boolean;
}

export const quickActions: QuickActionItem[] = [
  // ─── Quick Create Actions ────────────────────────────────────────────────
  { id: 'add-expense', label: 'Add Expense', icon: 'food & dining', description: 'Log a new expense', category: 'create' },
  { id: 'add-income', label: 'Add Income', icon: 'salary', description: 'Record incoming money', category: 'create' },
  { id: 'voice-input', label: 'Voice Logging', icon: 'voice logging', description: 'Speak to log instantly', category: 'create' },
  { id: 'receipt-scanner', label: 'Receipt Scanner', icon: 'receipt scanner', description: 'Scan & parse receipts', category: 'create' },
  { id: 'transfer', label: 'Transfer', icon: 'transfer', description: 'Move between accounts', category: 'create' },
  { id: 'split-bill', label: 'Split Bill', icon: 'group expenses', description: 'Split shared cost', category: 'create' },

  // ─── 17 Core Navigation Items (from Sidebar) ────────────────────────────
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', description: 'Overview & metrics', category: 'navigation' },
  { id: 'accounts', label: 'Accounts', icon: 'accounts', description: 'Banks, cards & wallets', category: 'navigation' },
  { id: 'transactions', label: 'Transactions', icon: 'transactions', description: 'All transactions log', category: 'navigation' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar', description: 'Timeline & calendar', category: 'navigation' },
  { id: 'investments', label: 'Investments', icon: 'investments', description: 'Portfolio, stocks & gold', category: 'navigation' },
  { id: 'loans', label: 'Loans', icon: 'loans', description: 'Borrow, lend & EMIs', category: 'navigation' },
  { id: 'goals', label: 'Goals', icon: 'goals', description: 'Savings & milestones', category: 'navigation' },
  { id: 'groups', label: 'Group Expenses', icon: 'group expenses', description: 'Shared group balances', category: 'navigation' },
  { id: 'reports', label: 'Reports', icon: 'reports', description: 'Analytics & insights', category: 'navigation' },
  { id: 'todo-lists', label: 'Todo Lists', icon: 'todo lists', description: 'Tasks & checklist items', category: 'navigation' },
  { id: 'book-advisor', label: 'Book Advisor', icon: 'book advisor', description: 'Financial advisory', category: 'tools', roles: ['admin', 'user'] },
  { id: 'notifications', label: 'Notifications', icon: 'notifications', description: 'Alerts & updates', category: 'navigation' },
  { id: 'recurring-transactions', label: 'Recurring', icon: 'recurring', description: 'Bills & subscriptions', category: 'navigation' },
  { id: 'budget-alerts', label: 'Budget Alerts', icon: 'budget alerts', description: 'Spending limit alerts', category: 'navigation' },
  { id: 'settings', label: 'Settings', icon: 'settings', description: 'App preferences & setup', category: 'navigation' },
];

type CategoryFilter = 'all' | 'create' | 'navigation' | 'tools';

export const QuickActionModal: React.FC<QuickActionModalProps> = ({
  isOpen,
  onClose,
  onAction,
}) => {
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<CategoryFilter>('all');

  const app = useOptionalApp();
  const { role } = useAuth();
  const voiceEnabled = useAICapability('voiceAssistant');
  const visibleFeatures = (app?.visibleFeatures ?? {}) as FeatureVisibility;

  // Filter actions based on RBAC, AI capabilities, visible feature flags, category tab, and search query
  const filteredActions = useMemo(() => {
    return quickActions.filter(action => {
      // 1. Role-based check
      if (action.roles && action.roles.length > 0) {
        if (!action.roles.includes(role)) return false;
      }

      // 2. Voice assistant gating
      if (action.requiresVoice && !voiceEnabled) {
        return false;
      }

      // 3. Feature access check (for page navigation items)
      if (action.category === 'navigation' || action.id === 'book-advisor') {
        if (!canAccessPage(action.id, visibleFeatures)) return false;
      }

      // 4. Tab Category filter
      if (activeFilter !== 'all' && action.category !== activeFilter) {
        return false;
      }

      // 5. Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchLabel = action.label.toLowerCase().includes(query);
        const matchDesc = action.description.toLowerCase().includes(query);
        return matchLabel || matchDesc;
      }

      return true;
    });
  }, [role, voiceEnabled, visibleFeatures, activeFilter, searchQuery]);

  const handleAction = async (actionId: string) => {
    if (Capacitor.isNativePlatform()) {
      try {
        await Haptics.impact({ style: ImpactStyle.Medium });
      } catch (hapticErr) {
        console.debug('[QuickActionModal] Haptics trigger ignored:', hapticErr);
      }
    }
    setSelectedAction(actionId);
    setTimeout(() => {
      onAction(actionId);
      onClose();
      setSelectedAction(null);
      setSearchQuery('');
    }, 150);
  };

  const handleClose = () => {
    setSearchQuery('');
    setActiveFilter('all');
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            data-testid="quick-action-modal-div"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-md z-[60]"
            onClick={handleClose}
          />

          {/* Modal / Bottom Sheet */}
          <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="fixed inset-x-0 bottom-0 z-[61] bg-white/98 backdrop-blur-2xl rounded-t-[32px] sm:rounded-t-[36px] shadow-2xl border-t border-slate-200/80 overflow-hidden max-h-[90dvh] flex flex-col sm:max-w-2xl sm:mx-auto sm:bottom-6 sm:rounded-[32px] sm:border"
          >
            {/* Drag Handle */}
            <div className="flex justify-center pt-3 pb-1 shrink-0 sm:hidden">
              <div className="w-10 h-1 bg-gray-300/70 rounded-full" />
            </div>

            {/* Header */}
            <div className="px-5 pt-3 pb-2 shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
                    <span>Quick Actions</span>
                    <Sparkles size={18} className="text-pink-500 animate-pulse" />
                  </h3>
                  <p className="text-xs text-gray-500 font-medium mt-0.5">
                    Fast access to create, navigate, and manage
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleClose}
                  className="rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 w-8 h-8 sm:w-9 sm:h-9"
                  aria-label="Close quick actions"
                  title="Close quick actions"
                  data-testid="quickaction-close-button"
                >
                  <X size={18} />
                </Button>
              </div>

              {/* Search Bar */}
              <div className="mt-3 relative">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search actions or features..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 text-sm bg-gray-50 hover:bg-gray-100/80 focus:bg-white border border-gray-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 rounded-xl transition-all outline-none text-gray-900 placeholder:text-gray-400"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 rounded-full"
                    title="Clear search"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Category Filter Tabs */}
              <div className="flex items-center gap-1.5 mt-2.5 overflow-x-auto scrollbar-hide py-1">
                <button
                  type="button"
                  onClick={() => setActiveFilter('all')}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all",
                    activeFilter === 'all'
                      ? "bg-slate-900 text-white shadow-sm"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  )}
                >
                  <LayoutGrid size={13} />
                  <span>All ({quickActions.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFilter('create')}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all",
                    activeFilter === 'create'
                      ? "bg-slate-900 text-white shadow-sm"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  )}
                >
                  <PlusCircle size={13} />
                  <span>Quick Create</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFilter('navigation')}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all",
                    activeFilter === 'navigation'
                      ? "bg-slate-900 text-white shadow-sm"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  )}
                >
                  <span>Pages (17)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFilter('tools')}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all",
                    activeFilter === 'tools'
                      ? "bg-slate-900 text-white shadow-sm"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  )}
                >
                  <Wrench size={13} />
                  <span>Tools & AI</span>
                </button>
              </div>
            </div>

            {/* Grid - Scrollable content */}
            <div className="px-4 pt-1 pb-[max(env(safe-area-inset-bottom,0px)+1.5rem,2rem)] overflow-y-auto flex-1 overscroll-contain">
              {filteredActions.length === 0 ? (
                <div className="py-12 text-center text-gray-400">
                  <p className="text-sm font-medium">No actions matching "{searchQuery}"</p>
                  <button
                    type="button"
                    onClick={() => { setSearchQuery(''); setActiveFilter('all'); }}
                    className="mt-2 text-xs text-indigo-600 font-semibold hover:underline"
                  >
                    Reset filters
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-4 sm:grid-cols-4 md:grid-cols-5 gap-2.5 sm:gap-3 py-1">
                  {filteredActions.map((action, i) => {
                    const isSelected = selectedAction === action.id;

                    return (
                      <motion.button
                        key={action.id}
                        type="button"
                        onClick={() => handleAction(action.id)}
                        data-testid={`quickaction-${action.id}-button`}
                        initial={{ opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: Math.min(i * 0.02, 0.3), type: 'spring', stiffness: 320, damping: 24 }}
                        whileTap={{ scale: 0.93 }}
                        whileHover={{ scale: 1.04 }}
                        className={cn(
                          "group relative flex flex-col items-center gap-2 py-3.5 px-2 rounded-2xl border transition-all duration-200 text-left",
                          isSelected
                            ? "bg-slate-900 text-white border-slate-900 shadow-md ring-2 ring-indigo-400/50"
                            : "bg-white border-slate-100 hover:border-slate-300 hover:bg-slate-50/80 shadow-sm hover:shadow-md"
                        )}
                      >
                        {/* Icon bubble */}
                        <div className="w-11 h-11 sm:w-12 sm:h-12 flex items-center justify-center transition-transform duration-200 group-hover:scale-110">
                          {getCategoryCartoonIcon(action.icon, 38)}
                        </div>

                        {/* Label */}
                        <span
                          className={cn(
                            "text-[11.5px] sm:text-xs font-semibold text-center leading-tight w-full truncate px-0.5",
                            isSelected ? "text-white" : "text-gray-800 group-hover:text-black"
                          )}
                        >
                          {action.label}
                        </span>

                        {/* Subtle description */}
                        <span
                          className={cn(
                            "hidden sm:block text-[9.5px] text-center leading-tight truncate w-full px-0.5",
                            isSelected ? "text-gray-300" : "text-gray-400"
                          )}
                        >
                          {action.description}
                        </span>
                      </motion.button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* iOS safe-area spacer */}
            <div className="h-safe-bottom bg-white/95" />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
