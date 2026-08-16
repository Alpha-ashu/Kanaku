import React from 'react';

interface IconProps {
 size?: number;
 className?: string;
}

// Helper for premium gloss effect
const GlossOverlay: React.FC<{ size: number }> = ({ size }) => (
 <circle cx="32" cy="32" r="28" fill="url(#glossGradient)" opacity="0.3" pointerEvents="none" />
);

const Gradients = () => (
 <svg className="hidden-svg" aria-hidden="true">
 <defs>
 <linearGradient id="glossGradient" x1="0%" y1="0%" x2="100%" y2="100%">
 <stop offset="0%" stopColor="white" stopOpacity="0.8" />
 <stop offset="50%" stopColor="white" stopOpacity="0" />
 <stop offset="100%" stopColor="white" stopOpacity="0" />
 </linearGradient>
 <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
 <feGaussianBlur in="SourceAlpha" stdDeviation="1.5" />
 <feOffset dx="0" dy="1" result="offsetblur" />
 <feComponentTransfer>
 <feFuncA type="linear" slope="0.3" />
 </feComponentTransfer>
 <feMerge>
 <feMergeNode />
 <feMergeNode in="SourceGraphic" />
 </feMerge>
 </filter>
 </defs>
 </svg>
);

// --- EXPENSE ICONS ---

export const FoodIcon: React.FC<IconProps> = ({ size = 48, className = '' }) => (
 <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
 <defs>
 <linearGradient id="foodGrad" x1="0%" y1="0%" x2="100%" y2="100%">
 <stop offset="0%" stopColor="#FF6B6B" />
 <stop offset="100%" stopColor="#EE5253" />
 </linearGradient>
 </defs>
 <circle cx="32" cy="32" r="30" fill="url(#foodGrad)" />
 <g>
 <path d="M18 32 Q18 22, 32 22 Q46 22, 46 32 Z" fill="#FFD93D" />
 <rect x="16" y="32" width="32" height="6" rx="2" fill="#8B4513" />
 <rect x="16" y="38" width="32" height="4" rx="1" fill="#4CD137" />
 <path d="M16 42 Q16 50, 32 50 Q48 50, 48 42 Z" fill="#FFD93D" />
 </g>
 <circle cx="32" cy="32" r="28" fill="white" opacity="0.15" />
 </svg>
);

export const TransportationIcon: React.FC<IconProps> = ({ size = 48, className = '' }) => (
 <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
 <circle cx="32" cy="32" r="30" fill="#F9CA24" />
 <g>
 <rect x="18" y="22" width="28" height="22" rx="4" fill="#EB4D4B" />
 <rect x="22" y="26" width="8" height="6" rx="1" fill="#DFF9FB" />
 <rect x="34" y="26" width="8" height="6" rx="1" fill="#DFF9FB" />
 <rect x="22" y="36" width="20" height="2" fill="white" opacity="0.4" />
 <circle cx="24" cy="46" r="4" fill="#2F3542" />
 <circle cx="40" cy="46" r="4" fill="#2F3542" />
 </g>
 <circle cx="32" cy="32" r="28" fill="white" opacity="0.15" />
 </svg>
);

export const HousingIcon: React.FC<IconProps> = ({ size = 48, className = '' }) => (
 <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
 <circle cx="32" cy="32" r="30" fill="#4834D4" />
 <g>
 <path d="M16 34 L32 18 L48 34 L48 50 L16 50 Z" fill="#F9F9F9" />
 <path d="M14 34 L32 16 L50 34" stroke="#686DE0" strokeWidth="4" fill="none" strokeLinecap="round" />
 <rect x="28" y="38" width="8" height="12" fill="#30336B" rx="1" />
 <circle cx="24" cy="28" r="2" fill="#B2BEC3" />
 </g>
 <circle cx="32" cy="32" r="28" fill="white" opacity="0.15" />
 </svg>
);

export const ShoppingIcon: React.FC<IconProps> = ({ size = 48, className = '' }) => (
 <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
 <circle cx="32" cy="32" r="30" fill="#BE2EDD" />
 <g>
 <path d="M20 28 L22 52 L42 52 L44 28 Z" fill="#F8EFBA" />
 <path d="M26 28 Q26 18, 32 18 Q38 18, 38 28" fill="none" stroke="#535C68" strokeWidth="3" strokeLinecap="round" />
 <rect x="28" y="34" width="8" height="8" rx="1" fill="#BE2EDD" opacity="0.6" />
 </g>
 <circle cx="32" cy="32" r="28" fill="white" opacity="0.15" />
 </svg>
);

