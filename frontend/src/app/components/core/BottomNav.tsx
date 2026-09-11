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
} from 'lucide-react';

export interface BottomNavProps {
  onQuickAdd: () => void;
}

// ── Custom Pixel-Perfect SVGs Matching User Reference Image ──────────────────
const HomeGlyph: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    {/* Geometric modern tapered house with center cutout notch */}
    <path d="M12 3.1a1.5 1.5 0 0 1 1 .38l6.7 5.7c.48.4.75 1 .75 1.63v8.59a1.6 1.6 0 0 1-1.6 1.6h-4.35v-4.9c0-.77-.63-1.4-1.4-1.4h-2.2c-.77 0-1.4.63-1.4 1.4v4.9H5.15a1.6 1.6 0 0 1-1.6-1.6V10.8c0-.63.27-1.22.75-1.62l6.7-5.71a1.5 1.5 0 0 1 1-.37z" />
  </svg>
);

const ChartGlyph: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.3"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    {/* L-shaped curved axis */}
    <path d="M4.5 5.5v11a2.2 2.2 0 0 0 2.2 2.2h12.8" />
    {/* 3 vertical rounded bars */}
    <path d="M8.5 14.5v-5" />
    <path d="M12.5 14.5v-8" />
    <path d="M16.5 14.5v-3.5" />
  </svg>
);

const SparkleGlyph: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    {/* Organic pinched 4-point star */}
    <path d="M10.8 4c0 3.6-2.6 6.4-6.3 6.4 3.7 0 6.3 2.8 6.3 6.4 0-3.6 2.6-6.4 6.3-6.4-3.7 0-6.3-2.8-6.3-6.4z" />
    {/* Top-right accent star */}
    <path d="M18.5 4.5v3M17 6h3" strokeWidth="2" />
  </svg>
);

const CoinsGlyph: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    width="23"
    height="23"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    {/* Left coin stack */}
    <ellipse cx="8" cy="6.8" rx="4.8" ry="2.2" />
    <path d="M3.2 6.8v4.2c0 1.2 2.1 2.2 4.8 2.2s4.8-1 4.8-2.2V6.8" />
    <path d="M3.2 11v4.2c0 1.2 2.1 2.2 4.8 2.2s4.8-1 4.8-2.2V11" />
    {/* Right coin stack */}
    <path d="M12.8 10.5c.8-.7 1.9-1.1 3.4-1.1 2.7 0 4.6.9 4.6 2.1v4.2c0 1.2-1.9 2.1-4.6 2.1-1.5 0-2.6-.4-3.4-1.1" />
    <path d="M12.8 14.8c.8.6 1.9 1 3.4 1 2.7 0 4.6-.9 4.6-2.1" />
  </svg>
);

const MoreGlyph: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    className={className}
    aria-hidden="true"
  >
    {/* 3 open ring dots matching reference image */}
    <circle cx="6.5" cy="12" r="1.6" />
    <circle cx="12" cy="12" r="1.6" />
    <circle cx="17.5" cy="12" r="1.6" />
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

// ── Secondary pages in the More popup ──────────────────────────────────────
const MORE_ITEMS = [
  { id: 'accounts', label: 'Accounts', icon: Wallet, color: 'from-blue-500 to-indigo-600' },
  { id: 'investments', label: 'Investments', icon: TrendingUp, color: 'from-emerald-500 to-teal-600' },
  { id: 'calendar', label: 'Calendar', icon: CalendarIcon, color: 'from-amber-500 to-orange-600' },
  { id: 'recurring-transactions', label: 'Recurring', icon: Repeat, color: 'from-purple-500 to-violet-600' },
  { id: 'budget-alerts', label: 'Budget Alerts', icon: BellRing, color: 'from-rose-500 to-pink-600' },
  { id: 'loans', label: 'Loans & EMI', icon: HandCoins, color: 'from-cyan-500 to-blue-600' },
  { id: 'groups', label: 'Groups & Friends', icon: Users, color: 'from-violet-500 to-purple-600' },
  { id: 'settings', label: 'Settings', icon: SettingsIcon, color: 'from-slate-600 to-slate-800' },
];

