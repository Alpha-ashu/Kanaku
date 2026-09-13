import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Wallet,
  Calendar as CalendarIcon,
  Users,
  HandCoins,
  TrendingUp,
  Repeat,
  BellRing,
  Settings as SettingsIcon,
  X,
  Sliders,
  Sparkles,
} from 'lucide-react';
import {
  useBottomNavPreferences,
  ALL_BOTTOM_NAV_ITEMS,
  BottomNavItemDefinition,
} from '@/lib/bottomNavPreferences';
import { BottomNavSettingsSection } from '@/app/components/profile/BottomNavSettingsSection';
import {
  useQuickActionPreferences,
  ALL_QUICK_ACTIONS,
  executeQuickAction,
  QuickActionDefinition,
} from '@/lib/quickActionPreferences';
import { QuickActionSettingsSection } from '@/app/components/profile/QuickActionSettingsSection';

export interface BottomNavProps {
  onQuickAdd?: () => void;
}

// ── Custom Pixel-Perfect SVGs Matching User Reference Image ──────────────────
const HomeGlyph: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path d="M12 3.1a1.5 1.5 0 0 1 1 .38l6.7 5.7c.48.4.75 1 .75 1.63v8.59a1.6 1.6 0 0 1-1.6 1.6h-4.35v-4.9c0-.77-.63-1.4-1.4-1.4h-2.2c-.77 0-1.4.63-1.4 1.4v4.9H5.15a1.6 1.6 0 0 1-1.6-1.6V10.8c0-.63.27-1.22.75-1.62l6.7-5.71a1.5 1.5 0 0 1 1-.37z" />
  </svg>
);

const WalletGlyph: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <rect x="2.5" y="5" width="19" height="14" rx="3" />
    <path d="M16 12h3" strokeWidth="2.5" />
    <path d="M2.5 9h19" />
  </svg>
);

const ChartGlyph: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.3"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M4.5 5.5v11a2.2 2.2 0 0 0 2.2 2.2h12.8" />
    <path d="M8.5 14.5v-5" />
    <path d="M12.5 14.5v-8" />
    <path d="M16.5 14.5v-3.5" />
  </svg>
);

const SparkleGlyph: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    width="21"
    height="21"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M10.8 4c0 3.6-2.6 6.4-6.3 6.4 3.7 0 6.3 2.8 6.3 6.4 0-3.6 2.6-6.4 6.3-6.4-3.7 0-6.3-2.8-6.3-6.4z" />
    <path d="M18.5 4.5v3M17 6h3" strokeWidth="2" />
  </svg>
);

const UsersGlyph: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="3.8" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const TrendingUpGlyph: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.3"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
    <polyline points="17 6 23 6 23 12" />
  </svg>
);

const CoinsGlyph: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    width="21"
    height="21"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <ellipse cx="8" cy="6.8" rx="4.8" ry="2.2" />
    <path d="M3.2 6.8v4.2c0 1.2 2.1 2.2 4.8 2.2s4.8-1 4.8-2.2V6.8" />
    <path d="M3.2 11v4.2c0 1.2 2.1 2.2 4.8 2.2s4.8-1 4.8-2.2V11" />
    <path d="M12.8 10.5c.8-.7 1.9-1.1 3.4-1.1 2.7 0 4.6.9 4.6 2.1v4.2c0 1.2-1.9 2.1-4.6 2.1-1.5 0-2.6-.4-3.4-1.1" />
    <path d="M12.8 14.8c.8.6 1.9 1 3.4 1 2.7 0 4.6-.9 4.6-2.1" />
  </svg>
);

const BarChartGlyph: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <line x1="12" y1="20" x2="12" y2="10" />
    <line x1="18" y1="20" x2="18" y2="4" />
    <line x1="6" y1="20" x2="6" y2="16" />
  </svg>
);

const CalendarGlyph: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <rect x="3" y="4" width="18" height="18" rx="3" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const RepeatGlyph: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <polyline points="17 1 21 5 17 9" />
    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
    <polyline points="7 23 3 19 7 15" />
    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
  </svg>
);

const BellRingGlyph: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
);

const HandCoinsGlyph: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M11 15h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 17" />
    <path d="m7 21 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9" />
    <path d="m2 16 6 6" />
    <circle cx="18" cy="5" r="3" />
  </svg>
);

