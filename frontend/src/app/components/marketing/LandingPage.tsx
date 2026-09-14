import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  TrendingUp,
  Shield,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Lock,
  PieChart,
  Zap,
  Users,
  ChevronRight,
  Wallet,
  Smartphone,
  Star,
  Activity,
  Sliders,
  DollarSign,
  Layers,
  Award,
  CircleDollarSign,
} from 'lucide-react';
import { KANAKULogo } from '@/app/components/ui/KANAKULogo';
import { PublicNavbar } from '@/app/components/ui/PublicNavbar';

interface LandingPageProps {
  onGetStarted: () => void;
  onLogin: () => void;
  onNavigate: (page: string) => void;
}

// Animated counter hook
function useCounter(target: number, duration = 1600, start = false) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!start) return;
    let startTime: number | null = null;
    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration, start]);
  return count;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onGetStarted,
  onLogin,
  onNavigate,
}) => {
  const [statsVisible, setStatsVisible] = useState(false);
  const statsRef = useRef<HTMLDivElement>(null);

  // Animated counters
  const usersCount = useCounter(54, 1500, statsVisible);
  const transactionsCount = useCounter(3, 1600, statsVisible);
  const savingsPct = useCounter(28, 1400, statsVisible);

  // Interactive Feature Tab state
  const [activeTab, setActiveTab] = useState<'analytics' | 'ai' | 'investments' | 'split'>('ai');

  // Interactive Wealth Calculator state
  const [monthlySavings, setMonthlySavings] = useState(15000);
  const [investmentReturn, setInvestmentReturn] = useState(12);

  // Trigger counters when stats section is in view
  useEffect(() => {
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setStatsVisible(true);
      },
      { threshold: 0.25 }
    );
    if (statsRef.current) obs.observe(statsRef.current);
    return () => obs.disconnect();
  }, []);

  // Calculate wealth projections
  const projection = useMemo(() => {
    const r = investmentReturn / 100 / 12;
    const calcFutureValue = (months: number) => {
      if (r === 0) return monthlySavings * months;
      return Math.round(monthlySavings * ((Math.pow(1 + r, months) - 1) / r));
    };
    return {
      yr1: calcFutureValue(12),
      yr3: calcFutureValue(36),
      yr5: calcFutureValue(60),
    };
  }, [monthlySavings, investmentReturn]);

  const featureTabs = [
    {
      id: 'ai',
      label: 'AI Insights',
      icon: Sparkles,
      title: 'Autonomous Financial Intelligence',
      description:
        'KANAKU analyzes cash flows to highlight silent leakages, optimize monthly recurring bills, and uncover tax-saving avenues in real time.',
      badge: 'Powered by On-Device AI',
      mockData: {
        insight: 'Potential ₹6,800/mo extra savings detected in recurring digital subscriptions.',
        confidence: '98% accuracy',
        action: 'Automate SIP of ₹5,000 in Nifty 50 Index Fund',
      },
    },
    {
      id: 'analytics',
      label: 'Smart Analytics',
      icon: TrendingUp,
      title: 'Visual Spending Intelligence',
      description:
        'Categorized breakdowns with automated SMS detection and multi-account reconciliation. See your net cash flow across banks instantly.',
      badge: 'Zero Manual Entry',
      mockData: {
        income: '₹1,25,000',
        expense: '₹48,320',
        savingsRate: '61.3%',
      },
    },
    {
      id: 'investments',
      label: 'Multi-Asset Portfolio',
      icon: Layers,
      title: 'Unified Wealth Dashboard',
      description:
        'Track physical Gold with live market rates, domestic equities, mutual funds, and fixed deposits in one consolidated valuation.',
      badge: 'Live Market Sync',
      mockData: {
        equity: '₹5,40,000 (+18.4%)',
        gold: '₹2,80,000 (+11.2%)',
        cash: '₹1,15,000 (Liquid)',
      },
    },
    {
      id: 'split',
      label: 'Group Expenses',
      icon: Users,
      title: 'Transparent Trip & Flat Splits',
      description:
        'Split restaurant bills, rent, and vacation expenses with friends. Settle balances seamlessly without awkward spreadsheets.',
      badge: 'Smart Debt Minimizer',
      mockData: {
        totalGroup: '₹34,500',
        youOwe: '₹0.00',
        youReceive: '₹4,850',
      },
    },
  ];

  const bentoCards = [
    {
      icon: <Sparkles className="w-6 h-6 text-violet-600" />,
      title: 'Predictive Cash Flow AI',
      desc: 'Anticipate upcoming expenses and salary credits before they occur. Never get caught short on EMI due dates.',
      gradient: 'from-violet-500/10 via-purple-500/5 to-transparent',
      border: 'hover:border-violet-500/30',
      tag: 'Predictive Tech',
    },
    {
      icon: <Shield className="w-6 h-6 text-emerald-600" />,
      title: 'Fort Knox Privacy & Offline First',
      desc: 'Your financial data is encrypted locally with AES-256. Works flawlessly without internet connection.',
      gradient: 'from-emerald-500/10 via-teal-500/5 to-transparent',
      border: 'hover:border-emerald-500/30',
      tag: 'Zero-Knowledge',
    },
    {
      icon: <PieChart className="w-6 h-6 text-blue-600" />,
      title: 'Visual Budget Guards',
      desc: 'Set custom spending thresholds with proactive warning alerts before budget limits are breached.',
      gradient: 'from-blue-500/10 via-indigo-500/5 to-transparent',
      border: 'hover:border-blue-500/30',
      tag: 'Active Alerts',
    },
    {
      icon: <Smartphone className="w-6 h-6 text-amber-600" />,
      title: 'Smart SMS & Receipt Scanner',
      desc: 'Automatically capture transactional alerts and scan grocery bills using embedded on-device OCR.',
      gradient: 'from-amber-500/10 via-orange-500/5 to-transparent',
      border: 'hover:border-amber-500/30',
      tag: 'Auto Capture',
    },
    {
      icon: <Layers className="w-6 h-6 text-pink-600" />,
      title: 'Multi-Asset Gold & Stock Tracker',
      desc: 'Keep pulse on 24K/22K Gold commodity fluctuations and mutual fund NAVs updated automatically.',
      gradient: 'from-pink-500/10 via-rose-500/5 to-transparent',
      border: 'hover:border-pink-500/30',
      tag: 'Live Rates',
    },
    {
      icon: <Users className="w-6 h-6 text-indigo-600" />,
      title: 'Cooperative Advisor Planning',
      desc: 'Optionally collaborate with certified financial advisors using permissioned, read-only session tokens.',
      gradient: 'from-indigo-500/10 via-blue-500/5 to-transparent',
      border: 'hover:border-indigo-500/30',
      tag: 'Pro Advisory',
    },
  ];

  return (
    <div className="relative min-h-screen bg-[#FDFEFE] text-slate-900 font-sans selection:bg-violet-500 selection:text-white overflow-x-hidden">
      {/* Dynamic Background Glow Elements */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden z-0">
        <div className="absolute -top-40 -left-40 w-[650px] h-[650px] rounded-full bg-gradient-to-tr from-violet-200/45 via-indigo-100/30 to-transparent blur-[130px]" />
        <div className="absolute top-20 right-0 w-[580px] h-[580px] rounded-full bg-gradient-to-bl from-pink-200/40 via-purple-100/25 to-transparent blur-[120px]" />
        <div className="absolute top-[45%] left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full bg-blue-100/30 blur-[150px]" />
      </div>

      {/* Modern Floating Navbar */}
      <PublicNavbar
        onNavigate={onNavigate}
        onLogin={onLogin}
        onGetStarted={onGetStarted}
        currentPage="landing"
      />

      {/* ─── Hero Section ─────────────────────────────────────────── */}
      <section id="home" className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-36 sm:pt-44 lg:pt-48 pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          {/* Left Hero Column */}
          <div className="lg:col-span-7 space-y-7">
            {/* Top Pill Badge */}
            <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-violet-50/80 border border-violet-200/80 shadow-sm backdrop-blur-md">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-600" />
              </span>
              <span className="text-xs font-bold text-violet-900 tracking-wide">
                Next-Gen Financial Intelligence 2.0
              </span>
              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-violet-600 text-white">
                Live
              </span>
            </div>

            {/* Main Headline */}
            <h1 className="text-4xl sm:text-6xl lg:text-[4rem] font-black text-slate-900 leading-[1.08] tracking-tight">
              Master Your Money with{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 via-purple-600 to-pink-600">
                AI Precision.
              </span>
            </h1>

            {/* Description */}
            <p className="text-slate-600 text-base sm:text-lg lg:text-xl leading-relaxed max-w-2xl font-normal">
              At <strong className="font-semibold text-slate-900">KANAKU</strong>, we are the architects of your financial future. Experience intelligent expense tracking, local-first bank-grade encryption, and proactive wealth recommendations — without your data ever being sold.
            </p>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 pt-2">
              <button
                data-testid="landing-page-get-started"
                onClick={onGetStarted}
                className="group inline-flex items-center justify-center gap-2.5 px-8 py-4 rounded-2xl bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 text-white font-bold text-sm sm:text-base shadow-xl shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200"
              >
                <span>Get Started Free</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>

              <button
                data-testid="landing-page-watch-demo"
                onClick={() => {
                  const el = document.getElementById('interactive-demo');
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                }}
                className="inline-flex items-center justify-center gap-2 px-6 py-4 rounded-2xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 font-bold text-sm sm:text-base shadow-sm hover:shadow transition-all duration-200"
              >
                <Sliders className="w-4 h-4 text-violet-600" />
                <span>Simulate Wealth</span>
              </button>
            </div>

            {/* Social Proof Bar */}
            <div className="pt-4 flex flex-wrap items-center gap-5 border-t border-slate-200/60">
              <div className="flex -space-x-2.5">
                {[
                  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=80&q=80',
                  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=80&q=80',
                  'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=80&q=80',
                  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=80&q=80',
                ].map((src, i) => (
                  <img
                    key={i}
                    src={src}
                    alt="User"
                    className="w-9 h-9 rounded-full border-2 border-white object-cover shadow-sm ring-1 ring-slate-900/5"
                  />
                ))}
              </div>
              <div className="text-xs sm:text-sm text-slate-600">
                <div className="flex items-center gap-1 text-amber-500 mb-0.5">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-3.5 h-3.5 fill-current" />
                  ))}
                  <span className="font-bold text-slate-800 ml-1">4.9 / 5.0</span>
                </div>
                <p>
                  Trusted by <strong className="font-bold text-slate-900">50,000+</strong> users & families in India
                </p>
              </div>
            </div>
          </div>

          {/* Right Hero Column: Interactive Simulated Financial Glass Dashboard */}
          <div className="lg:col-span-5 relative">
            <div className="relative mx-auto max-w-md lg:max-w-none">
              {/* Outer Glow Halo */}
              <div className="absolute -inset-2 rounded-[2.5rem] bg-gradient-to-tr from-violet-500/20 via-pink-500/20 to-blue-500/20 blur-xl opacity-80 animate-pulse" />

              {/* Main Simulated Financial Glass Card */}
              <div className="relative rounded-[2rem] bg-white/90 backdrop-blur-2xl border border-white/80 p-6 sm:p-7 shadow-[0_24px_50px_-12px_rgba(15,23,42,0.12)] ring-1 ring-slate-900/5 space-y-5">
                {/* Header of simulated card */}
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-violet-500/30">
                      <KANAKULogo className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 leading-tight">Net Worth Overview</h4>
                      <p className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Synchronized locally
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                    INR (₹)
                  </span>
                </div>

                {/* Net worth balance & trend */}
                <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white rounded-2xl p-5 shadow-lg relative overflow-hidden">
                  <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 rounded-full bg-violet-500/20 blur-2xl pointer-events-none" />
                  <p className="text-xs font-semibold text-slate-300 mb-1 tracking-wider uppercase">Total Portfolio</p>
                  <div className="flex items-baseline gap-2.5">
                    <span className="text-3xl font-black tracking-tight">₹8,42,850</span>
                    <span className="text-xs font-bold text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-500/30">
                      +18.4% MoM
                    </span>
                  </div>

                  {/* Sparkline mini bar chart */}
                  <div className="mt-4 pt-3 border-t border-slate-700/60 flex items-end justify-between gap-1.5 h-12">
                    {[35, 45, 40, 60, 55, 70, 65, 80, 75, 90, 85, 100].map((val, idx) => (
                      <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                        <div
                          className="w-full rounded-t bg-gradient-to-t from-violet-500 to-indigo-400 transition-all hover:bg-emerald-400 cursor-pointer"
                          style={{ height: `${val}%` }}
                          title={`Week ${idx + 1}`}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Floating AI Insight Pill */}
                <div className="rounded-xl p-3.5 bg-violet-50/80 border border-violet-200/70 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-violet-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div className="text-xs">
                    <p className="font-bold text-slate-900">AI Wealth Intelligence</p>
                    <p className="text-slate-600 mt-0.5 leading-relaxed">
                      Identified ₹4,200/mo unused subscriptions. Moving this to your Emergency Fund will reach your 6-month goal 42 days earlier.
                    </p>
                  </div>
                </div>

                {/* Recent Micro Transactions */}
                <div className="space-y-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Recent Automatic Sync</p>
                  {[
                    { title: 'Salary Credit - Tech Corp', amount: '+₹1,15,000', tag: 'Income', color: 'text-emerald-600 bg-emerald-50' },
                    { title: 'Sovereign Gold Bond SIP', amount: '-₹10,000', tag: 'Investment', color: 'text-amber-600 bg-amber-50' },
                    { title: 'Groceries & Household', amount: '-₹3,240', tag: 'Expense', color: 'text-rose-600 bg-rose-50' },
                  ].map((tx, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50/80 border border-slate-100 hover:bg-slate-100/70 transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md ${tx.color}`}>
                          {tx.tag}
                        </span>
                        <span className="text-xs font-semibold text-slate-800">{tx.title}</span>
                      </div>
                      <span className={`text-xs font-bold ${tx.amount.startsWith('+') ? 'text-emerald-600' : 'text-slate-900'}`}>
                        {tx.amount}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Floating Shield Badge */}
              <div className="absolute -bottom-5 -left-5 bg-white/95 backdrop-blur-xl border border-slate-200/80 px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center font-black">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-black text-slate-900">Zero Cloud Leak Risk</p>
                  <p className="text-[10px] font-semibold text-slate-500">AES-256 Encrypted on Device</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Trust Bar / Marquee ────────────────────────────────────── */}
      <section className="relative z-10 border-y border-slate-200/80 bg-slate-50/70 py-6 overflow-hidden">
        <div className="flex gap-10 whitespace-nowrap animate-[marquee_25s_linear_infinite]">
          {[
            'Offline-First Local Storage',
            'Bank-Grade AES-256 Encryption',
            'AI Expense Categorization',
            'Physical Gold Live Tracking',
            'Split Bills with Friends',
            'Automated SMS Detection',
            'Multi-Currency Support',
            'Comprehensive PDF Reports',
            'Offline-First Local Storage',
            'Bank-Grade AES-256 Encryption',
            'AI Expense Categorization',
            'Physical Gold Live Tracking',
            'Split Bills with Friends',
            'Automated SMS Detection',
            'Multi-Currency Support',
            'Comprehensive PDF Reports',
          ].map((feature, i) => (
            <div key={i} className="flex items-center gap-2.5 text-xs sm:text-sm font-bold text-slate-600">
              <CheckCircle2 className="w-4 h-4 text-violet-600 shrink-0" />
              <span>{feature}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Interactive Feature Explorer ──────────────────────────── */}
      <section id="features" className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 sm:py-32">
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
          <p className="text-xs font-extrabold uppercase tracking-widest text-violet-600">
            Interactive Product Preview
          </p>
          <h2 className="text-3xl sm:text-5xl font-black text-slate-900 tracking-tight">
            Designed for Financial Clarity
          </h2>
          <p className="text-slate-600 text-base sm:text-lg">
            Experience the tools that make managing wealth intuitive, proactive, and effortless.
          </p>

          {/* Tab selector */}
          <div className="flex flex-wrap justify-center gap-2 pt-4">
            {featureTabs.map((tab) => {
              const Icon = tab.icon;
              const isSelected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs sm:text-sm font-bold transition-all duration-200 ${
                    isSelected
                      ? 'bg-violet-600 text-white shadow-lg shadow-violet-500/25 scale-105'
                      : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Dynamic Tab Showcase Container */}
        {(() => {
          const tab = featureTabs.find((t) => t.id === activeTab) || featureTabs[0];
          return (
            <div className="rounded-[2.5rem] bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 text-white p-8 sm:p-12 lg:p-16 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-96 h-96 bg-violet-600/20 rounded-full blur-3xl pointer-events-none" />

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center relative z-10">
                <div className="lg:col-span-6 space-y-6">
                  <span className="inline-block px-3 py-1 rounded-full text-xs font-extrabold bg-violet-500/20 text-violet-300 border border-violet-400/30">
                    {tab.badge}
                  </span>
                  <h3 className="text-2xl sm:text-4xl font-black leading-tight">{tab.title}</h3>
                  <p className="text-slate-300 text-base sm:text-lg leading-relaxed">{tab.description}</p>
                  <button
                    onClick={onGetStarted}
                    className="inline-flex items-center gap-2 text-sm font-bold text-violet-300 hover:text-white transition-colors"
                  >
                    <span>Try this feature now</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Mockup Card */}
                <div className="lg:col-span-6">
                  <div className="bg-white/10 backdrop-blur-xl border border-white/15 rounded-3xl p-6 sm:p-8 space-y-4 shadow-2xl">
                    <div className="flex items-center justify-between border-b border-white/10 pb-4">
                      <span className="text-xs font-bold text-slate-300">Live Feature Telemetry</span>
                      <span className="text-xs font-bold text-emerald-400">● Active</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {Object.entries(tab.mockData).map(([key, val], i) => (
                        <div key={i} className="p-4 rounded-2xl bg-white/5 border border-white/10">
                          <p className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">
                            {key.replace(/([A-Z])/g, ' $1')}
                          </p>
                          <p className="text-base sm:text-lg font-black text-white mt-1">{val}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </section>

      {/* ─── Interactive Wealth & Savings Simulator ────────────────── */}
      <section id="interactive-demo" className="relative z-10 bg-slate-50/80 py-24 sm:py-32 border-y border-slate-200/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
            <span className="text-xs font-extrabold uppercase tracking-widest text-violet-600">
              Interactive Wealth Calculator
            </span>
            <h2 className="text-3xl sm:text-5xl font-black text-slate-900 tracking-tight">
              See How Small Savings Multiply
            </h2>
            <p className="text-slate-600 text-base sm:text-lg">
              Drag the sliders below to calculate your projected wealth growth using disciplined smart budgeting and compound interest.
            </p>
          </div>

          <div className="max-w-4xl mx-auto rounded-[2.5rem] bg-white border border-slate-200/80 p-8 sm:p-12 shadow-xl">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
              {/* Sliders Column */}
              <div className="space-y-8">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-sm font-bold text-slate-800">Monthly Savings Amount</label>
                    <span className="text-base font-black text-violet-600">
                      ₹{monthlySavings.toLocaleString('en-IN')}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={2000}
                    max={100000}
                    step={1000}
                    value={monthlySavings}
                    onChange={(e) => setMonthlySavings(Number(e.target.value))}
                    className="w-full accent-violet-600 h-2 bg-slate-200 rounded-lg cursor-pointer"
                  />
                  <div className="flex justify-between text-[11px] font-bold text-slate-400 mt-1">
                    <span>₹2,000</span>
                    <span>₹50,000</span>
                    <span>₹1,00,000</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-sm font-bold text-slate-800">Expected Annual Return</label>
                    <span className="text-base font-black text-violet-600">{investmentReturn}% p.a.</span>
                  </div>
                  <input
                    type="range"
                    min={6}
                    max={18}
                    step={1}
                    value={investmentReturn}
                    onChange={(e) => setInvestmentReturn(Number(e.target.value))}
                    className="w-full accent-violet-600 h-2 bg-slate-200 rounded-lg cursor-pointer"
                  />
                  <div className="flex justify-between text-[11px] font-bold text-slate-400 mt-1">
                    <span>6% (Fixed Deposit)</span>
                    <span>12% (Index Funds)</span>
                    <span>18% (Equities)</span>
                  </div>
                </div>
              </div>

              {/* Output Column */}
              <div className="bg-gradient-to-br from-violet-600 via-indigo-600 to-blue-600 rounded-3xl p-6 sm:p-8 text-white space-y-5 shadow-lg">
                <p className="text-xs font-extrabold uppercase tracking-wider text-violet-200">
                  Projected Wealth Accumulation
                </p>
                <div>
                  <span className="text-xs text-violet-100">In 5 Years</span>
                  <p className="text-3xl sm:text-4xl font-black mt-0.5">
                    ₹{projection.yr5.toLocaleString('en-IN')}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/20">
                  <div>
                    <span className="text-xs text-violet-100">In 1 Year</span>
                    <p className="text-lg sm:text-xl font-bold mt-0.5">
                      ₹{projection.yr1.toLocaleString('en-IN')}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-violet-100">In 3 Years</span>
                    <p className="text-lg sm:text-xl font-bold mt-0.5">
                      ₹{projection.yr3.toLocaleString('en-IN')}
                    </p>
                  </div>
                </div>

                <button
                  onClick={onGetStarted}
                  className="w-full py-3.5 rounded-xl bg-white text-slate-900 font-bold text-sm shadow-md hover:bg-slate-50 transition-colors"
                >
                  Start Saving with KANAKU
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Bento Grid Section ───────────────────────────────────── */}
      <section className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 sm:py-32">
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
          <span className="text-xs font-extrabold uppercase tracking-widest text-violet-600">
            Engineered For Excellence
          </span>
          <h2 className="text-3xl sm:text-5xl font-black text-slate-900 tracking-tight">
            Everything You Need Under One Roof
          </h2>
          <p className="text-slate-600 text-base sm:text-lg">
            Replace dozens of disparate apps, spreadsheets, and banking portals with one holistic, privacy-preserving solution.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {bentoCards.map((card, i) => (
            <div
              key={i}
              className={`group relative rounded-3xl bg-white border border-slate-200/80 p-7 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 ${card.border}`}
            >
              <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mb-5 shadow-sm group-hover:scale-110 transition-transform">
                {card.icon}
              </div>
              <span className="text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
                {card.tag}
              </span>
              <h3 className="text-lg font-bold text-slate-900 mt-3 mb-2">{card.title}</h3>
              <p className="text-sm text-slate-600 leading-relaxed">{card.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Metrics / Stats Bar ──────────────────────────────────── */}
      <section ref={statsRef} className="relative z-10 bg-slate-900 text-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 text-center">
            <div className="space-y-1">
              <p className="text-3xl sm:text-5xl font-black text-white">{usersCount}k+</p>
              <p className="text-xs sm:text-sm font-semibold text-slate-400">Active Individuals & Families</p>
            </div>
            <div className="space-y-1">
              <p className="text-3xl sm:text-5xl font-black text-white">{transactionsCount}M+</p>
              <p className="text-xs sm:text-sm font-semibold text-slate-400">Transactions Reconciled</p>
            </div>
            <div className="space-y-1">
              <p className="text-3xl sm:text-5xl font-black text-emerald-400">{savingsPct}%</p>
              <p className="text-xs sm:text-sm font-semibold text-slate-400">Avg. Annual Savings Growth</p>
            </div>
            <div className="space-y-1">
              <p className="text-3xl sm:text-5xl font-black text-white">99.99%</p>
              <p className="text-xs sm:text-sm font-semibold text-slate-400">Offline Uptime SLA</p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── High-Conversion CTA Banner ───────────────────────────── */}
      <section className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
        <div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-violet-600 via-indigo-600 to-pink-600 p-10 sm:p-16 text-center text-white shadow-2xl shadow-indigo-500/25">
          {/* Decorative ambient orbs */}
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-80 h-80 rounded-full bg-white/10 blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-80 h-80 rounded-full bg-white/10 blur-3xl pointer-events-none" />

          <span className="inline-block px-4 py-1.5 rounded-full text-xs font-extrabold uppercase tracking-widest bg-white/20 text-white mb-6 border border-white/20">
            Start Free Forever
          </span>

          <h2 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight max-w-3xl mx-auto leading-tight mb-6">
            Take Control of Your Financial Freedom Today
          </h2>

          <p className="text-white/80 text-base sm:text-lg max-w-xl mx-auto mb-8 leading-relaxed">
            Join thousands of smart earners who use KANAKU to track every rupee, multiply savings, and secure their future.
          </p>

          <button
            data-testid="landing-page-yes-get-started-free"
            onClick={onGetStarted}
            className="inline-flex items-center justify-center gap-2 px-10 py-4 rounded-full bg-white text-slate-900 font-extrabold text-sm sm:text-base hover:bg-slate-50 transition-all hover:scale-105 active:scale-95 shadow-xl shadow-black/20"
          >
            <span>Create Free Account</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <div className="flex flex-wrap justify-center items-center gap-6 mt-6 text-xs text-white/70 font-medium">
            <span>✓ No credit card required</span>
            <span>✓ 2-minute instant onboarding</span>
            <span>✓ Encrypted offline data</span>
          </div>
        </div>
      </section>

      {/* ─── Comprehensive Multi-Column Footer ─────────────────────── */}
      <footer className="relative z-10 border-t border-slate-200 bg-white text-slate-600 pt-16 pb-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 mb-12">
            {/* Brand column */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-violet-50 flex items-center justify-center border border-violet-100">
                  <KANAKULogo className="w-6 h-6" />
                </div>
                <span className="text-xl font-black text-slate-900 tracking-tight">KANAKU</span>
              </div>
              <p className="text-sm text-slate-500 max-w-sm leading-relaxed">
                The privacy-first financial operating system empowering users with automated analytics, offline-first reliability, and generative wealth insights.
              </p>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                All Cloud Services Operational
              </div>
            </div>

            {/* Navigation columns */}
            <div>
              <h5 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 mb-4">Product</h5>
              <ul className="space-y-2.5 text-sm">
                <li>
                  <button onClick={() => onNavigate('landing')} className="hover:text-slate-900 transition-colors">
                    Overview
                  </button>
                </li>
                <li>
                  <button onClick={() => onNavigate('pricing')} className="hover:text-slate-900 transition-colors">
                    Pricing Plans
                  </button>
                </li>
                <li>
                  <button onClick={() => onNavigate('about')} className="hover:text-slate-900 transition-colors">
                    About Kanaku
                  </button>
                </li>
              </ul>
            </div>

            <div>
              <h5 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 mb-4">Support & Trust</h5>
              <ul className="space-y-2.5 text-sm">
                <li>
                  <button onClick={() => onNavigate('contact')} className="hover:text-slate-900 transition-colors">
                    Contact Helpdesk
                  </button>
                </li>
                <li>
                  <button onClick={() => onNavigate('privacy')} className="hover:text-slate-900 transition-colors">
                    Privacy Policy
                  </button>
                </li>
                <li>
                  <button onClick={() => onNavigate('terms')} className="hover:text-slate-900 transition-colors">
                    Terms of Service
                  </button>
                </li>
                <li>
                  <button onClick={() => onNavigate('data-deletion')} className="hover:text-slate-900 transition-colors">
                    Data Deletion
                  </button>
                </li>
              </ul>
            </div>

            <div>
              <h5 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 mb-4">Security</h5>
              <p className="text-xs text-slate-500 leading-relaxed mb-3">
                Built with local-first indexedDB storage, AES-256 master key encryption, and biometric PIN gateways.
              </p>
              <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                <Shield className="w-4 h-4 text-emerald-600" />
                <span>ISO 27001 Compliant Architecture</span>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400 font-medium">
            <p>© {new Date().getFullYear()} KANAKU. Built with pride by Shaik Ashraf K. All rights reserved.</p>
            <div className="flex items-center gap-6">
              <button onClick={() => onNavigate('privacy')} className="hover:text-slate-600 transition-colors">
                Privacy
              </button>
              <button onClick={() => onNavigate('terms')} className="hover:text-slate-600 transition-colors">
                Terms
              </button>
              <button onClick={() => onNavigate('contact')} className="hover:text-slate-600 transition-colors">
                Support
              </button>
            </div>
          </div>
        </div>
      </footer>

      {/* Keyframe styles */}
      <style>{`
        @keyframes marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
};
