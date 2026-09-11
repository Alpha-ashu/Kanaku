import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Home,
  Receipt,
  Plus,
  BarChart3,
  Target,
  MoreHorizontal,
  Wallet,
  Calendar,
  Users,
  HandCoins,
  TrendingUp,
  Repeat,
  BellRing,
  Settings,
} from 'lucide-react';

export interface BottomNavProps {
  onQuickAdd: () => void;
}

// ── Secondary pages accessible via More popup ────────────────────
const MORE_ITEMS = [
  { id: 'accounts', label: 'Accounts', icon: Wallet },
  { id: 'investments', label: 'Investments', icon: TrendingUp },
  { id: 'calendar', label: 'Calendar', icon: Calendar },
  { id: 'recurring-transactions', label: 'Recurring', icon: Repeat },
  { id: 'budget-alerts', label: 'Budget Alerts', icon: BellRing },
  { id: 'loans', label: 'Loans & EMI', icon: HandCoins },
  { id: 'groups', label: 'Groups & Friends', icon: Users },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export const BottomNav: React.FC<BottomNavProps> = ({ onQuickAdd }) => {
  const { currentPage, setCurrentPage } = useApp();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreOpen) return;
    const handler = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [moreOpen]);

  const isTabActive = (itemId: string) => {
    if (currentPage === itemId) return true;
    if (itemId === 'transactions' && (currentPage === 'add-transaction' || currentPage === 'transaction-detail')) return true;
    if (itemId === 'reports' && (currentPage === 'analytics')) return true;
    if (itemId === 'goals' && (currentPage === 'goal-detail')) return true;
    return false;
  };

  const isMoreActive = MORE_ITEMS.some((item) => item.id === currentPage);

  const handleNavigation = (itemId: string, isAction?: boolean) => {
    if (Capacitor.isNativePlatform()) {
      Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
    }

    if (isAction || itemId === 'quick-action') {
      onQuickAdd();
    } else {
      setCurrentPage(itemId);
      setMoreOpen(false);
    }
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pointer-events-none pb-[max(14px,calc(env(safe-area-inset-bottom,0px)+12px))] px-3 select-none"
      role="navigation"
      aria-label="Bottom Navigation"
    >
      {/* Sleek Floating White Frosted Dock with Proper Financial Icons */}
      <div className="pointer-events-auto relative bg-white/95 backdrop-blur-2xl border border-white/80 shadow-[0_12px_36px_-6px_rgba(15,23,42,0.12),0_4px_14px_-2px_rgba(15,23,42,0.06)] rounded-full p-1.5 sm:p-2 flex items-center justify-center gap-1 sm:gap-2 transition-all">

        {/* 1. Dashboard / Home */}
        <motion.button
          type="button"
          whileTap={{ scale: 0.9 }}
          onClick={() => handleNavigation('dashboard')}
          data-testid="nav-dashboard-button"
          aria-label="Dashboard"
          aria-selected={isTabActive('dashboard')}
          role="tab"
          className={cn(
            'relative flex items-center justify-center w-10 h-10 sm:w-11 sm:h-11 rounded-full transition-colors cursor-pointer select-none focus:outline-none shrink-0',
            isTabActive('dashboard') ? 'text-white' : 'text-slate-700 hover:text-slate-950 hover:bg-slate-100/80 active:bg-slate-200'
          )}
        >
          {isTabActive('dashboard') && (
            <motion.div
              layoutId="activeDockCircle"
              className="absolute inset-0 rounded-full bg-[#18181B] shadow-md shadow-black/20"
              transition={{ type: 'spring', stiffness: 500, damping: 35 }}
            />
          )}
          <div className="relative z-10 flex items-center justify-center">
            <Home size={20} strokeWidth={2} className="transition-colors duration-150" />
          </div>
        </motion.button>

        {/* 2. Transactions (Receipt icon) */}
        <motion.button
          type="button"
          whileTap={{ scale: 0.9 }}
          onClick={() => handleNavigation('transactions')}
          data-testid="nav-transactions-button"
          aria-label="Transactions"
          aria-selected={isTabActive('transactions')}
          role="tab"
          className={cn(
            'relative flex items-center justify-center w-10 h-10 sm:w-11 sm:h-11 rounded-full transition-colors cursor-pointer select-none focus:outline-none shrink-0',
            isTabActive('transactions') ? 'text-white' : 'text-slate-700 hover:text-slate-950 hover:bg-slate-100/80 active:bg-slate-200'
          )}
        >
          {isTabActive('transactions') && (
            <motion.div
              layoutId="activeDockCircle"
              className="absolute inset-0 rounded-full bg-[#18181B] shadow-md shadow-black/20"
              transition={{ type: 'spring', stiffness: 500, damping: 35 }}
            />
          )}
          <div className="relative z-10 flex items-center justify-center">
            <Receipt size={20} strokeWidth={2} className="transition-colors duration-150" />
          </div>
        </motion.button>

        {/* 3. Center Quick Action (Plus / Add Transaction) */}
        <motion.button
          type="button"
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => handleNavigation('quick-action', true)}
          title="Add Transaction"
          aria-label="Add Transaction"
          data-testid="nav-quick-action-button"
          className="relative flex items-center justify-center w-10 h-10 sm:w-11 sm:h-11 rounded-full text-slate-800 hover:text-black hover:bg-slate-100/80 active:bg-slate-200 transition-all cursor-pointer focus:outline-none shrink-0"
        >
          <Plus size={22} strokeWidth={2.4} className="text-slate-800" />
        </motion.button>

        {/* 4. Reports (Analytics / Bar Chart) */}
        <motion.button
          type="button"
          whileTap={{ scale: 0.9 }}
          onClick={() => handleNavigation('reports')}
          data-testid="nav-reports-button"
          aria-label="Reports"
          aria-selected={isTabActive('reports')}
          role="tab"
          className={cn(
            'relative flex items-center justify-center w-10 h-10 sm:w-11 sm:h-11 rounded-full transition-colors cursor-pointer select-none focus:outline-none shrink-0',
            isTabActive('reports') ? 'text-white' : 'text-slate-700 hover:text-slate-950 hover:bg-slate-100/80 active:bg-slate-200'
          )}
        >
          {isTabActive('reports') && (
            <motion.div
              layoutId="activeDockCircle"
              className="absolute inset-0 rounded-full bg-[#18181B] shadow-md shadow-black/20"
              transition={{ type: 'spring', stiffness: 500, damping: 35 }}
            />
          )}
          <div className="relative z-10 flex items-center justify-center">
            <BarChart3 size={20} strokeWidth={2} className="transition-colors duration-150" />
          </div>
        </motion.button>

        {/* 5. Goals (Target bullseye icon) */}
        <motion.button
          type="button"
          whileTap={{ scale: 0.9 }}
          onClick={() => handleNavigation('goals')}
          data-testid="nav-goals-button"
          aria-label="Goals"
          aria-selected={isTabActive('goals')}
          role="tab"
          className={cn(
            'relative flex items-center justify-center w-10 h-10 sm:w-11 sm:h-11 rounded-full transition-colors cursor-pointer select-none focus:outline-none shrink-0',
            isTabActive('goals') ? 'text-white' : 'text-slate-700 hover:text-slate-950 hover:bg-slate-100/80 active:bg-slate-200'
          )}
        >
          {isTabActive('goals') && (
            <motion.div
              layoutId="activeDockCircle"
              className="absolute inset-0 rounded-full bg-[#18181B] shadow-md shadow-black/20"
              transition={{ type: 'spring', stiffness: 500, damping: 35 }}
            />
          )}
          <div className="relative z-10 flex items-center justify-center">
            <Target size={20} strokeWidth={2} className="transition-colors duration-150" />
          </div>
        </motion.button>

        {/* 6. More (···) Menu for Secondary Pages */}
        <div className="relative" ref={moreRef}>
          <motion.button
            type="button"
            whileTap={{ scale: 0.9 }}
            onClick={() => setMoreOpen((v) => !v)}
            data-testid="nav-more-button"
            aria-label="More Pages"
            aria-selected={isMoreActive}
            className={cn(
              'relative flex items-center justify-center w-10 h-10 sm:w-11 sm:h-11 rounded-full transition-colors cursor-pointer select-none focus:outline-none shrink-0',
              isMoreActive ? 'text-white' : 'text-slate-700 hover:text-slate-950 hover:bg-slate-100/80 active:bg-slate-200'
            )}
          >
            {isMoreActive && (
              <motion.div
                layoutId="activeDockCircle"
                className="absolute inset-0 rounded-full bg-[#18181B] shadow-md shadow-black/20"
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              />
            )}
            <div className="relative z-10 flex items-center justify-center">
              <MoreHorizontal size={20} strokeWidth={2.4} className="transition-colors duration-150" />
            </div>
          </motion.button>

          {/* More popup */}
          <AnimatePresence>
            {moreOpen && (
              <motion.div
                initial={{ opacity: 0, y: 12, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 450, damping: 30 }}
                className="absolute bottom-[calc(100%+14px)] right-0 bg-white/95 backdrop-blur-2xl rounded-[24px] shadow-[0_20px_50px_rgba(15,23,42,0.16),0_4px_12px_rgba(15,23,42,0.06)] border border-slate-100/90 p-2 min-w-[210px] overflow-hidden z-50"
              >
                <div className="px-3 py-1.5 border-b border-slate-100 mb-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Pages</span>
                </div>
                <div className="space-y-0.5">
                  {MORE_ITEMS.map((item) => {
                    const active = currentPage === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleNavigation(item.id)}
                        data-testid={`nav-more-${item.id}-button`}
                        className={cn(
                          'w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer select-none',
                          active
                            ? 'bg-[#18181B] text-white shadow-xs'
                            : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950'
                        )}
                      >
                        <item.icon
                          size={16}
                          className={active ? 'text-white' : 'text-slate-500'}
                          strokeWidth={2.2}
                        />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>
    </nav>
  );
};

export default BottomNav;