export const EntertainmentIcon: React.FC<IconProps> = ({ size = 48, className = '' }) => (
 <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
 <circle cx="32" cy="32" r="30" fill="#F0932B" />
 <g>
 <rect x="18" y="24" width="28" height="20" rx="2" fill="white" />
 <path d="M28 28 L40 34 L28 40 Z" fill="#EB4D4B" />
 <rect x="20" y="46" width="24" height="4" rx="2" fill="#535C68" />
 </g>
 <circle cx="32" cy="32" r="28" fill="white" opacity="0.15" />
 </svg>
);

export const HealthIcon: React.FC<IconProps> = ({ size = 48, className = '' }) => (
 <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
 <circle cx="32" cy="32" r="30" fill="#22A6B3" />
 <g>
 <rect x="20" y="20" width="24" height="24" rx="4" fill="white" />
 <rect x="28" y="24" width="8" height="16" fill="#EB4D4B" />
 <rect x="24" y="28" width="16" height="8" fill="#EB4D4B" />
 </g>
 <circle cx="32" cy="32" r="28" fill="white" opacity="0.15" />
 </svg>
);

export const UtilitiesIcon: React.FC<IconProps> = ({ size = 48, className = '' }) => (
 <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
 <circle cx="32" cy="32" r="30" fill="#7ED6DF" />
 <g>
 <path d="M32 18 Q42 18, 42 32 Q42 40, 36 44 L28 44 Q22 40, 22 32 Q22 18, 32 18" fill="#F9CA24" />
 <rect x="28" y="44" width="8" height="4" fill="#95AFC0" />
 <line x1="32" y1="24" x2="32" y2="36" stroke="white" strokeWidth="2" strokeLinecap="round" />
 </g>
 <circle cx="32" cy="32" r="28" fill="white" opacity="0.15" />
 </svg>
);

export const TravelIcon: React.FC<IconProps> = ({ size = 48, className = '' }) => (
 <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
 <circle cx="32" cy="32" r="30" fill="#686DE0" />
 <g>
 <path d="M32 20 L36 30 L48 34 L36 38 L32 50 L28 38 L16 34 L28 30 Z" fill="white" />
 <circle cx="32" cy="34" r="3" fill="#686DE0" />
 </g>
 <circle cx="32" cy="32" r="28" fill="white" opacity="0.15" />
 </svg>
);

export const EducationIcon: React.FC<IconProps> = ({ size = 48, className = '' }) => (
 <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
 <circle cx="32" cy="32" r="30" fill="#30336B" />
 <g>
 <rect x="18" y="22" width="28" height="26" rx="2" fill="#F9F9F9" />
 <rect x="16" y="20" width="32" height="6" rx="1" fill="#EB4D4B" />
 <line x1="24" y1="32" x2="40" y2="32" stroke="#D1D8E0" strokeWidth="2" />
 <line x1="24" y1="38" x2="40" y2="38" stroke="#D1D8E0" strokeWidth="2" />
 </g>
 <circle cx="32" cy="32" r="28" fill="white" opacity="0.15" />
 </svg>
);

export const InvestmentIcon: React.FC<IconProps> = ({ size = 48, className = '' }) => (
 <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
 <circle cx="32" cy="32" r="30" fill="#10B981" />
 <g>
 <path d="M18 44 L28 34 L36 40 L46 26" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
 <path d="M38 26 L46 26 L46 34" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
 <circle cx="46" cy="26" r="3" fill="#FFD93D" />
 </g>
 <circle cx="32" cy="32" r="28" fill="white" opacity="0.15" />
 </svg>
);

export const ElectronicsIcon: React.FC<IconProps> = ({ size = 48, className = '' }) => (
 <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
 <circle cx="32" cy="32" r="30" fill="#535C68" />
 <g>
 <rect x="22" y="18" width="20" height="28" rx="3" fill="#DFF9FB" />
 <rect x="24" y="20" width="16" height="20" rx="1" fill="#130F40" />
 <circle cx="32" cy="43" r="2" fill="#130F40" />
 </g>
 <circle cx="32" cy="32" r="28" fill="white" opacity="0.15" />
 </svg>
);

