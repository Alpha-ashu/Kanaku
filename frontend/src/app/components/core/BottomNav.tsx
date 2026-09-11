import React from 'react';
import {
  LayoutDashboard,
  Wallet,
  Receipt,
  Users,
  TrendingUp,
  BarChart3,
  Plus,
} from 'lucide-react';
import { useApp } from '@/contexts/AppContext';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

export interface BottomNavProps {
  onQuickAdd: () => void;
}

interface NavigationItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  isAction?: boolean;
}

export const BottomNav: React.FC<BottomNavProps> = ({ onQuickAdd }) => {
  const { currentPage, setCurrentPage } = useApp();

  // Exact 7 items in user-requested order with Quick Action button in the middle:
  // 1. Dashboard, 2. Accounts, 3. Transaction, 4. Quick Action section (middle), 5. Group expense, 6. Investment, 7. Report
  const navigationItems: NavigationItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'accounts', label: 'Accounts', icon: Wallet },
    { id: 'transactions', label: 'Transaction', icon: Receipt },
    { id: 'quick-action', label: 'Quick Action', icon: Plus, isAction: true },
    { id: 'groups', label: 'Group expense', icon: Users },
    { id: 'investments', label: 'Investment', icon: TrendingUp },
    { id: 'reports', label: 'Report', icon: BarChart3 },
  ];

  const isTabActive = (itemId: string) => {
    if (currentPage === itemId) return true;
    if (itemId === 'transactions' && (currentPage === 'add-transaction' || currentPage === 'transaction-detail')) return true;
    if (itemId === 'accounts' && (currentPage === 'add-account' || currentPage === 'account-detail')) return true;
    if (itemId === 'investments' && (currentPage === 'add-investment' || currentPage === 'portfolio')) return true;
    if (itemId === 'groups' && (currentPage === 'add-group' || currentPage === 'group-detail')) return true;
    if (itemId === 'reports' && (currentPage === 'analytics')) return true;
    return false;
  };

  const handleNavigation = (itemId: string, isAction?: boolean) => {
    if (Capacitor.isNativePlatform()) {
      Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
    }

    if (isAction || itemId === 'quick-action') {
      onQuickAdd();
    } else {
      setCurrentPage(itemId);
    }
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pointer-events-none pb-[max(12px,calc(env(safe-area-inset-bottom,0px)+8px))] px-2 sm:px-4 select-none"
      role="navigation"
      aria-label="Bottom Navigation"
    >
      {/* Sleek Minimalist Floating Frosted Capsule Bar */}
      <div className="pointer-events-auto bg-white/90 backdrop-blur-2xl border border-white/70 rounded-full shadow-[0_12px_40px_rgba(0,0,0,0.08)] p-1 sm:p-1.5 flex items-center justify-center gap-0.5 sm:gap-1 transition-all max-w-[98vw] overflow-x-auto scrollbar-none">
        {navigationItems.map((item) => {
          const Icon = item.icon;
          const isAction = item.isAction;
          const isActive = !isAction && isTabActive(item.id);

          if (isAction) {
            return (
              <motion.button
                key={item.id}
                type="button"
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.94 }}
                onClick={() => handleNavigation(item.id, true)}
                title="Quick Action"
                aria-label="Quick Action"
                data-testid="nav-quick-action-button"
                className="relative flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 md:w-11 md:h-11 rounded-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-md shadow-blue-500/25 shrink-0 mx-0.5 sm:mx-1 border-2 border-white cursor-pointer focus:outline-none z-20 transition-all"
              >
                <Icon className="w-4.5 h-4.5 sm:w-5 sm:h-5 text-white" strokeWidth={2.4} />
              </motion.button>
            );
          }

          return (
            <motion.button
              key={item.id}
              layout
              type="button"
              onClick={() => handleNavigation(item.id)}
              data-testid={`nav-${item.id}-button`}
              aria-label={item.label}
              aria-selected={isActive}
              role="tab"
              transition={{
                type: 'spring',
                stiffness: 450,
                damping: 32,
              }}
              className={cn(
                "relative flex items-center justify-center rounded-full transition-colors cursor-pointer select-none focus:outline-none shrink-0",
                isActive
                  ? "px-2.5 sm:px-3.5 py-1.5 sm:py-2 text-white"
                  : "w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 text-slate-400 hover:text-slate-700 hover:bg-slate-100/80 active:scale-95"
              )}
            >
              {/* Active Morphing Blue Pill Background */}
              {isActive && (
                <motion.div
                  layoutId="activeNavPill"
                  className="absolute inset-0 rounded-full bg-blue-600 shadow-sm shadow-blue-500/25"
                  transition={{
                    type: 'spring',
                    stiffness: 450,
                    damping: 32,
                  }}
                />
              )}

              {/* Icon & Label */}
              <div className="relative z-10 flex items-center gap-1.5">
                <Icon
                  className={cn(
                    "w-4 h-4 sm:w-4.5 sm:h-4.5 transition-colors duration-150 shrink-0",
                    isActive ? "text-white" : "text-slate-500 group-hover:text-slate-800"
                  )}
                  strokeWidth={isActive ? 2.3 : 1.8}
                />
                <AnimatePresence initial={false}>
                  {isActive && (
                    <motion.span
                      initial={{ opacity: 0, scale: 0.9, width: 0 }}
                      animate={{ opacity: 1, scale: 1, width: 'auto' }}
                      exit={{ opacity: 0, scale: 0.9, width: 0 }}
                      transition={{ duration: 0.18, ease: 'easeOut' }}
                      className="text-white font-medium text-xs sm:text-[13px] tracking-tight whitespace-nowrap overflow-hidden"
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            </motion.button>
          );
        })}
      </div>
    </nav>
  );
};
