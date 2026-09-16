import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { db } from '@/lib/database';
import { saveAccountWithBackendSync } from '@/lib/auth-sync-integration';
import { Wallet, Landmark, CreditCard, Banknote, Check, ArrowLeft, Globe2, Info } from 'lucide-react';
import { toast } from 'sonner';
import { SearchableDropdown } from '@/app/components/ui/SearchableDropdown';
import { BankLogo } from '@/app/components/ui/BankLogo';
import { BANKS_BY_COUNTRY } from '@/constants/banks';
import { cn } from '@/lib/utils';
import { FloatingSaveBar } from '@/app/components/ui/FloatingSaveBar';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';
import { useSubmitLock } from '@/hooks/useSubmitLock';

// --- Constants ---
const accountTypes = [
  { id: 'bank', label: 'Bank', icon: Landmark },
  { id: 'card', label: 'Credit Card', icon: CreditCard },
  { id: 'cash', label: 'Cash', icon: Banknote },
  { id: 'wallet', label: 'Wallet', icon: Wallet },
];

const CARD_NETWORKS = [
  { id: 'visa', label: 'Visa', color: 'text-blue-600' },
  { id: 'mastercard', label: 'Mastercard', color: 'text-orange-500' },
  { id: 'rupay', label: 'RuPay', color: 'text-blue-800' },
  { id: 'amex', label: 'Amex', color: 'text-sky-500' },
  { id: 'diners', label: 'Diners Club', color: 'text-indigo-900' },
];

const WalletLogo: React.FC<{ wallet: string }> = ({ wallet }) => {
  switch (wallet.toLowerCase()) {
    case 'paytm':
      return <div className="flex flex-col items-center leading-none"><span className="text-2xs font-black text-[#002E6E]">Pay</span><span className="text-2xs font-black text-[#00BAF2]">tm</span></div>;
    case 'phonepe':
      return <div className="w-full h-full flex items-center justify-center bg-[#5f259f] rounded-lg text-white font-black text-[8px]">PhonePe</div>;
    case 'google pay':
      return <div className="flex items-center gap-0.5 font-bold text-2xs"><span className="text-blue-500">G</span><span className="text-red-500">P</span><span className="text-yellow-500">a</span><span className="text-green-500">y</span></div>;
    case 'amazon pay':
      return <div className="flex flex-col items-center bg-[#232F3E] px-2 py-1 rounded text-white italic font-black text-[7px]">amazon<span className="text-orange-400 not-italic">pay</span></div>;
    case 'apple pay':
      return <div className="flex items-center gap-1 font-bold text-black"><div className="w-3 h-3 bg-black rounded-full" /><span className="text-2xs">Pay</span></div>;
    case 'samsung pay':
      return <div className="text-[#034ea2] font-black text-2xs italic">SAMSUNG <span className="not-italic font-bold">pay</span></div>;
    case 'mobikwik':
      return <div className="text-[#00529b] font-black text-2xs italic">MobiKwik</div>;
    case 'freecharge':
      return <div className="text-[#ff5a5f] font-black text-2xs">freecharge</div>;
    case 'airtel money':
      return <div className="text-red-600 font-black text-2xs">airtel <span className="font-light">money</span></div>;
    default:
      return <Wallet size={16} className="text-slate-400" />;
  }
};

const INDIAN_WALLETS = [
  { name: 'Paytm', color: 'border-[#00BAF2]/20 hover:bg-[#00BAF2]/5' },
  { name: 'PhonePe', color: 'border-[#5f259f]/20 hover:bg-[#5f259f]/5' },
  { name: 'Google Pay', color: 'border-slate-200 hover:bg-slate-50' },
  { name: 'Amazon Pay', color: 'border-orange-200 hover:bg-orange-50' },
  { name: 'Apple Pay', color: 'border-black/20 hover:bg-black/5' },
  { name: 'Samsung Pay', color: 'border-[#034ea2]/20 hover:bg-[#034ea2]/5' },
  { name: 'Mobikwik', color: 'border-[#00529b]/20 hover:bg-[#00529b]/5' },
  { name: 'Freecharge', color: 'border-[#ff5a5f]/20 hover:bg-[#ff5a5f]/5' },
  { name: 'Airtel Money', color: 'border-red-200 hover:bg-red-50' },
  { name: 'Others', color: 'border-slate-100 hover:bg-slate-50' },
];