export const PersonalCareIcon: React.FC<IconProps> = ({ size = 48, className = '' }) => (
 <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
 <circle cx="32" cy="32" r="30" fill="#FF7979" />
 <g>
 <ellipse cx="32" cy="28" rx="12" ry="14" fill="white" />
 <ellipse cx="32" cy="28" rx="9" ry="11" fill="#FAD3CF" />
 <rect x="30" y="42" width="4" height="10" rx="1" fill="#95AFC0" />
 </g>
 <circle cx="32" cy="32" r="28" fill="white" opacity="0.15" />
 </svg>
);

export const FamilyIcon: React.FC<IconProps> = ({ size = 48, className = '' }) => (
 <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
 <circle cx="32" cy="32" r="30" fill="#686DE0" />
 <g>
 <circle cx="26" cy="28" r="6" fill="white" />
 <path d="M18 48 Q18 38, 26 38 Q34 38, 34 48" fill="white" />
 <circle cx="40" cy="32" r="5" fill="#DFF9FB" />
 <path d="M34 48 Q34 40, 40 40 Q46 40, 46 48" fill="#DFF9FB" />
 </g>
 <circle cx="32" cy="32" r="28" fill="white" opacity="0.15" />
 </svg>
);

export const FinanceIcon: React.FC<IconProps> = ({ size = 48, className = '' }) => (
 <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
 <circle cx="32" cy="32" r="30" fill="#4834D4" />
 <g>
 <rect x="16" y="24" width="32" height="20" rx="3" fill="#130F40" />
 <rect x="16" y="28" width="32" height="5" fill="#F9CA24" />
 <rect x="38" y="38" width="6" height="2" rx="1" fill="white" />
 </g>
 <circle cx="32" cy="32" r="28" fill="white" opacity="0.15" />
 </svg>
);

export const GiftsIcon: React.FC<IconProps> = ({ size = 48, className = '' }) => (
 <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
 <circle cx="32" cy="32" r="30" fill="#EB4D4B" />
 <g>
 <rect x="18" y="30" width="28" height="20" rx="2" fill="#F9F9F9" />
 <rect x="16" y="26" width="32" height="6" rx="1" fill="white" />
 <rect x="30" y="26" width="4" height="24" fill="#EB4D4B" />
 </g>
 <circle cx="32" cy="32" r="28" fill="white" opacity="0.15" />
 </svg>
);

export const FitnessIcon: React.FC<IconProps> = ({ size = 48, className = '' }) => (
 <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
 <circle cx="32" cy="32" r="30" fill="#22A6B3" />
 <g>
 <rect x="20" y="28" width="24" height="8" rx="2" fill="#535C68" />
 <rect x="14" y="24" width="6" height="16" rx="2" fill="#2F3542" />
 <rect x="44" y="24" width="6" height="16" rx="2" fill="#2F3542" />
 </g>
 <circle cx="32" cy="32" r="28" fill="white" opacity="0.15" />
 </svg>
);

export const PetsIcon: React.FC<IconProps> = ({ size = 48, className = '' }) => (
 <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
 <circle cx="32" cy="32" r="30" fill="#F0932B" />
 <g>
 <circle cx="32" cy="38" r="10" fill="#78350F" />
 <circle cx="22" cy="24" r="5" fill="#78350F" />
 <circle cx="42" cy="24" r="5" fill="#78350F" />
 <circle cx="26" cy="16" r="4" fill="#78350F" />
 <circle cx="38" cy="16" r="4" fill="#78350F" />
 </g>
 <circle cx="32" cy="32" r="28" fill="white" opacity="0.15" />
 </svg>
);

export const TaxesIcon: React.FC<IconProps> = ({ size = 48, className = '' }) => (
 <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
 <circle cx="32" cy="32" r="30" fill="#686DE0" />
 <g>
 <rect x="20" y="18" width="24" height="32" rx="2" fill="white" />
 <line x1="24" y1="26" x2="36" y2="26" stroke="#D1D8E0" strokeWidth="2" />
 <text x="32" y="44" textAnchor="middle" fontSize="14" fontWeight="black" fill="#EB4D4B">%</text>
 </g>
 <circle cx="32" cy="32" r="28" fill="white" opacity="0.15" />
 </svg>
);

export const MiscIcon: React.FC<IconProps> = ({ size = 48, className = '' }) => (
 <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
 <circle cx="32" cy="32" r="30" fill="#95AFC0" />
 <g>
 <rect x="24" y="24" width="16" height="16" rx="2" fill="white" />
 <circle cx="32" cy="32" r="4" fill="#95AFC0" />
 </g>
 <circle cx="32" cy="32" r="28" fill="white" opacity="0.15" />
 </svg>
);

// --- INCOME ICONS ---

