/**
 * Static phone mockups of KANAKU app screens for the public marketing pages.
 * They mirror the real app's visual language (Dashboard, BottomNav, KaiScreen…)
 * with sample data, and are purely decorative (aria-hidden).
 */
import React from 'react';
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  BatteryFull,
  Bell,
  BellRing,
  Car,
  ChartPie,
  Check,
  ChevronDown,
  ChevronLeft,
  CircleCheck,
  Coins,
  CreditCard,
  Delete,
  Download,
  Ellipsis,
  FileText,
  FingerprintPattern,
  Fuel,
  HandCoins,
  House,
  Landmark,
  Plane,
  Plus,
  Receipt,
  Search,
  Send,
  ShoppingBag,
  ShoppingCart,
  Signal,
  SlidersHorizontal,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
  UtensilsCrossed,
  Wallet,
  Banknote,
  Wifi,
  X,
  Zap,
} from 'lucide-react';
import { KANAKULogo } from '@/app/components/ui/KANAKULogo';
import { AIOrb, type AIOrbState } from '@/app/components/features/ai/AIOrb';

export const formatINR = (value: number) => `₹${value.toLocaleString('en-IN')}`;

const appCard = 'rounded-[28px] sm:rounded-[32px] bg-white border border-slate-100/80 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.08)]';

// ─── Device frame ─────────────────────────────────────────────────────────────

export type PhoneNavId = 'home' | 'transactions' | 'kai' | 'investments' | 'groups';

const navItems: { id: PhoneNavId; icon: React.ElementType }[] = [
  { id: 'home', icon: House },
  { id: 'transactions', icon: Receipt },
  { id: 'kai', icon: Sparkles },
  { id: 'investments', icon: TrendingUp },
  { id: 'groups', icon: Users },
];

export const PhoneFrame: React.FC<{
  children: React.ReactNode;
  showNav?: boolean;
  activeNav?: PhoneNavId;
  dark?: boolean;
  className?: string;
}> = ({ children, showNav = false, activeNav, dark = false, className = '' }) => {
  const screenBg = dark ? 'bg-[#0b0b10]' : 'bg-[#F5F6FA]';
  return (
    <div
      aria-hidden="true"
      className={`relative w-[300px] h-[620px] shrink-0 select-none rounded-[50px] bg-[#0c0c10] p-[10px] shadow-[0_50px_100px_-40px_rgba(15,23,42,0.55),0_30px_60px_-34px_rgba(76,29,149,0.35)] ring-1 ring-black/50 ${className}`}
    >
      <span className="absolute -left-[3px] top-[118px] h-[30px] w-[3px] rounded-l-[2px] bg-[#1c1c22]" />
      <span className="absolute -left-[3px] top-[166px] h-[54px] w-[3px] rounded-l-[2px] bg-[#1c1c22]" />
      <span className="absolute -right-[3px] top-[150px] h-[80px] w-[3px] rounded-r-[2px] bg-[#1c1c22]" />

      <div className={`relative h-full w-full overflow-hidden rounded-[40px] ${screenBg}`}>
        <div
          className={`relative z-30 flex h-[44px] items-center justify-between px-7 pt-0.5 text-[12px] font-semibold ${
            dark ? 'text-white' : 'text-slate-900'
          }`}
        >
          <span>9:41</span>
          <span className="flex items-center gap-1">
            <Signal className="h-3 w-3" strokeWidth={3} />
            <Wifi className="h-3 w-3" strokeWidth={3} />
            <BatteryFull className="h-4 w-4" strokeWidth={2} />
          </span>
        </div>
        <div className="absolute left-1/2 top-[10px] z-40 h-[26px] w-[88px] -translate-x-1/2 rounded-full bg-black" />

        <div className="absolute inset-x-0 top-[44px] bottom-0 overflow-hidden">{children}</div>

        {showNav && (
          <>
            <div
              className={`absolute inset-x-0 bottom-0 z-10 h-24 bg-gradient-to-t ${
                dark ? 'from-[#0b0b10] via-[#0b0b10]/80' : 'from-[#F5F6FA] via-[#F5F6FA]/85'
              } to-transparent`}
            />
            <div className="absolute inset-x-0 bottom-[18px] z-20 flex justify-center">
              <div className="flex items-center gap-1 rounded-full border border-white/10 bg-black p-1 shadow-[0_12px_28px_rgba(0,0,0,0.45)]">
                {navItems.map(({ id, icon: Icon }) => (
                  <span
                    key={id}
                    className={`flex h-[38px] w-[38px] items-center justify-center rounded-full ${
                      id === activeNav
                        ? 'bg-gradient-to-b from-[#946BFB] via-[#7B3FEF] to-[#6824EB] text-white shadow-[inset_0_1.5px_2px_rgba(255,255,255,0.45),0_4px_14px_rgba(124,58,237,0.5)]'
                        : 'bg-[#1C1C20] text-slate-400'
                    }`}
                  >
                    <Icon className="h-[17px] w-[17px]" strokeWidth={2.2} />
                  </span>
                ))}
              </div>
            </div>
          </>
        )}

        <div
          className={`absolute bottom-[6px] left-1/2 z-30 h-[4px] w-[104px] -translate-x-1/2 rounded-full ${
            dark ? 'bg-white/70' : 'bg-slate-900/80'
          }`}
        />
      </div>
    </div>
  );
};

// ─── Small shared pieces ──────────────────────────────────────────────────────