const ListTodoGlyph: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <rect x="3" y="5" width="6" height="6" rx="1" />
    <path d="m3 17 2 2 4-4" />
    <path d="M13 6h8" />
    <path d="M13 12h8" />
    <path d="M13 18h8" />
  </svg>
);

const SettingsGlyph: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

const PlusGlyph: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.8"
    strokeLinecap="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const getNavGlyph = (id: string): React.ReactNode => {
  switch (id) {
    case 'dashboard': return <HomeGlyph />;
    case 'accounts': return <WalletGlyph />;
    case 'transactions': return <ChartGlyph />;
    case 'ai-assistant': return <SparkleGlyph />;
    case 'groups': return <UsersGlyph />;
    case 'investments': return <TrendingUpGlyph />;
    case 'goals': return <CoinsGlyph />;
    case 'reports': return <BarChartGlyph />;
    case 'calendar': return <CalendarGlyph />;
    case 'recurring-transactions': return <RepeatGlyph />;
    case 'budget-alerts': return <BellRingGlyph />;
    case 'loans': return <HandCoinsGlyph />;
    case 'todo-lists': return <ListTodoGlyph />;
    case 'settings': return <SettingsGlyph />;
    default: return <SparkleGlyph />;
  }
};


export const BottomNav: React.FC<BottomNavProps> = () => {
  const { currentPage, setCurrentPage } = useApp();
  const [selectedNavIds] = useBottomNavPreferences();
  const [selectedQuickActionIds] = useQuickActionPreferences();
  const [moreOpen, setMoreOpen] = useState(false);
  const [showCustomizeModal, setShowCustomizeModal] = useState(false);
  const [customizeTab, setCustomizeTab] = useState<'quick-actions' | 'bottom-dock'>('quick-actions');
  const moreRef = useRef<HTMLDivElement>(null);

  // Close explore menu on click outside
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
    if (itemId === 'dashboard' && currentPage === 'dashboard') return true;
    if (itemId === 'accounts' && (currentPage === 'add-account' || currentPage === 'edit-account')) return true;
    if (itemId === 'transactions' && (currentPage === 'add-transaction' || currentPage === 'transaction-detail')) return true;
    if (itemId === 'ai-assistant' && (currentPage === 'ai-insights' || currentPage === 'voice-input' || currentPage === 'voice-review')) return true;
    if (itemId === 'groups' && (currentPage === 'add-group' || currentPage === 'friends' || currentPage === 'friend-profile' || currentPage === 'add-friends')) return true;
    if (itemId === 'investments' && (currentPage === 'add-investment' || currentPage === 'edit-investment' || currentPage === 'add-gold')) return true;
    if (itemId === 'goals' && (currentPage === 'goal-detail' || currentPage === 'add-goal')) return true;
    if (itemId === 'reports' && currentPage === 'analytics') return true;
    if (itemId === 'loans' && currentPage === 'pay-emi') return true;
    if (itemId === 'settings' && (currentPage === 'user-profile' || currentPage === 'notifications')) return true;
    return false;
  };

  const activeQuickActions = React.useMemo(() => {
    const actionMap = new Map<string, QuickActionDefinition>(
      ALL_QUICK_ACTIONS.map((a) => [a.id, a])
    );
    const items: QuickActionDefinition[] = [];
    const seen = new Set<string>();
    for (const id of selectedQuickActionIds) {
      const action = actionMap.get(id);
      if (action && !seen.has(action.id)) {
        seen.add(action.id);
        items.push(action);
      }
    }
    return items.length > 0 ? items : (ALL_QUICK_ACTIONS.slice(0, 8) as QuickActionDefinition[]);
  }, [selectedQuickActionIds]);

  const isMoreActive = activeQuickActions.some((item) => item.id === currentPage);

  const handleNavigation = (itemId: string) => {
    if (Capacitor.isNativePlatform()) {
      Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
    }
    setCurrentPage(itemId);
    setMoreOpen(false);
  };

  const handleActionClick = (actionId: string) => {
    if (Capacitor.isNativePlatform()) {
      Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
    }
    setMoreOpen(false);
    executeQuickAction(actionId, setCurrentPage);
  };

  // Resolve active items from preferences
  const activeNavItems = selectedNavIds
    .map((id) => ALL_BOTTOM_NAV_ITEMS.find((item) => item.id === id))
    .filter(Boolean) as BottomNavItemDefinition[];

  // Dynamic width synchronization with FloatingSaveBar across all device screens
  const navContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = navContainerRef.current;
    if (!el) return;

    const updateWidth = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0) {
        document.documentElement.style.setProperty('--bottom-nav-width', `${Math.round(rect.width)}px`);
      }
    };

    updateWidth();
    const ro = new ResizeObserver(updateWidth);
    ro.observe(el);
    window.addEventListener('resize', updateWidth);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateWidth);
    };
  }, [activeNavItems.length]);

  return (
    <>
      {/* Backdrop overlay when Explore menu is open */}
      <AnimatePresence>
        {moreOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setMoreOpen(false)}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs pointer-events-auto"
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      {/* Customize Navigation Modal / Drawer */}
      <AnimatePresence>
        {showCustomizeModal && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm pointer-events-auto">
            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 450, damping: 30 }}
              className="bg-white rounded-[32px] w-full max-w-2xl max-h-[85vh] overflow-y-auto p-5 sm:p-6 shadow-2xl border border-slate-100"
            >
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-purple-600 text-white flex items-center justify-center shadow-xs">
                    <Sliders size={16} strokeWidth={2.4} />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900 tracking-tight">
                      Navigation & Quick Actions
                    </h3>
                    <p className="text-xs text-slate-500">Customize your bottom dock and quick actions popup</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCustomizeModal(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
                  aria-label="Close customization"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Segmented Switcher between Quick Actions and Bottom Dock */}
              <div className="flex items-center gap-1.5 mb-4 p-1 bg-slate-100/80 rounded-2xl">
                <button
                  type="button"
                  onClick={() => setCustomizeTab('quick-actions')}
                  className={cn(
                    'flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer text-center',
                    customizeTab === 'quick-actions'
                      ? 'bg-white text-purple-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  )}
                >
                  Quick Actions Popup
                </button>
                <button
                  type="button"
                  onClick={() => setCustomizeTab('bottom-dock')}
                  className={cn(
                    'flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer text-center',
                    customizeTab === 'bottom-dock'
                      ? 'bg-white text-purple-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  )}
                >
                  Bottom Dock
                </button>
              </div>

              {customizeTab === 'quick-actions' ? (
                <QuickActionSettingsSection />
              ) : (
                <BottomNavSettingsSection />
              )}

              <div className="pt-4 mt-4 border-t border-slate-100 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowCustomizeModal(false)}
                  className="px-5 py-2 rounded-full bg-slate-900 hover:bg-black text-white text-xs font-bold transition-all cursor-pointer shadow-md"
                >
                  Done
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <nav
        className={cn(
          "fixed bottom-0 left-0 right-0 z-50 flex justify-center pointer-events-none pb-[max(12px,calc(env(safe-area-inset-bottom,0px)+10px))] px-2.5 sm:px-4 select-none",
          showCustomizeModal && "hidden"
        )}
        role="navigation"
        aria-label="Bottom Navigation"
      >
        {/* Ambient Backlight Glow under Dock */}
        <div
          className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-[340px] h-[70px] rounded-full bg-purple-600/15 blur-2xl pointer-events-none"
          aria-hidden="true"
        />

        {/* Outer Flex Container: Dark Capsule + Separate White Plus Button */}
        <div ref={navContainerRef} className="pointer-events-auto relative flex items-center gap-2 sm:gap-3 max-w-full">

          {/* ── Dark Capsule Dock (Customized / Default: Dashboard, Accounts, Transactions, AI Assistant, Groups, Investments) ── */}
          <div
            data-testid="bottom-nav-dock"
            className="relative bg-[#000000] border border-white/[0.12] rounded-full p-1 sm:p-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.6),0_2px_8px_rgba(0,0,0,0.4)] flex items-center gap-0.5 sm:gap-1.5 overflow-x-auto scrollbar-none"
          >
            {activeNavItems.map((item) => {
              const active = isTabActive(item.id);
              return (
                <motion.button
                  key={item.id}
                  type="button"
                  whileTap={{ scale: 0.88 }}
                  onClick={() => handleNavigation(item.id)}
                  data-testid={`nav-${item.id}-button`}
                  aria-label={item.label}
                  title={item.label}
                  aria-selected={active}
                  role="tab"
                  className="relative flex items-center justify-center w-9.5 h-9.5 sm:w-11 sm:h-11 rounded-full cursor-pointer select-none focus:outline-none shrink-0 group"
                >
                  {active ? (
                    <motion.div
                      layoutId="activeDockPill"
                      className="absolute inset-0 rounded-full bg-gradient-to-b from-[#946BFB] via-[#7B3FEF] to-[#6824EB] border border-white/25 shadow-[inset_0_1.5px_2px_rgba(255,255,255,0.45),0_4px_18px_rgba(124,58,237,0.5),0_1px_4px_rgba(0,0,0,0.4)]"
                      transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                    />
                  ) : (
                    <div className="absolute inset-0 rounded-full bg-[#1C1C20] group-hover:bg-[#25252B] transition-colors border border-white/[0.04]" />
                  )}
                  {/* Keep ONLY icons as requested */}
                  <div className="relative z-10 flex items-center justify-center text-white transition-transform group-hover:scale-105">
                    {getNavGlyph(item.id)}
                  </div>
                </motion.button>
              );
            })}
          </div>

          {/* ── Separate Circular Plus Button with Explore KANAKU Popup ── */}
          <div className="relative" ref={moreRef}>
            <motion.button
              type="button"
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setMoreOpen((v) => !v)}
              title="Explore KANAKU & Quick Actions"
              aria-label="Explore KANAKU"
              data-testid="nav-quick-action-button"
              className={cn(
                'w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center cursor-pointer transition-all shrink-0 focus:outline-none shadow-[0_10px_28px_rgba(0,0,0,0.25),0_2px_6px_rgba(0,0,0,0.12)]',
                moreOpen
                  ? 'bg-[#0F172A] border-[2.8px] border-purple-500 text-white shadow-[0_0_20px_rgba(147,51,234,0.4)]'
                  : isMoreActive
                  ? 'bg-white border-[2.8px] border-purple-600 text-purple-600 shadow-[0_0_15px_rgba(147,51,234,0.3)]'
                  : 'bg-white border-[2.8px] border-black text-black hover:bg-slate-50'
              )}
            >
              <motion.div
                animate={{ rotate: moreOpen ? 45 : 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                className="flex items-center justify-center"
              >
                <PlusGlyph />
              </motion.div>
            </motion.button>

            {/* ── Enhanced Explore KANAKU Grid Popup Menu ─────────────────────── */}
            <AnimatePresence>
              {moreOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 16, scale: 0.94 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 12, scale: 0.95 }}
                  transition={{ type: 'spring', stiffness: 450, damping: 30 }}
                  className="absolute bottom-[calc(100%+16px)] right-0 w-[290px] sm:w-[330px] max-w-[calc(100vw-20px)] bg-[#121216]/95 backdrop-blur-2xl rounded-[28px] sm:rounded-[32px] shadow-[0_24px_64px_rgba(0,0,0,0.65),0_0_0_1px_rgba(255,255,255,0.12)] p-4 sm:p-5 overflow-hidden z-50 text-white"
                >
                  {/* Quick Actions 2-Column Grid */}
                  <div className="grid grid-cols-2 gap-2 max-h-[58vh] overflow-y-auto scrollbar-thin pr-0.5">
                    {activeQuickActions.map((action) => {
                      const active = currentPage === action.id;
                      const Icon = action.icon;
                      return (
                        <motion.button
                          key={action.id}
                          type="button"
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.96 }}
                          onClick={() => handleActionClick(action.id)}
                          data-testid={`nav-quickaction-${action.id}-button`}
                          className={cn(
                            'flex items-center gap-2.5 p-2 sm:p-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer select-none text-left',
                            active
                              ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-600/30'
                              : 'bg-white/[0.04] hover:bg-white/[0.08] text-white/90 border border-white/[0.05]'
                          )}
                        >
                          <div
                            className={cn(
                              'w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-xs',
                              action.colorClass
                            )}
                          >
                            <Icon className="w-4 h-4 text-white" strokeWidth={2.2} />
                          </div>
                          <span className="truncate text-xs font-semibold">{action.shortLabel || action.label}</span>
                        </motion.button>
                      );
                    })}
                  </div>

                  {/* Footer: Customize Link */}
                  <div className="pt-2.5 mt-2.5 border-t border-white/10 flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setMoreOpen(false);
                        setCustomizeTab('quick-actions');
                        setShowCustomizeModal(true);
                      }}
                      className="flex items-center gap-1 text-xs font-bold text-purple-400 hover:text-purple-300 transition-colors cursor-pointer select-none"
                      title="Customize Quick Actions"
                      data-testid="nav-customize-quick-actions-button"
                    >
                      <span>Customize</span>
                      <span aria-hidden="true">→</span>
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </div>
      </nav>
    </>
  );
};

export default BottomNav;
