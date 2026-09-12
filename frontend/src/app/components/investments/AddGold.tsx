import React, { useEffect, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { backendService } from '@/lib/backend-api';
import { TrendingUp, TrendingDown, Sparkles, ArrowLeft, Shield, MapPin, Calendar, Coins } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { takeVoiceDraft, VOICE_INVESTMENT_DRAFT_KEY, type VoiceInvestmentDraft } from '@/lib/voiceDrafts';
import { FloatingSaveBar } from '@/app/components/ui/FloatingSaveBar';
import { CenteredLayout } from '@/app/components/shared/CenteredLayout';

// --- Constants ---
const GOLD_TYPES = [
  { id: 'gold', label: 'Pure Gold', icon: '🥇' },
  { id: 'jewelry', label: 'Jewelry', icon: '💍' },
  { id: 'coin', label: 'Gold Coin', icon: '🪙' },
] as const;

const PURITY_PRESETS = [
  { label: '24K', value: 99.9 },
  { label: '22K', value: 91.67 },
  { label: '18K', value: 75 },
  { label: '14K', value: 58.5 },
];

const UNIT_OPTIONS = [
  { value: 'gram', label: 'Gram' },
  { value: 'ounce', label: 'Ounce' },
  { value: 'kg', label: 'Kilogram' },
];

export const AddGold: React.FC = () => {
  const { setCurrentPage, currency, refreshData } = useApp();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    type: 'gold' as 'gold' | 'jewelry' | 'coin',
    quantity: 0,
    unit: 'gram' as 'gram' | 'ounce' | 'kg',
    purchasePrice: 0,
    currentPrice: 0,
    purchaseDate: new Date().toISOString().split('T')[0],
    purityPercentage: 99.9,
    location: 'safe-deposit-box',
    certificateNumber: '',
    notes: '',
  });

  useEffect(() => {
    const draft = takeVoiceDraft<VoiceInvestmentDraft>(VOICE_INVESTMENT_DRAFT_KEY);
    if (draft) {
      setFormData(prev => ({ ...prev, purchasePrice: draft.amount || 0, notes: draft.description || '' }));
    }
  }, []);

  const totalValue = formData.quantity * formData.currentPrice;
  const totalInvestment = formData.quantity * formData.purchasePrice;
  const gainLoss = totalValue - totalInvestment;
  const gainPct = totalInvestment > 0 ? (gainLoss / totalInvestment) * 100 : 0;
  const hasGain = gainLoss >= 0;

  const handleSubmit = async () => {
    if (formData.quantity <= 0) { toast.error('Enter quantity'); return; }
    if (formData.purchasePrice <= 0) { toast.error('Enter purchase price'); return; }
    
    setIsSubmitting(true);
    try {
      await backendService.createGold({
        ...formData,
        purchaseDate: new Date(formData.purchaseDate),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      toast.success('Gold entry added');
      refreshData();
      setCurrentPage('investments');
    } catch (e) {
      toast.error('Failed to save entry');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <CenteredLayout enablePullToRefresh={false} className="pb-32">
      <div className="space-y-6 w-full">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 w-full">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <button
              type="button"
              data-testid="add-gold-back"
              onClick={() => setCurrentPage('investments')}
              title="Back to Portfolio"
              aria-label="Back to Portfolio"
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white border border-slate-200/80 hover:bg-slate-50 active:scale-95 shadow-xs flex items-center justify-center text-slate-700 transition-all shrink-0 cursor-pointer"
            >
              <ArrowLeft size={18} className="text-slate-700" />
            </button>
            <h1 className="font-page-title text-slate-900 tracking-tight leading-none truncate">
              Add Gold Asset
            </h1>
          </div>
        </div>

        {/* Main Single-Page Content Area */}
        <main className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 w-full pb-48 no-scrollbar">
          
          {/* Left Column: specifications & details (lg:col-7) */}
          <div className="lg:col-span-7 flex flex-col gap-4 lg:overflow-y-auto">
            <div className="bg-white rounded-[28px] sm:rounded-[32px] p-5 sm:p-7 border border-slate-100 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] space-y-5">
              
              {/* Category */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">1. Gold Category</label>
                <div className="grid grid-cols-3 gap-2.5">
                  {GOLD_TYPES.map(t => (
                    <button
                      key={t.id}
                      type="button"
                      data-testid={`add-gold-button-${t.id}`}
                      onClick={() => setFormData(prev => ({ ...prev, type: t.id as any }))}
                      className={cn(
                        "flex flex-col items-center gap-1.5 p-3 sm:p-4 rounded-2xl transition-all cursor-pointer border",
                        formData.type === t.id
                          ? "bg-amber-500 border-amber-500 text-white shadow-lg shadow-amber-500/25"
                          : "bg-slate-50 hover:bg-slate-100 border-slate-200/70 text-slate-700"
                      )}
                    >
                      <span className="text-2xl sm:text-3xl">{t.icon}</span>
                      <span className="text-[11px] font-black uppercase tracking-wider truncate w-full text-center">{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Purity Profile */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">2. Purity Profile</label>
                <div className="flex gap-2.5 items-center">
                  <div className="flex-1 grid grid-cols-4 gap-1 bg-slate-100/90 p-1 rounded-full border border-slate-200/60 shadow-2xs">
                    {PURITY_PRESETS.map(p => (
                      <button
                        key={p.label}
                        type="button"
                        data-testid={`add-gold-button-2-${p.label}`}
                        onClick={() => setFormData(prev => ({ ...prev, purityPercentage: p.value }))}
                        className={cn(
                          "py-2 rounded-full text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-all cursor-pointer",
                          formData.purityPercentage === p.value
                            ? "bg-[#18181B] text-white shadow-xs"
                            : "text-slate-600 hover:text-slate-900"
                        )}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <div className="w-24 relative">
                    <input
                      data-testid="add-gold-purity-percentage"
                      type="number"
                      value={formData.purityPercentage}
                      onChange={e => setFormData(prev => ({ ...prev, purityPercentage: parseFloat(e.target.value) || 0 }))}
                      aria-label="Purity percentage"
                      className="w-full h-10 bg-slate-50 border border-slate-200/80 rounded-2xl text-center font-bold text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 outline-none transition-all"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 pointer-events-none">%</span>
                  </div>
                </div>
              </div>

              {/* Storage & Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Storage Location</label>
                  <div className="relative">
                    <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input
                      id="add-gold-location"
                      name="location"
                      aria-label="Storage location"
                      data-testid="add-gold-locker-safe"
                      type="text"
                      value={formData.location}
                      onChange={e => setFormData(prev => ({ ...prev, location: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-200/80 rounded-2xl py-3 pl-10 pr-3.5 font-bold text-slate-900 text-xs focus:bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 outline-none transition-all"
                      placeholder="Locker, Safe..."
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Purchase Date</label>
                  <div className="relative">
                    <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input
                      data-testid="add-gold-purchase-date"
                      type="date"
                      value={formData.purchaseDate}
                      onChange={e => setFormData(prev => ({ ...prev, purchaseDate: e.target.value }))}
                      aria-label="Purchase date"
                      className="w-full bg-slate-50 border border-slate-200/80 rounded-2xl py-3 pl-10 pr-3.5 font-bold text-slate-900 text-xs focus:bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 outline-none transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Certificate / Notes */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Certificate / Notes</label>
                <textarea
                  id="add-gold-notes"
                  name="notes"
                  aria-label="Certificate or notes"
                  data-testid="add-gold-cert-12345"
                  value={formData.notes}
                  onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200/80 rounded-2xl py-3 px-3.5 font-medium text-slate-900 text-xs min-h-[75px] resize-none focus:bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 outline-none transition-all"
                  placeholder="Cert #12345, Hallmark, or notes..."
                />
              </div>
            </div>
            
            {/* Purity Verification Notice */}
            <div className="p-4 bg-amber-50/70 border border-amber-200/60 rounded-2xl flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center shrink-0 shadow-xs">
                <Shield size={18} className="text-white" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-amber-900 uppercase tracking-wider">Purity Verification</p>
                <p className="text-xs font-semibold text-amber-950/80">Accurate purity ensures precise portfolio valuation.</p>
              </div>
            </div>
          </div>

          {/* Right Column: Financials & Valuations (lg:col-5) */}
          <div className="lg:col-span-5 flex flex-col gap-4 lg:overflow-y-auto">
            
            {/* Weight Hero Card */}
            <div className="bg-white rounded-[28px] sm:rounded-[32px] p-6 sm:p-7 border border-slate-100 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] relative overflow-hidden flex flex-col items-center">
              <div className="absolute -top-10 -right-10 w-32 h-32 bg-amber-500/10 blur-[40px] rounded-full pointer-events-none" />
              
              {/* Unit Toggle */}
              <div className="flex items-center gap-1 mb-5 bg-slate-100/90 p-1 rounded-full border border-slate-200/60 shadow-2xs">
                {UNIT_OPTIONS.map(u => (
                  <button
                    key={u.value}
                    type="button"
                    data-testid={`add-gold-button-3-${u.value}`}
                    onClick={() => setFormData(prev => ({ ...prev, unit: u.value as any }))}
                    className={cn(
                      "px-4 py-1.5 rounded-full text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-all cursor-pointer",
                      formData.unit === u.value
                        ? "bg-[#18181B] text-white shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    )}
                  >
                    {u.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-col items-center w-full">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-1">
                  Weight ({formData.unit})
                </span>
                <input
                  data-testid="add-gold-0-00"
                  id="add-gold-weight"
                  name="quantity"
                  aria-label="Weight"
                  type="number"
                  step="any"
                  value={formData.quantity || ''}
                  onChange={e => setFormData(prev => ({ ...prev, quantity: parseFloat(e.target.value) || 0 }))}
                  className="bg-transparent text-5xl sm:text-6xl font-black text-slate-900 outline-none w-full text-center tracking-tighter"
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* Price Inputs Card */}
            <div className="bg-white rounded-[28px] sm:rounded-[32px] p-5 sm:p-6 border border-slate-100 shadow-[0_10px_30px_-4px_rgba(112,144,176,0.06)] space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Buy Price / {formData.unit}</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">{currency}</span>
                    <input
                      data-testid="add-gold-buy-price-per-unit"
                      type="number"
                      step="any"
                      value={formData.purchasePrice || ''}
                      onChange={e => setFormData(prev => ({ ...prev, purchasePrice: parseFloat(e.target.value) || 0 }))}
                      aria-label="Buy price per unit"
                      className="w-full bg-slate-50 border border-slate-200/80 rounded-2xl py-3 pl-10 pr-3.5 font-bold text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 outline-none transition-all"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Live Price / {formData.unit}</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">{currency}</span>
                    <input
                      data-testid="add-gold-live-price-per-unit"
                      type="number"
                      step="any"
                      value={formData.currentPrice || ''}
                      onChange={e => setFormData(prev => ({ ...prev, currentPrice: parseFloat(e.target.value) || 0 }))}
                      aria-label="Live price per unit"
                      className="w-full bg-slate-50 border border-slate-200/80 rounded-2xl py-3 pl-10 pr-3.5 font-bold text-xs text-slate-900 focus:bg-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 outline-none transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Gain/Loss Preview */}
              {formData.quantity > 0 && formData.purchasePrice > 0 && (
                <div className={cn(
                  "p-4 rounded-2xl flex items-center justify-between transition-all",
                  hasGain
                    ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"
                    : "bg-rose-500 text-white shadow-lg shadow-rose-500/20"
                )}>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                      {hasGain ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
                    </div>
                    <div>
                      <p className="text-[9px] font-bold uppercase opacity-75">Estimated P/L</p>
                      <p className="text-xl font-black tracking-tight">{currency} {Math.abs(gainLoss).toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-bold uppercase opacity-75">Performance</p>
                    <p className="text-sm font-black">{hasGain ? '+' : '-'}{Math.abs(gainPct).toFixed(1)}%</p>
                  </div>
                </div>
              )}
            </div>

            {/* Final Investment Summary Banner */}
            <div className="mt-auto p-5 sm:p-6 bg-gradient-to-br from-[#18181B] via-slate-900 to-amber-950/80 rounded-[28px] sm:rounded-[32px] text-white flex items-center justify-between shadow-xl border border-amber-500/20">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/20 flex items-center justify-center backdrop-blur-sm">
                  <Coins size={20} className="text-amber-400" />
                </div>
                <div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Total Gold Asset</p>
                  <p className="text-sm font-bold truncate max-w-[140px] text-white">{formData.quantity} {formData.unit}s</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Market Value</p>
                <p className="text-xl sm:text-2xl font-black tracking-tight text-white">
                  {currency} {(formData.quantity * (formData.currentPrice || formData.purchasePrice)).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </main>
      </div>

      <FloatingSaveBar
        onSave={handleSubmit}
        onDiscard={() => setCurrentPage('investments')}
        isSaving={isSubmitting}
        saveLabel="Add Gold Asset"
        accentClass="bg-amber-500 hover:bg-amber-600 bg-gradient-to-r from-amber-500 to-amber-600"
      />
    </CenteredLayout>
  );
};

