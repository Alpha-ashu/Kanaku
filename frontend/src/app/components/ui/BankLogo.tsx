import React from 'react';
import { BankInfo } from '@/constants/banks';
import { cn } from '@/lib/utils';

interface BankLogoProps {
  bank: BankInfo | { name: string; shortName?: string; color?: string; textColor?: string; initials?: string; type?: string };
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

export const BankLogo: React.FC<BankLogoProps> = ({ bank, size = 'md', className }) => {
  const sizeClasses = {
    xs: 'w-6 h-6 rounded-lg',
    sm: 'w-9 h-9 rounded-xl',
    md: 'w-11 h-11 rounded-2xl',
    lg: 'w-14 h-14 rounded-2xl',
  };

  const name = (bank.name || '').toLowerCase();
  const short = (bank.shortName || '').toLowerCase();
  const initials = (bank.initials || bank.name?.slice(0, 3) || 'BNK').toUpperCase();

  // Helper to render bank-specific authentic vector logo
  const renderLogoContent = () => {
    // 1. State Bank of India (SBI) - Iconic Sky-blue circle with vertical keyhole slit
    if (name.includes('state bank') || short === 'sbi' || initials === 'SBI') {
      return (
        <svg viewBox="0 0 40 40" className="w-full h-full p-1" fill="none">
          <rect width="40" height="40" rx="10" fill="#002D62" />
          <circle cx="20" cy="20" r="14" fill="#00A5EC" />
          {/* Keyhole center & slit */}
          <circle cx="20" cy="18" r="4.2" fill="#002D62" />
          <rect x="18" y="18" width="4" height="16" fill="#002D62" />
        </svg>
      );
    }

    // 2. HDFC Bank - Official Blue square with Red center and geometric cross
    if (name.includes('hdfc') || short === 'hdfc') {
      return (
        <svg viewBox="0 0 40 40" className="w-full h-full p-1" fill="none">
          <rect width="40" height="40" rx="10" fill="#004C8F" />
          {/* HDFC cross blocks */}
          <rect x="9" y="15" width="22" height="10" fill="#ED1C24" />
          <rect x="15" y="9" width="10" height="22" fill="#ED1C24" />
          <rect x="15" y="15" width="10" height="10" fill="#004C8F" />
          <rect x="11" y="11" width="4" height="4" fill="#00AEEF" />
          <rect x="25" y="11" width="4" height="4" fill="#00AEEF" />
          <rect x="11" y="25" width="4" height="4" fill="#00AEEF" />
          <rect x="25" y="25" width="4" height="4" fill="#00AEEF" />
        </svg>
      );
    }

    // 3. ICICI Bank - Deep Burgundy / Vermilion with stylized 'i' curve flame
    if (name.includes('icici') || short === 'icici') {
      return (
        <svg viewBox="0 0 40 40" className="w-full h-full p-1" fill="none">
          <rect width="40" height="40" rx="10" fill="#991B1E" />
          <circle cx="20" cy="12" r="3.2" fill="#F58220" />
          <path d="M18 17 H22 V29 H18 Z" fill="#FFFFFF" />
          <path d="M12 21 C12 15 16 12 21 12 C26 12 29 15 29 19 C29 23 25 27 21 27" stroke="#F58220" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      );
    }

    // 4. Axis Bank - Burgundy with white/pink stylized geometric triangle 'A'
    if (name.includes('axis') || short === 'axis') {
      return (
        <svg viewBox="0 0 40 40" className="w-full h-full p-1" fill="none">
          <rect width="40" height="40" rx="10" fill="#861242" />
          <path d="M20 9 L30 29 H24 L20 20 L16 29 H10 Z" fill="#FFFFFF" />
          <polygon points="17,24 20,18 23,24" fill="#861242" />
          <polygon points="20,9 30,29 25,29 20,17" fill="#F8B4D9" opacity="0.35" />
        </svg>
      );
    }

    // 5. Kotak Mahindra Bank - Crimson Red with the white Infinity symbol
    if (name.includes('kotak') || short === 'kotak') {
      return (
        <svg viewBox="0 0 40 40" className="w-full h-full p-1" fill="none">
          <rect width="40" height="40" rx="10" fill="#ED1C24" />
          <path
            d="M13 20 C13 16 16.5 15 19.5 20 C22.5 25 26.5 24 26.5 20 C26.5 16 22.5 15 19.5 20 C16.5 25 13 24 13 20 Z"
            stroke="#FFFFFF"
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    }

    // 6. Bank of Baroda (BOB) - Vermilion Orange with the Baroda Sun
    if (name.includes('baroda') || short === 'bob' || initials === 'BOB') {
      return (
        <svg viewBox="0 0 40 40" className="w-full h-full p-1" fill="none">
          <rect width="40" height="40" rx="10" fill="#F26522" />
          {/* Sun disc and radiant rays */}
          <circle cx="20" cy="20" r="5.5" fill="#FFFFFF" />
          <path
            d="M20 7.5 V11 M20 29 V32.5 M7.5 20 H11 M29 20 H32.5 M11.2 11.2 L13.8 13.8 M26.2 26.2 L28.8 28.8 M11.2 28.8 L13.8 26.2 M26.2 13.8 L28.8 11.2"
            stroke="#FFFFFF"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
      );
    }

    // 7. Punjab National Bank (PNB) - Maroon with Golden Circular Emblem
    if (name.includes('punjab national') || short === 'pnb' || initials === 'PNB') {
      return (
        <svg viewBox="0 0 40 40" className="w-full h-full p-1" fill="none">
          <rect width="40" height="40" rx="10" fill="#741130" />
          <circle cx="20" cy="20" r="12" stroke="#FFD700" strokeWidth="2" strokeDasharray="3 2" />
          <text x="20" y="24" textAnchor="middle" fill="#FFD700" fontWeight="900" fontSize="10" fontFamily="system-ui, sans-serif">
            PNB
          </text>
        </svg>
      );
    }

    // 8. Canara Bank - Royal Blue with Golden & White Interlocking Triangles
    if (name.includes('canara') || short === 'canara') {
      return (
        <svg viewBox="0 0 40 40" className="w-full h-full p-1" fill="none">
          <rect width="40" height="40" rx="10" fill="#0066B3" />
          <polygon points="14,27 26,27 20,16" fill="#FFCC00" />
          <polygon points="14,15 26,15 20,25" fill="#FFFFFF" opacity="0.85" />
        </svg>
      );
    }

    // 9. Union Bank of India - Royal Blue with Interlocking Red & White U
    if (name.includes('union bank') || short === 'ubi') {
      return (
        <svg viewBox="0 0 40 40" className="w-full h-full p-1" fill="none">
          <rect width="40" height="40" rx="10" fill="#003580" />
          <path d="M12 13 V22 C12 26 15 28 18 28 C21 28 24 26 24 22 V13" stroke="#DA291C" strokeWidth="3" strokeLinecap="round" />
          <path d="M16 13 V22 C16 26 19 28 22 28 C25 28 28 26 28 22 V13" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" />
        </svg>
      );
    }

    // 10. Bank of India (BOI) - Navy Blue with Golden Orange Star Emblem
    if (name.includes('bank of india') || short === 'boi') {
      return (
        <svg viewBox="0 0 40 40" className="w-full h-full p-1" fill="none">
          <rect width="40" height="40" rx="10" fill="#13294B" />
          <polygon points="20,8 23,16 31,16 25,21 27,29 20,24 13,29 15,21 9,16 17,16" fill="#F47920" />
          <circle cx="20" cy="20" r="4" fill="#FFFFFF" />
        </svg>
      );
    }

    // 11. IDFC FIRST Bank - Ruby Red with nested geometric box
    if (name.includes('idfc') || short === 'idfc') {
      return (
        <svg viewBox="0 0 40 40" className="w-full h-full p-1" fill="none">
          <rect width="40" height="40" rx="10" fill="#9D1B32" />
          <rect x="11" y="11" width="18" height="18" rx="2" stroke="#FFFFFF" strokeWidth="2.5" />
          <rect x="16" y="16" width="8" height="8" fill="#FFFFFF" />
        </svg>
      );
    }

    // 12. YES Bank - Deep Blue with Red checkmark
    if (name.includes('yes bank') || short === 'yes') {
      return (
        <svg viewBox="0 0 40 40" className="w-full h-full p-1" fill="none">
          <rect width="40" height="40" rx="10" fill="#00539B" />
          <text x="20" y="22" textAnchor="middle" fill="#FFFFFF" fontWeight="900" fontSize="11" fontFamily="system-ui, sans-serif">
            YES
          </text>
          <path d="M14 26 L19 29 L27 22" stroke="#ED1C24" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    }

    // 13. IndusInd Bank - Crimson Maroon with Bull Horns Crest
    if (name.includes('indusind') || short === 'indusind') {
      return (
        <svg viewBox="0 0 40 40" className="w-full h-full p-1" fill="none">
          <rect width="40" height="40" rx="10" fill="#6B1D28" />
          <path d="M11 24 C14 18 18 15 20 15 C22 15 26 18 29 24" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M14 15 C12 11 10 11 9 13 M26 15 C28 11 30 11 31 13" stroke="#F8B4D9" strokeWidth="2" strokeLinecap="round" />
          <circle cx="20" cy="22" r="2.8" fill="#FFFFFF" />
        </svg>
      );
    }

    // 14. Federal Bank - Navy and Gold Emblem
    if (name.includes('federal') || short === 'federal') {
      return (
        <svg viewBox="0 0 40 40" className="w-full h-full p-1" fill="none">
          <rect width="40" height="40" rx="10" fill="#0B2341" />
          <circle cx="20" cy="20" r="11" stroke="#DAAA00" strokeWidth="2" />
          <text x="20" y="24" textAnchor="middle" fill="#DAAA00" fontWeight="900" fontSize="8.5" fontFamily="system-ui, sans-serif">
            FED
          </text>
        </svg>
      );
    }

    // 15. Paytm Payments Bank - Sky Blue with Paytm branding
    if (name.includes('paytm') || short === 'paytm') {
      return (
        <svg viewBox="0 0 40 40" className="w-full h-full p-1" fill="none">
          <rect width="40" height="40" rx="10" fill="#00BAF2" />
          <text x="14" y="24" textAnchor="middle" fill="#002970" fontWeight="900" fontSize="10.5" fontFamily="system-ui, sans-serif">
            Pay
          </text>
          <text x="27" y="24" textAnchor="middle" fill="#FFFFFF" fontWeight="900" fontSize="10.5" fontFamily="system-ui, sans-serif">
            tm
          </text>
        </svg>
      );
    }

    // 16. Airtel Payments Bank - Vibrant Red with curved Ribbon
    if (name.includes('airtel') || short === 'airtel') {
      return (
        <svg viewBox="0 0 40 40" className="w-full h-full p-1" fill="none">
          <rect width="40" height="40" rx="10" fill="#E40000" />
          <path d="M13 26 C13 17 20 13 25 13 C28 13 29 15 29 18 C29 22 23 25 15 25" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" />
          <circle cx="25" cy="18" r="2.2" fill="#FFFFFF" />
        </svg>
      );
    }

    // 17. Chase Bank - Official Blue Octagon geometric mark
    if (name.includes('chase') || short === 'chase') {
      return (
        <svg viewBox="0 0 40 40" className="w-full h-full p-1" fill="none">
          <rect width="40" height="40" rx="10" fill="#117ACA" />
          <g transform="translate(20,20) scale(0.65)">
            <path d="M-6 -18 L6 -18 L12 -6 L-1 -6 Z" fill="#FFFFFF" />
            <path d="M18 -6 L18 6 L6 12 L6 -1 Z" fill="#FFFFFF" />
            <path d="M6 18 L-6 18 L-12 6 L1 6 Z" fill="#FFFFFF" />
            <path d="M-18 6 L-18 -6 L-6 -12 L-6 1 Z" fill="#FFFFFF" />
          </g>
        </svg>
      );
    }

    // 18. Bank of America - Red and Blue flag stripes
    if (name.includes('bank of america') || short === 'bofa') {
      return (
        <svg viewBox="0 0 40 40" className="w-full h-full p-1" fill="none">
          <rect width="40" height="40" rx="10" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="1" />
          <g transform="translate(10, 11) scale(0.7)">
            <rect x="0" y="0" width="12" height="4" fill="#0052C2" rx="1" />
            <rect x="0" y="7" width="12" height="4" fill="#0052C2" rx="1" />
            <rect x="0" y="14" width="12" height="4" fill="#0052C2" rx="1" />
            <rect x="15" y="0" width="12" height="4" fill="#E31837" rx="1" />
            <rect x="15" y="7" width="12" height="4" fill="#E31837" rx="1" />
            <rect x="15" y="14" width="12" height="4" fill="#E31837" rx="1" />
          </g>
        </svg>
      );
    }

    // 19. Citibank - Blue card with iconic red arc
    if (name.includes('citi') || short === 'citi') {
      return (
        <svg viewBox="0 0 40 40" className="w-full h-full p-1" fill="none">
          <rect width="40" height="40" rx="10" fill="#003B70" />
          <text x="18" y="25" textAnchor="middle" fill="#FFFFFF" fontWeight="900" fontSize="12" fontFamily="system-ui, sans-serif">
            citi
          </text>
          <path d="M14 14 C18 10 24 10 28 14" stroke="#ED1C24" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      );
    }

    // 20. HSBC - White card with Red hexagonal triangles
    if (name.includes('hsbc') || short === 'hsbc') {
      return (
        <svg viewBox="0 0 40 40" className="w-full h-full p-1" fill="none">
          <rect width="40" height="40" rx="10" fill="#FFFFFF" stroke="#E2E8F0" strokeWidth="1" />
          <g transform="translate(8, 11) scale(0.85)">
            <polygon points="0,10 8,0 8,20" fill="#DB0011" />
            <polygon points="24,10 16,0 16,20" fill="#DB0011" />
            <polygon points="12,0 8,10 16,10" fill="#DB0011" />
            <polygon points="12,20 8,10 16,10" fill="#DB0011" />
          </g>
        </svg>
      );
    }

    // 21. Barclays - Cyan with Eagle silhouette
    if (name.includes('barclays') || short === 'barclays') {
      return (
        <svg viewBox="0 0 40 40" className="w-full h-full p-1" fill="none">
          <rect width="40" height="40" rx="10" fill="#00AEEF" />
          <path d="M20 12 L16 16 L12 16 L15 21 L13 27 L20 24 L27 27 L25 21 L28 16 L24 16 Z" fill="#FFFFFF" />
        </svg>
      );
    }

    // Fallback: Elegant high-contrast branded badge with bank color or clean indigo
    const fallbackColor = bank.color || '#4f46e5';
    return (
      <div
        className="w-full h-full flex flex-col items-center justify-center rounded-[inherit] relative overflow-hidden shadow-xs"
        style={{
          background: `linear-gradient(135deg, ${fallbackColor}, ${fallbackColor}dd)`,
          color: bank.textColor || '#ffffff',
        }}
      >
        <span className="relative z-10 text-xs sm:text-sm font-black tracking-wider uppercase drop-shadow-xs">
          {initials.slice(0, 3)}
        </span>
        <div className="absolute inset-0 bg-white/10 opacity-40 pointer-events-none" />
      </div>
    );
  };

  return (
    <div
      className={cn(
        sizeClasses[size],
        'flex items-center justify-center flex-shrink-0 relative overflow-hidden transition-all duration-200 select-none shadow-xs',
        className
      )}
    >
      {renderLogoContent()}
    </div>
  );
};
