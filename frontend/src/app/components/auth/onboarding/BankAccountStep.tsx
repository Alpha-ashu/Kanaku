import React, { useState, useMemo } from 'react';
import { Search, Building2, CheckCircle2, SkipForward, ChevronRight, X } from 'lucide-react';
import { BankLogo } from '@/app/components/ui/BankLogo';

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

import { BANKS_BY_COUNTRY, BankInfo } from '@/constants/banks';



export const BankAccountStep: React.FC<BankAccountStepProps> = ({
 data,
 onUpdate,
 onNext,
 onBack,
 onSkip,
}) => {
 const [searchQuery, setSearchQuery] = useState(data.bankName || '');
 const [errors, setErrors] = useState<Record<string, string>>({});

 const allBanks = useMemo(() => {
 return BANKS_BY_COUNTRY[data.country] || BANKS_BY_COUNTRY.Default;
 }, [data.country]);

 const filteredBanks = useMemo(() => {
 const q = searchQuery.toLowerCase().trim();
 if (!q) return allBanks;
 return allBanks.filter(
 b =>
 b.name.toLowerCase().includes(q) ||
 b.shortName.toLowerCase().includes(q) ||
 b.type.toLowerCase().includes(q)
 );
 }, [searchQuery, allBanks]);

 const selectedBank = useMemo(
 () => allBanks.find(b => b.name === data.bankName) || null,
 [data.bankName, allBanks]
 );

  const currencyPrefix = useMemo(() => {
    const country = (data.country || '').trim();
    if (country === 'India') return '₹';
    if (country === 'United States' || country === 'US' || country === 'USA') return '$';
    if (country === 'United Kingdom' || country === 'UK') return '£';
    if (country === 'Canada') return 'C$';
    if (country === 'Australia') return 'A$';
    if (country === 'United Arab Emirates' || country === 'UAE') return 'AED ';
    if (country === 'Singapore') return 'S$';
    return '₹'; // default fallback
  }, [data.country]);

  const handleSelectBank = (bank: BankInfo) => {
    onUpdate({ bankName: bank.name });
    setSearchQuery(bank.name);
    setErrors(prev => ({ ...prev, bankName: '' }));
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!data.bankName) newErrors.bankName = 'Please select a bank';
    if (!data.accountHolderName.trim()) newErrors.accountHolderName = 'Account name is required';
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

  const showBankList = !data.bankName || searchQuery !== data.bankName;

  return (
    <form data-testid="bank-account-step-form" onSubmit={handleSubmit} className="space-y-5">
      <div className="text-center mb-5">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-tr from-violet-600/10 to-indigo-600/20 text-violet-600 mb-3 ring-1 ring-violet-500/20">
          <Building2 size={24} className="text-violet-600" />
        </div>
        <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mb-1.5">
          Primary Account Setup
        </h3>
        <p className="text-sm text-slate-500 max-w-sm mx-auto">
          {data.country
            ? `Select your primary bank in ${data.country} to automatically track balances and income.`
            : 'Link your primary bank to begin tracking your financial health.'}
        </p>
      </div>

      {/* Bank search */}
      <div>
        <label className="block text-xs font-bold text-slate-700 mb-1.5">
          Bank Name
        </label>

        {/* Search input */}
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            data-testid="bank-account-step-search-your-bank"
            type="text"
            value={searchQuery}
            onChange={e => {
              setSearchQuery(e.target.value);
              if (data.bankName && e.target.value !== data.bankName) {
                onUpdate({ bankName: '' });
              }
            }}
            placeholder="Search your bank (e.g. HDFC, Chase, SBI)..."
            autoComplete="off"
            className={`w-full pl-10 pr-4 py-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 bg-white text-sm text-slate-900 transition-all ${
              errors.bankName ? 'border-red-400 bg-red-50/30' : 'border-slate-200'
            }`}
          />
        </div>
        {errors.bankName && <p className="mt-1 text-xs text-red-600 pl-1">{errors.bankName}</p>}

        {/* Selected bank pill */}
        {selectedBank && (
          <div className="mt-2.5 flex items-center gap-3 bg-violet-50/70 border border-violet-200/80 rounded-xl p-3 shadow-sm">
            <BankLogo bank={selectedBank} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-900 truncate">{selectedBank.name}</p>
              <p className="text-xs text-violet-600 font-medium">{selectedBank.type}</p>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 size={18} className="text-violet-600 flex-shrink-0" />
              <button
                data-testid="bank-account-step-clear-selection"
                type="button"
                onClick={() => {
                  onUpdate({ bankName: '' });
                  setSearchQuery('');
                }}
                className="p-1 rounded-lg hover:bg-violet-200/60 text-slate-400 hover:text-slate-600 transition-colors"
                title="Clear selection"
              >
                <X size={15} className="flex-shrink-0" />
              </button>
            </div>
          </div>
        )}

        {/* Bank cards grid */}
        {showBankList && filteredBanks.length > 0 && (
          <div className="mt-2.5 space-y-1.5 max-h-[220px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-200">
            {filteredBanks.map(bank => {
              const isSelected = data.bankName === bank.name;
              return (
                <button
                  data-testid={`bank-account-step-button-${bank.name}`}
                  key={bank.name}
                  type="button"
                  onClick={() => handleSelectBank(bank)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl border transition-all text-left group ${
                    isSelected
                      ? 'border-violet-500 bg-violet-50/70 ring-2 ring-violet-200'
                      : 'border-slate-200/80 bg-white hover:border-violet-300 hover:bg-violet-50/40'
                  }`}
                >
                  <BankLogo bank={bank} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-bold truncate leading-tight transition-colors ${
                      isSelected ? 'text-violet-900' : 'text-slate-900 group-hover:text-violet-700'
                    }`}>{bank.name}</p>
                    <p className="text-xs text-slate-400">{bank.type}</p>
                  </div>
                  {isSelected ? (
                    <CheckCircle2 size={16} className="text-violet-600 flex-shrink-0" />
                  ) : (
                    <ChevronRight size={14} className="text-slate-300 group-hover:text-violet-400 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {showBankList && filteredBanks.length === 0 && searchQuery && (
          <div className="mt-3 text-center py-4 text-xs text-slate-400 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
            No banks found matching "{searchQuery}". You can type your exact bank name or pick from the list.
          </div>
        )}
      </div>

      {/* Account name */}
      <div>
        <label htmlFor="accountHolderName" className="block text-xs font-bold text-slate-700 mb-1.5">
          Account Label <span className="text-slate-400 font-normal">(for your reference)</span>
        </label>
        <input
          data-testid="bank-account-step-e-g-savings-account"
          type="text"
          id="accountHolderName"
          value={data.accountHolderName}
          onChange={e => { onUpdate({ accountHolderName: e.target.value }); setErrors(prev => ({ ...prev, accountHolderName: '' })); }}
          className={`w-full px-3.5 py-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 bg-white text-sm text-slate-900 ${
            errors.accountHolderName ? 'border-red-400 bg-red-50/30' : 'border-slate-200'
          }`}
          placeholder="e.g. Primary Savings, Salary Account"
        />
        {errors.accountHolderName && <p className="mt-1 text-xs text-red-600 pl-1">{errors.accountHolderName}</p>}
      </div>

      {/* Balance */}
      <div>
        <label htmlFor="currentBalance" className="block text-xs font-bold text-slate-700 mb-1.5">
          Opening Balance <span className="text-slate-400 font-normal">(optional)</span>
        </label>
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm pointer-events-none">
            {currencyPrefix}
          </span>
          <input
            data-testid="bank-account-step-0"
            type="number"
            id="currentBalance"
            value={data.currentBalance}
            onChange={e => { onUpdate({ currentBalance: e.target.value }); setErrors(prev => ({ ...prev, currentBalance: '' })); }}
            className={`w-full ${
              currencyPrefix.length > 1 ? 'pl-14' : 'pl-8'
            } pr-3.5 py-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 bg-white text-sm text-slate-900 ${
              errors.currentBalance ? 'border-red-400 bg-red-50/30' : 'border-slate-200'
            }`}
            placeholder="0"
            min="0"
            step="1"
          />
        </div>
        {errors.currentBalance && <p className="mt-1 text-xs text-red-600 pl-1">{errors.currentBalance}</p>}
        <p className="mt-1 text-xs text-slate-400">Starting balance for accurate net worth and cashflow tracking.</p>
      </div>

      {/* Actions */}
      <div className="space-y-3 pt-2">
        <div className="flex gap-3">
          <button
            data-testid="bank-account-step-back"
            type="button"
            onClick={onBack}
            className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 px-4 rounded-xl transition-all font-bold text-sm"
          >
            Back
          </button>
          <button
            data-testid="bank-account-step-continue"
            type="submit"
            className="flex-1 bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 hover:from-violet-700 hover:to-blue-700 text-white py-3 px-4 rounded-xl transition-all font-bold text-sm shadow-md shadow-violet-500/20 active:scale-[0.99]"
          >
            Continue
          </button>
        </div>
        {onSkip && (
          <button
            data-testid="bank-account-step-skip-for-now-i"
            type="button"
            onClick={onSkip}
            className="w-full flex items-center justify-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors py-1.5 font-medium"
          >
            <SkipForward size={14} />
            Skip for now - I'll add a bank account later
          </button>
        )}
      </div>
    </form>
  );
};
