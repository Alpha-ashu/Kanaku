import React from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, Sparkles, TrendingUp, Lock, Zap, CheckCircle2, ArrowUpRight } from 'lucide-react';
import { KanakuWordmark, DISPLAY_FONT } from '@/app/components/ui/KANAKULogo';

export const AuthShowcase: React.FC = () => {
  return (
    <div className="relative hidden lg:flex flex-col justify-between w-full h-full min-h-screen bg-gradient-to-br from-[#EDE9FE]/50 via-[#F5F4FE]/40 to-[#F8F9FD] text-slate-900 p-10 xl:p-14 2xl:p-16 overflow-hidden select-none border-r border-slate-200/90">
      {/* Ambient glowing mesh orbs matching theme */}
      <div className="absolute top-[-10%] left-[-10%] w-[520px] h-[520px] bg-violet-300/30 rounded-full blur-[130px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[520px] h-[520px] bg-indigo-200/35 rounded-full blur-[130px] pointer-events-none" />
      <div className="absolute top-[35%] right-[0%] w-[380px] h-[380px] bg-cyan-200/25 rounded-full blur-[110px] pointer-events-none" />

      {/* Radial grid texture overlay */}
      <div 
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, #7C3AED 1px, transparent 0)',
          backgroundSize: '28px 28px'
        }}
      />

      {/* Top Header / Brand Logo */}
      <div className="relative z-10">
        <KanakuWordmark
          logoClassName="w-10 h-10 flex-shrink-0 drop-shadow-[0_4px_12px_rgba(124,58,237,0.2)]"
          textClassName="text-xl xl:text-2xl font-black text-slate-900 tracking-[0.02em]"
        />
      </div>

      {/* Center Interactive Financial Card Showcase */}
      <div className="relative z-10 my-auto py-6 xl:py-8 max-w-lg w-full mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="relative bg-white/90 border border-slate-200/80 rounded-[32px] p-6 xl:p-8 backdrop-blur-2xl shadow-[0_20px_50px_-12px_rgba(112,144,176,0.18),0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden"
        >
          {/* Subtle top glare highlight line */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-violet-400/40 to-transparent" />

          {/* Metric Row */}
          <div className="flex items-start justify-between mb-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <span>Live Portfolio Ledger</span>
              </p>
              <div className="flex items-baseline gap-3">
                <span className="text-3xl xl:text-4xl font-black text-slate-900 tracking-tight">
                  ₹18,42,800
                </span>
                <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2.5 py-0.5 rounded-full shadow-xs">
                  <ArrowUpRight className="w-3.5 h-3.5" /> +14.8%
                </span>
              </div>
            </div>
            <div className="p-3 rounded-2xl bg-violet-50/90 border border-violet-100 text-violet-600 shadow-2xs">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>

          {/* Multi-asset distribution bar */}
          <div className="space-y-2.5 mb-6">
            <div className="flex justify-between text-xs font-medium">
              <span className="text-slate-600">Asset Allocation</span>
              <span className="text-emerald-600 font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                100% Synced
              </span>
            </div>
            <div className="h-3 w-full rounded-full bg-slate-100 p-0.5 gap-1 border border-slate-200/60 flex overflow-hidden">
              <div className="h-full rounded-l-full bg-gradient-to-r from-violet-500 to-indigo-500 w-[58%]" title="Mutual Funds & Stocks (58%)" />
              <div className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 w-[28%]" title="High-Yield Deposits (28%)" />
              <div className="h-full rounded-r-full bg-gradient-to-r from-emerald-400 to-teal-500 w-[14%]" title="Liquid Cash (14%)" />
            </div>
            <div className="flex items-center justify-between text-2xs xl:text-xs text-slate-500 pt-1">
              <span className="flex items-center gap-1.5 font-medium">
                <span className="w-2 h-2 rounded-full bg-violet-500 shadow-xs" /> Equities 58%
              </span>
              <span className="flex items-center gap-1.5 font-medium">
                <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-xs" /> Deposits 28%
              </span>
              <span className="flex items-center gap-1.5 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-xs" /> Cash 14%
              </span>
            </div>
          </div>

          {/* AI Financial Copilot Insight Pill */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-violet-50/90 via-indigo-50/60 to-purple-50/40 border border-violet-200/80 backdrop-blur-md flex items-start gap-3.5 shadow-2xs">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-600 text-white flex items-center justify-center flex-shrink-0 shadow-md shadow-violet-500/20">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-violet-900 mb-0.5 flex items-center gap-2">
                <span>KAI Insight</span>
                <span className="text-2xs font-bold text-violet-700 bg-violet-200/60 px-1.5 py-0.5 rounded-full border border-violet-300/60 uppercase tracking-wider">
                  Sample
                </span>
              </p>
              <p className="text-xs text-slate-600 leading-relaxed">
                You've spent <strong className="text-slate-900 font-bold">₹11,580</strong> on food this month — ₹1,210 less than at this point last month.
              </p>
            </div>
          </div>
        </motion.div>

        {/* Feature Pills */}
        <div className="grid grid-cols-3 gap-3 mt-6">
          <div className="p-3.5 rounded-2xl bg-white/80 border border-slate-200/80 backdrop-blur-sm text-center shadow-2xs hover:bg-white hover:border-violet-300 transition-all">
            <Lock className="w-4 h-4 text-violet-600 mx-auto mb-1.5" />
            <p className="text-xs font-bold text-slate-900">App Lock</p>
            <p className="text-2xs text-slate-500">PIN & biometrics</p>
          </div>
          <div className="p-3.5 rounded-2xl bg-white/80 border border-slate-200/80 backdrop-blur-sm text-center shadow-2xs hover:bg-white hover:border-amber-300 transition-all">
            <Zap className="w-4 h-4 text-amber-500 mx-auto mb-1.5" />
            <p className="text-xs font-bold text-slate-900">Local-First</p>
            <p className="text-2xs text-slate-500">Offline IndexedDB</p>
          </div>
          <div className="p-3.5 rounded-2xl bg-white/80 border border-slate-200/80 backdrop-blur-sm text-center shadow-2xs hover:bg-white hover:border-emerald-300 transition-all">
            <ShieldCheck className="w-4 h-4 text-emerald-600 mx-auto mb-1.5" />
            <p className="text-xs font-bold text-slate-900">Zero-Tracking</p>
            <p className="text-2xs text-slate-500">No Data Resale</p>
          </div>
        </div>
      </div>

      {/* Bottom Endorsement & Security SLA */}
      <div className="relative z-10 pt-4 border-t border-slate-200/80 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center font-bold text-xs text-white shadow-md ring-2 ring-violet-200">
            SA
          </div>
          <div>
            <p className="text-xs font-bold text-slate-900">Shaik Ashraf K</p>
            <p className="text-2xs text-slate-500">Founder & CEO, Kanaku</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-500 font-semibold">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>SOC2 & GDPR Compliant</span>
        </div>
      </div>
    </div>
  );
};
