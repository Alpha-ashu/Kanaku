import React from 'react';
import { useApp } from '@/contexts/AppContext';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

export interface BottomNavProps {
  onQuickAdd: () => void;
}

interface NavigationItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number; fill?: boolean }>;
  isAction?: boolean;
  testId: string;
}

// 1. Home icon with rounded roof and curved smile door
const NavHomeIcon: React.FC<{ className?: string; strokeWidth?: number }> = ({
  className = 'w-5 h-5',
  strokeWidth = 2,
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M4.5 10.5L12 3.5L19.5 10.5V18.5C19.5 19.6 18.6 20.5 17.5 20.5H6.5C5.4 20.5 4.5 19.6 4.5 18.5V10.5Z" />
    <path d="M10 16C10.6 16.8 11.2 17.2 12 17.2C12.8 17.2 13.4 16.8 14 16" />
  </svg>
);

// 2. Dining plate & cutlery for transactions / daily spending
const NavMealsIcon: React.FC<{ className?: string; strokeWidth?: number }> = ({
  className = 'w-5 h-5',
  strokeWidth = 2,
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <circle cx="12" cy="12" r="4.8" />
    <circle cx="12" cy="12" r="2.2" />
    <path d="M5.5 8.5V16.5" />
    <path d="M4.2 8.5C4.2 7.1 4.8 6 5.5 6C6.2 6 6.8 7.1 6.8 8.5C6.8 9.9 6.2 11 5.5 11C4.8 11 4.2 9.9 4.2 8.5Z" />
    <path d="M18.5 8.5V16.5" />
    <path d="M18.5 6V11C19.8 11 20 9.8 20 8.5C20 7.2 19.8 6 18.5 6Z" />
  </svg>
);

// 3. Viewfinder scanner with horizontal scan line for quick bill scanning & adding
const NavScanIcon: React.FC<{ className?: string; strokeWidth?: number }> = ({
  className = 'w-5 h-5',
  strokeWidth = 2.2,
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M4.5 8.5V6C4.5 5.2 5.2 4.5 6 4.5H8.5" />
    <path d="M15.5 4.5H18C18.8 4.5 19.5 5.2 19.5 6V8.5" />
    <path d="M4.5 15.5V18C4.5 18.8 5.2 19.5 6 19.5H8.5" />
    <path d="M15.5 19.5H18C18.8 19.5 19.5 18.8 19.5 18V15.5" />
    <path d="M7.5 12H16.5" />
  </svg>
);

// 4. Pie chart with separated top-right slice for reports & analytics
const NavPieChartIcon: React.FC<{ className?: string; strokeWidth?: number; fill?: boolean }> = ({
  className = 'w-5 h-5',
  strokeWidth = 1.8,
  fill = false,
}) => (
  <svg
    viewBox="0 0 24 24"
    fill={fill ? 'currentColor' : 'none'}
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M11 2.2C5.9 2.7 2 7 2 12.2C2 17.6 6.4 22 11.8 22C17 22 21.3 18.1 21.8 13H11V2.2Z" />
    <path d="M14 2C18.6 2.4 21.6 5.4 22 10H14V2Z" />
  </svg>
);

// 5. Cloche service platter on hand for goals & financial targets
const NavClocheIcon: React.FC<{ className?: string; strokeWidth?: number }> = ({
  className = 'w-5 h-5',
  strokeWidth = 2,
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M12 4.5V3" />
    <path d="M5.5 13.5C5.5 9 8.4 5.5 12 5.5C15.6 5.5 18.5 9 18.5 13.5" />
    <path d="M4 13.5H20" />
    <path d="M4.5 18.5C6.5 18.5 8 17.5 10 16L12 15H18" />
    <path d="M4.5 18.5L7.5 21" />
  </svg>
);

export const BottomNav: React.FC<BottomNavProps> = ({ onQuickAdd }) => {
  const { currentPage, setCurrentPage } = useApp();

  // Exactly the 5 items from the reference floating dock:
  // 1. Home/Dashboard, 2. Transactions/Meals, 3. Scanner/Quick-Add, 4. Reports/Pie-Chart, 5. Goals/Target-Cloche
  const navigationItems: NavigationItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: NavHomeIcon, testId: 'nav-dashboard-button' },
    { id: 'transactions', label: 'Transactions', icon: NavMealsIcon, testId: 'nav-transactions-button' },
    { id: 'quick-action', label: 'Scan & Add', icon: NavScanIcon, isAction: true, testId: 'nav-quick-action-button' },
    { id: 'reports', label: 'Reports', icon: NavPieChartIcon, testId: 'nav-reports-button' },
    { id: 'goals', label: 'Goals', icon: NavClocheIcon, testId: 'nav-goals-button' },
  ];

  const isTabActive = (itemId: string) => {
    if (currentPage === itemId) return true;
    if (itemId === 'transactions' && (currentPage === 'add-transaction' || currentPage === 'transaction-detail')) return true;
    if (itemId === 'reports' && (currentPage === 'analytics')) return true;
    if (itemId === 'goals' && (currentPage === 'goal-detail')) return true;
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
      className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pointer-events-none pb-[max(12px,calc(env(safe-area-inset-bottom,0px)+12px))] px-3 select-none"
      role="navigation"
      aria-label="Bottom Navigation"
    >
      {/* Sleek Floating Dock matching the exact reference design */}
      <div className="pointer-events-auto bg-white/95 backdrop-blur-2xl border border-white/80 shadow-[0_12px_36px_-6px_rgba(15,23,42,0.12),0_4px_14px_-2px_rgba(15,23,42,0.06)] rounded-full p-1.5 sm:p-2 flex items-center justify-center gap-1.5 sm:gap-2.5 transition-all">
        {navigationItems.map((item) => {
          const Icon = item.icon;
          const isAction = item.isAction;
          const isActive = !isAction && isTabActive(item.id);

          if (isAction) {
            return (
              <motion.button
                key={item.id}
                type="button"
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
                onClick={() => handleNavigation(item.id, true)}
                title={item.label}
                aria-label={item.label}
                data-testid={item.testId}
                className="relative flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-full text-slate-800 hover:text-black hover:bg-slate-100/80 active:bg-slate-200 transition-all cursor-pointer focus:outline-none shrink-0"
              >
                <Icon className="w-5 h-5 sm:w-5.5 sm:h-5.5 text-slate-800" strokeWidth={2.2} />
              </motion.button>
            );
          }

          return (
            <motion.button
              key={item.id}
              type="button"
              whileTap={{ scale: 0.92 }}
              onClick={() => handleNavigation(item.id)}
              data-testid={item.testId}
              aria-label={item.label}
              aria-selected={isActive}
              role="tab"
              className={cn(
                'relative flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-full transition-colors cursor-pointer select-none focus:outline-none shrink-0',
                isActive ? 'text-white' : 'text-slate-700 hover:text-slate-950 hover:bg-slate-100/80'
              )}
            >
              {/* Smooth Morphing Dark Active Pill Circle */}
              {isActive && (
                <motion.div
                  layoutId="activeDockCircle"
                  className="absolute inset-0 rounded-full bg-[#0F172A] shadow-md shadow-slate-950/20"
                  transition={{
                    type: 'spring',
                    stiffness: 500,
                    damping: 35,
                  }}
                />
              )}

              {/* Icon */}
              <div className="relative z-10 flex items-center justify-center">
                <Icon
                  className={cn(
                    'w-5 h-5 sm:w-5.5 sm:h-5.5 transition-colors duration-150',
                    isActive ? 'text-white' : 'text-slate-800'
                  )}
                  strokeWidth={2}
                  fill={item.id === 'reports' && !isActive ? true : false}
                />
              </div>
            </motion.button>
          );
        })}
      </div>
    </nav>
  );
};
