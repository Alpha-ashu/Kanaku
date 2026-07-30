import React from 'react';
import { SubcategoryCode, PhysicalAssetDetailsV2, PhysicalAssetType } from '@/types/investmentV2';
import { Gem, ShieldAlert, Building2, CreditCard, Sparkles, ShoppingBag } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PhysicalAssetsFormProps {
  subcategory: SubcategoryCode;
  details: PhysicalAssetDetailsV2;
  setDetails: React.Dispatch<React.SetStateAction<PhysicalAssetDetailsV2>>;
  formData: any;
  setFormData: React.Dispatch<React.SetStateAction<any>>;
  currency: string;
}

export const PhysicalAssetsForm: React.FC<PhysicalAssetsFormProps> = ({
  subcategory,
  details,
  setDetails,
  formData,
  setFormData,
  currency,
}) => {
  const isGold = subcategory === 'gold';
  const isSilver = subcategory === 'silver';

  const assetTypeOptions: { value: PhysicalAssetType; label: string }[] = isGold || isSilver
    ? [
        { value: 'coins', label: 'Coins' },
        { value: 'bars', label: 'Bars / Ingot' },
        { value: 'jewellery', label: 'Jewellery' },
        { value: 'biscuits', label: 'Biscuits' },
        { value: 'custom', label: 'Custom' },
      ]
    : [
        { value: 'platinum', label: 'Platinum' },
        { value: 'bronze', label: 'Bronze' },
        { value: 'diamond', label: 'Diamond' },
        { value: 'jewellery', label: 'Jewellery' },
        { value: 'collectibles', label: 'Collectibles' },
        { value: 'custom', label: 'Other' },
      ];

  return (
    <div className="space-y-5">
      {/* Physical Asset Specific Fields */}
      <div className="bg-slate-50/80 border border-slate-200/80 p-5 rounded-2xl space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-200/60 pb-3">
          <Gem size={16} className="text-amber-600" />
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            {isGold ? 'Gold Asset Details' : isSilver ? 'Silver Asset Details' : 'Physical Metal / Asset Details'}
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Asset Type */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600">Asset Type</label>
            <select
              value={details.assetType || 'coins'}
              onChange={e => setDetails(prev => ({ ...prev, assetType: e.target.value as PhysicalAssetType }))}
              className="w-full h-11 bg-white border border-slate-200 rounded-xl px-3.5 text-sm font-semibold text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none cursor-pointer"
            >
              {assetTypeOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Weight & Unit */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600">Weight</label>
            <div className="flex gap-2">
              <input
                type="number"
                value={details.weight || ''}
                onChange={e => {
                  const w = parseFloat(e.target.value) || 0;
                  setDetails(prev => ({ ...prev, weight: w }));
                  setFormData((prev: any) => ({ ...prev, quantity: w }));
                }}
                className="w-2/3 h-11 bg-white border border-slate-200 rounded-xl px-3.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                placeholder="0.00"
              />
              <select
                value={details.weightUnit || 'g'}
                onChange={e => setDetails(prev => ({ ...prev, weightUnit: e.target.value as any }))}
                className="w-1/3 h-11 bg-white border border-slate-200 rounded-xl px-3 text-xs font-bold text-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none cursor-pointer"
              >
                <option value="g">g</option>
                <option value="tola">tola</option>
                <option value="oz">oz</option>
                <option value="kg">kg</option>
              </select>
            </div>
          </div>

          {/* Purity */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600">Purity / Fineness</label>
            <input
              type="text"
              value={details.purity || ''}
              onChange={e => setDetails(prev => ({ ...prev, purity: e.target.value }))}
              className="w-full h-11 bg-white border border-slate-200 rounded-xl px-3.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none"
              placeholder={isGold ? 'e.g. 24K (999), 22K (916)' : 'e.g. 999 Fine Silver'}
            />
          </div>

          {/* Storage Location */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600">Storage Location</label>
            <input
              type="text"
              value={details.storageLocation || ''}
              onChange={e => setDetails(prev => ({ ...prev, storageLocation: e.target.value }))}
              className="w-full h-11 bg-white border border-slate-200 rounded-xl px-3.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none"
              placeholder="e.g. SBI Locker, Home Safe"
            />
          </div>
        </div>
      </div>

      {/* Gold Loan Integration Section */}
      <div className="bg-amber-50/60 border border-amber-200/80 p-5 rounded-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert size={18} className="text-amber-700" />
            <div>
              <h3 className="text-xs font-bold text-amber-900 uppercase tracking-wider">Gold Loan Integration</h3>
              <p className="text-[11px] text-amber-700 font-medium">Link this physical asset to the Loans Module</p>
            </div>
          </div>

          {/* Toggle */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-slate-700">Is this Gold Pledged?</span>
            <button
              type="button"
              onClick={() => setDetails(prev => ({ ...prev, isPledged: !prev.isPledged }))}
              data-testid="gold-loan-pledged-toggle"
              className={cn(
                'relative w-12 h-6 rounded-full transition-colors duration-200 cursor-pointer',
                details.isPledged ? 'bg-amber-600' : 'bg-slate-300'
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform duration-200 shadow-xs',
                  details.isPledged ? 'translate-x-6' : 'translate-x-0'
                )}
              />
            </button>
          </div>
        </div>

        {/* Pledged Details Form */}
        {details.isPledged && (
          <div className="pt-3 border-t border-amber-200/60 grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in fade-in zoom-in-95">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-amber-950">Lending Bank / Institution</label>
              <input
                type="text"
                value={details.bankName || ''}
                onChange={e => setDetails(prev => ({ ...prev, bankName: e.target.value }))}
                className="w-full h-11 bg-white border border-amber-200 rounded-xl px-3.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none"
                placeholder="e.g. Muthoot Finance, HDFC"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-amber-950">Loan Amount ({currency})</label>
              <input
                type="number"
                value={details.loanAmount || ''}
                onChange={e => setDetails(prev => ({ ...prev, loanAmount: parseFloat(e.target.value) || 0 }))}
                className="w-full h-11 bg-white border border-amber-200 rounded-xl px-3.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none"
                placeholder="0.00"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-amber-950">Interest Rate (%)</label>
              <input
                type="number"
                value={details.interestRate || ''}
                onChange={e => setDetails(prev => ({ ...prev, interestRate: parseFloat(e.target.value) || 0 }))}
                className="w-full h-11 bg-white border border-amber-200 rounded-xl px-3.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none"
                placeholder="e.g. 9.5"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-amber-950">Loan Date</label>
              <input
                type="date"
                value={details.loanDate || formData.date || ''}
                onChange={e => setDetails(prev => ({ ...prev, loanDate: e.target.value }))}
                className="w-full h-11 bg-white border border-amber-200 rounded-xl px-3.5 text-sm font-semibold text-slate-900 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none"
              />
            </div>

            <div className="sm:col-span-2 space-y-1.5">
              <label className="text-xs font-semibold text-amber-950">Loan Account Number</label>
              <input
                type="text"
                value={details.loanAccountNumber || ''}
                onChange={e => setDetails(prev => ({ ...prev, loanAccountNumber: e.target.value }))}
                className="w-full h-11 bg-white border border-amber-200 rounded-xl px-3.5 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none"
                placeholder="Loan Account / Reference ID"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
