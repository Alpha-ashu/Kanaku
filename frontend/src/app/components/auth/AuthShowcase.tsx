import React from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, Sparkles, TrendingUp, Lock, Zap, CheckCircle2, ArrowUpRight } from 'lucide-react';
import { KANAKULogo } from '@/app/components/ui/KANAKULogo';

export const AuthShowcase: React.FC = () => {
  return (
    <div className="relative hidden lg:flex flex-col justify-between w-full h-full min-h-screen bg-[#0A0D17] text-white p-12 xl:p-16 overflow-hidden select-none border-r border-slate-800/80">
      {/* Ambient background glows & mesh */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-violet-600/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-blue-600/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-[40%] right-[10%] w-[350px] h-[350px] bg-emerald-500/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Grid texture overlay */}
      <div 
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
          backgroundSize: '32px 32px'
        }}
      />

      {/* Top Header / Logo */}
      <div className="relative z-10">
        <div className="flex items-center gap-3">
          <KANAKULogo className="w-9 h-9 flex-shrink-0 drop-shadow-md" />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-black tracking-tight text-xl text-white">KANAKU</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider bg-violet-500/20 text-violet-300 border border-violet-500/30 uppercase">
                Pro
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium">Next-Gen Intelligent Wealth OS</p>
          </div>
        </div>
      </div>

      {/* Center Interactive Financial Card Showcase */}
      <div className="relative z-10 my-auto py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative bg-gradient-to-b from-white/[0.08] to-white/[0.02] border border-white/10 rounded-3xl p-6 xl:p-8 backdrop-blur-2xl shadow-2xl overflow-hidden"
        >
          {/* Subtle top glare */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-violet-400/40 to-transparent" />

          {/* Metric Row */}
          <div className="flex items-start justify-between mb-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Live Portfolio Ledger
              </p>
              <div className="flex items-baseline gap-3">
                <span className="text-3xl xl:text-4xl font-extrabold text-white tracking-tight">
                  ₹18,42,800
                </span>
                <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-400 bg-emerald-500/15 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                  <ArrowUpRight className="w-3.5 h-3.5" /> +14.8%
                </span>
              </div>
            </div>
            <div className="p-3 rounded-2xl bg-white/5 border border-white/10 text-violet-400">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>

          {/* Multi-asset distribution bar */}
          <div className="space-y-2 mb-6">
            <div className="flex justify-between text-xs text-slate-400 font-medium">
              <span>Asset Allocation</span>
              <span className="text-slate-200 font-semibold">100% Synced</span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-slate-800/80 overflow-hidden flex p-0.5 gap-0.5">
              <div className="h-full rounded-l-full bg-gradient-to-r from-violet-500 to-indigo-500 w-[58%]" title="Mutual Funds & Stocks (58%)" />
              <div className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 w-[28%]" title="High-Yield Deposits (28%)" />
              <div className="h-full rounded-r-full bg-gradient-to-r from-emerald-400 to-teal-500 w-[14%]" title="Liquid Cash (14%)" />
            </div>
            <div className="flex items-center gap-4 text-[11px] text-slate-400 pt-1">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-violet-500" /> Equities 58%
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-cyan-400" /> Deposits 28%
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400" /> Cash 14%
              </span>
            </div>
          </div>

          {/* AI Financial Copilot Insight Pill */}
          <div className="p-4 rounded-2xl bg-violet-500/10 border border-violet-500/20 backdrop-blur-md flex items-start gap-3.5">
            <div className="w-8 h-8 rounded-xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center flex-shrink-0 text-violet-300">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-violet-200 mb-0.5 flex items-center gap-2">
                AI Copilot Recommendation
                <span className="text-[10px] font-semibold text-violet-300/80 bg-violet-500/20 px-1.5 py-0.2 rounded">Optimized</span>
              </p>
              <p className="text-xs text-slate-300 leading-relaxed">
                Smart recurring expense trimming saved you <strong className="text-white font-bold">₹14,200</strong> this quarter across 4 subscriptions.
              </p>
            </div>
          </div>
        </motion.div>

        {/* Feature Pills */}
        <div className="grid grid-cols-3 gap-3 mt-6">
          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/5 backdrop-blur-sm text-center">
            <Lock className="w-4 h-4 text-violet-400 mx-auto mb-1.5" />
            <p className="text-xs font-bold text-slate-200">AES-256 Bit</p>
            <p className="text-[10px] text-slate-400">Bank-Grade Vault</p>
          </div>
          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/5 backdrop-blur-sm text-center">
            <Zap className="w-4 h-4 text-amber-400 mx-auto mb-1.5" />
            <p className="text-xs font-bold text-slate-200">Local-First</p>
            <p className="text-[10px] text-slate-400">Offline IndexedDB</p>
          </div>
          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/5 backdrop-blur-sm text-center">
            <ShieldCheck className="w-4 h-4 text-emerald-400 mx-auto mb-1.5" />
            <p className="text-xs font-bold text-slate-200">Zero-Tracking</p>
            <p className="text-[10px] text-slate-400">No Data Resale</p>
          </div>
        </div>
      </div>

      {/* Bottom Endorsement & Security SLA */}
      <div className="relative z-10 pt-4 border-t border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center font-bold text-xs text-white shadow-md">
            SA
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-200">Shaik Ashraf K</p>
            <p className="text-[10px] text-slate-500">Founder & CEO, Kanaku</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>SOC2 & GDPR Compliant</span>
        </div>
      </div>
    </div>
  );
};