export const SalaryIcon: React.FC<IconProps> = ({ size = 48, className = '' }) => (
 <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
 <circle cx="32" cy="32" r="30" fill="#10B981" />
 <g>
 <path d="M24 24 Q32 18, 40 24 L42 28 Q42 46, 32 50 Q22 46, 22 28 Z" fill="#F9CA24" />
 <text x="32" y="42" textAnchor="middle" fontSize="18" fontWeight="bold" fill="#78350F">$</text>
 </g>
 <circle cx="32" cy="32" r="28" fill="white" opacity="0.15" />
 </svg>
);

export const FreelanceIcon: React.FC<IconProps> = ({ size = 48, className = '' }) => (
 <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
 <circle cx="32" cy="32" r="30" fill="#4834D4" />
 <g>
 <rect x="18" y="22" width="28" height="20" rx="2" fill="#2F3542" />
 <rect x="20" y="24" width="24" height="16" rx="1" fill="#70A1FF" />
 <rect x="16" y="44" width="32" height="4" rx="2" fill="#535C68" />
 </g>
 <circle cx="32" cy="32" r="28" fill="white" opacity="0.15" />
 </svg>
);

export const BusinessIcon: React.FC<IconProps> = ({ size = 48, className = '' }) => (
 <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
 <circle cx="32" cy="32" r="30" fill="#686DE0" />
 <g>
 <rect x="20" y="18" width="24" height="32" rx="2" fill="white" />
 <rect x="24" y="22" width="16" height="4" fill="#D1D8E0" />
 <rect x="24" y="30" width="16" height="4" fill="#D1D8E0" />
 <rect x="28" y="44" width="8" height="6" fill="#2F3542" />
 </g>
 <circle cx="32" cy="32" r="28" fill="white" opacity="0.15" />
 </svg>
);

export const TransferIcon: React.FC<IconProps> = ({ size = 48, className = '' }) => (
 <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
 <circle cx="32" cy="32" r="30" fill="#4834D4" />
 <g>
 <path d="M18 28 L46 28 L38 20" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
 <path d="M46 36 L18 36 L26 44" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
 </g>
 <circle cx="32" cy="32" r="28" fill="white" opacity="0.15" />
 </svg>
);

export const GoalIcon: React.FC<IconProps> = ({ size = 48, className = '' }) => (
 <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
 <circle cx="32" cy="32" r="30" fill="#F0932B" />
 <g>
 <circle cx="32" cy="32" r="16" fill="white" />
 <circle cx="32" cy="32" r="10" fill="#EB4D4B" />
 <circle cx="32" cy="32" r="4" fill="white" />
 </g>
 <circle cx="32" cy="32" r="28" fill="white" opacity="0.15" />
 </svg>
);

export const CalendarIcon: React.FC<IconProps> = ({ size = 48, className = '' }) => (
 <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
 <circle cx="32" cy="32" r="30" fill="#7ED6DF" />
 <g>
 <rect x="18" y="22" width="28" height="24" rx="3" fill="white" />
 <rect x="18" y="22" width="28" height="8" rx="1" fill="#EB4D4B" />
 <circle cx="24" cy="38" r="2" fill="#D1D8E0" />
 <circle cx="32" cy="38" r="2" fill="#D1D8E0" />
 <circle cx="40" cy="38" r="2" fill="#D1D8E0" />
 </g>
 <circle cx="32" cy="32" r="28" fill="white" opacity="0.15" />
 </svg>
);

export const MicIcon: React.FC<IconProps> = ({ size = 48, className = '' }) => (
 <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
 <circle cx="32" cy="32" r="30" fill="#BE2EDD" />
 <g>
 <rect x="26" y="18" width="12" height="20" rx="6" fill="white" />
 <path d="M20 30 Q20 42, 32 42 Q44 42, 44 30" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" />
 <line x1="32" y1="42" x2="32" y2="48" stroke="white" strokeWidth="3" />
 </g>
 <circle cx="32" cy="32" r="28" fill="white" opacity="0.15" />
 </svg>
);

