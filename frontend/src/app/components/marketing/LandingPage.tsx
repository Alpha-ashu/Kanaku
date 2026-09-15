import React, { useEffect, useRef, useState } from 'react';
import { MotionConfig, motion } from 'framer-motion';
import {
  ArrowRight,
  ChartColumn,
  Check,
  ChevronDown,
  EyeOff,
  Lock,
  MessageSquare,
  Mic,
  Receipt,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  Users,
  Wallet,
  WifiOff,
  LayoutDashboard,
} from 'lucide-react';
import { KANAKULogo } from '@/app/components/ui/KANAKULogo';
import { PublicNavbar, KanakuWordmark, scrollToSection } from '@/app/components/ui/PublicNavbar';
import { type AIOrbState } from '@/app/components/features/ai/AIOrb';
import {
  AccountsScreen,
  BudgetsScreen,
  DashboardScreen,
  GroupsScreen,
  InvestmentsScreen,
  KaiScreen,
  PhoneFrame,
  PinLockScreen,
  ReportsScreen,
  ScannerScreen,
  TransactionsScreen,
  type KaiConversation,
  type PhoneNavId,
} from '@/app/components/marketing/AppScreenMockups';

interface LandingPageProps {
  onGetStarted: () => void;
  onLogin: () => void;
  onNavigate: (page: string) => void;
}

const DISPLAY_FONT = "'Manrope', 'Inter', system-ui, sans-serif";

// ─── Content ──────────────────────────────────────────────────────────────────