export const Ring: React.FC<{ size: number; stroke: number; pct: number; color: string; track: string; arc?: number; className?: string }> = ({
  size,
  stroke,
  pct,
  color,
  track,
  arc = 1,
  className = '',
}) => {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const arcLength = circumference * arc;
  const rotation = arc < 1 ? 90 + (360 * (1 - arc)) / 2 : -90;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: `rotate(${rotation}deg)` }}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={track}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${arcLength} ${circumference}`}
      />
      {pct > 0 && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(arcLength * Math.min(pct, 100)) / 100} ${circumference}`}
        />
      )}
    </svg>
  );
};

const ScreenHeader: React.FC<{ title: string; subtitle?: string; children?: React.ReactNode }> = ({
  title,
  subtitle,
  children,
}) => (
  <div className="flex items-center justify-between gap-2">
    <div className="min-w-0">
      {subtitle && <p className="text-[10px] font-semibold text-slate-400">{subtitle}</p>}
      <p className="truncate text-[17px] font-extrabold leading-tight tracking-tight text-slate-900">{title}</p>
    </div>
    {children && <div className="flex shrink-0 items-center gap-1.5">{children}</div>}
  </div>
);

const RoundIcon: React.FC<{ icon: React.ElementType; dark?: boolean }> = ({ icon: Icon, dark = false }) => (
  <span
    className={`flex h-8 w-8 items-center justify-center rounded-full ${
      dark ? 'bg-[#18181B] text-white' : 'border border-slate-100 bg-white text-slate-600 shadow-sm'
    }`}
  >
    <Icon className="h-3.5 w-3.5" />
  </span>
);