export const WalletIcon: React.FC<IconProps> = ({ size = 48, className = '' }) => (
 <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
 <defs>
 <linearGradient id="walletGrad" x1="0%" y1="0%" x2="100%" y2="100%">
 <stop offset="0%" stopColor="#6C63FF" />
 <stop offset="100%" stopColor="#4F46E5" />
 </linearGradient>
 </defs>
 <circle cx="32" cy="32" r="30" fill="url(#walletGrad)" />
 <g>
 <rect x="14" y="22" width="36" height="20" rx="3" fill="white" />
 <rect x="14" y="22" width="36" height="8" rx="3" fill="#E8E8FF" />
 <circle cx="48" cy="36" r="3.5" fill="#6C63FF" />
 <line x1="16" y1="32" x2="26" y2="32" stroke="#6C63FF" strokeWidth="1.5" strokeLinecap="round" />
 <line x1="16" y1="38" x2="42" y2="38" stroke="#D0D0D0" strokeWidth="1" strokeLinecap="round" />
 </g>
 <circle cx="32" cy="32" r="28" fill="white" opacity="0.15" />
 </svg>
);

export const ChecklistIcon: React.FC<IconProps> = ({ size = 48, className = '' }) => (
 <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
 <defs>
 <linearGradient id="checklistGrad" x1="0%" y1="0%" x2="100%" y2="100%">
 <stop offset="0%" stopColor="#00D084" />
 <stop offset="100%" stopColor="#00B060" />
 </linearGradient>
 </defs>
 <circle cx="32" cy="32" r="30" fill="url(#checklistGrad)" />
 <g>
 <rect x="16" y="18" width="28" height="28" rx="2" fill="white" />
 <line x1="20" y1="26" x2="28" y2="34" stroke="#00D084" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
 <line x1="28" y1="34" x2="40" y2="18" stroke="#00D084" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
 <line x1="20" y1="40" x2="44" y2="40" stroke="#E0E0E0" strokeWidth="1.5" strokeLinecap="round" />
 </g>
 <circle cx="32" cy="32" r="28" fill="white" opacity="0.15" />
 </svg>
);