interface AssistantExample extends KaiConversation {
  id: string;
  label: string;
  icon: React.ElementType;
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
      { label: 'Paid with', value: 'HDFC Card' },
    ],
    needsConfirmation: true,
  },
  {
    id: 'query',
    label: 'Check your spending',
    icon: ChartColumn,
    prompt: 'How much have I spent on food this month?',
    reply: '₹11,580 so far — ₹1,210 less than at this point last month.',
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
    reply: "You can, but it would use most of this month's surplus. Waiting a month keeps your goal on track.",
    cardTitle: 'Your month at a glance',
    rows: [
      { label: 'Expected surplus', value: '₹41,800' },
      { label: 'After purchase', value: '₹6,800' },
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

const capabilities = [
  { icon: Mic, title: 'Voice & chat', text: 'Tell KAI what you spent' },
  { icon: ScanLine, title: 'Receipt & PDF scan', text: 'Bills filled in for you' },
  { icon: MessageSquare, title: 'Bank SMS', text: 'Auto-capture in our Android app' },
  { icon: WifiOff, title: 'Works offline', text: "Syncs when you're back online" },
];

interface TourScreen {
  id: string;
  label: string;
  icon: React.ElementType;
  title: string;
  description: string;
  nav?: PhoneNavId;
  screen: React.ReactNode;
  callout: { title: string; text: string };
}

const tourScreens: TourScreen[] = [
  {
    id: 'home',
    label: 'Home',
    icon: LayoutDashboard,
    title: 'Your money at a glance',
    description:
      "Net worth, this month's spending and income, and a nudge from KAI when something changes — all on the first screen you open.",
    nav: 'home',
    screen: <DashboardScreen />,
    callout: { title: 'Net cashflow', text: '+₹36,680 this month' },
  },
  {
    id: 'transactions',
    label: 'Transactions',
    icon: Receipt,
    title: 'Every transaction, organized',
    description:
      'Search and filter everything you spent and earned, grouped by day with the category and account on every entry.',
    nav: 'transactions',
    screen: <TransactionsScreen />,
    callout: { title: 'Auto-categorized', text: 'Swiggy → Food delivery' },
  },
  {
    id: 'accounts',
    label: 'Accounts',
    icon: Wallet,
    title: 'All your accounts together',
    description: 'Bank accounts, credit cards, wallets and cash side by side, with balances that update as you spend.',
    screen: <AccountsScreen />,
    callout: { title: 'Balances stay current', text: 'Every entry updates its account' },
  },
  {
    id: 'investments',
    label: 'Investments',
    icon: TrendingUp,
    title: 'Investments and gold, tracked',
    description:
      'Mutual funds, stocks, fixed deposits and gold in one portfolio, with stock and gold prices refreshed from market data.',
    nav: 'investments',
    screen: <InvestmentsScreen />,
    callout: { title: 'Gold 24K · 35 g', text: 'Valued at the live rate' },
  },
  {
    id: 'reports',
    label: 'Reports',
    icon: ChartColumn,
    title: 'Reports you can act on',
    description: 'See where the month went, compare it with earlier months and download a PDF statement to share.',
    screen: <ReportsScreen />,
    callout: { title: 'Savings rate', text: '43% of income this month' },
  },
];

const everydayCards = [
  {
    icon: ScanLine,
    title: 'Scan any bill in seconds',
    description:
      'Point your camera at a receipt or upload a PDF. KANAKU fills in the merchant, date, items and total for you to confirm.',
    screen: <ScannerScreen />,
    dark: true,
  },
  {
    icon: Target,
    title: 'Budgets that speak up',
    description: 'Set limits by category and get an alert as you get close — not after the month is already over.',
    screen: <BudgetsScreen />,
  },
  {
    icon: Users,
    title: 'Split trips, flats and dinners',
    description: 'Add shared expenses and KANAKU keeps a running tally of who owes whom, so settling up is easy.',
    screen: <GroupsScreen />,
  },
];

const securityPoints = [
  {
    icon: WifiOff,
    title: 'Offline-first',
    description: 'Your records live on your device and sync to your account when you are online.',
  },
  {
    icon: Lock,
    title: 'App lock',
    description: 'Unlock with your PIN, or biometrics on supported devices.',
  },
  {
    icon: EyeOff,
    title: 'No ads, no data selling',
    description: 'KANAKU shows no ads, and we never sell or rent your personal or financial data.',
  },
  {
    icon: Trash2,
    title: 'You stay in control',
    description: 'Export reports anytime, and delete your account and data whenever you choose.',
  },
];

const faqs = [
  {
    question: 'Is KANAKU free to use?',
    answer:
      'Yes. KANAKU is free to use, with no time limit and no card required. AI features like KAI and bill scanning have a fair-use daily limit.',
  },
  {
    question: 'Does KANAKU work without internet?',
    answer:
      'Yes. KANAKU is offline-first: you can add, edit and review transactions without a connection, and everything syncs to your account when you are back online. A few features, like the KAI assistant, bill scanning and live market prices, need a connection.',
  },
  {
    question: 'Does KANAKU read my SMS messages?',
    answer:
      'Only in the KANAKU Android app you download directly from us, and only if you allow it. When enabled, KANAKU looks for bank transaction alerts so they can be added for you. The Google Play version never reads SMS — log expenses by voice, receipt scan or manual entry instead.',
  },
  {
    question: 'Can I track multiple accounts?',
    answer:
      'Yes. Add as many bank accounts, cards, cash and wallets as you need. You choose your home currency during setup, and investments held in other currencies are converted to it.',
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
      className={`mt-3 text-[30px] sm:text-[42px] leading-[1.1] font-bold tracking-[-0.03em] ${
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

/** Positions a phone relative to a centred anchor; transforms keep the layout box untouched. */
const PlacedPhone: React.FC<{
  offset: number;
  top: number;
  scale: number;
  className?: string;
  children: React.ReactNode;
}> = ({ offset, top, scale, className = '', children }) => (
  <div
    className={`absolute left-1/2 ${className}`}
    style={{
      top,
      zIndex: 30 - Math.abs(offset) / 20,
      transform: `translateX(calc(-50% + ${offset}px)) scale(${scale})`,
      transformOrigin: 'top center',
    }}
  >
    {children}
  </div>
);

const gridBackground = (color: string, size: number, mask: string): React.CSSProperties => ({
  backgroundImage: `linear-gradient(to right, ${color} 1px, transparent 1px), linear-gradient(to bottom, ${color} 1px, transparent 1px)`,
  backgroundSize: `${size}px ${size}px`,
  maskImage: mask,
  WebkitMaskImage: mask,
});

const AppTour: React.FC = () => {
  const [activeIndex, setActiveIndex] = useState(0);
  const active = tourScreens[activeIndex];

  return (
    <div className="mt-12 sm:mt-14 grid grid-cols-1 gap-8 lg:grid-cols-12 lg:gap-14 items-center">
      <div className="lg:col-span-5">
        <div className="lg:hidden -mx-4 px-4 flex gap-2 overflow-x-auto pb-1 scrollbar-none" role="tablist" aria-label="App screens">
          {tourScreens.map((item, index) => {
            const Icon = item.icon;
            const selected = index === activeIndex;
            return (
              <button
                type="button"
                key={item.id}
                role="tab"
                aria-selected={selected}
                data-testid={`landing-page-tour-chip-${item.id}`}
                onClick={() => setActiveIndex(index)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors ${
                  selected ? 'border-slate-950 bg-slate-950 text-white' : 'border-slate-200 bg-white text-slate-700'
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="hidden lg:block space-y-2" role="tablist" aria-label="App screens">
          {tourScreens.map((item, index) => {
            const Icon = item.icon;
            const selected = index === activeIndex;
            return (
              <button
                type="button"
                key={item.id}
                role="tab"
                aria-selected={selected}
                data-testid={`landing-page-tour-${item.id}`}
                onClick={() => setActiveIndex(index)}
                className={`w-full text-left rounded-[18px] border px-5 py-4 transition-colors ${
                  selected ? 'border-slate-200 bg-white shadow-[0_12px_30px_-18px_rgba(15,23,42,0.35)]' : 'border-transparent hover:bg-white/70'
                }`}
              >
                <span className="flex items-center gap-3">
                  <span
                    className={`w-9 h-9 shrink-0 rounded-[10px] flex items-center justify-center ${
                      selected ? 'bg-violet-600 text-white' : 'bg-slate-200/70 text-slate-600'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </span>
                  <span className={`text-[15px] font-semibold ${selected ? 'text-slate-950' : 'text-slate-700'}`}>
                    {selected ? item.title : item.label}
                  </span>
                </span>
                {selected && <span className="mt-2 block pl-12 text-[15px] leading-relaxed text-slate-600">{item.description}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="lg:col-span-7">
        <div className="relative flex justify-center overflow-hidden rounded-[32px] border border-slate-200 bg-gradient-to-b from-violet-100/70 via-white to-slate-50 px-4 py-10 sm:py-14">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={gridBackground('rgb(226 232 240 / 0.7)', 40, 'radial-gradient(ellipse 70% 60% at 50% 40%, black, transparent)')}
          />
          <motion.div
            key={active.id}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="relative"
          >
            <PhoneFrame showNav activeNav={active.nav}>
              {active.screen}
            </PhoneFrame>
          </motion.div>
          <motion.div
            key={`${active.id}-callout`}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35, delay: 0.15 }}
            className="absolute z-50 hidden sm:flex left-6 xl:left-10 bottom-20 items-center gap-3 rounded-[14px] border border-slate-200 bg-white/95 backdrop-blur px-4 py-3 shadow-[0_18px_40px_-16px_rgba(15,23,42,0.35)]"
            aria-hidden="true"
          >
            <span className="w-8 h-8 rounded-[10px] bg-violet-600 text-white flex items-center justify-center">
              <Check className="w-4 h-4" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-slate-900">{active.callout.title}</span>
              <span className="block text-xs text-slate-500">{active.callout.text}</span>
            </span>
          </motion.div>
        </div>
      </div>

      <div className="lg:hidden">
        <p className="text-lg font-semibold text-slate-950">{active.title}</p>
        <p className="mt-2 text-[15px] leading-relaxed text-slate-600">{active.description}</p>
      </div>
    </div>
  );
};

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
                className={`w-full min-w-0 text-left flex items-center gap-3.5 rounded-[14px] border px-4 py-3 transition-colors ${
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
          Review every entry — confirm in chat, or edit and undo in voice.
        </p>
      </div>

      <div className="lg:col-span-7">
        <div className="relative flex justify-center overflow-hidden rounded-[32px] border border-slate-200 bg-gradient-to-br from-fuchsia-100/60 via-violet-100/70 to-sky-100/60 px-4 py-10 sm:py-14">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/3 w-[420px] h-[420px] -translate-x-1/2 rounded-full bg-violet-300/40 blur-[90px]"
          />
          <div className="relative">
            <PhoneFrame>
              <KaiScreen conversation={assistantExamples[activeIndex]} thinking={thinking} orbState={orbState} />
            </PhoneFrame>
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
        { label: 'KAI assistant', id: 'assistant', section: true },
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
    <MotionConfig reducedMotion="user">
      <div
        className="relative min-h-screen bg-white text-slate-900 antialiased overflow-x-hidden selection:bg-violet-200"
        // Headings pick up --font-display from the base layer; Manrope gives the marketing pages a distinct voice.
        style={{ '--font-display': DISPLAY_FONT } as React.CSSProperties}
      >
        <PublicNavbar onNavigate={onNavigate} onLogin={onLogin} onGetStarted={onGetStarted} currentPage="landing" />

        <main>
          {/* ─── Hero ───────────────────────────────────────────────── */}
          <section id="home" className="relative overflow-hidden bg-gradient-to-b from-violet-50/80 via-white to-white">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={gridBackground('rgb(226 232 240 / 0.6)', 56, 'radial-gradient(ellipse 75% 55% at 50% 0%, black 35%, transparent 75%)')}
            />

            <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 sm:pt-36 text-center">
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

              <h1 className="mt-6 text-[36px] sm:text-[56px] lg:text-[64px] leading-[1.04] font-extrabold tracking-[-0.035em] text-slate-950">
                Track every expense.
                <br />
                <span className="text-violet-600">Understand every rupee.</span>
              </h1>

              <p className="mt-6 max-w-2xl mx-auto text-base sm:text-lg leading-relaxed text-slate-600">
                KANAKU is the expense tracker that keeps up with you. Log spending in seconds by voice, receipt scan or
                bank SMS, then see your budgets, reports and net worth in one app — even offline.
              </p>

              <div className="mt-8 flex flex-col sm:flex-row justify-center gap-3">
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
                  onClick={() => scrollToSection('features')}
                  className="inline-flex items-center justify-center gap-2 rounded-[14px] border border-slate-200 bg-white px-6 py-3.5 text-[15px] font-semibold text-slate-800 hover:bg-slate-50 hover:border-slate-300 transition-colors"
                >
                  Explore the app
                </button>
              </div>

              <ul className="mt-7 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-slate-600">
                {['Free plan, no card needed', 'Works offline', 'Web and mobile'].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-violet-600" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="relative mx-auto mt-14 sm:mt-16 h-[650px] max-w-[1440px]">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute left-1/2 top-16 w-[620px] max-w-[120vw] h-[520px] -translate-x-1/2 rounded-full bg-violet-300/35 blur-[110px]"
              />
              <PlacedPhone offset={-590} top={110} scale={0.84} className="hidden xl:block">
                <PhoneFrame>
                  <KaiScreen conversation={assistantExamples[0]} />
                </PhoneFrame>
              </PlacedPhone>
              <PlacedPhone offset={-320} top={50} scale={0.92} className="hidden md:block">
                <PhoneFrame showNav activeNav="transactions">
                  <TransactionsScreen />
                </PhoneFrame>
              </PlacedPhone>
              <PlacedPhone offset={0} top={0} scale={1}>
                <PhoneFrame showNav activeNav="home">
                  <DashboardScreen />
                </PhoneFrame>
              </PlacedPhone>
              <PlacedPhone offset={320} top={50} scale={0.92} className="hidden md:block">
                <PhoneFrame showNav>
                  <BudgetsScreen />
                </PhoneFrame>
              </PlacedPhone>
              <PlacedPhone offset={590} top={110} scale={0.84} className="hidden xl:block">
                <PhoneFrame showNav activeNav="investments">
                  <InvestmentsScreen />
                </PhoneFrame>
              </PlacedPhone>
              <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 z-40 h-24 bg-gradient-to-t from-white to-transparent" />
            </div>
          </section>

          {/* ─── Capture methods ────────────────────────────────────── */}
          <section className="border-y border-slate-200 bg-white">
            <ul className="max-w-7xl mx-auto grid grid-cols-2 lg:grid-cols-4 divide-slate-200 lg:divide-x">
              {capabilities.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.title} className="flex items-center gap-3 px-4 sm:px-8 py-6">
                    <span className="w-10 h-10 shrink-0 rounded-[10px] bg-violet-50 text-violet-700 flex items-center justify-center">
                      <Icon className="w-5 h-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm sm:text-[15px] font-semibold text-slate-900">{item.title}</span>
                      <span className="block text-xs sm:text-sm text-slate-500">{item.text}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* ─── App tour ───────────────────────────────────────────── */}
          <section id="features" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
            <SectionHeading
              eyebrow="Inside the app"
              title="Every part of your money, one tap away"
              description="Tap through the screens you'll use every day — the same app on your phone and in your browser."
            />
            <AppTour />
          </section>

          {/* ─── KAI assistant ──────────────────────────────────────── */}
          <section id="assistant" className="border-y border-slate-200 bg-slate-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
              <AssistantDemo />
            </div>
          </section>

          {/* ─── Everyday tools ─────────────────────────────────────── */}
          <section id="everyday" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
            <SectionHeading
              eyebrow="Built for everyday money"
              title="Scan, budget and split without the busywork"
              description="The small jobs that usually get skipped are the ones KANAKU makes quick."
            />
            <div className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {everydayCards.map((card, index) => {
                const Icon = card.icon;
                return (
                  <div
                    key={card.title}
                    className={`flex flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-slate-50 ${
                      index === 2 ? 'md:col-span-2 lg:col-span-1' : ''
                    }`}
                  >
                    <div className="p-7 sm:p-8">
                      <span className="w-10 h-10 rounded-[10px] bg-white border border-slate-200 text-violet-700 flex items-center justify-center">
                        <Icon className="w-5 h-5" />
                      </span>
                      <h3 className="mt-5 text-xl font-semibold tracking-tight text-slate-950">{card.title}</h3>
                      <p className="mt-2 text-[15px] leading-relaxed text-slate-600">{card.description}</p>
                    </div>
                    <div className="relative mt-auto h-[450px] overflow-hidden">
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute left-1/2 top-20 w-72 h-72 -translate-x-1/2 rounded-full bg-violet-300/40 blur-[80px]"
                      />
                      <PlacedPhone offset={0} top={8} scale={0.84}>
                        <PhoneFrame dark={card.dark}>{card.screen}</PhoneFrame>
                      </PlacedPhone>
                      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 z-40 h-20 bg-gradient-to-t from-slate-50 to-transparent" />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ─── Security & privacy ─────────────────────────────────── */}
          <section id="security" className="relative overflow-hidden bg-slate-950">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute right-[-10%] top-1/2 w-[640px] h-[640px] -translate-y-1/2 rounded-full bg-violet-700/30 blur-[140px]"
            />
            <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28 grid grid-cols-1 gap-14 lg:grid-cols-2 items-center">
              <div>
                <SectionHeading
                  align="left"
                  tone="dark"
                  eyebrow="Privacy & security"
                  title="Your finances stay yours."
                  description="Money is personal. KANAKU keeps your records with you, locks when you want it locked, and never uses your data to sell you anything."
                />
                <ul className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-7">
                  {securityPoints.map((point) => {
                    const Icon = point.icon;
                    return (
                      <li key={point.title} className="flex gap-4">
                        <span className="w-10 h-10 shrink-0 rounded-[10px] border border-white/10 bg-white/5 text-violet-300 flex items-center justify-center">
                          <Icon className="w-5 h-5" />
                        </span>
                        <span>
                          <span className="block text-base font-semibold text-white">{point.title}</span>
                          <span className="mt-1 block text-sm leading-relaxed text-slate-400">{point.description}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <button
                  type="button"
                  data-testid="landing-page-privacy-link"
                  onClick={() => onNavigate('privacy')}
                  className="group mt-10 inline-flex items-center gap-2 text-[15px] font-semibold text-white hover:text-violet-300 transition-colors"
                >
                  Read our privacy policy
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>
              <div className="flex justify-center">
                <PhoneFrame>
                  <PinLockScreen />
                </PhoneFrame>
              </div>
            </div>
          </section>

          {/* ─── FAQ ────────────────────────────────────────────────── */}
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

          {/* ─── Closing call to action ─────────────────────────────── */}
          <section className="px-4 sm:px-6 lg:px-8 pb-20 sm:pb-28">
            <div className="relative max-w-7xl mx-auto overflow-hidden rounded-[32px] bg-[#1e1045]">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute left-1/4 -top-40 w-[720px] max-w-[160%] h-[420px] -translate-x-1/2 rounded-full bg-violet-500/35 blur-[100px]"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 opacity-40"
                style={gridBackground('rgb(255 255 255 / 0.12)', 44, 'radial-gradient(ellipse 60% 80% at 30% 50%, black, transparent)')}
              />
              <div className="relative grid grid-cols-1 lg:grid-cols-2 items-center">
                <div className="px-6 py-14 sm:px-12 sm:py-20 text-center lg:text-left">
                  <KANAKULogo className="w-12 h-12 mx-auto lg:mx-0" />
                  <h2 className="mt-6 text-[30px] sm:text-[44px] leading-[1.1] font-bold tracking-[-0.03em] text-white">
                    Take control of your spending today.
                  </h2>
                  <p className="mt-4 text-base sm:text-lg text-violet-200 max-w-xl mx-auto lg:mx-0">
                    Create your free KANAKU account and log your first expense in minutes.
                  </p>
                  <div className="mt-8 flex flex-col sm:flex-row justify-center lg:justify-start gap-3">
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
                <div className="relative hidden lg:block h-full min-h-[460px]">
                  <PlacedPhone offset={-120} top={70} scale={0.8}>
                    <PhoneFrame showNav activeNav="groups">
                      <GroupsScreen />
                    </PhoneFrame>
                  </PlacedPhone>
                  <PlacedPhone offset={110} top={36} scale={0.8}>
                    <PhoneFrame showNav activeNav="home">
                      <DashboardScreen />
                    </PhoneFrame>
                  </PlacedPhone>
                </div>
              </div>
            </div>
          </section>
        </main>

        {/* ─── Footer ───────────────────────────────────────────────── */}
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

        <style>{`
          @keyframes kanaku-scan { 0%, 100% { top: 14%; } 50% { top: 82%; } }
          .kanaku-scan-line { animation: kanaku-scan 2.8s ease-in-out infinite; }
          @media (prefers-reduced-motion: reduce) { .kanaku-scan-line { animation: none; top: 48%; } }
        `}</style>
      </div>
    </MotionConfig>
  );
};
