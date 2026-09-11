import React from 'react';
import { useApp } from '@/contexts/AppContext';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children?: React.ReactNode;
  showBack?: boolean;
  backTo?: string;
  onBack?: () => void;
  className?: string;
}

export const PageHeaderCard: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  icon,
  children,
  showBack,
  backTo = 'dashboard',
  onBack,
  className,
}) => {
  const { setCurrentPage, goBack, currentPage } = useApp();

  const handleBackClick = () => {
    if (onBack) {
      onBack();
    } else if (backTo && backTo !== 'dashboard') {
      setCurrentPage(backTo);
    } else {
      goBack();
    }
  };

  // Automatically show back button on all non-dashboard pages by default
  const shouldShowBack = showBack !== undefined ? showBack : (currentPage !== 'dashboard');

  return (
    <header className={cn('relative mb-6 sm:mb-8 w-full', className)}>
      <div className="flex flex-row flex-wrap items-center justify-between gap-3 sm:gap-4 w-full">
        <div className="flex items-center gap-3 sm:gap-3.5 min-w-0">
          {shouldShowBack && (
            <button
              data-testid="page-header-go-back"
              onClick={handleBackClick}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white border border-slate-200/80 hover:bg-slate-50 active:scale-95 shadow-xs flex items-center justify-center text-slate-700 transition-all shrink-0 cursor-pointer"
              aria-label="Go back"
              title="Go back"
            >
              <ChevronLeft className="w-5 h-5 text-slate-700" />
            </button>
          )}

          {icon && (
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white border border-slate-200/80 shadow-xs flex items-center justify-center text-slate-800 shrink-0">
              {icon}
            </div>
          )}

          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-slate-900 tracking-tight leading-tight truncate">
              {title}
            </h1>
            {subtitle && (
              <p className="text-xs sm:text-sm text-slate-400 font-medium mt-0.5 truncate">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {children && (
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
            {children}
          </div>
        )}
      </div>
    </header>
  );
};

export const HeaderActions = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <div className={cn('flex items-center gap-2 sm:gap-3 flex-wrap', className)}>
    {children}
  </div>
);

export const SegmentedTabs = ({
  tabs,
  activeTab,
  onChange,
}: {
  tabs: { id: string; label: string; icon?: React.ReactNode }[];
  activeTab: string;
  onChange: (id: string) => void;
}) => (
  <div className="p-1 bg-white/95 backdrop-blur-md rounded-full flex items-center gap-1 border border-slate-200/80 shadow-xs max-w-full overflow-x-auto scrollbar-hide shrink-0">
    {tabs.map((tab) => {
      const isActive = activeTab === tab.id;
      return (
        <button
          data-testid={`page-header-button-${tab.id}`}
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            'flex items-center justify-center gap-1.5 px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-bold transition-all whitespace-nowrap cursor-pointer',
            isActive
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/60'
          )}
        >
          {tab.icon && (
            <span className={isActive ? 'text-white' : 'text-slate-400'}>
              {tab.icon}
            </span>
          )}
          <span>{tab.label}</span>
        </button>
      );
    })}
  </div>
);

export const PrimaryActionButton = ({
  onClick,
  children,
  icon,
  className,
  variant = 'primary',
}: {
  onClick?: () => void;
  children: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
  variant?: 'primary' | 'secondary';
}) => {
  return (
    <button
      data-testid="page-header-button-2"
      onClick={onClick}
      className={cn(
        'flex items-center justify-center gap-1.5 sm:gap-2 px-4 sm:px-6 py-2 sm:py-2.5 rounded-full font-bold transition-all active:scale-95 whitespace-nowrap text-xs sm:text-sm shadow-xs cursor-pointer shrink-0',
        variant === 'primary'
          ? 'bg-slate-950 text-white hover:bg-slate-800'
          : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50',
        className
      )}
    >
      {icon && <span>{icon}</span>}
      <span>{children}</span>
    </button>
  );
};

export const SearchHeader = ({
  value,
  onChange,
  placeholder = 'Search...',
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}) => (
  <div className="relative group min-w-[200px] sm:min-w-[280px] shrink-0">
    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-slate-400">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={16}
        height={16}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
    </div>
    <input
      data-testid="page-header-placeholder"
      type="text"
      id="page-header-search"
      name="page-header-search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full h-10 sm:h-11 pl-10 pr-4 bg-white border border-slate-200/80 rounded-full focus:ring-2 focus:ring-blue-500/20 text-xs sm:text-sm font-semibold text-slate-900 placeholder:text-slate-400 transition-all shadow-2xs"
    />
  </div>
);

// Alias PageHeader to PageHeaderCard for backward compatibility
export const PageHeader = PageHeaderCard;