export const BottomNav: React.FC<BottomNavProps> = ({ onQuickAdd }) => {
  const { currentPage, setCurrentPage } = useApp();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  // Close more menu on click outside
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
    if (itemId === 'reports' && (currentPage === 'analytics' || currentPage === 'ai-insights')) return true;
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
    <>
      {/* Backdrop overlay when More menu is open */}
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

      <nav
        className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pointer-events-none pb-[max(14px,calc(env(safe-area-inset-bottom,0px)+12px))] px-3 select-none"
        role="navigation"
        aria-label="Bottom Navigation"
      >
        {/* Ambient Backlight Glow under Dock */}
        <div
          className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-[340px] h-[70px] rounded-full bg-purple-600/15 blur-2xl pointer-events-none"
          aria-hidden="true"
        />

        {/* Outer Flex Container: Dark Capsule + Separate White Quick Add Circle */}
        <div className="pointer-events-auto relative flex items-center gap-2.5 sm:gap-3">

          {/* ── Dark Capsule Dock (Matching Reference Image) ─────────────── */}
          <div className="relative bg-[#000000] border border-white/[0.12] rounded-full p-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.6),0_2px_8px_rgba(0,0,0,0.4)] flex items-center gap-1 sm:gap-1.5">

            {/* 1. Dashboard / Home */}
            <motion.button
              type="button"
              whileTap={{ scale: 0.88 }}
              onClick={() => handleNavigation('dashboard')}
              data-testid="nav-dashboard-button"
              aria-label="Dashboard"
              aria-selected={isTabActive('dashboard')}
              role="tab"
              className="relative flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-full cursor-pointer select-none focus:outline-none shrink-0 group"
            >
              {isTabActive('dashboard') ? (
                <motion.div
                  layoutId="activeDockPill"
                  className="absolute inset-0 rounded-full bg-gradient-to-b from-[#946BFB] via-[#7B3FEF] to-[#6824EB] border border-white/25 shadow-[inset_0_1.5px_2px_rgba(255,255,255,0.45),0_4px_18px_rgba(124,58,237,0.5),0_1px_4px_rgba(0,0,0,0.4)]"
                  transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                />
              ) : (
                <div className="absolute inset-0 rounded-full bg-[#1C1C20] group-hover:bg-[#25252B] transition-colors border border-white/[0.04]" />
              )}
              <div className="relative z-10 flex items-center justify-center text-white transition-transform group-hover:scale-105">
                <HomeGlyph />
              </div>
            </motion.button>

            {/* 2. Transactions / Trends */}
            <motion.button
              type="button"
              whileTap={{ scale: 0.88 }}
              onClick={() => handleNavigation('transactions')}
              data-testid="nav-transactions-button"
              aria-label="Transactions"
              aria-selected={isTabActive('transactions')}
              role="tab"
              className="relative flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-full cursor-pointer select-none focus:outline-none shrink-0 group"
            >
              {isTabActive('transactions') ? (
                <motion.div
                  layoutId="activeDockPill"
                  className="absolute inset-0 rounded-full bg-gradient-to-b from-[#946BFB] via-[#7B3FEF] to-[#6824EB] border border-white/25 shadow-[inset_0_1.5px_2px_rgba(255,255,255,0.45),0_4px_18px_rgba(124,58,237,0.5),0_1px_4px_rgba(0,0,0,0.4)]"
                  transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                />
              ) : (
                <div className="absolute inset-0 rounded-full bg-[#1C1C20] group-hover:bg-[#25252B] transition-colors border border-white/[0.04]" />
              )}
              <div className="relative z-10 flex items-center justify-center text-white transition-transform group-hover:scale-105">
                <ChartGlyph />
              </div>
            </motion.button>

            {/* 3. Reports / AI Insights */}
            <motion.button
              type="button"
              whileTap={{ scale: 0.88 }}
              onClick={() => handleNavigation('reports')}
              data-testid="nav-reports-button"
              aria-label="Reports"
              aria-selected={isTabActive('reports')}
              role="tab"
              className="relative flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-full cursor-pointer select-none focus:outline-none shrink-0 group"
            >
              {isTabActive('reports') ? (
                <motion.div
                  layoutId="activeDockPill"
                  className="absolute inset-0 rounded-full bg-gradient-to-b from-[#946BFB] via-[#7B3FEF] to-[#6824EB] border border-white/25 shadow-[inset_0_1.5px_2px_rgba(255,255,255,0.45),0_4px_18px_rgba(124,58,237,0.5),0_1px_4px_rgba(0,0,0,0.4)]"
                  transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                />
              ) : (
                <div className="absolute inset-0 rounded-full bg-[#1C1C20] group-hover:bg-[#25252B] transition-colors border border-white/[0.04]" />
              )}
              <div className="relative z-10 flex items-center justify-center text-white transition-transform group-hover:scale-105">
                <SparkleGlyph />
              </div>
            </motion.button>

            {/* 4. Goals / Savings */}
            <motion.button
              type="button"
              whileTap={{ scale: 0.88 }}
              onClick={() => handleNavigation('goals')}
              data-testid="nav-goals-button"
              aria-label="Goals"
              aria-selected={isTabActive('goals')}
              role="tab"
              className="relative flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-full cursor-pointer select-none focus:outline-none shrink-0 group"
            >
              {isTabActive('goals') ? (
                <motion.div
                  layoutId="activeDockPill"
                  className="absolute inset-0 rounded-full bg-gradient-to-b from-[#946BFB] via-[#7B3FEF] to-[#6824EB] border border-white/25 shadow-[inset_0_1.5px_2px_rgba(255,255,255,0.45),0_4px_18px_rgba(124,58,237,0.5),0_1px_4px_rgba(0,0,0,0.4)]"
                  transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                />
              ) : (
                <div className="absolute inset-0 rounded-full bg-[#1C1C20] group-hover:bg-[#25252B] transition-colors border border-white/[0.04]" />
              )}
              <div className="relative z-10 flex items-center justify-center text-white transition-transform group-hover:scale-105">
                <CoinsGlyph />
              </div>
            </motion.button>

            {/* 5. More (···) Menu */}
            <div className="relative" ref={moreRef}>
              <motion.button
                type="button"
                whileTap={{ scale: 0.88 }}
                onClick={() => setMoreOpen((v) => !v)}
                data-testid="nav-more-button"
                aria-label="More Pages"
                aria-selected={isMoreActive}
                className="relative flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-full cursor-pointer select-none focus:outline-none shrink-0 group"
              >
                {isMoreActive ? (
                  <motion.div
                    layoutId="activeDockPill"
                    className="absolute inset-0 rounded-full bg-gradient-to-b from-[#946BFB] via-[#7B3FEF] to-[#6824EB] border border-white/25 shadow-[inset_0_1.5px_2px_rgba(255,255,255,0.45),0_4px_18px_rgba(124,58,237,0.5),0_1px_4px_rgba(0,0,0,0.4)]"
                    transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                  />
                ) : (
                  <div className="absolute inset-0 rounded-full bg-[#1C1C20] group-hover:bg-[#25252B] transition-colors border border-white/[0.04]" />
                )}
                <div className="relative z-10 flex items-center justify-center text-white transition-transform group-hover:scale-105">
                  <MoreGlyph />
                </div>
              </motion.button>

              {/* ── Enhanced More Grid Popup Menu ─────────────────────── */}
              <AnimatePresence>
                {moreOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 16, scale: 0.94 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 12, scale: 0.95 }}
                    transition={{ type: 'spring', stiffness: 450, damping: 30 }}
                    className="absolute bottom-[calc(100%+16px)] right-0 w-[280px] sm:w-[320px] bg-[#121216]/95 backdrop-blur-2xl rounded-[28px] shadow-[0_24px_64px_rgba(0,0,0,0.65),0_0_0_1px_rgba(255,255,255,0.12)] p-4 overflow-hidden z-50 text-white"
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/10">
                      <div>
                        <h4 className="text-sm font-black text-white tracking-tight">Explore KANAKU</h4>
                        <p className="text-[11px] text-slate-400 font-medium">Quick access to all features</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setMoreOpen(false)}
                        className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer"
                        aria-label="Close menu"
                      >
                        <X size={14} />
                      </button>
                    </div>

                    {/* 2-Column Grid */}
                    <div className="grid grid-cols-2 gap-2">
                      {MORE_ITEMS.map((item) => {
                        const active = currentPage === item.id;
                        const Icon = item.icon;
                        return (
                          <motion.button
                            key={item.id}
                            type="button"
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.96 }}
                            onClick={() => handleNavigation(item.id)}
                            data-testid={`nav-more-${item.id}-button`}
                            className={cn(
                              'flex items-center gap-2.5 p-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer select-none text-left',
                              active
                                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-600/30'
                                : 'bg-white/[0.04] hover:bg-white/[0.08] text-white/90 border border-white/[0.05]'
                            )}
                          >
                            <div
                              className={cn(
                                'w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-xs',
                                active
                                  ? 'bg-white/20 text-white'
                                  : cn('bg-gradient-to-br text-white', item.color)
                              )}
                            >
                              <Icon size={16} strokeWidth={2.3} />
                            </div>
                            <span className="truncate text-xs font-semibold">{item.label}</span>
                          </motion.button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

          </div>

          {/* ── Separate Circular White Quick Add Button (Matching Image 2) ─ */}
          <motion.button
            type="button"
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.9, rotate: 90 }}
            transition={{ type: 'spring', stiffness: 500, damping: 25 }}
            onClick={() => handleNavigation('quick-action', true)}
            title="Quick Add Transaction"
            aria-label="Quick Add"
            data-testid="nav-quick-action-button"
            className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-white border-[3.2px] border-black text-black shadow-[0_10px_28px_rgba(0,0,0,0.25),0_2px_6px_rgba(0,0,0,0.12)] flex items-center justify-center cursor-pointer transition-colors hover:bg-slate-50 shrink-0 focus:outline-none"
          >
            <PlusGlyph />
          </motion.button>

        </div>
      </nav>
    </>
  );
};

export default BottomNav;
