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
    <div className="w-full space-y-2.5">
      {/* Main Category Bar (Auto-resizing scrollable pill matching AddTransaction) */}
      <div className="flex items-center justify-start sm:justify-center bg-slate-100/90 rounded-full p-1 gap-1 w-full max-w-xl mx-auto overflow-x-auto no-scrollbar scrollbar-none">
        {CATEGORY_CONFIGS.map(cat => {
          const isActive = selectedCategory === cat.code;
          return (
            <button
              key={cat.code}
              type="button"
              onClick={() => onSelectCategory(cat.code, cat.subcategories[0].code)}
              data-testid={`investment-category-tab-${cat.code}`}
              className={cn(
                'flex-1 min-w-max flex items-center justify-center gap-1.5 py-2 px-3 sm:px-5 rounded-full font-black text-[11px] sm:text-xs uppercase tracking-wider transition-all duration-200 cursor-pointer select-none shrink-0',
                isActive
                  ? 'bg-slate-900 text-white shadow-sm scale-[1.02]'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
              )}
            >
              <span>{cat.icon}</span>
              <span className="whitespace-nowrap">{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* Subcategory Responsive Pills Bar (Auto-resizing flex pills) */}
      <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2 max-w-4xl mx-auto w-full px-1">
        {currentCategoryConfig.subcategories.map(sub => {
          const isActive = selectedSubcategory === sub.code;
          return (
            <button
              key={sub.code}
              type="button"
              onClick={() => onSelectSubcategory(sub.code)}
              data-testid={`investment-subcategory-pill-${sub.code}`}
              className={cn(
                'flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-full text-[10px] sm:text-xs font-bold tracking-wider uppercase transition-all duration-150 cursor-pointer select-none',
                isActive
                  ? 'bg-white text-slate-900 border border-slate-300 shadow-sm scale-[1.02] font-black'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-800 border border-slate-200/60'
              )}
            >
              <span className="text-xs sm:text-sm">{sub.icon}</span>
              <span>{sub.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
