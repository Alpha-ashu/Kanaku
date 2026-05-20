
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { Button } from '@/app/components/ui/button';
import { SearchableDropdown } from '@/app/components/ui/SearchableDropdown';
import { backendService } from '@/lib/backend-api';
import { saveTransactionWithBackendSync } from '@/lib/auth-sync-integration';
import { db } from '@/lib/database';
import {
  TrendingUp, Loader2, RefreshCw, ChevronLeft, ArrowLeft, Check,
  Search, Calendar, Wallet, AlignLeft, Info, Plus, ArrowUpRight,
  BarChart3, Globe, Shield, Scan, Upload, CheckCircle2, AlertCircle,
  Weight, Tag, MapPin, Users, Gift, ShoppingBag, Building2, Briefcase, Gem,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { searchStocks, fetchStockQuote, StockQuote, StockSearchResult, displaySymbol } from '@/lib/stockApi';
import { formatNativeMoney, getCurrencySymbol, normalizeCurrencyCode } from '@/lib/currencyUtils';
import { fetchCurrencyConversionRate } from '@/lib/investmentUtils';
import { inferInvestmentTypeFromText } from '@/lib/voiceExpenseParser';
import { takeVoiceDraft, VOICE_INVESTMENT_DRAFT_KEY, type VoiceInvestmentDraft } from '@/lib/voiceDrafts';
import { extractAssetMetadata, ExtractedAssetMetadata } from '@/lib/assetOcrParser';

import '@/styles/premium-transactions.css';

// ─── Types ──────────────────────────────────────────────────────────────────────
type InvestmentFormType =
  | 'stocks' | 'crypto' | 'mutual-funds' | 'bonds'
  | 'gold' | 'silver' | 'platinum' | 'bronze'
  | 'real-estate' | 'business' | 'other';

type OwnershipTag = 'self' | 'inherited' | 'gifted';

// ─── Constants ──────────────────────────────────────────────────────────────────
const INVESTMENT_TYPES: { key: InvestmentFormType; label: string; icon: string; group: 'market' | 'physical' | 'asset' }[] = [
  { key: 'stocks',       label: 'Stocks',    icon: '📈', group: 'market' },
  { key: 'crypto',       label: 'Crypto',    icon: '₿',  group: 'market' },
  { key: 'mutual-funds', label: 'Funds',     icon: '📊', group: 'market' },
  { key: 'gold',         label: 'Gold',      icon: '🥇', group: 'physical' },
  { key: 'silver',       label: 'Silver',    icon: '🥈', group: 'physical' },
  { key: 'platinum',     label: 'Platinum',  icon: '💎', group: 'physical' },
  { key: 'bronze',       label: 'Bronze',    icon: '🏆', group: 'physical' },
  { key: 'real-estate',  label: 'Property',  icon: '🏠', group: 'asset' },
  { key: 'business',     label: 'Business',  icon: '🏢', group: 'asset' },
  { key: 'bonds',        label: 'Bonds',     icon: '📜', group: 'market' },
  { key: 'other',        label: 'Other',     icon: '💼', group: 'asset' },
];

const PHYSICAL_METALS: InvestmentFormType[] = ['gold', 'silver', 'platinum', 'bronze'];
const MARKET_ASSETS: InvestmentFormType[] = ['stocks', 'crypto', 'mutual-funds', 'bonds'];

const METAL_ACCENT: Record<string, string> = {
  gold: '#D4AF37', silver: '#C0C0C0', platinum: '#E5E4E2', bronze: '#CD7F32',
};

const PENDING_INVESTMENT_DRAFT_KEY = 'pendingInvestmentDraft';

// ─── Sub-components ────────────────────────────────────────────────────────────

const AssetTypeGrid = ({
  selectedType,
  onSelect,
}: {
  selectedType: string;
  onSelect: (type: InvestmentFormType) => void;
}) => (
  <div className="space-y-2">
    {[
      { label: 'Market Assets', keys: MARKET_ASSETS },
      { label: 'Physical Metals', keys: PHYSICAL_METALS },
      { label: 'Other Assets', keys: ['real-estate', 'business', 'other'] as InvestmentFormType[] },
    ].map(group => (
      <div key={group.label}>
        <p style={{ fontSize: 8, fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 6 }}>
          {group.label}
        </p>
        <div className="flex flex-wrap gap-2">
          {group.keys.map(key => {
            const type = INVESTMENT_TYPES.find(t => t.key === key)!;
            const isSelected = selectedType === key;
            const isPhysical = PHYSICAL_METALS.includes(key);
            const accentColor = isPhysical ? METAL_ACCENT[key] : undefined;
            return (
              <button
                key={key}
                onClick={() => onSelect(key)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 rounded-xl transition-all text-[10px] font-black',
                  isSelected ? 'shadow-lg' : 'hover:opacity-80'
                )}
                style={{
                  background: isSelected
                    ? (accentColor ? `${accentColor}22` : '#4f46e5')
                    : 'rgba(248,250,252,1)',
                  border: isSelected
                    ? `1.5px solid ${accentColor ?? '#4f46e5'}`
                    : '1.5px solid transparent',
                  color: isSelected
                    ? (accentColor ?? '#4f46e5')
                    : '#64748b',
                }}
              >
                <span>{type.icon}</span>
                <span>{type.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    ))}
  </div>
);

// Physical asset metadata form section
const PhysicalAssetForm: React.FC<{
  metalType: InvestmentFormType;
  metadata: PhysicalMeta;
  onChange: (key: keyof PhysicalMeta, val: any) => void;
}> = ({ metalType, metadata, onChange }) => {
  const accent = METAL_ACCENT[metalType] ?? '#94a3b8';
  return (
    <div className="space-y-3 pt-2">
      <div style={{ height: 1, background: `linear-gradient(to right, ${accent}40, transparent)` }} />
      <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase', color: accent }}>
        Physical Asset Details
      </p>

      <div className="grid grid-cols-2 gap-3">
        {/* Weight */}
        <div className="space-y-1">
          <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Weight</label>
          <div className="flex gap-1">
            <input
              type="number"
              value={metadata.weightValue || ''}
              onChange={e => onChange('weightValue', parseFloat(e.target.value) || 0)}
              className="w-2/3 bg-slate-50 border-none rounded-xl py-2 px-3 font-bold text-slate-900 text-xs"
              placeholder="0.00"
            />
            <select
              value={metadata.weightUnit || 'g'}
              onChange={e => onChange('weightUnit', e.target.value)}
              className="w-1/3 bg-slate-50 border-none rounded-xl py-2 px-2 font-bold text-xs text-slate-700"
            >
              <option value="g">g</option>
              <option value="tola">tola</option>
              <option value="oz">oz</option>
              <option value="kg">kg</option>
            </select>
          </div>
        </div>

        {/* Purity */}
        <div className="space-y-1">
          <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Purity / Fineness</label>
          <input
            type="text"
            value={metadata.purity || ''}
            onChange={e => onChange('purity', e.target.value)}
            className="w-full bg-slate-50 border-none rounded-xl py-2 px-3 font-bold text-slate-900 text-xs"
            placeholder="e.g. 22K (916)"
          />
        </div>

        {/* Form / Type */}
        <div className="space-y-1">
          <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Form</label>
          <select
            value={metadata.form || ''}
            onChange={e => onChange('form', e.target.value)}
            className="w-full bg-slate-50 border-none rounded-xl py-2 px-3 font-bold text-xs text-slate-700"
          >
            <option value="">Select form</option>
            <option value="jewelry">Jewelry / Ornament</option>
            <option value="coin">Coin</option>
            <option value="bar">Bar / Ingot</option>
            <option value="biscuit">Biscuit</option>
            <option value="other">Other</option>
          </select>
        </div>

        {/* Hallmark HUID */}
        <div className="space-y-1">
          <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">BIS HUID</label>
          <input
            type="text"
            value={metadata.hallmarkNumber || ''}
            onChange={e => onChange('hallmarkNumber', e.target.value.toUpperCase().slice(0, 6))}
            className="w-full bg-slate-50 border-none rounded-xl py-2 px-3 font-bold text-slate-900 text-xs tracking-widest"
            placeholder="6-digit code"
            maxLength={6}
          />
        </div>
      </div>

      {/* Jeweler Name */}
      <div className="space-y-1">
        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Jeweler / Shop</label>
        <input
          type="text"
          value={metadata.jewelerName || ''}
          onChange={e => onChange('jewelerName', e.target.value)}
          className="w-full bg-slate-50 border-none rounded-xl py-2 px-3 font-bold text-slate-900 text-xs"
          placeholder="e.g. Tanishq, Kalyan Jewellers"
        />
      </div>

      {/* Locker Name */}
      <div className="space-y-1">
        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Storage / Locker</label>
        <input
          type="text"
          value={metadata.lockerName || ''}
          onChange={e => onChange('lockerName', e.target.value)}
          className="w-full bg-slate-50 border-none rounded-xl py-2 px-3 font-bold text-slate-900 text-xs"
          placeholder="e.g. SBI Bank Locker, Home Safe"
        />
      </div>

      {/* Ownership */}
      <div className="space-y-1">
        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Ownership</label>
        <div className="flex gap-2">
          {(['self', 'inherited', 'gifted'] as OwnershipTag[]).map(tag => {
            const icons = { self: <ShoppingBag size={10} />, inherited: <Users size={10} />, gifted: <Gift size={10} /> };
            const labels = { self: 'Self-Purchased', inherited: 'Inherited', gifted: 'Gifted' };
            const isActive = metadata.ownershipTag === tag;
            return (
              <button
                key={tag}
                onClick={() => onChange('ownershipTag', tag)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[9px] font-black transition-all"
                style={{
                  background: isActive ? `${accent}18` : 'rgba(248,250,252,1)',
                  border: `1.5px solid ${isActive ? accent : 'transparent'}`,
                  color: isActive ? accent : '#64748b',
                }}
              >
                {icons[tag]} {labels[tag]}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// Real Estate form section
const RealEstateForm: React.FC<{
  metadata: RealEstateMeta;
  onChange: (key: keyof RealEstateMeta, val: any) => void;
}> = ({ metadata, onChange }) => (
  <div className="space-y-3 pt-2">
    <div style={{ height: 1, background: 'linear-gradient(to right, rgba(99,102,241,0.4), transparent)' }} />
    <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#818CF8' }}>
      Property Details
    </p>
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1">
        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Property Type</label>
        <select
          value={metadata.propertyType || ''}
          onChange={e => onChange('propertyType', e.target.value)}
          className="w-full bg-slate-50 border-none rounded-xl py-2 px-3 font-bold text-xs text-slate-700"
        >
          <option value="">Select type</option>
          <option value="Residential">Residential</option>
          <option value="Commercial">Commercial</option>
          <option value="Agricultural Land">Agricultural Land</option>
          <option value="Plot / Land">Plot / Land</option>
          <option value="Industrial">Industrial</option>
        </select>
      </div>
      <div className="space-y-1">
        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Location</label>
        <input
          type="text"
          value={metadata.location || ''}
          onChange={e => onChange('location', e.target.value)}
          className="w-full bg-slate-50 border-none rounded-xl py-2 px-3 font-bold text-slate-900 text-xs"
          placeholder="City, Area"
        />
      </div>
      <div className="space-y-1">
        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Area (sq.ft)</label>
        <input
          type="number"
          value={metadata.areaSqft || ''}
          onChange={e => onChange('areaSqft', parseFloat(e.target.value) || 0)}
          className="w-full bg-slate-50 border-none rounded-xl py-2 px-3 font-bold text-slate-900 text-xs"
          placeholder="0"
        />
      </div>
      <div className="space-y-1">
        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Rental Yield %</label>
        <input
          type="number"
          value={metadata.rentalYield || ''}
          onChange={e => onChange('rentalYield', parseFloat(e.target.value) || 0)}
          className="w-full bg-slate-50 border-none rounded-xl py-2 px-3 font-bold text-slate-900 text-xs"
          placeholder="e.g. 4.5"
        />
      </div>
    </div>
    <div className="space-y-1">
      <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Document Storage</label>
      <input
        type="text"
        value={metadata.documentSafe || ''}
        onChange={e => onChange('documentSafe', e.target.value)}
        className="w-full bg-slate-50 border-none rounded-xl py-2 px-3 font-bold text-slate-900 text-xs"
        placeholder="Where are the documents kept?"
      />
    </div>
  </div>
);

// Business form section
const BusinessForm: React.FC<{
  metadata: BusinessMeta;
  onChange: (key: keyof BusinessMeta, val: any) => void;
}> = ({ metadata, onChange }) => (
  <div className="space-y-3 pt-2">
    <div style={{ height: 1, background: 'linear-gradient(to right, rgba(16,185,129,0.4), transparent)' }} />
    <p style={{ fontSize: 9, fontWeight: 900, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#34D399' }}>
      Business Details
    </p>
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1">
        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Ownership %</label>
        <input
          type="number"
          value={metadata.ownershipPercent || ''}
          onChange={e => onChange('ownershipPercent', parseFloat(e.target.value) || 0)}
          className="w-full bg-slate-50 border-none rounded-xl py-2 px-3 font-bold text-slate-900 text-xs"
          placeholder="e.g. 51"
          min={0} max={100}
        />
      </div>
      <div className="space-y-1">
        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Sector</label>
        <input
          type="text"
          value={metadata.sector || ''}
          onChange={e => onChange('sector', e.target.value)}
          className="w-full bg-slate-50 border-none rounded-xl py-2 px-3 font-bold text-slate-900 text-xs"
          placeholder="e.g. Retail, Tech"
        />
      </div>
    </div>
  </div>
);

// OCR bill scanner component
const OcrBillScanner: React.FC<{
  onExtracted: (data: ExtractedAssetMetadata) => void;
  accentColor?: string;
}> = ({ onExtracted, accentColor = '#D4AF37' }) => {
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ExtractedAssetMetadata | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setScanning(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);

      // Try backend OCR
      let rawText = '';
      try {
        const response = await backendService.uploadExpenseBill({ file });
        rawText = response?.rawText ?? response?.text ?? '';
      } catch (e) {
        // If OCR backend fails, read as text (for PDF text layer)
        rawText = await file.text();
      }

      if (!rawText) {
        toast.error('Could not extract text from bill');
        return;
      }

      const extracted = extractAssetMetadata(rawText);
      setResult(extracted);

      if (extracted.confidenceScore >= 20) {
        onExtracted(extracted);
        toast.success(`AI extracted details with ${extracted.confidenceScore}% confidence`);
      } else {
        toast.warning('Low confidence extraction — please fill details manually');
      }
    } catch (e) {
      toast.error('Bill scan failed');
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="space-y-2">
      <input
        ref={fileRef}
        type="file"
        accept="image/*,.pdf"
        className="hidden"
        onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
      />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={scanning}
        className="w-full flex items-center gap-3 p-3 rounded-xl transition-all active:scale-98"
        style={{
          background: `${accentColor}0F`,
          border: `1.5px dashed ${accentColor}50`,
          color: accentColor,
        }}
      >
        {scanning
          ? <Loader2 size={16} className="animate-spin shrink-0" />
          : <Scan size={16} className="shrink-0" />}
        <div className="text-left">
          <p style={{ fontSize: 11, fontWeight: 900 }}>
            {scanning ? 'Scanning bill…' : 'Scan Jeweller Bill (AI)'}
          </p>
          <p style={{ fontSize: 9, color: '#94a3b8', fontWeight: 600 }}>
            Upload invoice image or PDF to auto-fill fields
          </p>
        </div>
      </button>

      {result && (
        <div className="p-2.5 rounded-xl text-[9px] font-bold"
          style={{ background: result.confidenceScore >= 50 ? 'rgba(74,222,128,0.08)' : 'rgba(251,191,36,0.08)', border: `1px solid ${result.confidenceScore >= 50 ? 'rgba(74,222,128,0.2)' : 'rgba(251,191,36,0.2)'}` }}
        >
          {result.confidenceScore >= 50
            ? <CheckCircle2 size={12} className="inline mr-1 text-green-500" />
            : <AlertCircle size={12} className="inline mr-1 text-yellow-500" />}
          Confidence: {result.confidenceScore}%
          {result.assetType && ` · ${result.assetType}`}
          {result.weight && ` · ${result.weight.toFixed(2)}g`}
          {result.purity && ` · ${result.purity}`}
          {result.hallmarkNumber && ` · HUID: ${result.hallmarkNumber}`}
        </div>
      )}
    </div>
  );
};

// ─── Metadata interfaces ────────────────────────────────────────────────────────
interface PhysicalMeta {
  weightValue: number;
  weightUnit: 'g' | 'tola' | 'oz' | 'kg';
  weightGrams?: number;
  purity: string;
  form: string;
  hallmarkNumber: string;
  jewelerName: string;
  lockerName: string;
  ownershipTag: OwnershipTag;
}

interface RealEstateMeta {
  propertyType: string;
  location: string;
  areaSqft: number;
  rentalYield: number;
  documentSafe: string;
  registrationStatus: string;
}

interface BusinessMeta {
  ownershipPercent: number;
  sector: string;
  dividendFrequency: string;
}

function toGrams(val: number, unit: string): number {
  if (unit === 'kg') return val * 1000;
  if (unit === 'oz') return val * 31.1034768;
  if (unit === 'tola') return val * 11.6638;
  return val;
}

// ─── Main Component ────────────────────────────────────────────────────────────
export const AddInvestment: React.FC = () => {
  const { accounts, setCurrentPage, currency, refreshData } = useApp();
  const activeAccounts = accounts.filter(a => a.isActive);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    type: 'stocks' as InvestmentFormType,
    quantity: 0,
    purchasePrice: 0,
    currentPrice: 0,
    date: new Date().toISOString().split('T')[0],
    broker: '',
    description: '',
    fundingAccountId: activeAccounts[0]?.id || 0,
    purchaseFees: 0,
  });

  const [physicalMeta, setPhysicalMeta] = useState<PhysicalMeta>({
    weightValue: 0, weightUnit: 'g', purity: '', form: '', hallmarkNumber: '',
    jewelerName: '', lockerName: '', ownershipTag: 'self',
  });
  const [realEstateMeta, setRealEstateMeta] = useState<RealEstateMeta>({
    propertyType: '', location: '', areaSqft: 0, rentalYield: 0, documentSafe: '', registrationStatus: '',
  });
  const [businessMeta, setBusinessMeta] = useState<BusinessMeta>({
    ownershipPercent: 0, sector: '', dividendFrequency: '',
  });

  const [searchResults, setSearchResults] = useState<StockSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [fetchingPrice, setFetchingPrice] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [quoteSnapshot, setQuoteSnapshot] = useState<any>(null);
  const searchTimer = useRef<any>(null);

  const isMarketAsset = MARKET_ASSETS.includes(formData.type);
  const isPhysicalMetal = PHYSICAL_METALS.includes(formData.type);
  const isRealEstate = formData.type === 'real-estate';
  const isBusiness = formData.type === 'business';

  const assetCurrencyCode = quoteSnapshot?.currencyCode || normalizeCurrencyCode(currency);
  const assetCurrency = getCurrencySymbol(assetCurrencyCode);
  const livePrice = quoteSnapshot?.currentPrice || formData.currentPrice;
  const accentColor = isPhysicalMetal ? (METAL_ACCENT[formData.type] ?? '#4f46e5') : '#4f46e5';

  // Load voice draft
  useEffect(() => {
    const draft = takeVoiceDraft<VoiceInvestmentDraft>(VOICE_INVESTMENT_DRAFT_KEY);
    if (draft) {
      setFormData(prev => ({ ...prev, name: draft.description || '', purchasePrice: draft.amount || 0 }));
    }
  }, []);

  const handleSelectStock = async (stock: StockSearchResult) => {
    const nextType = stock.symbol.endsWith('-USD') ? 'crypto' : (formData.type === 'crypto' ? 'crypto' : 'stocks');
    setSelectedSymbol(stock.symbol);
    setFormData(prev => ({ ...prev, name: displaySymbol(stock.symbol), type: nextType }));
    setShowSuggestions(false);

    setFetchingPrice(true);
    try {
      const quote = await fetchStockQuote(stock.symbol, nextType === 'crypto' ? 'crypto' : undefined);
      if (quote) {
        setQuoteSnapshot({ currentPrice: quote.lastPrice, currencyCode: normalizeCurrencyCode(quote.currencyCode || quote.currency) });
        setFormData(prev => ({ ...prev, currentPrice: quote.lastPrice, purchasePrice: prev.purchasePrice || quote.lastPrice }));
      }
    } finally {
      setFetchingPrice(false);
    }
  };

  useEffect(() => {
    if (!isMarketAsset || !formData.name || formData.name.length < 2 || !showSuggestions) return;
    setSearching(true);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      const results = await searchStocks(formData.name, formData.type === 'crypto' ? 'crypto' : undefined);
      setSearchResults(results);
      setSearching(false);
    }, 300);
  }, [formData.name, formData.type, isMarketAsset, showSuggestions]);

  // Handle OCR extracted data
  const handleOcrExtracted = (data: ExtractedAssetMetadata) => {
    if (data.assetType && PHYSICAL_METALS.includes(data.assetType as InvestmentFormType)) {
      setFormData(prev => ({ ...prev, type: data.assetType as InvestmentFormType }));
    }
    setPhysicalMeta(prev => ({
      ...prev,
      weightValue: data.weight ?? prev.weightValue,
      weightUnit: 'g',
      purity: data.purity ?? prev.purity,
      form: data.form ?? prev.form,
      hallmarkNumber: data.hallmarkNumber ?? prev.hallmarkNumber,
      jewelerName: data.jewelerName ?? prev.jewelerName,
    }));
    if (data.price && data.price > 0) {
      setFormData(prev => ({ ...prev, purchasePrice: data.price! }));
    }
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) { toast.error('Enter asset name'); return; }

    if (isPhysicalMetal) {
      if (physicalMeta.weightValue <= 0) { toast.error('Enter weight for physical metal'); return; }
    } else {
      if (formData.quantity <= 0) { toast.error('Enter quantity'); return; }
    }
    if (formData.purchasePrice <= 0 && !isPhysicalMetal) {
      toast.error('Enter purchase price'); return;
    }

    setIsSubmitting(true);
    try {
      const assetTypeMap: Record<InvestmentFormType, string> = {
        stocks: 'stock', crypto: 'crypto', 'mutual-funds': 'other', bonds: 'other',
        gold: 'gold', silver: 'silver', platinum: 'platinum', bronze: 'bronze',
        'real-estate': 'real_estate', business: 'business', other: 'other',
      };

      const buyFxRate = await fetchCurrencyConversionRate(assetCurrencyCode, currency);

      // Build metadata object
      let metadata: Record<string, any> = {};
      if (isPhysicalMetal) {
        const weightGrams = toGrams(physicalMeta.weightValue, physicalMeta.weightUnit);
        metadata = {
          weightGrams,
          weightValue: physicalMeta.weightValue,
          weightUnit: physicalMeta.weightUnit,
          purity: physicalMeta.purity,
          form: physicalMeta.form,
          hallmarkNumber: physicalMeta.hallmarkNumber,
          jewelerName: physicalMeta.jewelerName,
          lockerName: physicalMeta.lockerName,
          ownershipTag: physicalMeta.ownershipTag,
        };
      } else if (isRealEstate) {
        metadata = { ...realEstateMeta };
      } else if (isBusiness) {
        metadata = { ...businessMeta };
      }

      // For physical metals: quantity = weight in grams, purchasePrice = per-gram price
      const quantity = isPhysicalMetal
        ? toGrams(physicalMeta.weightValue, physicalMeta.weightUnit)
        : formData.quantity;
      const purchasePrice = formData.purchasePrice;
      const totalPurchaseCost = (purchasePrice * quantity * buyFxRate) + formData.purchaseFees;

      await backendService.createInvestment({
        assetType: assetTypeMap[formData.type],
        assetName: selectedSymbol || formData.name,
        quantity,
        buyPrice: purchasePrice,
        currentPrice: livePrice || purchasePrice,
        totalInvested: totalPurchaseCost,
        currentValue: (livePrice || purchasePrice) * quantity * buyFxRate,
        profitLoss: ((livePrice || purchasePrice) * quantity * buyFxRate) - totalPurchaseCost,
        purchaseDate: new Date(formData.date),
        lastUpdated: new Date(),
        updatedAt: new Date(),
        broker: formData.broker,
        description: formData.description,
        assetCurrency: assetCurrencyCode,
        baseCurrency: currency,
        buyFxRate,
        fundingAccountId: formData.fundingAccountId,
        purchaseFees: formData.purchaseFees,
        metadata,
      } as any);

      toast.success('Investment added successfully');
      refreshData();
      setCurrentPage('investments');
    } catch (e) {
      console.error(e);
      toast.error('Failed to save investment');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-white">

      {/* Header */}
      <header className="px-4 lg:px-6 py-4 bg-white border-b border-slate-100">
        <div className="flex flex-row flex-wrap items-center justify-between gap-4 w-full">
          <div className="flex items-center gap-3">
            <button onClick={() => setCurrentPage('investments')} className="lg:!hidden p-2 text-slate-600 hover:bg-slate-50 rounded-xl transition-all">
              <ChevronLeft size={20} />
            </button>
            <h1 className="text-xl font-black text-slate-900 tracking-tight leading-none">Add Investment</h1>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={() => setCurrentPage('investments')} className="hidden sm:block text-[10px] font-black uppercase text-slate-400 hover:text-slate-600 tracking-widest px-4">Cancel</button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="bg-slate-900 text-white px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-slate-200 hover:bg-slate-800 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />}
              Add to Portfolio
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-3 lg:p-5 grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-5 pb-32 lg:pb-5">

        {/* Left Column */}
        <div className="lg:col-span-7 flex flex-col gap-3 lg:overflow-y-auto">

          {/* Asset Type Selector */}
          <div className="premium-glass-card p-4 space-y-4">
            <div className="space-y-1">
              <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Asset Category</label>
              <AssetTypeGrid selectedType={formData.type} onSelect={t => { setFormData(prev => ({ ...prev, type: t })); setQuoteSnapshot(null); setSelectedSymbol(null); }} />
            </div>

            {/* Asset Name / Search */}
            <div className="space-y-1 relative">
              <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">
                {isPhysicalMetal ? 'Asset Name / Description' : isRealEstate ? 'Property Name' : isBusiness ? 'Business Name' : 'Asset Search / Name'}
              </label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => { setFormData(prev => ({ ...prev, name: e.target.value })); if (isMarketAsset) setShowSuggestions(true); }}
                  className="w-full bg-slate-50 border-none rounded-xl py-2.5 pl-9 pr-3 font-bold text-slate-900 text-xs"
                  placeholder={
                    isMarketAsset ? 'Search Symbol (AAPL, BTC...)' :
                    isPhysicalMetal ? 'e.g. Gold Necklace, 22K Ring' :
                    isRealEstate ? 'e.g. 2BHK Apartment, Chennai' :
                    isBusiness ? 'e.g. Family Textile Shop' : 'Asset Name'
                  }
                />
                {fetchingPrice && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-indigo-500" size={12} />}
              </div>

              {/* Autocomplete */}
              {showSuggestions && (searchResults.length > 0 || searching) && (
                <div className="absolute z-50 top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
                  {searching ? (
                    <div className="p-4 text-center text-[9px] font-black text-slate-300 uppercase tracking-widest">Searching Market...</div>
                  ) : searchResults.slice(0, 5).map(r => (
                    <button key={r.symbol} onClick={() => handleSelectStock(r)} className="w-full flex items-center justify-between p-3 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0">
                      <div className="text-left">
                        <p className="text-xs font-black text-slate-900">{displaySymbol(r.symbol)}</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase truncate max-w-[180px]">{r.companyName}</p>
                      </div>
                      <ArrowUpRight size={14} className="text-slate-300" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Physical Metal section */}
            {isPhysicalMetal && (
              <>
                <OcrBillScanner onExtracted={handleOcrExtracted} accentColor={accentColor} />
                <PhysicalAssetForm
                  metalType={formData.type}
                  metadata={physicalMeta}
                  onChange={(k, v) => setPhysicalMeta(prev => ({ ...prev, [k]: v }))}
                />
              </>
            )}

            {/* Real Estate section */}
            {isRealEstate && (
              <RealEstateForm
                metadata={realEstateMeta}
                onChange={(k, v) => setRealEstateMeta(prev => ({ ...prev, [k]: v }))}
              />
            )}

            {/* Business section */}
            {isBusiness && (
              <BusinessForm
                metadata={businessMeta}
                onChange={(k, v) => setBusinessMeta(prev => ({ ...prev, [k]: v }))}
              />
            )}

            {/* Broker & Date */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Broker / Platform</label>
                <div className="relative">
                  <Globe className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
                  <input type="text" value={formData.broker} onChange={e => setFormData(prev => ({ ...prev, broker: e.target.value }))} className="w-full bg-slate-50 border-none rounded-xl py-2.5 pl-9 pr-3 font-bold text-slate-900 text-xs" placeholder="e.g. Zerodha" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Date</label>
                <div className="relative">
                  <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
                  <input type="date" value={formData.date} onChange={e => setFormData(prev => ({ ...prev, date: e.target.value }))} className="w-full bg-slate-50 border-none rounded-xl py-2.5 pl-9 pr-3 font-bold text-xs" />
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Notes</label>
              <textarea value={formData.description} onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))} className="w-full bg-slate-50 border-none rounded-xl py-2.5 px-3 font-bold text-slate-900 text-xs min-h-[60px] resize-none" placeholder="Long term holding..." />
            </div>
          </div>

          {/* Account Source */}
          <div className="premium-glass-card p-4 space-y-3">
            <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Payment Account</label>
            <SearchableDropdown
              options={activeAccounts.map(a => ({
                value: String(a.id),
                label: a.name,
                description: `${currency} ${a.balance.toLocaleString()}`,
                icon: <div className="w-7 h-7 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400 font-black text-[8px]">{(a.type || 'BK').substring(0, 2).toUpperCase()}</div>
              }))}
              value={String(formData.fundingAccountId)}
              onChange={val => setFormData(prev => ({ ...prev, fundingAccountId: parseInt(val) }))}
              placeholder="Select Account"
              className="h-12 rounded-xl border-none bg-slate-50 font-bold text-xs"
            />
          </div>
        </div>

        {/* Right Column: Financials */}
        <div className="lg:col-span-5 flex flex-col gap-4 lg:overflow-y-auto">

          <div className="premium-glass-card p-5 bg-white relative overflow-hidden">
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-indigo-500/5 blur-[40px] rounded-full" />
            <div className="grid grid-cols-2 gap-6">
              {/* Quantity / Weight */}
              <div className="flex flex-col items-center">
                <span className="text-[8px] font-black text-slate-300 uppercase tracking-[0.2em] mb-2">
                  {isPhysicalMetal ? `Weight (${physicalMeta.weightUnit})` : 'Quantity'}
                </span>
                {isPhysicalMetal ? (
                  <input
                    type="number"
                    value={physicalMeta.weightValue || ''}
                    onChange={e => setPhysicalMeta(prev => ({ ...prev, weightValue: parseFloat(e.target.value) || 0 }))}
                    className="bg-transparent text-3xl font-black text-slate-900 outline-none w-full text-center tracking-tighter"
                    placeholder="0.00"
                  />
                ) : (
                  <input
                    type="number"
                    value={formData.quantity || ''}
                    onChange={e => setFormData(prev => ({ ...prev, quantity: parseFloat(e.target.value) || 0 }))}
                    className="bg-transparent text-3xl font-black text-slate-900 outline-none w-full text-center tracking-tighter"
                    placeholder="0.00"
                  />
                )}
              </div>
              <div className="flex flex-col items-center border-l border-slate-100">
                <span className="text-[8px] font-black text-slate-300 uppercase tracking-[0.2em] mb-2">
                  {isPhysicalMetal ? `Total Cost (${currency})` : `Buy Price (${assetCurrency})`}
                </span>
                <input
                  type="number"
                  value={formData.purchasePrice || ''}
                  onChange={e => setFormData(prev => ({ ...prev, purchasePrice: parseFloat(e.target.value) || 0 }))}
                  className="bg-transparent text-3xl font-black text-slate-900 outline-none w-full text-center tracking-tighter"
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>

          <div className="premium-glass-card p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Fees ({currency})</label>
                <input type="number" value={formData.purchaseFees || ''} onChange={e => setFormData(prev => ({ ...prev, purchaseFees: parseFloat(e.target.value) || 0 }))} className="w-full bg-slate-50 border-none rounded-xl py-2.5 px-3 font-bold text-xs" placeholder="0" />
              </div>
              <div className="text-right">
                <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest">Subtotal</p>
                <p className="text-xl font-black text-slate-900">
                  {assetCurrency} {isPhysicalMetal
                    ? formData.purchasePrice.toLocaleString()
                    : (formData.quantity * formData.purchasePrice).toLocaleString()}
                </p>
              </div>
            </div>

            {isMarketAsset && selectedSymbol && (
              <div className="p-3 bg-indigo-50 border border-indigo-100/50 rounded-xl flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0"><BarChart3 size={16} className="text-white" /></div>
                <div className="flex-1">
                  <p className="text-[8px] font-black text-indigo-600 uppercase tracking-widest">Live Market Pulse</p>
                  <p className="text-[10px] font-bold text-slate-700">Trading at <span className="text-indigo-600">{assetCurrency} {livePrice.toLocaleString()}</span></p>
                </div>
              </div>
            )}

            <div className="p-3 bg-slate-900 rounded-xl text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center"><Shield size={16} className="text-indigo-400" /></div>
                <div>
                  <p className="text-[8px] font-black text-white/40 uppercase tracking-widest">Portfolio Exposure</p>
                  <p className="text-[10px] font-bold">This {formData.type} asset adds to your wealth mix.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Total Summary Footer */}
          <div
            className="mt-auto p-4 rounded-2xl text-white flex items-center justify-between shadow-xl"
            style={{
              background: isPhysicalMetal
                ? `linear-gradient(135deg, ${accentColor}CC, ${accentColor}88)`
                : 'linear-gradient(135deg, #4f46e5, #7c3aed)',
              boxShadow: isPhysicalMetal ? `0 8px 32px ${accentColor}33` : '0 8px 32px rgba(79,70,229,0.25)',
            }}
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center"><TrendingUp size={16} className="text-white" /></div>
              <div>
                <p className="text-[8px] font-black text-white/60 uppercase">Total Investment</p>
                <p className="text-[10px] font-black truncate max-w-[120px]">{formData.name || 'New Asset'}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[8px] font-black text-white/60 uppercase">Total Capital</p>
              <p className="text-lg font-black tracking-tighter">
                {currency} {(formData.purchasePrice + formData.purchaseFees).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
