import React from 'react';
import { BankInfo } from '@/constants/banks';
import { cn } from '@/lib/utils';

interface BankLogoProps {
 bank: BankInfo;
 size?: 'xs' | 'sm' | 'md' | 'lg';
 className?: string;
}

export const BankLogo: React.FC<BankLogoProps> = ({ bank, size = 'md', className }) => {
 const sizeClasses = {
 xs: 'w-6 h-6 text-[8px] rounded-lg',
 sm: 'w-9 h-9 text-xs rounded-xl',
 md: 'w-11 h-11 text-sm rounded-xl',
 lg: 'w-14 h-14 text-base rounded-2xl',
 };

 return (
 <div
 className={cn(
 sizeClasses[size],
 'flex items-center justify-center font-black flex-shrink-0 shadow-sm relative overflow-hidden transition-transform active:scale-95',
 className
 )}
 style={{ 
 background: `linear-gradient(135deg, ${bank.color}, ${bank.color}ee)`,
 color: bank.textColor 
 }}
 >
 {/* Decorative inner glow */}
 <div className="absolute inset-0 bg-white/10 opacity-0 hover:opacity-100 transition-opacity" />
 
 {/* Subtle border */}
 <div className="absolute inset-0 border border-black/5 rounded-[inherit]" />
 
 <span className="relative z-10 tracking-tighter uppercase">{bank.initials}</span>
 
 {/* Glossy effect */}
 <div className="absolute -top-[50%] -left-[50%] w-[200%] h-[200%] bg-gradient-to-br from-white/20 to-transparent rotate-45 pointer-events-none" />
 </div>
 );
};