export const DashboardIcon: React.FC<IconProps> = ({ size = 48, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
    <defs>
      <linearGradient id="dashboardGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#3B82F6" />
        <stop offset="100%" stopColor="#1D4ED8" />
      </linearGradient>
    </defs>
    <circle cx="32" cy="32" r="30" fill="url(#dashboardGrad)" />
    <g>
      <rect x="16" y="16" width="13" height="13" rx="3" fill="white" />
      <rect x="35" y="16" width="13" height="13" rx="3" fill="white" />
      <rect x="16" y="35" width="13" height="13" rx="3" fill="white" />
      <rect x="35" y="35" width="13" height="13" rx="3" fill="#93C5FD" />
      <circle cx="22.5" cy="22.5" r="2" fill="#3B82F6" />
      <circle cx="41.5" cy="22.5" r="2" fill="#3B82F6" />
      <circle cx="22.5" cy="41.5" r="2" fill="#3B82F6" />
      <path d="M39 41.5 L44 41.5" stroke="#1D4ED8" strokeWidth="2" strokeLinecap="round" />
    </g>
    <circle cx="32" cy="32" r="28" fill="white" opacity="0.15" />
  </svg>
);

export const TransactionsIcon: React.FC<IconProps> = ({ size = 48, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
    <defs>
      <linearGradient id="transGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#10B981" />
        <stop offset="100%" stopColor="#059669" />
      </linearGradient>
    </defs>
    <circle cx="32" cy="32" r="30" fill="url(#transGrad)" />
    <g>
      <path d="M18 16 L46 16 L46 48 L42 45 L38 48 L34 45 L30 48 L26 45 L22 48 L18 45 Z" fill="white" />
      <line x1="24" y1="24" x2="40" y2="24" stroke="#D1D5DB" strokeWidth="2" strokeLinecap="round" />
      <line x1="24" y1="30" x2="36" y2="30" stroke="#D1D5DB" strokeWidth="2" strokeLinecap="round" />
      <circle cx="32" cy="38" r="4.5" fill="#10B981" />
      <text x="32" y="41.5" textAnchor="middle" fontSize="7" fontWeight="bold" fill="white">₹</text>
    </g>
    <circle cx="32" cy="32" r="28" fill="white" opacity="0.15" />
  </svg>
);

export const ReportsIcon: React.FC<IconProps> = ({ size = 48, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
    <defs>
      <linearGradient id="reportGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#8B5CF6" />
        <stop offset="100%" stopColor="#6D28D9" />
      </linearGradient>
    </defs>
    <circle cx="32" cy="32" r="30" fill="url(#reportGrad)" />
    <g>
      <rect x="18" y="34" width="6" height="14" rx="2" fill="white" />
      <rect x="29" y="24" width="6" height="24" rx="2" fill="#FDE047" />
      <rect x="40" y="16" width="6" height="32" rx="2" fill="white" />
      <path d="M21 30 L32 20 L43 12" fill="none" stroke="#FDE047" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </g>
    <circle cx="32" cy="32" r="28" fill="white" opacity="0.15" />
  </svg>
);

export const AdvisorIcon: React.FC<IconProps> = ({ size = 48, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
    <defs>
      <linearGradient id="advisorGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#0EA5E9" />
        <stop offset="100%" stopColor="#0284C7" />
      </linearGradient>
    </defs>
    <circle cx="32" cy="32" r="30" fill="url(#advisorGrad)" />
    <g>
      <circle cx="32" cy="22" r="7" fill="white" />
      <path d="M20 44 C20 35 25 33 32 33 C39 33 44 35 44 44 Z" fill="white" />
      <circle cx="42" cy="24" r="3" fill="#FDE047" />
      <path d="M30 35 L32 40 L34 35" fill="#0284C7" />
    </g>
    <circle cx="32" cy="32" r="28" fill="white" opacity="0.15" />
  </svg>
);

export const ScannerIcon: React.FC<IconProps> = ({ size = 48, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
    <defs>
      <linearGradient id="scannerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#EC4899" />
        <stop offset="100%" stopColor="#DB2777" />
      </linearGradient>
    </defs>
    <circle cx="32" cy="32" r="30" fill="url(#scannerGrad)" />
    <g>
      <rect x="20" y="18" width="24" height="28" rx="2" fill="white" />
      <line x1="24" y1="24" x2="36" y2="24" stroke="#F472B6" strokeWidth="2" strokeLinecap="round" />
      <line x1="24" y1="30" x2="40" y2="30" stroke="#E5E7EB" strokeWidth="2" strokeLinecap="round" />
      <line x1="24" y1="36" x2="34" y2="36" stroke="#E5E7EB" strokeWidth="2" strokeLinecap="round" />
      <path d="M15 22 L15 17 L20 17" fill="none" stroke="#FDE047" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M49 22 L49 17 L44 17" fill="none" stroke="#FDE047" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 42 L15 47 L20 47" fill="none" stroke="#FDE047" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M49 42 L49 47 L44 47" fill="none" stroke="#FDE047" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="16" y1="32" x2="48" y2="32" stroke="#FDE047" strokeWidth="2" strokeLinecap="round" opacity="0.9" />
    </g>
    <circle cx="32" cy="32" r="28" fill="white" opacity="0.15" />
  </svg>
);

export const NotificationBellIcon: React.FC<IconProps> = ({ size = 48, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
    <defs>
      <linearGradient id="bellGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#F59E0B" />
        <stop offset="100%" stopColor="#D97706" />
      </linearGradient>
    </defs>
    <circle cx="32" cy="32" r="30" fill="url(#bellGrad)" />
    <g>
      <path d="M32 16 C30 16 28 17 28 19 L28 20 C24 23 22 27 22 34 L20 38 C19 40 21 42 23 42 L41 42 C43 42 45 40 44 38 L42 34 C42 27 40 23 36 20 L36 19 C36 17 34 16 32 16 Z" fill="white" />
      <circle cx="32" cy="46" r="3" fill="white" />
      <circle cx="44" cy="20" r="3.5" fill="#EF4444" stroke="white" strokeWidth="1" />
    </g>
    <circle cx="32" cy="32" r="28" fill="white" opacity="0.15" />
  </svg>
);

export const RecurringIcon: React.FC<IconProps> = ({ size = 48, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
    <defs>
      <linearGradient id="recurGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#06B6D4" />
        <stop offset="100%" stopColor="#0891B2" />
      </linearGradient>
    </defs>
    <circle cx="32" cy="32" r="30" fill="url(#recurGrad)" />
    <g>
      <path d="M22 28 C24 22 30 18 37 20 C42 21 45 25 46 29" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M46 23 L46 29 L40 29" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M42 36 C40 42 34 46 27 44 C22 43 19 39 18 35" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M18 41 L18 35 L24 35" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="32" cy="32" r="3" fill="#FDE047" />
    </g>
    <circle cx="32" cy="32" r="28" fill="white" opacity="0.15" />
  </svg>
);

export const BudgetAlertIcon: React.FC<IconProps> = ({ size = 48, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
    <defs>
      <linearGradient id="alertGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#F43F5E" />
        <stop offset="100%" stopColor="#E11D48" />
      </linearGradient>
    </defs>
    <circle cx="32" cy="32" r="30" fill="url(#alertGrad)" />
    <g>
      <path d="M32 16 C30 16 28 17 28 19 L28 20 C24 23 22 27 22 34 L20 38 C19 40 21 42 23 42 L41 42 C43 42 45 40 44 38 L42 34 C42 27 40 23 36 20 L36 19 C36 17 34 16 32 16 Z" fill="white" />
      <circle cx="32" cy="46" r="3" fill="white" />
      <line x1="32" y1="25" x2="32" y2="33" stroke="#E11D48" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="32" cy="37" r="1.5" fill="#E11D48" />
    </g>
    <circle cx="32" cy="32" r="28" fill="white" opacity="0.15" />
  </svg>
);

export const SettingsIcon: React.FC<IconProps> = ({ size = 48, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
    <defs>
      <linearGradient id="settingsGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#64748B" />
        <stop offset="100%" stopColor="#475569" />
      </linearGradient>
    </defs>
    <circle cx="32" cy="32" r="30" fill="url(#settingsGrad)" />
    <g>
      <circle cx="32" cy="32" r="8" fill="white" />
      <circle cx="32" cy="32" r="4.5" fill="#475569" />
      <rect x="30" y="16" width="4" height="6" rx="1.5" fill="white" />
      <rect x="30" y="42" width="4" height="6" rx="1.5" fill="white" />
      <rect x="16" y="30" width="6" height="4" rx="1.5" fill="white" />
      <rect x="42" y="30" width="6" height="4" rx="1.5" fill="white" />
      <rect x="20" y="20" width="4" height="6" rx="1.5" fill="white" transform="rotate(45 22 23)" />
      <rect x="38" y="38" width="4" height="6" rx="1.5" fill="white" transform="rotate(45 40 41)" />
      <rect x="38" y="20" width="4" height="6" rx="1.5" fill="white" transform="rotate(-45 40 23)" />
      <rect x="20" y="38" width="4" height="6" rx="1.5" fill="white" transform="rotate(-45 22 41)" />
    </g>
    <circle cx="32" cy="32" r="28" fill="white" opacity="0.15" />
  </svg>
);

export const LoanIcon: React.FC<IconProps> = ({ size = 48, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" className={className}>
    <defs>
      <linearGradient id="loanGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#EF4444" />
        <stop offset="100%" stopColor="#DC2626" />
      </linearGradient>
    </defs>
    <circle cx="32" cy="32" r="30" fill="url(#loanGrad)" />
    <g>
      <circle cx="32" cy="22" r="8" fill="#FDE047" />
      <text x="32" y="26" textAnchor="middle" fontSize="11" fontWeight="black" fill="#B45309">₹</text>
      <path d="M18 42 L28 35 C30 33 34 33 36 35 L46 42" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M22 46 L30 40 L34 40 L42 46" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" />
    </g>
    <circle cx="32" cy="32" r="28" fill="white" opacity="0.15" />
  </svg>
);

// --- MAPPING ---

export const getCategoryCartoonIcon = (categoryName: string, size: number = 32): React.ReactNode => {
  const normalized = categoryName.toLowerCase();
  
  // Create a hidden SVG container for gradients to work globally if needed
  // But here we'll just include Gradients once in the UI if possible.
  // For now, each icon has its own simple definition or we use Gradients component.

  const iconMap: Record<string, React.ReactNode> = {
    // Navigation / Core
    'dashboard': <DashboardIcon size={size} />,
    'transactions': <TransactionsIcon size={size} />,
    'reports': <ReportsIcon size={size} />,
    'book advisor': <AdvisorIcon size={size} />,
    'book-advisor': <AdvisorIcon size={size} />,
    'advisor': <AdvisorIcon size={size} />,
    'voice logging': <MicIcon size={size} />,
    'voice-logging': <MicIcon size={size} />,
    'receipt scanner': <ScannerIcon size={size} />,
    'receipt-scanner': <ScannerIcon size={size} />,
    'scanner': <ScannerIcon size={size} />,
    'notifications': <NotificationBellIcon size={size} />,
    'recurring': <RecurringIcon size={size} />,
    'recurring transactions': <RecurringIcon size={size} />,
    'recurring-transactions': <RecurringIcon size={size} />,
    'budget alerts': <BudgetAlertIcon size={size} />,
    'budget-alerts': <BudgetAlertIcon size={size} />,
    'settings': <SettingsIcon size={size} />,
    'loans': <LoanIcon size={size} />,
    'loan': <LoanIcon size={size} />,
    'group expenses': <FamilyIcon size={size} />,
    'group-expenses': <FamilyIcon size={size} />,
    'groups': <FamilyIcon size={size} />,
    'todo lists': <ChecklistIcon size={size} />,
    'todo-lists': <ChecklistIcon size={size} />,
    'todos': <ChecklistIcon size={size} />,

    // Expense
    'housing': <HousingIcon size={size} />,
    'housing / rent': <HousingIcon size={size} />,
    'home maintenance': <HousingIcon size={size} />,
    'utilities': <UtilitiesIcon size={size} />,
    'food & dining': <FoodIcon size={size} />,
    'food': <FoodIcon size={size} />,
    'transportation': <TransportationIcon size={size} />,
    'vehicle': <TransportationIcon size={size} />,
    'vehicle maintenance': <TransportationIcon size={size} />,
    'health & medical': <HealthIcon size={size} />,
    'healthcare': <HealthIcon size={size} />,
    'shopping': <ShoppingIcon size={size} />,
    'electronics & gadgets': <ElectronicsIcon size={size} />,
    'subscriptions': <EntertainmentIcon size={size} />,
    'entertainment': <EntertainmentIcon size={size} />,
    'travel': <TravelIcon size={size} />,
    'travel & vacation': <TravelIcon size={size} />,
    'education': <EducationIcon size={size} />,
    'gifts & donations': <GiftsIcon size={size} />,
    'donations & charity': <GiftsIcon size={size} />,
    'family & kids': <FamilyIcon size={size} />,
    'personal care': <PersonalCareIcon size={size} />,
    'fitness & sports': <FitnessIcon size={size} />,
    'pets': <PetsIcon size={size} />,
    'investments': <InvestmentIcon size={size} />,
    'investment': <InvestmentIcon size={size} />,
    'taxes & government': <TaxesIcon size={size} />,
    'loan / debt payments': <LoanIcon size={size} />,
    'financial': <FinanceIcon size={size} />,
    'miscellaneous': <MiscIcon size={size} />,
    'miscellaneous / other': <MiscIcon size={size} />,
    
    // Income
    'salary': <SalaryIcon size={size} />,
    'freelance & side gigs': <FreelanceIcon size={size} />,
    'investment returns': <InvestmentIcon size={size} />,
    'business': <BusinessIcon size={size} />,
    'gift & refund': <GiftsIcon size={size} />,
    'other income': <MiscIcon size={size} />,
    
    // Utils
    'transfer': <TransferIcon size={size} />,
    'wallet': <WalletIcon size={size} />,
    'account': <WalletIcon size={size} />,
    'accounts': <WalletIcon size={size} />,
    'goal': <GoalIcon size={size} />,
    'goals': <GoalIcon size={size} />,
    'checklist': <ChecklistIcon size={size} />,
    'todo': <ChecklistIcon size={size} />,
    'calendar': <CalendarIcon size={size} />,
    'voice': <MicIcon size={size} />,

    // Goal categories
    'emergency': <HealthIcon size={size} />,
    'gadget': <ElectronicsIcon size={size} />,
    'wedding': <GiftsIcon size={size} />,
    'personal': <PersonalCareIcon size={size} />,
    'custom': <MiscIcon size={size} />,
  };
  
  // Case-insensitive lookup
  for (const [key, icon] of Object.entries(iconMap)) {
    if (key.toLowerCase() === normalized) return icon;
  }

  return <MiscIcon size={size} />;
};

// Get background color for category
export const getCategoryColor = (categoryName: string): string => {
 const normalized = categoryName.toLowerCase();
 const colorMap: Record<string, string> = {
 'housing': '#4834D4',
 'utilities': '#7ED6DF',
 'food & dining': '#EB4D4B',
 'transportation': '#F9CA24',
 'health & medical': '#22A6B3',
 'shopping': '#BE2EDD',
 'subscriptions': '#F0932B',
 'travel': '#686DE0',
 'education': '#30336B',
 'gifts & donations': '#EB4D4B',
 'family & kids': '#686DE0',
 'personal care': '#FF7979',
 'fitness & sports': '#22A6B3',
 'pets': '#F0932B',
 'investments': '#10B981',
 'taxes & government': '#686DE0',
 'loan / debt payments': '#4834D4',
 'salary': '#10B981',
 'freelance': '#4834D4',
 'business': '#686DE0',
 };
 
 for (const [key, color] of Object.entries(colorMap)) {
 if (key.toLowerCase() === normalized) return color;
 }
 
 return '#95AFC0';
};
