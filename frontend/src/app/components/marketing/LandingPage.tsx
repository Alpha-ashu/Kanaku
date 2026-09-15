import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Bell,
  CalendarClock,
  ChartColumn,
  Check,
  ChevronDown,
  CircleCheck,
  EyeOff,
  FileText,
  Fuel,
  Globe,
  HandCoins,
  Keyboard,
  Landmark,
  Lock,
  MessageSquare,
  Mic,
  Plane,
  ReceiptText,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
  WifiOff,
  Zap,
} from 'lucide-react';
import { KANAKULogo } from '@/app/components/ui/KANAKULogo';
import { PublicNavbar, KanakuWordmark, scrollToSection } from '@/app/components/ui/PublicNavbar';
import { AIOrb, type AIOrbState } from '@/app/components/features/ai/AIOrb';

interface LandingPageProps {
  onGetStarted: () => void;
  onLogin: () => void;
  onNavigate: (page: string) => void;
}

const DISPLAY_FONT = "'Manrope', 'Inter', system-ui, sans-serif";

const formatINR = (value: number) => `₹${value.toLocaleString('en-IN')}`;

// ─── Sample data for the product illustrations ────────────────────────────────

const spendByCategory = [
  { name: 'Bills & utilities', amount: 11600, pct: 24, color: 'bg-violet-600' },
  { name: 'Food & dining', amount: 11580, pct: 24, color: 'bg-sky-500' },
  { name: 'Shopping', amount: 9800, pct: 20, color: 'bg-amber-400' },
  { name: 'Other', amount: 8580, pct: 18, color: 'bg-slate-300' },
  { name: 'Transport', amount: 6760, pct: 14, color: 'bg-emerald-500' },
];

const recentTransactions = [
  { icon: ShoppingCart, tint: 'bg-violet-50 text-violet-600', title: 'DMart', meta: 'Groceries · HDFC Card', amount: '−₹1,850' },
  { icon: Zap, tint: 'bg-sky-50 text-sky-600', title: 'Electricity bill', meta: 'Bills · Auto-pay', amount: '−₹2,340' },
  { icon: Fuel, tint: 'bg-emerald-50 text-emerald-600', title: 'Indian Oil', meta: 'Transport · UPI', amount: '−₹1,200' },
  { icon: Landmark, tint: 'bg-slate-100 text-slate-600', title: 'Salary', meta: 'Income · SBI Savings', amount: '+₹85,000', positive: true },
];

const steps = [
  {
    number: '01',
    title: 'Capture in seconds',
    description:
      'Say it, snap it or type it. On Android, KANAKU can also pick up bank transaction alerts from SMS — only with your permission.',
    points: [
      { icon: Mic, label: 'Voice' },
      { icon: ScanLine, label: 'Receipt & PDF scan' },
      { icon: MessageSquare, label: 'Bank SMS' },
      { icon: Keyboard, label: 'Manual entry' },
    ],
  },
  {
    number: '02',
    title: 'Organized for you',
    description:
      'Scanned, spoken and SMS entries arrive with the amount, merchant, category and account filled in, so budgets and balances stay current.',
    points: [
      { icon: Sparkles, label: 'Smart categories' },
      { icon: Target, label: 'Budgets & alerts' },
      { icon: RefreshCw, label: 'Recurring bills' },
    ],
  },
  {
    number: '03',
    title: 'See the full picture',
    description:
      'Monthly reports, shareable PDF statements and a live view of your net worth across accounts and investments.',
    points: [
      { icon: ChartColumn, label: 'Reports' },
      { icon: FileText, label: 'PDF statements' },
      { icon: TrendingUp, label: 'Net worth' },
    ],
  },
];

const receiptLines = [
  { item: 'Basmati rice', price: '649' },
  { item: 'Toor dal', price: '179' },
  { item: 'Sunflower oil', price: '165' },
  { item: 'Milk & curd', price: '324' },
  { item: '+ 8 items', price: '533' },
];

const budgets = [
  { name: 'Groceries', spent: 6420, limit: 8000 },
  { name: 'Dining out', spent: 4250, limit: 5000 },
  { name: 'Shopping', spent: 4400, limit: 10000 },
];

const allocation = [
  { name: 'Stocks', pct: 38, color: 'bg-violet-600' },
  { name: 'Mutual funds', pct: 27, color: 'bg-sky-500' },
  { name: 'Gold', pct: 15, color: 'bg-amber-400' },
  { name: 'Fixed deposits', pct: 12, color: 'bg-emerald-500' },
  { name: 'Cash', pct: 8, color: 'bg-slate-300' },
];

const securityPoints = [
  {
    icon: WifiOff,
    title: 'Offline-first by design',
    description:
      'Your records are stored on your device, so you can add and review transactions without a connection. Changes sync when you are back online.',
  },
  {
    icon: Lock,
    title: 'App lock',
    description: 'Keep KANAKU locked behind a PIN, with biometric unlock on supported devices.',
  },
  {
    icon: EyeOff,
    title: 'No ads. No selling your data.',
    description:
      'KANAKU is funded by subscriptions, not advertising. We never sell or rent your personal or financial data.',
  },
  {
    icon: Trash2,
    title: 'You stay in control',
    description: 'Export reports whenever you need them, and delete your account and data at any time.',
  },
];