const QUICK_BALANCE_PRESETS = [0, 1000, 5000, 10000];

// --- Components ---
const CardNetworkLogo: React.FC<{ network: string }> = ({ network }) => {
  switch (network) {
    case 'visa':
      return <span className="text-2xs font-black italic text-blue-700 tracking-tighter">VISA</span>;
    case 'mastercard':
      return (
        <div className="flex -space-x-1.5">
          <div className="w-3 h-3 rounded-full bg-[#EB001B] opacity-90" />
          <div className="w-3 h-3 rounded-full bg-[#F79E1B] opacity-90" />
        </div>
      );
    case 'rupay':
      return (
        <div className="flex items-center">
          <span className="text-2xs font-black text-blue-800">Ru</span>
          <span className="text-2xs font-black text-orange-500">Pay</span>
        </div>
      );
    case 'amex':
      return <div className="px-1 py-0.5 bg-sky-500 rounded-sm text-[7px] font-bold text-white leading-none">AMEX</div>;
    case 'diners':
      return <div className="w-4 h-4 rounded-full border-2 border-indigo-900 flex items-center justify-center text-[6px] font-black text-indigo-900">D</div>;
    default:
      return <CreditCard size={14} />;
  }
};

export const AddAccount: React.FC = () => {
  const guardSubmit = useSubmitLock();
  const { setCurrentPage, currency, refreshData, accounts } = useApp();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    balance: '',
    type: 'bank' as 'bank' | 'card' | 'cash' | 'wallet',
    subType: 'savings'
  });
  const [provider, setProvider] = useState('');
  const [userCountry, setUserCountry] = useState('India');
  const [customHue, setCustomHue] = useState<number>(240);
  const [selectedColor, setSelectedColor] = useState<{ id: string; bg: string; glow: string; color?: string }>({
    id: 'midnight',
    bg: 'bg-[#0F172A]',
    glow: 'bg-indigo-500/10',
    color: '#0F172A'
  });

  const CARD_COLORS = [
    { id: 'midnight', bg: 'bg-[#0F172A]', glow: 'bg-indigo-500/10', color: '#0F172A' },
    { id: 'emerald', bg: 'bg-[#064E3B]', glow: 'bg-emerald-500/10', color: '#064E3B' },
    { id: 'rose', bg: 'bg-[#4C0519]', glow: 'bg-rose-500/10', color: '#4C0519' },
    { id: 'amber', bg: 'bg-[#451A03]', glow: 'bg-amber-500/10', color: '#451A03' },
    { id: 'violet', bg: 'bg-[#2E1065]', glow: 'bg-violet-500/10', color: '#2E1065' },
    { id: 'blue', bg: 'bg-[#1E3A8A]', glow: 'bg-blue-500/10', color: '#1E3A8A' },
  ];

  useEffect(() => {
    try {
      const profile = JSON.parse(localStorage.getItem('user_profile') || '{}');
      if (profile?.country) setUserCountry(profile.country);
    } catch (parseErr) {
      console.warn('[AddAccount] Failed to parse cached user_profile:', parseErr);
    }
  }, []);

  const bankOptions = useMemo(() => {
    const list = BANKS_BY_COUNTRY[userCountry] || BANKS_BY_COUNTRY['India'] || [];
    const base = list.map(b => ({
      value: b.name,
      label: b.name,
      description: b.type,
      icon: <BankLogo bank={b} size="xs" />
    }));
    return [...base, { value: 'Others', label: 'Others', description: 'Manually specify provider', icon: <Globe2 size={14} className="text-slate-400" /> }];
  }, [userCountry]);

  const walletOptions = useMemo(() => {
    const base = INDIAN_WALLETS.map(w => ({
      value: w.name,
      label: w.name,
      description: 'Mobile Wallet',
      icon: <Wallet size={14} className="text-indigo-500" />
    }));
    return [...base, { value: 'Others', label: 'Others', description: 'Manually specify provider', icon: <Globe2 size={14} className="text-slate-400" /> }];
  }, []);

  const handleSubmit = guardSubmit(async () => {
    const resolvedName = formData.name.trim() || (formData.type === 'cash' ? 'Cash Wallet' : provider);
    if (!resolvedName) { toast.error('Enter an account name'); return; }

    setIsSubmitting(true);
    try {
      const existingAccount = await db.accounts
        .filter(a =>
          a.name.toLowerCase() === resolvedName.toLowerCase() &&
          a.type === formData.type &&
          a.isActive &&
          !a.deletedAt
        )
        .first();

      if (existingAccount) {
        toast.error('An active account with the same name and type already exists.');
        setIsSubmitting(false);
        return;
      }

      await saveAccountWithBackendSync({
        name: resolvedName,
        type: formData.type,
        subType: formData.subType,
        colorId: selectedColor.id,
        customColor: selectedColor.id === 'custom' ? selectedColor.color : undefined,
        provider: provider || null,
        country: userCountry === 'Default' ? null : userCountry,
        openingBalance: parseFloat(formData.balance) || 0,
        balance: parseFloat(formData.balance) || 0,
        currency,
        isActive: true,
        updatedAt: new Date(),
        updatedBy: null,
      });
      toast.success('Account created');
      refreshData();
      setCurrentPage('accounts');
    } catch (e) {
      toast.error('Failed to create account');
    } finally {
      setIsSubmitting(false);
    }
  });

  return (
    <CenteredLayout enablePullToRefresh={false} className="pb-36">
      <div className="flex flex-col text-slate-900 w-full">
        {/* Header - Matches App Theme */}
        <header className="sticky top-0 z-30 pb-2">
          <div className="flex items-center justify-between py-2 sm:py-2.5 mb-1.5">
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setCurrentPage('accounts')}
                title="Back to Accounts"
                aria-label="Back to Accounts"
                data-testid="account-create-back-button"
                className="w-8.5 h-8.5 sm:w-9.5 sm:h-9.5 rounded-full bg-white border border-slate-200/80 hover:bg-slate-50 active:scale-95 shadow-xs flex items-center justify-center text-slate-700 transition-all shrink-0 cursor-pointer"
              >
                <ArrowLeft size={16} className="text-slate-700" />
              </button>
              <h1 className="font-page-title text-slate-900 tracking-tight leading-none truncate">New Account</h1>
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <div className="w-full grid grid-cols-1 xl:grid-cols-12 gap-6 xl:gap-8 items-start">
          {/* Left Column: Configuration (xl:col-7) */}
          <div className="xl:col-span-7 flex flex-col gap-6 order-2 xl:order-1 w-full">
            <div className="bg-white/90 backdrop-blur-xl rounded-[28px] sm:rounded-[32px] p-5 sm:p-6 border border-slate-100 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.08)] space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 w-full">
                <label className="text-2xs font-bold text-slate-400 uppercase tracking-wider shrink-0">1. Asset Type</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full md:w-auto">
                  {accountTypes.map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, type: t.id as any }))}
                      data-testid={`account-create-type-${t.id}-button`}
                      className={cn(
                        "flex flex-col items-center gap-1.5 p-3 rounded-2xl transition-all cursor-pointer font-bold text-2xs uppercase tracking-wider",
                        formData.type === t.id
                          ? "bg-slate-900 text-white shadow-md shadow-slate-900/10"
                          : "bg-slate-50 text-slate-500 hover:bg-slate-100"
                      )}
                    >
                      <t.icon size={18} />
                      <span>{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 w-full">
                <label className="text-2xs font-bold text-slate-400 uppercase tracking-wider shrink-0">2. Custom Label (Optional)</label>
                <div className="relative w-full md:max-w-md">
                  <Wallet className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                  <input
                    id="account-custom-label"
                    name="accountName"
                    aria-label="Custom account label"
                    type="text"
                    value={formData.name}
                    onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    data-testid="account-create-name-input"
                    className="w-full h-10 sm:h-11 bg-slate-50 border border-slate-200/80 rounded-xl pl-10 pr-3.5 text-xs sm:text-sm font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:bg-white focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400 outline-none transition-all"
                    placeholder="e.g. My Savings"
                  />
                </div>
              </div>

              {formData.type !== 'cash' && (
                <div className="space-y-4 pt-2 border-t border-slate-100">
                  {formData.type !== 'wallet' && (
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 w-full">
                      <label className="text-2xs font-bold text-slate-400 uppercase tracking-wider shrink-0">
                        3. Institution / Provider
                      </label>
                      <div className="w-full md:max-w-md">
                        {(formData.type === 'bank' || formData.type === 'card') ? (
                          <SearchableDropdown
                            testId="add-account-form-data-type-card"
                            options={bankOptions}
                            value={provider}
                            onChange={(val) => {
                              if (val === 'Others') setProvider('');
                              else setProvider(val);
                            }}
                            placeholder={formData.type === 'card' ? "Search Issuing Bank..." : "Search Indian Banks..."}
                            searchPlaceholder="e.g. HDFC, SBI..."
                            className="w-full"
                            renderTrigger={(selected) => (
                              <div className="relative w-full h-10 sm:h-11 bg-slate-50 border border-slate-200/80 rounded-xl pl-10 pr-3.5 text-xs sm:text-sm font-semibold text-slate-900 flex items-center gap-2 cursor-pointer hover:bg-slate-100/80 transition-colors">
                                <Landmark className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                                {selected ? (
                                  <div className="flex items-center gap-2 truncate">
                                    {selected.icon}
                                    <span className="truncate">{selected.label}</span>
                                  </div>
                                ) : (
                                  <span className="text-slate-400 font-normal truncate">{formData.type === 'card' ? 'Select Issuing Bank' : 'Select Bank'}</span>
                                )}
                              </div>
                            )}
                          />
                        ) : (
                          <div className="relative">
                            <Landmark className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                            <input
                              id="account-provider"
                              name="provider"
                              aria-label="Bank or wallet name"
                              type="text"
                              value={provider}
                              onChange={e => setProvider(e.target.value)}
                              data-testid="account-create-provider-input"
                              className="w-full h-10 sm:h-11 bg-slate-50 border border-slate-200/80 rounded-xl pl-10 pr-3.5 text-xs sm:text-sm font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:bg-white focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400 outline-none transition-all"
                              placeholder="Bank or Wallet Name"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 w-full pt-1">
                    <label className="text-2xs font-bold text-slate-400 uppercase tracking-wider shrink-0">
                      4. {formData.type === 'card' ? 'Card Network' : formData.type === 'wallet' ? 'Select Wallet Brand' : 'Account Category'}
                    </label>

                    {formData.type === 'wallet' ? (
                      <div className="grid grid-cols-5 sm:grid-cols-8 gap-1 pt-1 w-full md:max-w-md">
                        {INDIAN_WALLETS.map(w => (
                          <button
                            key={w.name}
                            type="button"
                            title={w.name}
                            onClick={() => {
                              if (w.name === 'Others') setProvider('');
                              else setProvider(w.name);
                              setFormData(prev => ({ ...prev, subType: w.name.toLowerCase() }));
                            }}
                            data-testid={`account-create-wallet-${w.name.toLowerCase().replace(/\s+/g, '-')}-button`}
                            className={cn(
                              "aspect-[4/3] flex flex-col items-center justify-center gap-1.5 rounded-2xl border transition-all p-1 cursor-pointer",
                              provider === w.name || (w.name === 'Others' && !provider)
                                ? "bg-white border-purple-600 shadow-md scale-105"
                                : cn("bg-white border-transparent hover:border-slate-200", w.color)
                            )}
                          >
                            <div className="w-full flex-1 flex items-center justify-center overflow-hidden">
                              <WalletLogo wallet={w.name} />
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2 w-full md:w-auto">
                        {formData.type === 'card' ? (
                          CARD_NETWORKS.map(net => (
                            <button
                              key={net.id}
                              type="button"
                              onClick={() => setFormData(prev => ({ ...prev, subType: net.id }))}
                              data-testid={`account-create-network-${net.id}-button`}
                              className={cn(
                                "flex items-center gap-2 px-3.5 py-2 rounded-xl text-2xs font-bold transition-all border cursor-pointer",
                                formData.subType === net.id
                                  ? "bg-purple-50 border-purple-300 text-purple-700 shadow-2xs"
                                  : "bg-slate-50 border-slate-200/80 text-slate-600 hover:border-slate-300 hover:bg-slate-100"
                              )}
                            >
                              <CardNetworkLogo network={net.id} />
                              {net.label}
                            </button>
                          ))
                        ) : (
                          [
                            { id: 'savings', label: 'Saving' },
                            { id: 'current', label: 'Current' },
                            { id: 'fd', label: 'FD' },
                            { id: 'salary', label: 'Salary' },
                            { id: 'joint', label: 'Joint' },
                          ].map(st => (
                            <button
                              key={st.id}
                              type="button"
                              onClick={() => setFormData(prev => ({ ...prev, subType: st.id }))}
                              data-testid={`account-create-subtype-${st.id}-button`}
                              className={cn(
                                "px-3.5 py-2 rounded-xl text-2xs font-bold transition-all border cursor-pointer",
                                formData.subType === st.id
                                  ? "bg-purple-50 border-purple-300 text-purple-700 shadow-2xs"
                                  : "bg-slate-50 border-slate-200/80 text-slate-600 hover:border-slate-300 hover:bg-slate-100"
                              )}
                            >
                              {st.label}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Financials & Aesthetics (xl:col-5) */}
          <div className="xl:col-span-5 flex flex-col gap-6 order-1 xl:order-2 w-full">
            {/* Preview Card + Palette */}
            <div className="order-1 lg:order-2 flex flex-col gap-4">
              {/* Large Preview Card with Live Reactive Color */}
              <div
                style={{
                  backgroundColor: selectedColor.id === 'custom' ? (selectedColor.color || `hsl(${customHue}, 70%, 45%)`) : undefined
                }}
                className={cn(
                  "p-6 sm:p-8 rounded-[28px] sm:rounded-[32px] text-white relative overflow-hidden flex flex-col justify-between min-h-[220px] sm:min-h-[240px] shadow-2xl transition-all duration-300 border border-white/10 group",
                  selectedColor.id !== 'custom' ? selectedColor.bg : ''
                )}
              >
                {/* Decorative Ambient Glow Elements */}
                <div
                  style={{
                    backgroundColor: selectedColor.id === 'custom' ? (selectedColor.color || `hsl(${customHue}, 70%, 45%)`) : undefined
                  }}
                  className={cn(
                    "absolute top-0 right-0 w-64 h-64 blur-[80px] rounded-full -mr-20 -mt-20 group-hover:opacity-100 transition-all duration-700 opacity-60 pointer-events-none",
                    selectedColor.id !== 'custom' ? selectedColor.glow : ''
                  )}
                />
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 blur-[60px] rounded-full -ml-20 -mb-20 pointer-events-none" />

                {/* Card Pattern Overlay */}
                <div className="absolute inset-0 opacity-[0.06] pointer-events-none card-dot-pattern" />

                <div className="flex justify-between items-start relative z-10">
                  <div className="flex flex-col gap-1.5">
                    <div className="w-12 h-12 sm:w-13 sm:h-13 rounded-2xl bg-white/10 backdrop-blur-xl flex items-center justify-center border border-white/15 shadow-md group-hover:scale-105 transition-transform duration-300">
                      {React.createElement(accountTypes.find(t => t.id === formData.type)?.icon || Wallet, { size: 24, className: "text-white" })}
                    </div>
                  </div>

                  {/* Chip Icon & Card Network Logo */}
                  <div className="flex items-center gap-2">
                    {formData.type === 'card' && (
                      <div className="w-10 h-7 bg-gradient-to-br from-amber-200 via-amber-400 to-amber-600 rounded-md relative overflow-hidden shadow-sm border border-amber-500/30">
                        <div className="absolute inset-0 opacity-40">
                          <div className="absolute top-1/2 left-0 w-full h-[1px] bg-black/20" />
                          <div className="absolute top-0 left-1/2 w-[1px] h-full bg-black/20" />
                        </div>
                      </div>
                    )}
                    <CardNetworkLogo network={formData.subType} />
                  </div>
                </div>

                <div className="space-y-4 sm:space-y-5 relative z-10 mt-6 sm:mt-8">
                  <div className="flex flex-col gap-0.5">
                    <p className="text-2xs font-black uppercase tracking-[0.25em] text-white/50">Account / Institution</p>
                    <p className="text-lg sm:text-xl font-bold tracking-tight truncate max-w-[280px] text-white">
                      {formData.name || provider || 'New Account'}
                    </p>
                  </div>

                  <div className="flex justify-between items-end">
                    <div className="space-y-0.5">
                      <p className="text-2xs font-black uppercase tracking-[0.25em] text-white/50">Available Balance</p>
                      <div className="flex items-baseline gap-2">
                        <span className="text-base sm:text-lg font-bold text-white/70">{currency}</span>
                        <span className="text-3xl sm:text-4xl font-black tracking-tight tabular-nums text-white">
                          {Number(formData.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Color Palette Section - Glass Card */}
              <div className="premium-glass-card p-5 sm:p-6 bg-white/90 backdrop-blur-xl rounded-[28px] sm:rounded-[32px] border border-slate-100 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.08)] relative overflow-hidden space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-2xs font-bold text-slate-500 uppercase tracking-wider">Choose Card Aesthetic</label>
                  <span className="text-2xs font-semibold text-slate-400 capitalize">
                    {selectedColor.id === 'custom' ? 'Custom Color' : selectedColor.id}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                  {CARD_COLORS.map(color => (
                    <button
                      key={color.id}
                      type="button"
                      onClick={() => setSelectedColor(color)}
                      style={{ backgroundColor: color.color }}
                      data-testid={`account-create-color-${color.id}-button`}
                      aria-label={`Select ${color.id} theme`}
                      className={cn(
                        "w-10 h-10 sm:w-11 sm:h-11 rounded-full border-2 transition-all relative flex items-center justify-center shadow-xs hover:scale-105 active:scale-95 cursor-pointer",
                        selectedColor.id === color.id
                          ? "border-purple-600 scale-110 shadow-lg shadow-purple-500/25 ring-2 ring-purple-500/30"
                          : "border-white hover:border-slate-200"
                      )}
                    >
                      {selectedColor.id === color.id && (
                        <Check size={16} className="text-white drop-shadow-xs" />
                      )}
                    </button>
                  ))}
                </div>

                {/* Custom Spectrum Section */}
                <div className="pt-3.5 border-t border-slate-100/90 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-2xs font-bold text-slate-500 uppercase tracking-wider">Custom Spectrum</span>
                      {selectedColor.id === 'custom' && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700">
                          Active
                        </span>
                      )}
                    </div>
                    <div
                      style={{ backgroundColor: selectedColor.id === 'custom' ? (selectedColor.color || `hsl(${customHue}, 70%, 45%)`) : `hsl(${customHue}, 70%, 45%)` }}
                      className="w-5 h-5 rounded-full shadow-xs border-2 border-white ring-1 ring-slate-200 transition-colors shrink-0"
                    />
                  </div>

                  {/* Rainbow Spectrum Slider Track */}
                  <div className="relative h-3.5 w-full rounded-full bg-slate-100 flex items-center cursor-pointer group">
                    <div className="absolute inset-0 rounded-full bg-gradient-to-r from-[#ff0000] via-[#ffff00] via-[#00ff00] via-[#00ffff] via-[#0000ff] via-[#ff00ff] to-[#ff0000] shadow-inner" />
                    <input
                      type="range"
                      min="0"
                      max="360"
                      value={customHue}
                      aria-label="Color hue"
                      data-testid="account-create-hue-slider"
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                      onChange={(e) => {
                        const hue = Number(e.target.value);
                        setCustomHue(hue);
                        setSelectedColor({
                          id: 'custom',
                          bg: 'custom',
                          glow: 'bg-white/10',
                          color: `hsl(${hue}, 70%, 45%)`
                        });
                      }}
                    />
                    {/* Draggable Slider Thumb */}
                    <div
                      style={{
                        left: `calc(${(customHue / 360) * 100}% - 9px)`,
                        backgroundColor: `hsl(${customHue}, 70%, 45%)`
                      }}
                      className={cn(
                        "absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-full border-2 border-white shadow-md pointer-events-none transition-transform duration-75",
                        selectedColor.id === 'custom' ? "scale-120 ring-2 ring-purple-600 shadow-purple-500/25" : "scale-100 ring-1 ring-slate-300"
                      )}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Balance Input Card - Order 2 on Mobile, Order 1 on Desktop */}
            <div className="bg-white/90 backdrop-blur-xl rounded-[28px] sm:rounded-[32px] p-6 sm:p-8 border border-slate-100 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.08)] relative overflow-hidden flex flex-col items-center order-2 lg:order-1">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 w-full mb-6">
                <div className="flex flex-col">
                  <span className="text-2xs font-bold text-purple-600 uppercase tracking-wider">Setup Initial Capital</span>
                  <h3 className="text-sm font-bold text-slate-800">Opening Balance</h3>
                </div>
                <div className="flex items-center gap-1.5 text-slate-400">
                  <Info size={14} />
                  <span className="text-2xs font-semibold uppercase tracking-wider">Starting Amount</span>
                </div>
              </div>

              <div className="relative flex items-center justify-center w-full py-6 px-4 rounded-2xl bg-slate-50 border border-slate-200/80 focus-within:border-purple-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-purple-500/20 transition-all duration-300">
                <div className="flex items-center justify-center gap-3 w-full max-w-full">
                  <span className="text-xl md:text-2xl font-black text-purple-400 select-none shrink-0">{currency}</span>
                  <input
                    id="account-opening-balance"
                    name="balance"
                    aria-label="Opening balance"
                    type="number"
                    value={formData.balance}
                    onChange={e => setFormData(prev => ({ ...prev, balance: e.target.value }))}
                    data-testid="account-create-balance-input"
                    className="bg-transparent text-4xl md:text-5xl lg:text-6xl font-black text-slate-900 outline-none w-full min-w-0 text-center tracking-tighter placeholder:text-slate-200"
                    placeholder="0.00"
                    autoFocus
                  />
                </div>
              </div>

              <div className="w-full mt-6 flex flex-col gap-2.5">
                <div className="flex items-center justify-between gap-4 w-full">
                  <p className="text-2xs font-bold uppercase tracking-wider text-slate-400 shrink-0">Quick Balance Presets</p>
                  <div className="text-2xs font-semibold text-purple-600 uppercase tracking-wider">Add to balance</div>
                </div>
                <div className="flex justify-center gap-2 w-full">
                  {QUICK_BALANCE_PRESETS.filter(p => p > 0).map(amt => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, balance: String((Number(prev.balance) || 0) + amt) }))}
                      data-testid={`account-create-preset-${amt}-button`}
                      className="flex-1 px-3 sm:px-4 py-2.5 bg-slate-50 border border-slate-200/80 rounded-xl text-xs font-bold text-slate-700 hover:border-purple-200 hover:bg-purple-50/50 hover:text-purple-700 transition-all active:scale-95 cursor-pointer shadow-2xs"
                    >
                      +{amt.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <FloatingSaveBar
        onSave={handleSubmit}
        onDiscard={() => setCurrentPage('accounts')}
        isSaving={isSubmitting}
        saveLabel="Create Account"
      />
    </CenteredLayout>
  );
};
