import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Search, CheckCircle2, SkipForward, ChevronRight, X, ShieldCheck, RefreshCw, Landmark, Building2 } from 'lucide-react';
import { BankLogo } from '@/app/components/ui/BankLogo';
import { BANKS_BY_COUNTRY, BankInfo } from '@/constants/banks';

interface BankAccountStepProps {
  data: {
    country: string;
    bankName: string;
    accountHolderName: string;
    currentBalance: string;
  };
  onUpdate: (data: any) => void;
  onNext: () => void;
  onBack: () => void;
  onSkip?: () => void;
}

export const BankAccountStep: React.FC<BankAccountStepProps> = ({
  data,
  onUpdate,
  onNext,
  onBack,
  onSkip,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // 1. Robust country normalization so any country variation resolves cleanly
  const normalizedCountry = useMemo(() => {
    const c = (data.country || '').toLowerCase().trim();
    if (c.includes('india') || c === 'in') return 'India';
    if (c.includes('united states') || c.includes('usa') || c === 'us') return 'United States';
    if (c.includes('united kingdom') || c.includes('uk') || c.includes('great britain') || c === 'gb') return 'United Kingdom';
    return 'India';
  }, [data.country]);

  // 2. Primary country banks list
  const countryBanks = useMemo(() => {
    return BANKS_BY_COUNTRY[normalizedCountry] || BANKS_BY_COUNTRY.India || [];
  }, [normalizedCountry]);

  // 3. Complete pool across all regions for global search
  const allBanksPool = useMemo(() => {
    const pool: BankInfo[] = [];
    const seen = new Set<string>();

    countryBanks.forEach(b => {
      seen.add(b.name.toLowerCase());
      pool.push(b);
    });

    Object.values(BANKS_BY_COUNTRY).forEach(arr => {
      arr.forEach(b => {
        if (!seen.has(b.name.toLowerCase())) {
          seen.add(b.name.toLowerCase());
          pool.push(b);
        }
      });
    });

    return pool;
  }, [countryBanks]);

  // 4. Filtered banks matching search query across name, shortName, initials, or type
  const filteredBanks = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return [];

    const matchesInCountry = countryBanks.filter(
      b =>
        b.name.toLowerCase().includes(q) ||
        b.shortName.toLowerCase().includes(q) ||
        b.initials.toLowerCase().includes(q) ||
        b.type.toLowerCase().includes(q)
    );

    if (matchesInCountry.length > 0) return matchesInCountry;

    // Fallback: search globally if not found in primary country
    return allBanksPool.filter(
      b =>
        b.name.toLowerCase().includes(q) ||
        b.shortName.toLowerCase().includes(q) ||
        b.initials.toLowerCase().includes(q) ||
        b.type.toLowerCase().includes(q)
    );
  }, [searchQuery, countryBanks, allBanksPool]);

  // 5. Popular quick-pick banks for fast 1-click selection
  const popularBanks = useMemo(() => {
    const popularKeys = ['SBI', 'HDFC', 'ICICI', 'AXIS', 'Kotak', 'BOB', 'PNB'];
    const list: BankInfo[] = [];
    popularKeys.forEach(key => {
      const found = allBanksPool.find(
        b => b.shortName.toUpperCase() === key || b.initials.toUpperCase() === key
      );
      if (found) list.push(found);
    });
    return list;
  }, [allBanksPool]);

  // 6. Selected bank details
  const selectedBank = useMemo(() => {
    if (!data.bankName) return null;
    return (
      allBanksPool.find(b => b.name.toLowerCase() === data.bankName.toLowerCase()) || {
        name: data.bankName,
        shortName: data.bankName.split(' ')[0] || data.bankName,
        color: '#4f46e5',
        textColor: '#ffffff',
        initials: data.bankName.slice(0, 3).toUpperCase(),
        type: 'Primary Account',
      }
    );
  }, [data.bankName, allBanksPool]);

  // 7. Currency symbol
  const currencyPrefix = useMemo(() => {
    if (normalizedCountry === 'India') return '₹';
    if (normalizedCountry === 'United States') return '$';
    if (normalizedCountry === 'United Kingdom') return '£';
    return '₹';
  }, [normalizedCountry]);

  // Handle bank selection
  const handleSelectBank = (bank: BankInfo) => {
    const isAutoSuggested =
      !data.accountHolderName.trim() ||
      data.accountHolderName.toLowerCase().includes('account') ||
      data.accountHolderName.toLowerCase().includes('savings');

    onUpdate({
      bankName: bank.name,
      ...(isAutoSuggested
        ? { accountHolderName: `${bank.shortName || bank.name.split(' ')[0]} Primary Account` }
        : {}),
    });
    setSearchQuery('');
    setIsDropdownOpen(false);
    setErrors(prev => ({ ...prev, bankName: '' }));
  };

  const handleSelectCustomBank = (customName: string) => {
    if (!customName.trim()) return;
    const cleanName = customName.trim();
    const isAutoSuggested =
      !data.accountHolderName.trim() ||
      data.accountHolderName.toLowerCase().includes('account') ||
      data.accountHolderName.toLowerCase().includes('savings');

    onUpdate({
      bankName: cleanName,
      ...(isAutoSuggested
        ? { accountHolderName: `${cleanName.split(' ')[0]} Primary Account` }
        : {}),
    });
    setSearchQuery('');
    setIsDropdownOpen(false);
    setErrors(prev => ({ ...prev, bankName: '' }));
  };

  const handleClearBank = () => {
    onUpdate({ bankName: '' });
    setSearchQuery('');
    setIsDropdownOpen(false);
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 50);
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!data.bankName) newErrors.bankName = 'Please select your bank';
    if (!data.accountHolderName.trim()) newErrors.accountHolderName = 'Account label is required';
    if (data.currentBalance && isNaN(Number(data.currentBalance)))
      newErrors.currentBalance = 'Please enter a valid amount';
    if (data.currentBalance && Number(data.currentBalance) < 0)
      newErrors.currentBalance = 'Balance cannot be negative';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateForm()) onNext();
  };

  return (
    <form data-testid="bank-account-step-form" onSubmit={handleSubmit} className="space-y-5">
      {/* Header */}
      <div className="text-center mb-4">
        <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
          Primary Account Setup
        </h3>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          Connect your primary account to track balances, cashflow, and net worth
        </p>
      </div>

      {/* Reassuring privacy strip */}
      <div className="flex items-center gap-2.5 rounded-2xl border border-emerald-200/60 bg-emerald-50/50 px-3.5 py-2.5">
        <ShieldCheck size={16} className="text-emerald-600 shrink-0" />
        <p className="text-xs text-slate-600 leading-snug">
          <span className="font-bold text-slate-800">Private & Local:</span> Kanaku never asks for net banking logins. You stay in full control of balances and records.
        </p>
      </div>

      {/* Bank Selection Area */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-xs font-bold text-slate-700">
            Bank Name {data.bankName && <span className="text-emerald-600 font-semibold text-2xs ml-1.5">✓ Selected</span>}
          </label>
          {data.bankName && (
            <button
              type="button"
              onClick={handleClearBank}
              className="text-2xs font-bold text-violet-600 hover:text-violet-800 transition-colors cursor-pointer"
            >
              Choose different bank
            </button>
          )}
        </div>

        {/* Selected Bank Highlight Card */}
        {selectedBank ? (
          <div className="p-3.5 bg-gradient-to-r from-violet-50/90 via-indigo-50/40 to-slate-50/60 border-2 border-violet-500/30 rounded-2xl flex items-center justify-between gap-3 shadow-xs animate-in fade-in-50 duration-200">
            <div className="flex items-center gap-3 min-w-0">
              <BankLogo bank={selectedBank} size="md" />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-black text-slate-900 truncate">{selectedBank.name}</p>
                  <span className="inline-flex items-center gap-1 text-2xs font-bold text-emerald-700 bg-emerald-100/90 px-2 py-0.5 rounded-full shrink-0">
                    <CheckCircle2 size={11} className="text-emerald-600" />
                    Selected
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5 font-medium">{selectedBank.type}</p>
              </div>
            </div>
            <button
              data-testid="bank-account-step-clear-selection"
              type="button"
              onClick={handleClearBank}
              className="shrink-0 flex items-center gap-1 text-xs font-bold text-violet-700 hover:text-violet-900 bg-white hover:bg-violet-100/60 border border-violet-200/90 px-3 py-1.5 rounded-xl transition-all shadow-2xs cursor-pointer"
            >
              <RefreshCw size={12} />
              <span>Change</span>
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Popular Quick-Select Chips */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-2xs font-bold text-slate-400 uppercase tracking-wider">Popular Banks</p>
                <span className="text-2xs text-slate-400">1-click pick</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {popularBanks.map(bank => (
                  <button
                    key={bank.name}
                    type="button"
                    data-testid={`bank-account-step-button-${bank.name}`}
                    onClick={() => handleSelectBank(bank)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200/90 bg-slate-50/60 hover:border-violet-300 hover:bg-violet-50/50 text-slate-700 text-xs font-bold transition-all shadow-2xs hover:shadow-xs cursor-pointer"
                  >
                    <BankLogo bank={bank} size="xs" />
                    <span>{bank.shortName}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Search Input with floating Dropdown attached */}
            <div ref={dropdownRef} className="relative">
              <div className="relative">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  data-testid="bank-account-step-search-your-bank"
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onFocus={() => {
                    if (searchQuery.trim().length > 0) {
                      setIsDropdownOpen(true);
                    }
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Escape') {
                      setIsDropdownOpen(false);
                    } else if (e.key === 'Enter') {
                      e.preventDefault();
                      if (filteredBanks.length > 0) {
                        handleSelectBank(filteredBanks[0]);
                      } else if (searchQuery.trim().length > 1) {
                        handleSelectCustomBank(searchQuery.trim());
                      }
                    }
                  }}
                  onChange={e => {
                    const val = e.target.value;
                    setSearchQuery(val);
                    setIsDropdownOpen(val.trim().length > 0);
                    if (errors.bankName) {
                      setErrors(prev => ({ ...prev, bankName: '' }));
                    }
                  }}
                  placeholder="Type to search your bank (e.g. HDFC, SBI, Axis)..."
                  autoComplete="off"
                  className={`w-full pl-10 pr-10 py-2.5 border rounded-2xl focus:outline-none focus:ring-4 focus:ring-violet-500/15 focus:border-violet-500 bg-white text-sm text-slate-900 transition-all ${
                    errors.bankName && !data.bankName ? 'border-red-400 bg-red-50/20' : 'border-slate-200/90'
                  }`}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setIsDropdownOpen(false);
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-full cursor-pointer"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Floating Dropdown ONLY visible when user is typing / enters bank names */}
              {isDropdownOpen && searchQuery.trim().length > 0 && (
                <div className="absolute z-30 top-full left-0 right-0 mt-1.5 bg-white border border-slate-200/90 rounded-2xl shadow-xl shadow-slate-900/10 overflow-hidden divide-y divide-slate-100 max-h-[220px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 animate-in fade-in-50 duration-150">
                  {filteredBanks.map(bank => (
                    <button
                      key={bank.name}
                      type="button"
                      data-testid={`bank-account-step-button-${bank.name}`}
                      onMouseDown={e => {
                        e.preventDefault();
                        handleSelectBank(bank);
                      }}
                      className="w-full flex items-center gap-3 px-3.5 py-2.5 hover:bg-violet-50/70 transition-colors text-left group cursor-pointer"
                    >
                      <BankLogo bank={bank} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-slate-900 leading-snug group-hover:text-violet-700 transition-colors truncate">
                          {bank.name}
                        </p>
                        <p className="text-2xs text-slate-400 font-medium">{bank.type}</p>
                      </div>
                      <ChevronRight size={14} className="text-slate-300 group-hover:text-violet-500 group-hover:translate-x-0.5 transition-all shrink-0" />
                    </button>
                  ))}

                  {/* Option to use custom bank name if not found or custom */}
                  {filteredBanks.length === 0 && (
                    <div className="p-4 text-center">
                      <p className="text-xs text-slate-500 mb-2">No bank found matching "{searchQuery.trim()}".</p>
                      <button
                        type="button"
                        onMouseDown={e => {
                          e.preventDefault();
                          handleSelectCustomBank(searchQuery.trim());
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-50 hover:bg-violet-100 text-violet-700 text-xs font-bold transition-all border border-violet-200 cursor-pointer"
                      >
                        <Landmark size={13} />
                        <span>Use "{searchQuery.trim()}" as bank name</span>
                      </button>
                    </div>
                  )}

                  {filteredBanks.length > 0 && searchQuery.trim().length > 2 && (
                    <button
                      type="button"
                      onMouseDown={e => {
                        e.preventDefault();
                        handleSelectCustomBank(searchQuery.trim());
                      }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left bg-slate-50/70 hover:bg-violet-50/70 transition-colors text-slate-600 hover:text-violet-700 text-xs font-semibold cursor-pointer"
                    >
                      <Building2 size={13} className="text-slate-400" />
                      <span className="truncate">Not in list? Use "{searchQuery.trim()}"</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        {errors.bankName && !data.bankName && <p className="mt-1 text-xs text-red-600 pl-1">{errors.bankName}</p>}
      </div>

      {/* Account Label */}
      <div>
        <label htmlFor="accountHolderName" className="block text-xs font-bold text-slate-700 mb-1.5">
          Account Label <span className="text-slate-400 font-normal">(for your reference)</span>
        </label>
        <input
          data-testid="bank-account-step-e-g-savings-account"
          type="text"
          id="accountHolderName"
          value={data.accountHolderName}
          onChange={e => {
            onUpdate({ accountHolderName: e.target.value });
            setErrors(prev => ({ ...prev, accountHolderName: '' }));
          }}
          className={`w-full px-3.5 py-2.5 border rounded-2xl focus:outline-none focus:ring-4 focus:ring-violet-500/15 focus:border-violet-500 bg-white text-sm text-slate-900 transition-all ${
            errors.accountHolderName ? 'border-red-400 bg-red-50/20' : 'border-slate-200/90'
          }`}
          placeholder="e.g. Primary Savings, Salary Account"
        />
        {errors.accountHolderName && <p className="mt-1 text-xs text-red-600 pl-1">{errors.accountHolderName}</p>}
      </div>

      {/* Balance */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label htmlFor="currentBalance" className="block text-xs font-bold text-slate-700">
            Opening Balance <span className="text-slate-400 font-normal">(optional)</span>
          </label>
          <span className="text-2xs text-slate-400">Quick presets</span>
        </div>
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm pointer-events-none">
            {currencyPrefix}
          </span>
          <input
            data-testid="bank-account-step-0"
            type="number"
            id="currentBalance"
            value={data.currentBalance}
            onChange={e => {
              onUpdate({ currentBalance: e.target.value });
              setErrors(prev => ({ ...prev, currentBalance: '' }));
            }}
            className={`w-full ${
              currencyPrefix.length > 1 ? 'pl-14' : 'pl-8'
            } pr-3.5 py-2.5 border rounded-2xl focus:outline-none focus:ring-4 focus:ring-violet-500/15 focus:border-violet-500 bg-white text-sm text-slate-900 transition-all ${
              errors.currentBalance ? 'border-red-400 bg-red-50/20' : 'border-slate-200/90'
            }`}
            placeholder="0"
            min="0"
            step="1"
          />
        </div>
        
        {/* Quick balance preset chips */}
        <div className="flex items-center gap-1.5 mt-2">
          {['0', '5000', '25000', '50000'].map(amt => (
            <button
              key={amt}
              type="button"
              onClick={() => {
                onUpdate({ currentBalance: amt });
                setErrors(prev => ({ ...prev, currentBalance: '' }));
              }}
              className={`px-2.5 py-1 rounded-lg text-2xs font-semibold border transition-all cursor-pointer ${
                data.currentBalance === amt
                  ? 'border-violet-500 bg-violet-50 text-violet-700 font-bold ring-1 ring-violet-400/40'
                  : 'border-slate-200 bg-slate-50/80 hover:bg-slate-100 text-slate-600'
              }`}
            >
              {amt === '0' ? 'Zero' : `${currencyPrefix}${Number(amt).toLocaleString()}`}
            </button>
          ))}
        </div>

        {errors.currentBalance && <p className="mt-1 text-xs text-red-600 pl-1">{errors.currentBalance}</p>}
        <p className="mt-1.5 text-2xs text-slate-400 font-medium">Starting balance for accurate net worth and cashflow tracking.</p>
      </div>

      {/* Actions */}
      <div className="space-y-3 pt-2">
        <div className="flex gap-3">
          <button
            data-testid="bank-account-step-back"
            type="button"
            onClick={onBack}
            className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 px-4 rounded-2xl transition-all font-bold text-sm cursor-pointer"
          >
            Back
          </button>
          <button
            data-testid="bank-account-step-continue"
            type="submit"
            className="flex-1 bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 hover:from-violet-700 hover:to-blue-700 text-white py-3 px-4 rounded-2xl transition-all font-bold text-sm shadow-md shadow-violet-500/20 active:scale-[0.99] cursor-pointer"
          >
            Continue
          </button>
        </div>
        {onSkip && (
          <button
            data-testid="bank-account-step-skip-for-now-i"
            type="button"
            onClick={onSkip}
            className="w-full flex items-center justify-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors py-1.5 font-medium cursor-pointer"
          >
            <SkipForward size={14} />
            Skip for now - I'll add a bank account later
          </button>
        )}
      </div>
    </form>
  );
};