interface AssistantExample {
  id: string;
  label: string;
  icon: React.ElementType;
  prompt: string;
  reply: string;
  cardTitle: string;
  rows: { label: string; value: string }[];
  needsConfirmation?: boolean;
}

const assistantExamples: AssistantExample[] = [
  {
    id: 'record',
    label: 'Log an expense',
    icon: Mic,
    prompt: 'Spent ₹1,850 on groceries at DMart with my HDFC card',
    reply: "Got it. Here's the expense — confirm and I'll save it.",
    cardTitle: 'New expense',
    rows: [
      { label: 'Amount', value: '₹1,850' },
      { label: 'Category', value: 'Groceries' },
      { label: 'Merchant', value: 'DMart' },
      { label: 'Paid with', value: 'HDFC Credit Card' },
      { label: 'Date', value: 'Today' },
    ],
    needsConfirmation: true,
  },
  {
    id: 'query',
    label: 'Check your spending',
    icon: ChartColumn,
    prompt: 'How much have I spent on food this month?',
    reply: '₹11,580 so far — ₹1,210 less than at this point last month. Groceries are the biggest share.',
    cardTitle: 'Food this month',
    rows: [
      { label: 'Groceries', value: '₹6,420' },
      { label: 'Dining out', value: '₹4,250' },
      { label: 'Food delivery', value: '₹910' },
    ],
  },
  {
    id: 'advice',
    label: 'Ask for advice',
    icon: Sparkles,
    prompt: 'Can I afford a ₹35,000 phone this month?',
    reply:
      "You can, but it would use most of this month's surplus. Waiting a month keeps your emergency fund goal on schedule.",
    cardTitle: 'Your month at a glance',
    rows: [
      { label: 'Expected surplus', value: '₹41,800' },
      { label: 'Left after purchase', value: '₹6,800' },
      { label: 'Emergency fund', value: '68% funded' },
    ],
  },
  {
    id: 'task',
    label: 'Set a budget',
    icon: Target,
    prompt: 'Set a ₹3,000 monthly budget for food delivery',
    reply: "I've drafted the budget. Confirm and I'll start tracking it.",
    cardTitle: 'New budget',
    rows: [
      { label: 'Category', value: 'Food delivery' },
      { label: 'Limit', value: '₹3,000 / month' },
      { label: 'Spent so far', value: '₹910' },
    ],
    needsConfirmation: true,
  },
];

const faqs = [
  {
    question: 'Is KANAKU free to use?',
    answer:
      'Yes. You can start on the Free plan with no time limit and no card required. Paid plans add more automation and are completely optional — see Pricing for details.',
  },
  {
    question: 'Does KANAKU work without internet?',
    answer:
      'Yes. KANAKU is offline-first: you can add, edit and review transactions without a connection, and everything syncs to your account when you are back online. A few features, like the KAI assistant and live market prices, need a connection.',
  },
  {
    question: 'Does KANAKU read my SMS messages?',
    answer:
      'Only on Android, and only if you allow it. When enabled, KANAKU looks for bank transaction alerts so they can be added for you. You can always log expenses by voice, receipt scan or manual entry instead.',
  },
  {
    question: 'Can I track multiple accounts and currencies?',
    answer:
      'Yes. Add bank accounts, cards, cash and wallets, choose your home currency during setup, and record transactions in other currencies when you need to.',
  },
  {
    question: 'Can I split expenses with friends or family?',
    answer:
      'Yes. Create a group for a trip, a shared flat or an event, add shared expenses, and KANAKU keeps track of who owes whom.',
  },
  {
    question: 'How do I delete my data?',
    answer:
      "You can delete your account and data at any time. Our data deletion page explains the steps, including what to do if you can't log in.",
  },
];

// ─── Building blocks ──────────────────────────────────────────────────────────

const SectionHeading: React.FC<{
  eyebrow: string;
  title: string;
  description?: string;
  align?: 'center' | 'left';
  tone?: 'light' | 'dark';
}> = ({ eyebrow, title, description, align = 'center', tone = 'light' }) => (
  <div className={align === 'center' ? 'max-w-2xl mx-auto text-center' : 'max-w-xl'}>
    <p className={`text-sm font-semibold ${tone === 'dark' ? 'text-violet-300' : 'text-violet-700'}`}>{eyebrow}</p>
    <h2
      className={`mt-3 text-[30px] sm:text-[40px] leading-[1.12] font-bold tracking-[-0.03em] ${
        tone === 'dark' ? 'text-white' : 'text-slate-950'
      }`}
    >
      {title}
    </h2>
    {description && (
      <p className={`mt-4 text-base sm:text-lg leading-relaxed ${tone === 'dark' ? 'text-slate-400' : 'text-slate-600'}`}>
        {description}
      </p>
    )}
  </div>
);

const floatingCard =
  'absolute hidden sm:block rounded-[14px] border border-slate-200 bg-white/95 backdrop-blur px-4 py-3 shadow-[0_18px_40px_-16px_rgba(15,23,42,0.35)]';