const Pills: React.FC<{ items: string[]; active: string }> = ({ items, active }) => (
  <div className="flex gap-1 overflow-hidden">
    {items.map((item) => (
      <span
        key={item}
        className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[9.5px] font-bold ${
          item === active ? 'bg-[#18181B] text-white' : 'bg-white text-slate-500 border border-slate-100'
        }`}
      >
        {item}
      </span>
    ))}
  </div>
);

const IconTile: React.FC<{ icon: React.ElementType; tint: string; size?: 'sm' | 'md' }> = ({
  icon: Icon,
  tint,
  size = 'md',
}) => (
  <span
    className={`flex shrink-0 items-center justify-center ${
      size === 'md' ? 'h-9 w-9 rounded-[12px]' : 'h-7 w-7 rounded-[9px]'
    } ${tint}`}
  >
    <Icon className={size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5'} />
  </span>
);

const BankCard: React.FC<{
  name: string;
  amount: string;
  type: string;
  gradient: string;
  icon: React.ElementType;
  note?: string;
  className?: string;
}> = ({ name, amount, type, gradient, icon: Icon, note, className = '' }) => (
  <div className={`relative overflow-hidden rounded-[18px] bg-gradient-to-br p-3 text-white ${gradient} ${className}`}>
    <span className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-white/15 blur-xl" />
    <div className="relative flex items-center justify-between">
      <span className="flex h-7 w-7 items-center justify-center rounded-[9px] border border-white/20 bg-white/15">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="rounded-[6px] bg-white/15 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest text-white/80">
        {type}
      </span>
    </div>
    <p className="relative mt-2 truncate text-[10.5px] font-bold text-white/85">{name}</p>
    <div className="relative flex items-end justify-between gap-2">
      <p className="text-[16px] font-black leading-tight tracking-tight">{amount}</p>
      {note && <span className="pb-0.5 text-[8.5px] font-semibold text-white/75">{note}</span>}
    </div>
  </div>
);

const TxRow: React.FC<{
  icon: React.ElementType;
  tint: string;
  title: string;
  meta: string;
  amount: string;
  side?: string;
  positive?: boolean;
}> = ({ icon, tint, title, meta, amount, side, positive = false }) => (
  <div className="flex items-center gap-2.5 py-2">
    <IconTile icon={icon} tint={tint} />
    <div className="min-w-0 flex-1">
      <p className="truncate text-[11.5px] font-bold text-slate-900">{title}</p>
      <p className="truncate text-[9.5px] font-medium text-slate-400">{meta}</p>
    </div>
    <div className="shrink-0 text-right">
      <p className={`text-[11.5px] font-extrabold ${positive ? 'text-emerald-600' : 'text-slate-900'}`}>{amount}</p>
      {side && <p className="text-[9px] font-medium text-slate-400">{side}</p>}
    </div>
  </div>
);

// ─── Screens ──────────────────────────────────────────────────────────────────

const miniGauges = [
  { label: 'Expenses', value: '₹48,320', pct: 57, stroke: '#F97316', track: '#FFE4D6', icon: TrendingDown },
  { label: 'Income', value: '₹85,000', pct: 100, stroke: '#8B5CF6', track: '#EDE9FE', icon: TrendingUp },
  { label: 'Cashflow', value: '₹36,680', pct: 43, stroke: '#10B981', track: '#D1FAE5', icon: Activity },
];

export const DashboardScreen: React.FC = () => {
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(today);
    date.setDate(today.getDate() - 3 + i);
    return date;
  });

  return (
    <div className="h-full space-y-3 px-4 pt-2">
      <ScreenHeader subtitle="Welcome Back 👋" title="Stay On Track Today">
        <RoundIcon icon={Bell} />
      </ScreenHeader>

      <div className={`${appCard} px-2 py-2.5`}>
        <div className="flex justify-between">
          {days.map((date, i) => {
            const weekday = date.toLocaleDateString('en-IN', { weekday: 'short' }).slice(0, 3);
            return i === 3 ? (
              <span
                key={i}
                className="flex w-[34px] flex-col items-center rounded-[14px] bg-[#0F172A] py-1.5 shadow-md shadow-slate-950/20"
              >
                <span className="text-[8px] font-black uppercase tracking-wider text-[#FF2D78]">{weekday}</span>
                <span className="text-[13px] font-black leading-tight text-white">{date.getDate()}</span>
                <span className="mt-0.5 h-1 w-1 rounded-full bg-[#FF2D78]" />
              </span>
            ) : (
              <span key={i} className="flex w-[30px] flex-col items-center py-1.5">
                <span className="text-[8px] font-bold uppercase text-slate-400">{weekday}</span>
                <span className="text-[13px] font-bold leading-tight text-slate-500">{date.getDate()}</span>
                <span className="mt-0.5 h-1 w-1" />
              </span>
            );
          })}
        </div>
        <div className="mt-2 flex justify-center">
          <Pills items={['Daily', 'Weekly', 'Monthly', 'Yearly']} active="Monthly" />
        </div>
      </div>

      <div className="p-4 sm:p-6 bg-white border border-slate-100/80 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.08)] rounded-[28px] sm:rounded-[32px] relative overflow-hidden">
        <div className="flex items-center justify-between gap-2 pb-3">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1 rounded-full border border-purple-100 bg-purple-50 px-2.5 py-0.5 text-[9px] font-bold text-purple-700">
              <Sparkles className="h-2.5 w-2.5 text-purple-600" />
              Total Net Worth
            </span>
            <p className="mt-1.5 text-[22px] font-black leading-none tracking-tight text-slate-900">₹9,21,000</p>
            <p className="mt-1.5 text-[9.5px] font-bold text-emerald-600">▲ ₹38,200 this month</p>
          </div>
          <div className="relative h-[84px] w-[84px] shrink-0">
            <Ring size={84} stroke={8} pct={57} color="#18181B" track="#F1F5F9" arc={0.75} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[11px] font-black leading-none text-slate-900">₹48,320</span>
              <span className="mt-0.5 text-[8px] font-medium text-slate-400">of ₹85,000</span>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 divide-x divide-slate-100 border-t border-slate-100 -mx-4 sm:-mx-6 -mb-4 sm:-mb-6">
          {miniGauges.map(({ label, value, pct, stroke, track, icon: Icon }) => (
            <div key={label} className="flex flex-col items-center py-2.5">
              <span className="text-[10.5px] font-black text-slate-900">{value}</span>
              <span className="text-[8px] font-medium text-slate-400">{label}</span>
              <span className="relative mt-1.5 h-[34px] w-[34px]">
                <Ring size={34} stroke={3.5} pct={pct} color={stroke} track={track} />
                <Icon className="absolute inset-0 m-auto h-3.5 w-3.5" style={{ color: stroke }} />
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 rounded-[18px] border border-purple-200/70 bg-gradient-to-r from-purple-100/90 via-pink-100/80 to-purple-200/90 px-3.5 py-2.5">
        <div className="min-w-0">
          <p className="flex items-center gap-1 text-[10px] font-extrabold text-purple-950">
            <Sparkles className="h-3 w-3 text-purple-700" />
            KAI Assistant
          </p>
          <p className="mt-0.5 text-[10px] font-medium leading-snug text-purple-900/80">
            Dining costs are up 18% this month. Want me to set a budget?
          </p>
        </div>
        <AIOrb size={40} showStatusGlow={false} />
      </div>

      <div>
        <div className="flex items-center justify-between px-0.5">
          <p className="text-[11px] font-extrabold text-slate-900">Accounts &amp; Wallets</p>
          <span className="text-[9px] font-bold text-purple-600">View all</span>
        </div>
        <div className="mt-2 flex gap-2">
          <BankCard
            className="w-[150px] shrink-0"
            gradient="from-[#1e3a8a] to-[#0f172a]"
            icon={Landmark}
            name="HDFC Savings"
            amount="₹1,42,300"
            type="Bank"
          />
          <BankCard
            className="w-[150px] shrink-0"
            gradient="from-[#8b5cf6] to-[#4c1d95]"
            icon={CreditCard}
            name="ICICI Coral Card"
            amount="−₹18,450"
            type="Card"
          />
        </div>
      </div>
    </div>
  );
};

export const TransactionsScreen: React.FC = () => (
  <div className="h-full space-y-3 px-4 pt-2">
    <ScreenHeader subtitle="This month" title="Transactions">
      <RoundIcon icon={Search} />
      <RoundIcon icon={SlidersHorizontal} />
    </ScreenHeader>

    <div className="grid grid-cols-2 gap-2">
      <div className={`${appCard} p-2.5`}>
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <ArrowDownLeft className="h-3.5 w-3.5" />
        </span>
        <p className="mt-1.5 text-[9px] font-semibold text-slate-400">Income</p>
        <p className="text-[14px] font-black text-slate-900">₹85,000</p>
      </div>
      <div className={`${appCard} p-2.5`}>
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-50 text-rose-600">
          <ArrowUpRight className="h-3.5 w-3.5" />
        </span>
        <p className="mt-1.5 text-[9px] font-semibold text-slate-400">Expenses</p>
        <p className="text-[14px] font-black text-slate-900">₹48,320</p>
      </div>
    </div>

    <Pills items={['All', 'Expenses', 'Income', 'Transfers']} active="All" />

    <div>
      <p className="px-0.5 text-[9.5px] font-extrabold uppercase tracking-wider text-slate-400">Today</p>
      <div className={`${appCard} mt-1.5 divide-y divide-slate-100 px-3`}>
        <TxRow icon={ShoppingCart} tint="bg-violet-50 text-violet-600" title="DMart" meta="Groceries · HDFC Card" amount="−₹1,850" side="7:42 PM" />
        <TxRow icon={UtensilsCrossed} tint="bg-orange-50 text-orange-500" title="Swiggy" meta="Food delivery · UPI" amount="−₹486" side="1:15 PM" />
        <TxRow icon={Car} tint="bg-sky-50 text-sky-600" title="Uber" meta="Transport · UPI" amount="−₹312" side="9:05 AM" />
      </div>
    </div>

    <div>
      <p className="px-0.5 text-[9.5px] font-extrabold uppercase tracking-wider text-slate-400">Yesterday</p>
      <div className={`${appCard} mt-1.5 divide-y divide-slate-100 px-3`}>
        <TxRow icon={Landmark} tint="bg-emerald-50 text-emerald-600" title="Salary" meta="Income · SBI Savings" amount="+₹85,000" side="10:00 AM" positive />
        <TxRow icon={Zap} tint="bg-amber-50 text-amber-600" title="Electricity bill" meta="Bills · Auto-pay" amount="−₹2,340" side="8:30 AM" />
        <TxRow icon={Fuel} tint="bg-teal-50 text-teal-600" title="Indian Oil" meta="Fuel · UPI" amount="−₹1,200" side="7:10 AM" />
      </div>
    </div>
  </div>
);

export const AccountsScreen: React.FC = () => (
  <div className="h-full space-y-3 px-4 pt-2">
    <ScreenHeader subtitle="4 accounts" title="Accounts">
      <RoundIcon icon={Plus} dark />
    </ScreenHeader>

    <div className={`${appCard} p-3.5`}>
      <p className="text-[9.5px] font-semibold text-slate-400">Net balance</p>
      <p className="text-[22px] font-black leading-tight tracking-tight text-slate-900">₹1,34,600</p>
      <div className="mt-1.5 flex gap-1.5">
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-bold text-emerald-700">Assets ₹1,53,050</span>
        <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[9px] font-bold text-rose-600">Owed ₹18,450</span>
      </div>
    </div>

    <Pills items={['All', 'Banks', 'Cards', 'Wallets', 'Cash']} active="All" />

    <div className="space-y-2">
      <BankCard gradient="from-[#1e3a8a] to-[#0f172a]" icon={Landmark} name="HDFC Savings" amount="₹1,42,300" type="Bank" note="•••• 4821" />
      <BankCard gradient="from-[#8b5cf6] to-[#4c1d95]" icon={CreditCard} name="ICICI Coral Credit Card" amount="−₹18,450" type="Card" note="•••• 3009" />
      <BankCard gradient="from-[#0ea5e9] to-[#1d4ed8]" icon={Wallet} name="Paytm Wallet" amount="₹4,250" type="Wallet" />
      <BankCard gradient="from-[#10b981] to-[#0f766e]" icon={Banknote} name="Cash" amount="₹6,500" type="Cash" />
    </div>
  </div>
);

const holdings = [
  { icon: Coins, tint: 'bg-amber-50 text-amber-600', name: 'Gold 24K', meta: '35 g · live rate', value: '₹2,84,200', change: '+11.4%' },
  { icon: ChartPie, tint: 'bg-violet-50 text-violet-600', name: 'Nifty 50 Index Fund', meta: 'Mutual fund · SIP', value: '₹2,12,300', change: '+16.2%' },
  { icon: Landmark, tint: 'bg-sky-50 text-sky-600', name: 'SBI Fixed Deposit', meta: '7.1% p.a.', value: '₹1,71,300', change: '+7.1%' },
  { icon: TrendingUp, tint: 'bg-emerald-50 text-emerald-600', name: 'Reliance Industries', meta: 'Stock · 40 shares', value: '₹1,18,600', change: '+8.1%' },
];

const investmentMix = [
  { name: 'Gold', pct: 36, color: 'bg-amber-400' },
  { name: 'Mutual funds', pct: 27, color: 'bg-violet-500' },
  { name: 'Fixed deposit', pct: 22, color: 'bg-sky-500' },
  { name: 'Stocks', pct: 15, color: 'bg-emerald-500' },
];

export const InvestmentsScreen: React.FC = () => {
  // Unique per instance — this screen renders in several phones and url(#id) resolves to the first match.
  const sparkId = `kanaku-mock-spark-${React.useId().replace(/:/g, '')}`;
  return (
    <div className="h-full space-y-3 px-4 pt-2">
      <ScreenHeader subtitle="Portfolio" title="Investments">
        <RoundIcon icon={Plus} dark />
      </ScreenHeader>

      <div className="relative overflow-hidden rounded-[20px] bg-gradient-to-br from-[#18181B] via-[#1e1b4b] to-[#4c1d95] p-3.5 text-white">
        <p className="text-[9.5px] font-semibold text-white/60">Current value</p>
        <p className="text-[22px] font-black leading-tight tracking-tight">₹7,86,400</p>
        <p className="text-[10px] font-bold text-emerald-300">+₹1,02,300 (14.9%) all time</p>
        <svg viewBox="0 0 240 44" className="mt-2 h-11 w-full" preserveAspectRatio="none">
          <defs>
            <linearGradient id={sparkId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M0 36 L20 33 L40 35 L60 28 L80 30 L100 24 L120 26 L140 18 L160 21 L180 14 L200 16 L220 9 L240 6 L240 44 L0 44 Z"
            fill={`url(#${sparkId})`}
          />
          <polyline
            points="0,36 20,33 40,35 60,28 80,30 100,24 120,26 140,18 160,21 180,14 200,16 220,9 240,6"
            fill="none"
            stroke="#c4b5fd"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <div className={`${appCard} p-3`}>
        <div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
          {investmentMix.map((asset) => (
            <span key={asset.name} className={asset.color} style={{ width: `${asset.pct}%` }} />
          ))}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
          {investmentMix.map((asset) => (
            <span key={asset.name} className="flex items-center gap-1.5 text-[9.5px] font-medium text-slate-500">
              <span className={`h-1.5 w-1.5 rounded-full ${asset.color}`} />
              {asset.name}
              <span className="ml-auto font-bold text-slate-900">{asset.pct}%</span>
            </span>
          ))}
        </div>
      </div>

      <div className={`${appCard} divide-y divide-slate-100 px-3`}>
        {holdings.map((holding) => (
          <TxRow
            key={holding.name}
            icon={holding.icon}
            tint={holding.tint}
            title={holding.name}
            meta={holding.meta}
            amount={holding.value}
            side={holding.change}
          />
        ))}
      </div>
    </div>
  );
};

const categorySegments = [
  { name: 'Bills', pct: 24, color: '#7C3AED' },
  { name: 'Food', pct: 24, color: '#0EA5E9' },
  { name: 'Shopping', pct: 20, color: '#F59E0B' },
  { name: 'Other', pct: 18, color: '#CBD5E1' },
  { name: 'Transport', pct: 14, color: '#10B981' },
];

export const ReportsScreen: React.FC = () => {
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) =>
    new Date(now.getFullYear(), now.getMonth() - 5 + i, 1).toLocaleString('en-IN', { month: 'short' }).slice(0, 3)
  );
  const bars = [
    [70, 46],
    [70, 52],
    [74, 44],
    [70, 58],
    [76, 50],
    [80, 44],
  ];
  const size = 76;
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const starts = categorySegments.map((_, i) =>
    categorySegments.slice(0, i).reduce((sum, segment) => sum + (circumference * segment.pct) / 100, 0)
  );

  return (
    <div className="h-full space-y-3 px-4 pt-2">
      <ScreenHeader subtitle="Insights" title="Reports">
        <span className="flex items-center gap-1 rounded-full border border-slate-100 bg-white px-2.5 py-1.5 text-[9.5px] font-bold text-slate-700 shadow-sm">
          This month
          <ChevronDown className="h-3 w-3" />
        </span>
      </ScreenHeader>

      <div className={`${appCard} grid grid-cols-3 divide-x divide-slate-100 py-2.5 text-center`}>
        <div>
          <p className="text-[8.5px] font-semibold text-slate-400">Income</p>
          <p className="text-[12px] font-black text-emerald-600">₹85,000</p>
        </div>
        <div>
          <p className="text-[8.5px] font-semibold text-slate-400">Spent</p>
          <p className="text-[12px] font-black text-rose-600">₹48,320</p>
        </div>
        <div>
          <p className="text-[8.5px] font-semibold text-slate-400">Saved</p>
          <p className="text-[12px] font-black text-violet-700">43%</p>
        </div>
      </div>

      <div className={`${appCard} p-3.5`}>
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-extrabold text-slate-900">Income vs spending</p>
          <span className="flex items-center gap-2 text-[8.5px] font-semibold text-slate-400">
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-200" />
              In
            </span>
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-[#18181B]" />
              Out
            </span>
          </span>
        </div>
        <div className="mt-3 flex items-end justify-between">
          {bars.map(([income, spend], i) => (
            <div key={months[i]} className="flex flex-col items-center gap-1">
              <div className="flex items-end gap-[3px]">
                <span className="w-[9px] rounded-[4px] bg-violet-200" style={{ height: income }} />
                <span
                  className={`w-[9px] rounded-[4px] ${i === bars.length - 1 ? 'bg-violet-600' : 'bg-[#18181B]'}`}
                  style={{ height: spend }}
                />
              </div>
              <span className="text-[8.5px] font-semibold text-slate-400">{months[i]}</span>
            </div>
          ))}
        </div>
      </div>

      <div className={`${appCard} flex items-center gap-3 p-3.5`}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
          {categorySegments.map((segment, i) => (
            <circle
              key={segment.name}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={segment.color}
              strokeWidth={stroke}
              strokeDasharray={`${Math.max((circumference * segment.pct) / 100 - 2, 0)} ${circumference}`}
              strokeDashoffset={-starts[i]}
            />
          ))}
        </svg>
        <div className="flex-1 space-y-1">
          {categorySegments.map((segment) => (
            <p key={segment.name} className="flex items-center gap-1.5 text-[9.5px] font-medium text-slate-500">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: segment.color }} />
              {segment.name}
              <span className="ml-auto font-bold text-slate-900">{segment.pct}%</span>
            </p>
          ))}
        </div>
      </div>

      <div className={`${appCard} flex items-center gap-2.5 p-2.5`}>
        <IconTile icon={FileText} tint="bg-rose-50 text-rose-500" size="sm" />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold text-slate-900">Monthly statement</p>
          <p className="text-[9px] font-medium text-slate-400">PDF · ready to share</p>
        </div>
        <RoundIcon icon={Download} dark />
      </div>
    </div>
  );
};

