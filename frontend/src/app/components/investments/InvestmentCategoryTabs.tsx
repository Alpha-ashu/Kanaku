import React from 'react';
import { MainCategoryCode, SubcategoryCode } from '@/types/investmentV2';
import { ArrowUpRight, ArrowDownLeft, Repeat } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CategoryTabConfig {
  code: MainCategoryCode;
  label: string;
  icon: React.ReactNode;
  subcategories: { code: SubcategoryCode; label: string; icon: string }[];
}

export const CATEGORY_CONFIGS: CategoryTabConfig[] = [
  {
    code: 'market_assets',
    label: 'Market Assets',
    icon: <ArrowUpRight size={14} className="stroke-[2.5]" />,
    subcategories: [
      { code: 'stocks', label: 'Stocks', icon: '📈' },
      { code: 'mutual_funds', label: 'Mutual Funds', icon: '📊' },
      { code: 'etf', label: 'ETF', icon: '📉' },
      { code: 'bonds', label: 'Bonds', icon: '📜' },
      { code: 'fd', label: 'Fixed Deposit', icon: '🏦' },
      { code: 'rd', label: 'Recurring Deposit', icon: '🔄' },
      { code: 'crypto', label: 'Crypto', icon: '₿' },
      { code: 'forex', label: 'Forex', icon: '💱' },
      { code: 'commodities', label: 'Commodities', icon: '🛢️' },
      { code: 'market_others', label: 'Others', icon: '💼' },
    ],
  },
  {
    code: 'physical_assets',
    label: 'Physical Assets',
    icon: <ArrowDownLeft size={14} className="stroke-[2.5]" />,
    subcategories: [
      { code: 'gold', label: 'Gold', icon: '🥇' },
      { code: 'silver', label: 'Silver', icon: '🥈' },
      { code: 'physical_others', label: 'Others', icon: '💎' },
    ],
  },
  {
    code: 'other_investments',
    label: 'Other Investments',
    icon: <Repeat size={14} className="stroke-[2.5]" />,
    subcategories: [
      { code: 'property', label: 'Property', icon: '🏠' },
      { code: 'business', label: 'Business', icon: '🏢' },
      { code: 'collectibles', label: 'Collectibles', icon: '🎨' },
      { code: 'private_equity', label: 'Private Equity', icon: '🤝' },
      { code: 'other_investments_others', label: 'Others', icon: '💼' },
    ],
  },
];

interface InvestmentCategoryTabsProps {
  selectedCategory: MainCategoryCode;
  selectedSubcategory: SubcategoryCode;
  onSelectCategory: (category: MainCategoryCode, defaultSubcategory: SubcategoryCode) => void;
  onSelectSubcategory: (subcategory: SubcategoryCode) => void;
}

export const InvestmentCategoryTabs: React.FC<InvestmentCategoryTabsProps> = ({
  selectedCategory,
  selectedSubcategory,
  onSelectCategory,
  onSelectSubcategory,
}) => {
  const currentCategoryConfig = CATEGORY_CONFIGS.find(c => c.code === selectedCategory) || CATEGORY_CONFIGS[0];

  return (
    <div className="w-full space-y-3">
      {/* Main Category Tabs (Non-truncating 3-column segmented control) */}
      <div className="grid grid-cols-3 bg-slate-100/90 rounded-2xl sm:rounded-full p-1 sm:p-1.5 gap-1 sm:gap-1.5 w-full max-w-md mx-auto border border-slate-200/80 shadow-xs">
        {CATEGORY_CONFIGS.map(cat => {
          const isActive = selectedCategory === cat.code;
          const label = cat.code === 'market_assets' ? 'Market' : cat.code === 'physical_assets' ? 'Physical' : 'Others';
          return (
            <button
              key={cat.code}
              type="button"
              onClick={() => onSelectCategory(cat.code, cat.subcategories[0].code)}
              data-testid={`investment-category-tab-${cat.code}`}
              className={cn(
                'flex items-center justify-center gap-1.5 sm:gap-2 py-2 sm:py-2.5 px-2 sm:px-4 rounded-xl sm:rounded-full font-black text-2xs sm:text-xs uppercase tracking-wider transition-all duration-200 cursor-pointer select-none text-center whitespace-nowrap',
                isActive
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200/70 scale-[1.01]'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-white/50'
              )}
            >
              <span className={cn('shrink-0 transition-transform duration-200', isActive && 'scale-110 text-indigo-600')}>{cat.icon}</span>
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      {/* Subcategory Grid (Column x Row structured layout - no horizontal clipping or scrollbar) */}
      <div className="w-full max-w-3xl mx-auto">
        <div
          className={cn(
            'grid gap-1.5 sm:gap-2 w-full',
            currentCategoryConfig.code === 'market_assets'
              ? 'grid-cols-2 sm:grid-cols-5'
              : currentCategoryConfig.code === 'physical_assets'
              ? 'grid-cols-3'
              : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-5'
          )}
        >
          {currentCategoryConfig.subcategories.map(sub => {
            const isActive = selectedSubcategory === sub.code;
            return (
              <button
                key={sub.code}
                type="button"
                onClick={() => onSelectSubcategory(sub.code)}
                data-testid={`investment-subcategory-pill-${sub.code}`}
                className={cn(
                  'flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl text-2xs sm:text-xs font-bold tracking-wide uppercase transition-all duration-200 cursor-pointer select-none border text-center shadow-xs active:scale-95',
                  isActive
                    ? 'bg-slate-900 text-white border-slate-900 shadow-sm ring-2 ring-indigo-500/20 scale-[1.01]'
                    : 'bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 border-slate-200/80 shadow-2xs hover:border-slate-300'
                )}
              >
                <span className="text-xs sm:text-sm shrink-0">{sub.icon}</span>
                <span className="whitespace-nowrap">{sub.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