const HeroPreview: React.FC = () => (
  <div className="relative mx-auto w-full max-w-[540px]" aria-hidden="true">
    <div className="absolute -inset-x-3 -inset-y-5 sm:-inset-8 rounded-[2rem] bg-gradient-to-br from-violet-100 via-white to-sky-100/80 border border-slate-200/70" />

    <div className="relative rounded-2xl border border-slate-200 bg-white shadow-[0_30px_70px_-30px_rgba(15,23,42,0.35)]">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <p className="text-xs font-medium text-slate-500">Spending</p>
          <p className="text-sm font-semibold text-slate-900">This month</p>
        </div>
        {/* Hidden from sm up, where the budget alert card floats over this corner. */}
        <div className="flex sm:hidden rounded-[10px] bg-slate-100 p-0.5 text-xs font-medium text-slate-500">
          {['Week', 'Month', 'Year'].map((period) => (
            <span
              key={period}
              className={`px-2.5 py-1 rounded-[6px] ${period === 'Month' ? 'bg-white text-slate-900 shadow-sm' : ''}`}
            >
              {period}
            </span>
          ))}
        </div>
      </div>

      <div className="px-5 pt-5 pb-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p
              className="text-[32px] font-bold tracking-tight text-slate-950 leading-none tabular-nums"
              style={{ fontFamily: DISPLAY_FONT }}
            >
              ₹48,320
            </p>
            <p className="mt-2 text-sm text-slate-500">of ₹60,000 monthly budget</p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
            <TrendingDown className="w-3.5 h-3.5" />
            12% less than last month
          </span>
        </div>
        <div className="mt-4 h-2 rounded-full bg-slate-100">
          <div className="h-full w-[80%] rounded-full bg-violet-600" />
        </div>

        <div className="mt-5 flex h-2.5 gap-1 overflow-hidden rounded-full">
          {spendByCategory.map((category) => (
            <div key={category.name} className={category.color} style={{ width: `${category.pct}%` }} />
          ))}
        </div>
        <ul className="mt-3 grid grid-cols-2 gap-x-5 gap-y-1.5">
          {spendByCategory.map((category) => (
            <li key={category.name} className="flex items-center justify-between gap-2 text-xs">
              <span className="flex items-center gap-1.5 min-w-0 text-slate-600">
                <span className={`w-2 h-2 rounded-full shrink-0 ${category.color}`} />
                <span className="truncate">{category.name}</span>
              </span>
              <span className="font-medium text-slate-900 tabular-nums">{formatINR(category.amount)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t border-slate-100 px-5 pt-4 pb-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Recent</p>
          <span className="text-xs font-medium text-violet-700">View all</span>
        </div>
        <ul className="mt-1 divide-y divide-slate-100">
          {recentTransactions.map((tx) => {
            const Icon = tx.icon;
            return (
              <li key={tx.title} className="flex items-center gap-3 py-2.5">
                <span className={`w-9 h-9 shrink-0 rounded-[10px] flex items-center justify-center ${tx.tint}`}>
                  <Icon className="w-4 h-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 truncate">{tx.title}</p>
                  <p className="text-xs text-slate-500 truncate">{tx.meta}</p>
                </div>
                <span className={`text-sm font-semibold tabular-nums ${tx.positive ? 'text-emerald-600' : 'text-slate-900'}`}>
                  {tx.amount}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>

    <div className={`${floatingCard} -right-3 lg:-right-10 -top-7 w-56`}>
      <div className="flex items-center gap-2">
        <Bell className="w-4 h-4 text-amber-500" />
        <p className="text-sm font-semibold text-slate-900">Dining out at 85%</p>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-slate-100">
        <div className="h-full w-[85%] rounded-full bg-amber-400" />
      </div>
      <p className="mt-1.5 text-xs text-slate-500">₹750 left this month</p>
    </div>

    <div className={`${floatingCard} -left-4 lg:-left-12 -bottom-12 w-64`}>
      <div className="flex items-center gap-3">
        <span className="w-9 h-9 shrink-0 rounded-[10px] bg-violet-600 text-white flex items-center justify-center">
          <ScanLine className="w-4 h-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">Receipt scanned</p>
          <p className="text-xs text-slate-500 truncate">DMart · 12 items · ₹1,850</p>
        </div>
        <CircleCheck className="w-5 h-5 shrink-0 text-emerald-500" />
      </div>
    </div>
  </div>
);

const FeatureCard: React.FC<{
  icon: React.ElementType;
  title: string;
  description: string;
  wide?: boolean;
  className?: string;
  children: React.ReactNode;
}> = ({ icon: Icon, title, description, wide = false, className = '', children }) => (
  <div
    className={`rounded-2xl border border-slate-200 bg-white p-6 sm:p-7 flex flex-col ${
      wide ? 'lg:grid lg:grid-cols-2 lg:gap-8 lg:items-center' : ''
    } ${className}`}
  >
    <div>
      <span className="w-10 h-10 rounded-[10px] bg-violet-50 text-violet-700 flex items-center justify-center">
        <Icon className="w-5 h-5" />
      </span>
      <h3 className="mt-5 text-lg font-semibold tracking-tight text-slate-950">{title}</h3>
      <p className="mt-2 text-[15px] leading-relaxed text-slate-600">{description}</p>
    </div>
    <div className={`mt-6 ${wide ? 'lg:mt-0' : 'mt-auto pt-6'}`} aria-hidden="true">
      {children}
    </div>
  </div>
);

const visualPanel = 'rounded-[14px] border border-slate-100 bg-slate-50 p-4';

const ReceiptVisual: React.FC = () => (
  <div className={`${visualPanel} grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center`}>
    <div className="rounded-[10px] border border-dashed border-slate-300 bg-white p-4 font-mono text-[11px] leading-5 text-slate-500 shadow-sm whitespace-nowrap">
      <p className="text-center font-semibold tracking-widest text-slate-800">DMART</p>
      <p className="text-center">Tax invoice</p>
      <div className="my-2 border-t border-dashed border-slate-200" />
      {receiptLines.map((line) => (
        <div key={line.item} className="flex justify-between gap-2">
          <span className="truncate">{line.item}</span>
          <span>{line.price}</span>
        </div>
      ))}
      <div className="my-2 border-t border-dashed border-slate-200" />
      <div className="flex justify-between font-semibold text-slate-800">
        <span>TOTAL</span>
        <span>₹1,850</span>
      </div>
    </div>
    <ArrowRight className="hidden sm:block w-5 h-5 text-slate-300" />
    <div className="rounded-[10px] border border-slate-200 bg-white p-4 shadow-sm">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
        <CircleCheck className="w-4 h-4 text-emerald-500" />
        Ready to save
      </p>
      <dl className="mt-3 space-y-2 text-xs">
        {[
          ['Merchant', 'DMart'],
          ['Date', 'Today'],
          ['Items', '12'],
          ['Category', 'Groceries'],
          ['Total', '₹1,850'],
        ].map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3">
            <dt className="text-slate-500">{label}</dt>
            <dd className="font-medium text-slate-900">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  </div>
);

const BudgetsVisual: React.FC = () => (
  <div className={`${visualPanel} space-y-3.5`}>
    {budgets.map((budget) => {
      const pct = Math.round((budget.spent / budget.limit) * 100);
      const nearLimit = pct >= 85;
      return (
        <div key={budget.name}>
          <div className="flex justify-between text-xs">
            <span className="font-medium text-slate-800">{budget.name}</span>
            <span className={nearLimit ? 'font-semibold text-amber-600' : 'text-slate-500'}>
              {formatINR(budget.spent)} / {formatINR(budget.limit)}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-slate-200/70">
            <div
              className={`h-full rounded-full ${nearLimit ? 'bg-amber-400' : 'bg-violet-600'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      );
    })}
  </div>
);

const GroupVisual: React.FC = () => (
  <div className={visualPanel}>
    <div className="flex items-center gap-3">
      <span className="w-9 h-9 shrink-0 rounded-[10px] bg-sky-100 text-sky-600 flex items-center justify-center">
        <Plane className="w-4 h-4" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-900">Goa trip</p>
        <p className="text-xs text-slate-500">4 members · ₹34,500 total</p>
      </div>
    </div>
    <div className="mt-3 flex items-center gap-3">
      <div className="flex -space-x-1.5">
        {[
          ['AK', 'bg-violet-600'],
          ['RS', 'bg-sky-500'],
          ['PM', 'bg-amber-500'],
          ['VN', 'bg-emerald-500'],
        ].map(([initials, color]) => (
          <span
            key={initials}
            className={`w-8 h-8 shrink-0 rounded-full border-2 border-slate-50 text-[10px] font-semibold text-white flex items-center justify-center ${color}`}
          >
            {initials}
          </span>
        ))}
      </div>
      <div className="flex-1 flex items-center justify-between rounded-[10px] bg-emerald-50 px-3 py-2 text-xs">
        <span className="text-emerald-800">You are owed</span>
        <span className="font-semibold text-emerald-700">₹4,850</span>
      </div>
    </div>
  </div>
);

const NetWorthVisual: React.FC = () => (
  <div className={visualPanel}>
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <p className="text-xs text-slate-500">Net worth</p>
        <p className="text-2xl font-bold tracking-tight text-slate-950 tabular-nums" style={{ fontFamily: DISPLAY_FONT }}>
          ₹12,48,500
        </p>
      </div>
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
        <TrendingUp className="w-3.5 h-3.5" />
        +₹38,200 this month
      </span>
    </div>
    <div className="mt-4 flex h-2.5 gap-1 overflow-hidden rounded-full">
      {allocation.map((asset) => (
        <div key={asset.name} className={asset.color} style={{ width: `${asset.pct}%` }} />
      ))}
    </div>
    <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
      {allocation.map((asset) => (
        <li key={asset.name} className="flex items-center gap-1.5 whitespace-nowrap text-slate-600">
          <span className={`w-2 h-2 shrink-0 rounded-full ${asset.color}`} />
          {asset.name}
          <span className="ml-auto font-medium text-slate-900">{asset.pct}%</span>
        </li>
      ))}
    </ul>
    <p className="mt-4 flex items-center gap-1.5 text-xs text-slate-500">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
      Stock and gold prices refresh from market data
    </p>
  </div>
);

const ReportsVisual: React.FC = () => {
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) =>
    new Date(now.getFullYear(), now.getMonth() - 5 + i, 1).toLocaleString('en-IN', { month: 'short' })
  );
  // Bar heights in px — percentage heights collapse inside the auto-height flex columns.
  const heights = [52, 64, 46, 72, 58, 44];
  return (
    <div className={visualPanel}>
      <div className="flex items-end gap-2">
        {heights.map((height, i) => (
          <div key={months[i]} className="flex flex-1 flex-col items-center gap-1.5">
            <div
              className={`w-full rounded-[6px] ${i === heights.length - 1 ? 'bg-violet-600' : 'bg-slate-200'}`}
              style={{ height }}
            />
            <span className="text-[10px] text-slate-500">{months[i]}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-2 rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-xs">
        <FileText className="w-4 h-4 text-rose-500" />
        <span className="font-medium text-slate-800">Monthly statement.pdf</span>
        <span className="ml-auto text-slate-400">Ready</span>
      </div>
    </div>
  );
};

const LoansGoalsVisual: React.FC = () => (
  <div className={`${visualPanel} space-y-3`}>
    <div className="flex items-center gap-3 rounded-[10px] bg-white border border-slate-200 px-3 py-2.5">
      <CalendarClock className="w-4 h-4 text-amber-500" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-slate-900">Car loan EMI</p>
        <p className="text-[11px] text-slate-500">Due in 3 days</p>
      </div>
      <span className="text-xs font-semibold text-slate-900">₹12,400</span>
    </div>
    <div className="rounded-[10px] bg-white border border-slate-200 px-3 py-2.5">
      <div className="flex items-center gap-3">
        <Target className="w-4 h-4 text-violet-600" />
        <p className="flex-1 text-xs font-medium text-slate-900">Emergency fund</p>
        <span className="text-xs font-semibold text-slate-900">68%</span>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-slate-100">
        <div className="h-full w-[68%] rounded-full bg-violet-600" />
      </div>
    </div>
  </div>
);

const AccountsVisual: React.FC = () => (
  <ul className={`${visualPanel} divide-y divide-slate-200/70 py-1`}>
    {[
      { icon: Landmark, name: 'HDFC Savings', currency: 'INR', balance: '₹1,42,300' },
      { icon: Wallet, name: 'Cash', currency: 'INR', balance: '₹6,500' },
      { icon: Globe, name: 'Travel card', currency: 'USD', balance: '$1,250' },
    ].map(({ icon: Icon, name, currency, balance }) => (
      <li key={name} className="flex items-center gap-3 py-2.5">
        <Icon className="w-4 h-4 text-slate-500" />
        <span className="flex-1 text-xs font-medium text-slate-900">{name}</span>
        <span className="rounded bg-white border border-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
          {currency}
        </span>
        <span className="w-20 text-right text-xs font-semibold text-slate-900 tabular-nums">{balance}</span>
      </li>
    ))}
  </ul>
);

const AssistantDemo: React.FC = () => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [thinking, setThinking] = useState(false);
  const [orbState, setOrbState] = useState<AIOrbState>('idle');
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.splice(0).forEach((id) => window.clearTimeout(id));
  }, []);

  const selectExample = (index: number) => {
    timers.current.splice(0).forEach((id) => window.clearTimeout(id));
    setActiveIndex(index);
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setThinking(false);
      return;
    }
    setThinking(true);
    setOrbState('processing');
    timers.current.push(
      window.setTimeout(() => {
        setThinking(false);
        setOrbState('completed');
      }, 900),
      window.setTimeout(() => setOrbState('idle'), 2600)
    );
  };

  const example = assistantExamples[activeIndex];

  return (
    <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-16 items-center">
      <div className="lg:col-span-5">
        <SectionHeading
          align="left"
          eyebrow="KAI assistant"
          title="Ask your money anything."
          description="KAI is the assistant built into KANAKU. Type or speak in plain language to log expenses, check your spending, set budgets and get advice based on your own numbers."
        />

        <div className="mt-8 space-y-2" role="tablist" aria-label="Assistant examples">
          {assistantExamples.map((item, index) => {
            const Icon = item.icon;
            const selected = index === activeIndex;
            return (
              <button
                type="button"
                key={item.id}
                role="tab"
                aria-selected={selected}
                data-testid={`landing-page-assistant-example-${item.id}`}
                onClick={() => selectExample(index)}
                className={`w-full text-left flex items-center gap-3.5 rounded-[14px] border px-4 py-3 transition-colors ${
                  selected
                    ? 'border-violet-300 bg-white shadow-sm ring-1 ring-violet-200'
                    : 'border-transparent hover:border-slate-200 hover:bg-white/70'
                }`}
              >
                <span
                  className={`w-9 h-9 shrink-0 rounded-[10px] flex items-center justify-center ${
                    selected ? 'bg-violet-600 text-white' : 'bg-slate-200/70 text-slate-600'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-900">{item.label}</span>
                  <span className="block text-[13px] text-slate-500 truncate">“{item.prompt}”</span>
                </span>
              </button>
            );
          })}
        </div>

        <p className="mt-6 flex items-center gap-2 text-sm text-slate-600">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          Nothing is saved until you confirm it.
        </p>
      </div>

      <div className="lg:col-span-7">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-[0_30px_70px_-34px_rgba(15,23,42,0.35)] overflow-hidden">
          <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-3.5">
            <AIOrb size={34} state={orbState} showStatusGlow={false} />
            <div>
              <p className="text-sm font-semibold text-slate-900">KAI</p>
              <p className="text-xs text-slate-500">{thinking ? 'Thinking…' : 'Your KANAKU assistant'}</p>
            </div>
          </div>

          <div className="space-y-4 bg-slate-50/70 px-4 sm:px-6 py-6 min-h-[380px]" aria-live="polite">
            <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-[6px] bg-slate-950 px-4 py-2.5 text-[15px] text-white">
              {example.prompt}
            </div>

            {thinking ? (
              <div className="w-fit rounded-2xl rounded-bl-[6px] border border-slate-200 bg-white px-4 py-3.5 flex gap-1.5">
                {[0, 150, 300].map((delay) => (
                  <span
                    key={delay}
                    className="w-2 h-2 rounded-full bg-slate-300 animate-bounce"
                    style={{ animationDelay: `${delay}ms` }}
                  />
                ))}
              </div>
            ) : (
              <div className="max-w-[92%] space-y-3">
                <div className="rounded-2xl rounded-bl-[6px] border border-slate-200 bg-white px-4 py-3 text-[15px] leading-relaxed text-slate-700">
                  {example.reply}
                </div>
                <div className="rounded-[14px] border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{example.cardTitle}</p>
                  <dl className="mt-3 divide-y divide-slate-100">
                    {example.rows.map((row) => (
                      <div key={row.label} className="flex items-center justify-between gap-4 py-2 text-sm">
                        <dt className="text-slate-500">{row.label}</dt>
                        <dd className="font-medium text-slate-900 text-right">{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                  {example.needsConfirmation && (
                    <div className="mt-3 flex gap-2" aria-hidden="true">
                      <span className="flex-1 rounded-[10px] bg-violet-600 py-2 text-center text-sm font-semibold text-white">
                        Confirm
                      </span>
                      <span className="flex-1 rounded-[10px] border border-slate-200 py-2 text-center text-sm font-semibold text-slate-700">
                        Edit
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-3" aria-hidden="true">
            <div className="flex-1 rounded-[10px] bg-slate-100 px-3.5 py-2.5 text-sm text-slate-400">Ask KAI anything…</div>
            <span className="w-10 h-10 rounded-[10px] bg-slate-950 text-white flex items-center justify-center">
              <Mic className="w-4 h-4" />
            </span>
          </div>
        </div>
        <p className="mt-3 text-center text-xs text-slate-500">Examples use sample data.</p>
      </div>
    </div>
  );
};

const FaqList: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  return (
    <div className="divide-y divide-slate-200 border-y border-slate-200">
      {faqs.map((faq, index) => {
        const open = openIndex === index;
        return (
          <div key={faq.question}>
            <button
              type="button"
              data-testid={`landing-page-faq-${index}`}
              aria-expanded={open}
              aria-controls={`landing-faq-answer-${index}`}
              onClick={() => setOpenIndex(open ? null : index)}
              className="w-full flex items-center justify-between gap-6 py-5 text-left"
            >
              <span className="text-base sm:text-[17px] font-semibold text-slate-900">{faq.question}</span>
              <ChevronDown
                className={`w-5 h-5 shrink-0 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
              />
            </button>
            <div id={`landing-faq-answer-${index}`} hidden={!open} className="pb-5 pr-10">
              <p className="text-[15px] leading-relaxed text-slate-600">{faq.answer}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted, onLogin, onNavigate }) => {
  const footerColumns: { title: string; links: { label: string; id: string; section?: boolean }[] }[] = [
    {
      title: 'Product',
      links: [
        { label: 'Features', id: 'features', section: true },
        { label: 'Security', id: 'security', section: true },
        { label: 'Pricing', id: 'pricing' },
      ],
    },
    {
      title: 'Company',
      links: [
        { label: 'About', id: 'about' },
        { label: 'Contact support', id: 'contact' },
      ],
    },
    {
      title: 'Legal',
      links: [
        { label: 'Privacy policy', id: 'privacy' },
        { label: 'Terms of service', id: 'terms' },
        { label: 'Data deletion', id: 'data-deletion' },
      ],
    },
  ];

  return (
    <div
      className="relative min-h-screen bg-white text-slate-900 antialiased overflow-x-hidden selection:bg-violet-200"
      // Headings pick up --font-display from the base layer; Manrope gives the marketing pages a distinct voice.
      style={{ '--font-display': DISPLAY_FONT } as React.CSSProperties}
    >
      <PublicNavbar onNavigate={onNavigate} onLogin={onLogin} onGetStarted={onGetStarted} currentPage="landing" />

      <main>
        {/* ─── Hero ─────────────────────────────────────────────────── */}
        <section id="home" className="relative">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                'linear-gradient(to right, rgb(241 245 249) 1px, transparent 1px), linear-gradient(to bottom, rgb(241 245 249) 1px, transparent 1px)',
              backgroundSize: '56px 56px',
              maskImage: 'radial-gradient(ellipse 80% 70% at 50% 0%, black 30%, transparent 75%)',
              WebkitMaskImage: 'radial-gradient(ellipse 80% 70% at 50% 0%, black 30%, transparent 75%)',
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] max-w-[140vw] h-[520px] rounded-full bg-violet-200/40 blur-[120px]"
          />

          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 sm:pt-36 pb-24 lg:pb-32 grid grid-cols-1 gap-16 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-12 items-center">
            <div className="max-w-[640px]">
              <button
                type="button"
                data-testid="landing-page-kai-link"
                onClick={() => scrollToSection('assistant')}
                className="group inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 py-1 pl-1 pr-3 text-[13px] text-slate-600 shadow-sm hover:border-slate-300 transition-colors"
              >
                <span className="rounded-full bg-violet-600 px-2 py-0.5 text-[11px] font-semibold text-white">New</span>
                Meet KAI, your finance assistant
                <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
              </button>

              <h1 className="mt-6 text-[36px] sm:text-[54px] lg:text-[40px] xl:text-[50px] leading-[1.06] font-extrabold tracking-[-0.035em] text-slate-950">
                Track every expense.
                <br />
                <span className="text-violet-600">Understand every rupee.</span>
              </h1>

              <p className="mt-6 max-w-xl text-base sm:text-lg leading-relaxed text-slate-600">
                KANAKU is the expense tracker that keeps up with you. Log spending in seconds by voice, receipt scan or
                bank SMS, then see your budgets, reports and net worth in one place — even offline.
              </p>

              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  data-testid="landing-page-get-started"
                  onClick={onGetStarted}
                  className="group inline-flex items-center justify-center gap-2 rounded-[14px] bg-violet-600 px-6 py-3.5 text-[15px] font-semibold text-white shadow-[0_10px_24px_-10px_rgba(124,58,237,0.7)] hover:bg-violet-700 transition-colors"
                >
                  Get started free
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </button>
                <button
                  type="button"
                  data-testid="landing-page-watch-demo"
                  onClick={() => scrollToSection('how-it-works')}
                  className="inline-flex items-center justify-center gap-2 rounded-[14px] border border-slate-200 bg-white px-6 py-3.5 text-[15px] font-semibold text-slate-800 hover:bg-slate-50 hover:border-slate-300 transition-colors"
                >
                  See how it works
                </button>
              </div>

              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600">
                {['Free plan, no card needed', 'Works offline', 'Web and mobile'].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-violet-600" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <HeroPreview />
          </div>
        </section>

        {/* ─── How it works ─────────────────────────────────────────── */}
        <section id="how-it-works" className="border-y border-slate-200 bg-slate-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
            <SectionHeading
              eyebrow="How it works"
              title="From receipt to report, without the spreadsheet"
              description="Logging an expense takes seconds. Staying on top of your money takes no extra effort."
            />

            <ol className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-3">
              {steps.map((step) => (
                <li key={step.number} className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-7">
                  <span className="text-sm font-semibold tabular-nums text-violet-700">{step.number}</span>
                  <h3 className="mt-3 text-xl font-semibold tracking-tight text-slate-950">{step.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-slate-600">{step.description}</p>
                  <ul className="mt-5 flex flex-wrap gap-2">
                    {step.points.map((point) => {
                      const Icon = point.icon;
                      return (
                        <li
                          key={point.label}
                          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[13px] font-medium text-slate-700"
                        >
                          <Icon className="w-3.5 h-3.5 text-slate-500" />
                          {point.label}
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ─── Features ─────────────────────────────────────────────── */}
        <section id="features" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
          <SectionHeading
            eyebrow="Features"
            title="Everything you need to manage your money"
            description="KANAKU brings spending, budgets, shared expenses and investments together, so you don't need a different app for each."
          />

          <div className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              wide
              className="md:col-span-2"
              icon={ReceiptText}
              title="Scan receipts and bills"
              description="Take a photo of a bill or upload a PDF. KANAKU reads the merchant, date, items and total, then prepares the transaction for you to confirm."
            >
              <ReceiptVisual />
            </FeatureCard>
            <FeatureCard
              icon={Target}
              title="Budgets that warn you early"
              description="Set monthly limits by category and get alerted as you approach them, before the month gets away from you."
            >
              <BudgetsVisual />
            </FeatureCard>
            <FeatureCard
              icon={Users}
              title="Split with friends and family"
              description="Track shared costs for trips, flats and events. KANAKU works out who owes whom."
            >
              <GroupVisual />
            </FeatureCard>
            <FeatureCard
              wide
              className="md:col-span-2"
              icon={TrendingUp}
              title="Investments and net worth"
              description="Follow stocks, mutual funds, gold and fixed deposits alongside your accounts, so you always know where you stand."
            >
              <NetWorthVisual />
            </FeatureCard>
            <FeatureCard
              icon={ChartColumn}
              title="Reports and PDF statements"
              description="See month-over-month trends and export clean PDF statements to share or keep."
            >
              <ReportsVisual />
            </FeatureCard>
            <FeatureCard
              icon={HandCoins}
              title="Loans, EMIs and goals"
              description="Keep track of what you owe, what you have lent and what you are saving towards."
            >
              <LoansGoalsVisual />
            </FeatureCard>
            <FeatureCard
              className="md:col-span-2 lg:col-span-1"
              icon={Wallet}
              title="Every account, any currency"
              description="Bank accounts, cards, cash and wallets in one place, in the currencies you actually use."
            >
              <AccountsVisual />
            </FeatureCard>
          </div>
        </section>

        {/* ─── KAI assistant ────────────────────────────────────────── */}
        <section id="assistant" className="border-y border-slate-200 bg-slate-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
            <AssistantDemo />
          </div>
        </section>

        {/* ─── Security & privacy ───────────────────────────────────── */}
        <section id="security" className="bg-slate-950">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28 grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-5">
              <SectionHeading
                align="left"
                tone="dark"
                eyebrow="Privacy & security"
                title="Your finances stay yours."
                description="Money is personal. KANAKU is built so your records live with you, stay locked when you want them locked, and are never used to sell you anything."
              />
              <button
                type="button"
                data-testid="landing-page-privacy-link"
                onClick={() => onNavigate('privacy')}
                className="group mt-8 inline-flex items-center gap-2 text-[15px] font-semibold text-white hover:text-violet-300 transition-colors"
              >
                Read our privacy policy
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>

            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10">
              {securityPoints.map((point) => {
                const Icon = point.icon;
                return (
                  <div key={point.title} className="bg-slate-950 p-6 sm:p-7">
                    <span className="w-10 h-10 rounded-[10px] border border-white/10 bg-white/5 text-violet-300 flex items-center justify-center">
                      <Icon className="w-5 h-5" />
                    </span>
                    <h3 className="mt-5 text-base font-semibold text-white">{point.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-400">{point.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ─── FAQ ──────────────────────────────────────────────────── */}
        <section id="faq" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28 grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-4">
            <SectionHeading
              align="left"
              eyebrow="FAQ"
              title="Questions, answered"
              description="Can't find what you're looking for? Our team is happy to help."
            />
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                data-testid="landing-page-faq-contact"
                onClick={() => onNavigate('contact')}
                className="rounded-[10px] border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 transition-colors"
              >
                Contact support
              </button>
              <button
                type="button"
                data-testid="landing-page-faq-pricing"
                onClick={() => onNavigate('pricing')}
                className="rounded-[10px] px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-50 transition-colors"
              >
                View pricing
              </button>
            </div>
          </div>
          <div className="lg:col-span-8">
            <FaqList />
          </div>
        </section>

        {/* ─── Closing call to action ───────────────────────────────── */}
        <section className="px-4 sm:px-6 lg:px-8 pb-20 sm:pb-28">
          <div className="relative max-w-7xl mx-auto overflow-hidden rounded-3xl bg-[#1e1045] px-6 py-14 sm:px-12 sm:py-20 text-center">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 -top-40 -translate-x-1/2 w-[720px] max-w-[160%] h-[420px] rounded-full bg-violet-500/35 blur-[100px]"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 opacity-40"
              style={{
                backgroundImage:
                  'linear-gradient(to right, rgb(255 255 255 / 0.12) 1px, transparent 1px), linear-gradient(to bottom, rgb(255 255 255 / 0.12) 1px, transparent 1px)',
                backgroundSize: '44px 44px',
                maskImage: 'radial-gradient(ellipse 60% 80% at 50% 50%, black, transparent)',
                WebkitMaskImage: 'radial-gradient(ellipse 60% 80% at 50% 50%, black, transparent)',
              }}
            />
            <div className="relative">
              <KANAKULogo className="w-12 h-12 mx-auto" />
              <h2 className="mt-6 text-[30px] sm:text-[44px] leading-[1.1] font-bold tracking-[-0.03em] text-white">
                Take control of your spending today.
              </h2>
              <p className="mt-4 text-base sm:text-lg text-violet-200 max-w-xl mx-auto">
                Create your free KANAKU account and log your first expense in minutes.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row justify-center gap-3">
                <button
                  type="button"
                  data-testid="landing-page-yes-get-started-free"
                  onClick={onGetStarted}
                  className="group inline-flex items-center justify-center gap-2 rounded-[14px] bg-white px-6 py-3.5 text-[15px] font-semibold text-slate-950 hover:bg-violet-50 transition-colors"
                >
                  Create free account
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </button>
                <button
                  type="button"
                  data-testid="landing-page-cta-log-in"
                  onClick={onLogin}
                  className="inline-flex items-center justify-center rounded-[14px] border border-white/30 px-6 py-3.5 text-[15px] font-semibold text-white hover:bg-white/10 transition-colors"
                >
                  Log in
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ─── Footer ─────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 grid grid-cols-1 gap-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <KanakuWordmark />
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-500">
              Expense tracking, budgets, shared costs and net worth in one privacy-first app.
            </p>
          </div>
          <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-3 gap-8">
            {footerColumns.map((column) => (
              <div key={column.title}>
                <p className="text-sm font-semibold text-slate-900">{column.title}</p>
                <ul className="mt-4 space-y-3">
                  {column.links.map((link) => (
                    <li key={link.id}>
                      <button
                        type="button"
                        data-testid={`landing-page-footer-${link.id}`}
                        onClick={() => (link.section ? scrollToSection(link.id) : onNavigate(link.id))}
                        className="text-sm text-slate-500 hover:text-slate-900 transition-colors"
                      >
                        {link.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="border-t border-slate-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row gap-2 justify-between text-sm text-slate-500">
            <p>© {new Date().getFullYear()} KANAKU. All rights reserved.</p>
            <p>Built by Shaik Ashraf K.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};