export interface KaiConversation {
  prompt: string;
  reply: string;
  cardTitle: string;
  rows: { label: string; value: string }[];
  needsConfirmation?: boolean;
}

export const KaiScreen: React.FC<{ conversation: KaiConversation; thinking?: boolean; orbState?: AIOrbState }> = ({
  conversation,
  thinking = false,
  orbState = 'idle',
}) => (
  <div className="flex h-full flex-col bg-gradient-to-b from-[#F5F6FA] via-[#f3effd] to-[#fbf2fa] px-4 pb-6 pt-2">
    <div>
      <p className="text-[17px] font-extrabold leading-tight tracking-tight text-slate-900">Hi, Priya 👋</p>
      <p className="text-[10.5px] font-medium text-slate-500">How can I help you today?</p>
    </div>

    <div className="flex flex-col items-center pt-3">
      <AIOrb size={72} state={orbState} showStatusGlow />
      <span className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-white/70 bg-white/80 px-3 py-1 text-[9.5px] font-bold text-slate-600">
        {thinking && <span className="h-1.5 w-1.5 animate-ping rounded-full bg-purple-600" />}
        {thinking ? 'Thinking…' : 'Tap the orb to talk'}
      </span>
    </div>

    <div className="mt-3 flex-1 space-y-2 overflow-hidden">
      <div className="ml-auto w-fit max-w-[88%] rounded-[16px] rounded-br-[4px] bg-[#18181B] px-3 py-2 text-[11px] leading-snug text-white">
        {conversation.prompt}
      </div>

      {thinking ? (
        <div className="flex w-fit gap-1 rounded-[16px] rounded-bl-[4px] border border-slate-100 bg-white px-3 py-2.5">
          {[0, 150, 300].map((delay) => (
            <span
              key={delay}
              className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-300"
              style={{ animationDelay: `${delay}ms` }}
            />
          ))}
        </div>
      ) : (
        <>
          <p className="max-w-[92%] text-[11px] font-medium leading-snug text-slate-700">{conversation.reply}</p>
          <div className={`${appCard} p-3`}>
            <p className="flex items-center gap-1 text-[8.5px] font-black uppercase tracking-wider text-purple-700">
              <Sparkles className="h-2.5 w-2.5" />
              {conversation.cardTitle}
            </p>
            <div className="mt-1.5 divide-y divide-slate-100">
              {conversation.rows.map((row) => (
                <p key={row.label} className="flex justify-between gap-2 py-1.5 text-[10.5px]">
                  <span className="text-slate-400">{row.label}</span>
                  <span className="font-bold text-slate-900">{row.value}</span>
                </p>
              ))}
            </div>
            {conversation.needsConfirmation && (
              <div className="mt-2 flex gap-1.5">
                <span className="flex flex-1 items-center justify-center gap-1 rounded-full bg-gradient-to-tr from-[#8B5CF6] to-[#7C3AED] py-1.5 text-[10.5px] font-bold text-white">
                  <Check className="h-3 w-3" />
                  Confirm
                </span>
                <span className="flex flex-1 items-center justify-center rounded-full bg-slate-100 py-1.5 text-[10.5px] font-bold text-slate-700">
                  Edit
                </span>
              </div>
            )}
          </div>
        </>
      )}
    </div>

    <div className="mt-2 flex items-center gap-2 rounded-full border border-purple-100 bg-white/95 py-1.5 pl-3.5 pr-1.5 shadow-[0_12px_32px_-4px_rgba(112,144,176,0.2)]">
      <span className="flex-1 truncate text-[10px] font-medium text-slate-400">Try “spent 2000 on petrol”</span>
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-tr from-[#8B5CF6] to-[#7C3AED] text-white">
        <Send className="h-3 w-3" />
      </span>
    </div>
  </div>
);

const receiptItems = [
  ['Basmati rice', '649'],
  ['Toor dal', '179'],
  ['Sunflower oil', '165'],
  ['Milk & curd', '324'],
  ['+ 8 items', '533'],
];

export const ScannerScreen: React.FC = () => (
  <div className="relative h-full text-white">
    <div className="flex items-center justify-between px-4 pt-1">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10">
        <X className="h-3.5 w-3.5" />
      </span>
      <p className="text-[12px] font-semibold">Scan receipt</p>
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10">
        <Zap className="h-3.5 w-3.5" />
      </span>
    </div>

    <div className="relative mx-5 mt-3 h-[218px] overflow-hidden rounded-[22px] bg-gradient-to-b from-[#2a2a33] to-[#141419]">
      <div className="absolute left-1/2 top-5 w-[150px] -translate-x-1/2 rotate-[-3deg] rounded-[6px] bg-[#fbfaf6] p-3 font-mono text-[7.5px] leading-[13px] text-slate-500 shadow-2xl">
        <p className="text-center text-[8.5px] font-bold tracking-[0.2em] text-slate-800">DMART</p>
        <p className="text-center">Tax invoice</p>
        <div className="my-1.5 border-t border-dashed border-slate-300" />
        {receiptItems.map(([item, price]) => (
          <p key={item} className="flex justify-between">
            <span>{item}</span>
            <span>{price}</span>
          </p>
        ))}
        <div className="my-1.5 border-t border-dashed border-slate-300" />
        <p className="flex justify-between font-bold text-slate-800">
          <span>TOTAL</span>
          <span>₹1,850</span>
        </p>
        <div className="mt-2 flex h-4 items-stretch justify-center gap-[1.5px]">
          {[2, 1, 3, 1, 2, 2, 1, 3, 1, 1, 2, 3, 1, 2, 1, 3, 2, 1].map((w, i) => (
            <span key={i} className="bg-slate-700" style={{ width: w }} />
          ))}
        </div>
      </div>
      {['left-3 top-3 border-l-2 border-t-2 rounded-tl-[12px]', 'right-3 top-3 border-r-2 border-t-2 rounded-tr-[12px]', 'left-3 bottom-3 border-b-2 border-l-2 rounded-bl-[12px]', 'right-3 bottom-3 border-b-2 border-r-2 rounded-br-[12px]'].map(
        (corner) => (
          <span key={corner} className={`absolute h-7 w-7 border-violet-400 ${corner}`} />
        )
      )}
      <span className="kanaku-scan-line absolute inset-x-6 h-[2px] bg-gradient-to-r from-transparent via-violet-300 to-transparent shadow-[0_0_14px_3px_rgba(167,139,250,0.65)]" />
    </div>

    <div className="mt-3 flex justify-center gap-1.5 text-[9.5px] font-semibold">
      <span className="rounded-full bg-white/15 px-3 py-1 text-white">Receipt</span>
      <span className="rounded-full px-3 py-1 text-white/50">PDF</span>
      <span className="rounded-full px-3 py-1 text-white/50">Gallery</span>
    </div>

    <div className="absolute inset-x-0 bottom-0 top-[300px] rounded-t-[26px] bg-white px-4 pt-2 text-slate-900">
      <span className="mx-auto block h-1 w-9 rounded-full bg-slate-200" />
      <div className="mt-2.5 flex items-center gap-1.5">
        <CircleCheck className="h-4 w-4 text-emerald-500" />
        <p className="text-[12px] font-extrabold">Receipt detected</p>
        <span className="ml-auto rounded-full bg-purple-50 px-2 py-0.5 text-[8.5px] font-bold text-purple-700">Auto-filled</span>
      </div>
      <div className="mt-2 divide-y divide-slate-100">
        {[
          ['Merchant', 'DMart'],
          ['Date', 'Today, 7:42 PM'],
          ['Items', '12'],
          ['Category', 'Groceries'],
        ].map(([label, value]) => (
          <p key={label} className="flex justify-between py-1.5 text-[10.5px]">
            <span className="text-slate-400">{label}</span>
            <span className="font-bold">{value}</span>
          </p>
        ))}
        <p className="flex items-center justify-between py-1.5">
          <span className="text-[10.5px] text-slate-400">Total</span>
          <span className="text-[16px] font-black">₹1,850</span>
        </p>
      </div>
      <span className="mt-2 flex items-center justify-center rounded-full bg-gradient-to-tr from-[#8B5CF6] to-[#7C3AED] py-2 text-[11px] font-bold text-white">
        Save expense
      </span>
    </div>
  </div>
);

const budgetRows = [
  { icon: ShoppingCart, tint: 'bg-violet-50 text-violet-600', bar: 'bg-violet-600', name: 'Groceries', spent: 6420, limit: 8000 },
  { icon: UtensilsCrossed, tint: 'bg-amber-50 text-amber-600', bar: 'bg-amber-400', name: 'Dining out', spent: 4250, limit: 5000 },
  { icon: Car, tint: 'bg-sky-50 text-sky-600', bar: 'bg-sky-500', name: 'Transport', spent: 3100, limit: 5000 },
  { icon: ShoppingBag, tint: 'bg-pink-50 text-pink-600', bar: 'bg-pink-500', name: 'Shopping', spent: 4400, limit: 10000 },
];

export const BudgetsScreen: React.FC = () => (
  <div className="h-full space-y-3 px-4 pt-2">
    <ScreenHeader subtitle="This month" title="Budgets">
      <RoundIcon icon={Plus} dark />
    </ScreenHeader>

    <div className={`${appCard} flex items-center gap-3 p-3.5`}>
      <div className="relative h-[86px] w-[86px] shrink-0">
        <Ring size={86} stroke={9} pct={65} color="#7C3AED" track="#EDE9FE" arc={0.75} />
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[13px] font-black leading-none text-slate-900">₹9,830</span>
          <span className="mt-0.5 text-[8.5px] font-medium text-slate-400">left</span>
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-[9.5px] font-semibold text-slate-400">Spent so far</p>
        <p className="text-[14px] font-black text-slate-900">₹18,170</p>
        <p className="text-[9.5px] font-medium text-slate-400">of ₹28,000 across 4 budgets</p>
      </div>
    </div>

    <div className="flex items-center gap-2 rounded-[16px] border border-amber-200 bg-amber-50 p-2.5">
      <IconTile icon={BellRing} tint="bg-amber-100 text-amber-600" size="sm" />
      <div className="min-w-0">
        <p className="text-[10.5px] font-bold text-amber-900">Dining out is at 85%</p>
        <p className="text-[9.5px] font-medium text-amber-700">₹750 left for this month</p>
      </div>
    </div>

    <div className={`${appCard} divide-y divide-slate-100 px-3`}>
      {budgetRows.map((row) => {
        const pct = Math.round((row.spent / row.limit) * 100);
        return (
          <div key={row.name} className="py-2.5">
            <div className="flex items-center gap-2.5">
              <IconTile icon={row.icon} tint={row.tint} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold text-slate-900">{row.name}</p>
                <p className="text-[9px] font-medium text-slate-400">
                  {formatINR(row.spent)} of {formatINR(row.limit)}
                </p>
              </div>
              <span className={`text-[10.5px] font-extrabold ${pct >= 85 ? 'text-amber-600' : 'text-slate-900'}`}>{pct}%</span>
            </div>
            <div className="mt-1.5 h-1.5 rounded-full bg-slate-100">
              <div className={`h-full rounded-full ${row.bar}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

const groupMembers = [
  ['You', 'bg-violet-300 text-violet-900'],
  ['RS', 'bg-sky-300 text-sky-900'],
  ['MK', 'bg-amber-300 text-amber-900'],
  ['VN', 'bg-emerald-300 text-emerald-900'],
];

export const GroupsScreen: React.FC = () => (
  <div className="h-full space-y-3 px-4 pt-2">
    <div className="flex items-center justify-between">
      <RoundIcon icon={ChevronLeft} />
      <p className="text-[13px] font-extrabold text-slate-900">Goa Trip</p>
      <RoundIcon icon={Ellipsis} />
    </div>

    <div className="relative overflow-hidden rounded-[22px] bg-gradient-to-br from-violet-500 via-purple-600 to-indigo-700 p-3.5 text-white">
      <span className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/15 blur-2xl" />
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-[9.5px] font-semibold text-white/70">Total spent</p>
          <p className="text-[22px] font-black leading-tight tracking-tight">₹34,500</p>
        </div>
        <span className="flex h-8 w-8 items-center justify-center rounded-[10px] border border-white/20 bg-white/15">
          <Plane className="h-4 w-4" />
        </span>
      </div>
      <div className="relative mt-3 flex items-center justify-between">
        <div className="flex -space-x-1.5">
          {groupMembers.map(([initials, color]) => (
            <span
              key={initials}
              className={`flex h-7 w-7 items-center justify-center rounded-full border-2 border-purple-600 text-[8px] font-extrabold ${color}`}
            >
              {initials}
            </span>
          ))}
        </div>
        <span className="rounded-full bg-white/20 px-2.5 py-1 text-[9.5px] font-bold">You are owed ₹4,850</span>
      </div>
    </div>

    <div className="grid grid-cols-2 gap-2">
      <span className="flex items-center justify-center gap-1 rounded-full bg-[#18181B] py-2 text-[10.5px] font-bold text-white">
        <Plus className="h-3 w-3" />
        Add expense
      </span>
      <span className="flex items-center justify-center gap-1 rounded-full border border-slate-200 bg-white py-2 text-[10.5px] font-bold text-slate-800">
        <HandCoins className="h-3 w-3" />
        Settle up
      </span>
    </div>

    <div className={`${appCard} px-3 py-1`}>
      <p className="pt-2 text-[9.5px] font-extrabold uppercase tracking-wider text-slate-400">Balances</p>
      <div className="divide-y divide-slate-100">
        {[
          ['RS', 'Rahul owes you', '₹2,450', 'bg-sky-100 text-sky-800'],
          ['MK', 'Meera owes you', '₹2,400', 'bg-amber-100 text-amber-800'],
          ['VN', 'Vikram is settled up', '', 'bg-emerald-100 text-emerald-800'],
        ].map(([initials, label, amount, color]) => (
          <div key={initials} className="flex items-center gap-2.5 py-2">
            <span className={`flex h-7 w-7 items-center justify-center rounded-full text-[8.5px] font-extrabold ${color}`}>
              {initials}
            </span>
            <p className="flex-1 text-[11px] font-semibold text-slate-800">{label}</p>
            {amount ? (
              <span className="text-[11px] font-extrabold text-emerald-600">{amount}</span>
            ) : (
              <CircleCheck className="h-4 w-4 text-emerald-500" />
            )}
          </div>
        ))}
      </div>
    </div>

    <div className={`${appCard} divide-y divide-slate-100 px-3`}>
      <TxRow icon={House} tint="bg-violet-50 text-violet-600" title="Villa booking" meta="Paid by Meera" amount="₹18,000" />
      <TxRow icon={UtensilsCrossed} tint="bg-orange-50 text-orange-500" title="Beach shack dinner" meta="Paid by you" amount="₹6,800" />
    </div>
  </div>
);

export const PinLockScreen: React.FC = () => (
  <div className="flex h-full flex-col items-center px-8 pt-10">
    <KANAKULogo className="h-12 w-12" />
    <p className="mt-4 text-[16px] font-extrabold tracking-tight text-slate-900">Welcome back, Priya</p>
    <p className="mt-0.5 text-[10.5px] font-medium text-slate-500">Enter your PIN to unlock KANAKU</p>

    <div className="mt-6 flex gap-3">
      {[true, true, false, false].map((filled, i) => (
        <span
          key={i}
          className={`h-3 w-3 rounded-full ${filled ? 'bg-violet-600' : 'border-2 border-slate-300'}`}
        />
      ))}
    </div>

    <div className="mt-8 grid grid-cols-3 gap-x-5 gap-y-3">
      {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'bio', '0', 'del'].map((key) => (
        <span
          key={key}
          className={`flex h-[54px] w-[54px] items-center justify-center rounded-full text-[20px] font-semibold text-slate-900 ${
            key === 'bio' || key === 'del' ? '' : 'border border-slate-100 bg-white shadow-sm'
          }`}
        >
          {key === 'bio' ? (
            <FingerprintPattern className="h-6 w-6 text-violet-600" />
          ) : key === 'del' ? (
            <Delete className="h-5 w-5 text-slate-500" />
          ) : (
            key
          )}
        </span>
      ))}
    </div>

    <p className="mt-6 text-[10.5px] font-semibold text-violet-700">Forgot PIN?</p>
  </div>
);
