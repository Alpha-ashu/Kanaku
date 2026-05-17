import React, { useState, useMemo } from 'react';
import { Search, Building2, CheckCircle2, SkipForward, ChevronRight } from 'lucide-react';
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
 <form onSubmit={handleSubmit} className="space-y-5">
 <div className="text-center mb-2">
 <h3 className="text-xl font-bold text-gray-900 mb-1">Bank Account Setup</h3>
 <p className="text-sm text-gray-500">
 {data.country
 ? `Showing banks available in ${data.country}`
 : 'Set up your primary account for tracking.'}
 </p>
 </div>

 {/* Bank search */}
 <div>
 <label className="block text-sm font-medium text-gray-700 mb-2">Bank Name</label>

 {/* Search input */}
 <div className="relative">
 <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
 <input
 type="text"
 value={searchQuery}
 onChange={e => {
 setSearchQuery(e.target.value);
 if (data.bankName && e.target.value !== data.bankName) {
 onUpdate({ bankName: '' });
 }
 }}
 placeholder="Search your bank..."
 autoComplete="off"
 className={`w-full pl-9 pr-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 ${
 errors.bankName ? 'border-red-400 bg-red-50' : 'border-gray-300'
 }`}
 />
 </div>
 {errors.bankName && <p className="mt-1 text-sm text-red-600">{errors.bankName}</p>}

 {/* Selected bank pill */}
 {selectedBank && (
 <div className="mt-2 flex items-center gap-2.5 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5">
 <BankLogo bank={selectedBank} size="sm" />
 <div className="min-w-0 flex-1">
 <p className="text-sm font-semibold text-blue-900 truncate">{selectedBank.name}</p>
 <p className="text-xs text-blue-600">{selectedBank.type}</p>
 </div>
 <CheckCircle2 size={18} className="text-blue-500 flex-shrink-0" />
 </div>
 )}

 {/* Bank cards grid */}
 {showBankList && filteredBanks.length > 0 && (
 <div className="mt-3 space-y-2 max-h-[220px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-gray-200">
 {filteredBanks.map(bank => (
 <button
 key={bank.name}
 type="button"
 onClick={() => handleSelectBank(bank)}
 className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left ${
 data.bankName === bank.name
 ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
 : 'border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/50'
 }`}
 >
 <BankLogo bank={bank} size="sm" />
 <div className="min-w-0 flex-1">
 <p className="text-sm font-semibold text-gray-900 truncate leading-tight">{bank.name}</p>
 <p className="text-xs text-gray-500">{bank.type}</p>
 </div>
 {data.bankName === bank.name ? (
 <CheckCircle2 size={16} className="text-blue-500 flex-shrink-0" />
 ) : (
 <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
 )}
 </button>
 ))}
 </div>
 )}

 {showBankList && filteredBanks.length === 0 && searchQuery && (
 <div className="mt-3 text-center py-4 text-sm text-gray-500">
 No banks found for"{searchQuery}". Try a different name.
 </div>
 )}
 </div>

 {/* Account name */}
 <div>
 <label htmlFor="accountHolderName" className="block text-sm font-medium text-gray-700 mb-1">
 Account Name <span className="text-gray-400 font-normal">(as in bank records)</span>
 </label>
 <input
 type="text"
 id="accountHolderName"
 value={data.accountHolderName}
 onChange={e => { onUpdate({ accountHolderName: e.target.value }); setErrors(prev => ({ ...prev, accountHolderName: '' })); }}
 className={`w-full px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 ${
 errors.accountHolderName ? 'border-red-400 bg-red-50' : 'border-gray-300'
 }`}
 placeholder="e.g. Savings Account, Salary A/C"
 />
 {errors.accountHolderName && <p className="mt-1 text-sm text-red-600">{errors.accountHolderName}</p>}
 </div>

 {/* Balance */}
 <div>
 <label htmlFor="currentBalance" className="block text-sm font-medium text-gray-700 mb-1">
 Current Balance <span className="text-gray-400 font-normal">(optional)</span>
 </label>
 <div className="relative">
 <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 font-medium text-sm">
 {data.country === 'India' ? 'INR' : data.country === 'United States' ? '$' : data.country === 'United Kingdom' ? 'GBP' : 'INR'}
 </span>
 <input
 type="number"
 id="currentBalance"
 value={data.currentBalance}
 onChange={e => { onUpdate({ currentBalance: e.target.value }); setErrors(prev => ({ ...prev, currentBalance: '' })); }}
 className={`w-full pl-8 pr-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 ${
 errors.currentBalance ? 'border-red-400 bg-red-50' : 'border-gray-300'
 }`}
 placeholder="0"
 min="0"
 step="1"
 />
 </div>
 {errors.currentBalance && <p className="mt-1 text-sm text-red-600">{errors.currentBalance}</p>}
 <p className="mt-1 text-xs text-gray-400">Your current account balance for accurate tracking.</p>
 </div>

 {/* Actions */}
 <div className="space-y-3 pt-1">
 <div className="flex gap-3">
 <button
 type="button"
 onClick={onBack}
 className="flex-1 bg-gray-100 text-gray-800 py-3 px-4 rounded-xl hover:bg-gray-200 transition-colors font-semibold"
 >
 Back
 </button>
 <button
 type="submit"
 className="flex-1 bg-blue-600 text-white py-3 px-4 rounded-xl hover:bg-blue-700 transition-colors font-semibold shadow-md border-b-4 border-blue-700 active:border-b-0 active:mt-1"
 >
 Continue
 </button>
 </div>
 {onSkip && (
 <button
 type="button"
 onClick={onSkip}
 className="w-full flex items-center justify-center gap-2 text-sm text-gray-400 hover:text-gray-600 transition-colors py-1"
 >
 <SkipForward size={14} />
 Skip for now - I'll add a bank account later
 </button>
 )}
 </div>
 </form>
 );
};
