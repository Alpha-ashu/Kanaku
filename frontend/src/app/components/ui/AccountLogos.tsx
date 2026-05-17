import React from 'react';
import { cn } from '@/lib/utils';

export const CardNetworkLogo: React.FC<{ network: string }> = ({ network }) => {
 const normalized = network.toLowerCase();
 if (normalized === 'visa') {
 return (
 <svg viewBox="0 0 48 48" className="h-6 w-auto fill-white opacity-80" xmlns="http://www.w3.org/2000/svg">
 <path d="M31.17 31.85h4.15l2.59-15.7H33.76l-2.59 15.7zm11.75-15.35c-1.07-.46-2.74-.95-4.81-.95-5.32 0-9.06 2.83-9.09 6.89-.03 2.99 2.68 4.65 4.73 5.65 2.1 1.03 2.81 1.68 2.8 2.6-.02 1.4-1.68 2.04-3.23 2.04-2.15 0-3.31-.33-5.07-1.11l-.7-.34-.75 4.63c1.25.58 3.56 1.08 5.95 1.1 5.66 0 9.33-2.8 9.38-7.14.03-2.38-1.42-4.19-4.54-5.69-1.89-.95-3.05-1.58-3.05-2.55.01-.86.96-1.74 3.03-1.74 1.72-.03 2.97.37 3.93.79l.47.22.88-5.4zm-19.46 0-3.9 10.68-.47-2.36c-.82-2.77-3.37-5.77-6.22-7.27l4.03 14.65h4.43l6.59-15.7h-4.46zm-17.38 0L1.7 31.85h4.41l6.6-15.7h-6.63z" />
 </svg>
 );
 }
 if (normalized === 'mastercard') {
 return (
 <div className="flex -space-x-2 opacity-80">
 <div className="w-5 h-5 rounded-full bg-[#EB001B]" />
 <div className="w-5 h-5 rounded-full bg-[#F79E1B]/80" />
 </div>
 );
 }
 if (normalized === 'rupay') {
 return (
 <div className="flex flex-col items-end opacity-80 leading-none">
 <span className="text-[10px] font-black italic tracking-tighter text-white">RuPay</span>
 <div className="h-[2px] w-8 bg-gradient-to-r from-orange-400 via-white to-green-500 rounded-full mt-0.5" />
 </div>
 );
 }
 if (normalized === 'paytm') {
 return (
 <div className="flex flex-col items-end opacity-80 leading-none">
 <span className="text-[11px] font-black tracking-tight text-white flex items-center">
 Pay<span className="text-sky-300">tm</span>
 </span>
 </div>
 );
 }
 if (normalized === 'gpay' || normalized === 'googlepay') {
 return (
 <div className="flex items-center gap-0.5 opacity-80 scale-75 origin-right">
 <div className="w-2 h-2 rounded-full bg-red-500" />
 <div className="w-2 h-2 rounded-full bg-yellow-500" />
 <div className="w-2 h-2 rounded-full bg-green-500" />
 <div className="w-2 h-2 rounded-full bg-blue-500" />
 </div>
 );
 }
 return null;
};

// Smart bank/card brand logo renderer based on account name
export const getBankCardLogo = (name: string, isActive: boolean, size: 'sm' | 'md' = 'md') => {
 const n = name.toLowerCase();
 const w = size === 'sm' ? 52 : 64;
 const h = size === 'sm' ? 32 : 40;
 const textSm = size === 'sm' ? '9' : '11';
 const textMd = size === 'sm' ? '11' : '14';
 const textLg = size === 'sm' ? '13' : '16';

 // Indian Banks
 if (n.includes('sbi') || n.includes('state bank')) {
 return (
 <div className={cn(size === 'sm' ? 'w-[52px] h-8' : 'w-16 h-10',"flex flex-col items-center justify-center rounded-lg overflow-hidden bg-[#22408C]")}>
 <svg viewBox="0 0 60 36" width={w} height={h}>
 <rect width="60" height="36" fill="#22408C" />
 <text x="30" y="15" textAnchor="middle" fill="#fff" fontWeight="bold" fontSize={textLg} fontFamily="Arial">SBI</text>
 <text x="30" y="28" textAnchor="middle" fill="#a0b4e0" fontSize={textSm} fontFamily="Arial">State Bank</text>
 </svg>
 </div>
 );
 }
 if (n.includes('hdfc')) {
 return (
 <div className={cn(size === 'sm' ? 'w-[52px] h-8' : 'w-16 h-10',"flex items-center justify-center rounded-lg overflow-hidden bg-[#004C8F]")}>
 <svg viewBox="0 0 60 36" width={w} height={h}>
 <rect width="60" height="36" fill="#004C8F" />
 <text x="30" y="14" textAnchor="middle" fill="#00AEEF" fontWeight="800" fontSize={textLg} fontFamily="Arial">HDFC</text>
 <text x="30" y="27" textAnchor="middle" fill="#80c6f7" fontSize={textSm} fontFamily="Arial">BANK</text>
 </svg>
 </div>
 );
 }
 if (n.includes('icici')) {
 return (
 <div className={cn(size === 'sm' ? 'w-[52px] h-8' : 'w-16 h-10',"flex items-center justify-center rounded-lg overflow-hidden bg-[#B02A2A]")}>
 <svg viewBox="0 0 60 36" width={w} height={h}>
 <rect width="60" height="36" fill="#B02A2A" />
 <text x="30" y="15" textAnchor="middle" fill="#fff" fontWeight="bold" fontSize={textMd} fontFamily="Arial">ICICI</text>
 <text x="30" y="27" textAnchor="middle" fill="#f0a0a0" fontSize={textSm} fontFamily="Arial">BANK</text>
 </svg>
 </div>
 );
 }
 if (n.includes('axis')) {
 return (
 <div className={cn(size === 'sm' ? 'w-[52px] h-8' : 'w-16 h-10',"flex items-center justify-center rounded-lg overflow-hidden bg-[#97144D]")}>
 <svg viewBox="0 0 60 36" width={w} height={h}>
 <rect width="60" height="36" fill="#97144D" />
 <text x="30" y="22" textAnchor="middle" fill="#fff" fontWeight="bold" fontSize={textLg} fontFamily="Arial">AXIS</text>
 </svg>
 </div>
 );
 }
 if (n.includes('kotak')) {
 return (
 <div className={cn(size === 'sm' ? 'w-[52px] h-8' : 'w-16 h-10',"flex items-center justify-center rounded-lg overflow-hidden bg-[#ED1C24]")}>
 <svg viewBox="0 0 60 36" width={w} height={h}>
 <rect width="60" height="36" fill="#ED1C24" />
 <text x="30" y="15" textAnchor="middle" fill="#fff" fontWeight="bold" fontSize={textSm} fontFamily="Arial">KOTAK</text>
 <text x="30" y="27" textAnchor="middle" fill="#ffa0a4" fontSize={textSm} fontFamily="Arial">MAHINDRA</text>
 </svg>
 </div>
 );
 }
 if (n.includes('pnb') || n.includes('punjab national')) {
 return (
 <div className={cn(size === 'sm' ? 'w-[52px] h-8' : 'w-16 h-10',"flex items-center justify-center rounded-lg overflow-hidden bg-[#003366]")}>
 <svg viewBox="0 0 60 36" width={w} height={h}>
 <rect width="60" height="36" fill="#003366" />
 <text x="30" y="22" textAnchor="middle" fill="#FFD700" fontWeight="bold" fontSize={textLg} fontFamily="Arial">PNB</text>
 </svg>
 </div>
 );
 }
 if (n.includes('bob') || n.includes('bank of baroda')) {
 return (
 <div className={cn(size === 'sm' ? 'w-[52px] h-8' : 'w-16 h-10',"flex items-center justify-center rounded-lg overflow-hidden bg-[#E87722]")}>
 <svg viewBox="0 0 60 36" width={w} height={h}>
 <rect width="60" height="36" fill="#E87722" />
 <text x="30" y="22" textAnchor="middle" fill="#fff" fontWeight="bold" fontSize={textLg} fontFamily="Arial">BOB</text>
 </svg>
 </div>
 );
 }
 if (n.includes('canara')) {
 return (
 <div className={cn(size === 'sm' ? 'w-[52px] h-8' : 'w-16 h-10',"flex items-center justify-center rounded-lg overflow-hidden bg-[#034694]")}>
 <svg viewBox="0 0 60 36" width={w} height={h}>
 <rect width="60" height="36" fill="#034694" />
 <text x="30" y="22" textAnchor="middle" fill="#FFD700" fontWeight="bold" fontSize={textSm} fontFamily="Arial">CANARA</text>
 </svg>
 </div>
 );
 }
 if (n.includes('union bank')) {
 return (
 <div className={cn(size === 'sm' ? 'w-[52px] h-8' : 'w-16 h-10',"flex items-center justify-center rounded-lg overflow-hidden bg-[#003087]")}>
 <svg viewBox="0 0 60 36" width={w} height={h}>
 <rect width="60" height="36" fill="#003087" />
 <text x="30" y="22" textAnchor="middle" fill="#fff" fontWeight="bold" fontSize={textSm} fontFamily="Arial">UNION</text>
 </svg>
 </div>
 );
 }
 if (n.includes('idbi')) {
 return (
 <div className={cn(size === 'sm' ? 'w-[52px] h-8' : 'w-16 h-10',"flex items-center justify-center rounded-lg overflow-hidden bg-[#3D9A42]")}>
 <svg viewBox="0 0 60 36" width={w} height={h}>
 <rect width="60" height="36" fill="#3D9A42" />
 <text x="30" y="22" textAnchor="middle" fill="#fff" fontWeight="bold" fontSize={textLg} fontFamily="Arial">IDBI</text>
 </svg>
 </div>
 );
 }
 if (n.includes('yes bank')) {
 return (
 <div className={cn(size === 'sm' ? 'w-[52px] h-8' : 'w-16 h-10',"flex items-center justify-center rounded-lg overflow-hidden bg-[#00539B]")}>
 <svg viewBox="0 0 60 36" width={w} height={h}>
 <rect width="60" height="36" fill="#00539B" />
 <text x="30" y="22" textAnchor="middle" fill="#fff" fontWeight="bold" fontSize={textLg} fontFamily="Arial">YES</text>
 </svg>
 </div>
 );
 }
 if (n.includes('indusind')) {
 return (
 <div className={cn(size === 'sm' ? 'w-[52px] h-8' : 'w-16 h-10',"flex items-center justify-center rounded-lg overflow-hidden bg-[#7B2D8B]")}>
 <svg viewBox="0 0 60 36" width={w} height={h}>
 <rect width="60" height="36" fill="#7B2D8B" />
 <text x="30" y="22" textAnchor="middle" fill="#fff" fontWeight="bold" fontSize={textSm} fontFamily="Arial">IndusInd</text>
 </svg>
 </div>
 );
 }
 if (n.includes('idfc')) {
 return (
 <div className={cn(size === 'sm' ? 'w-[52px] h-8' : 'w-16 h-10',"flex items-center justify-center rounded-lg overflow-hidden bg-[#009FE3]")}>
 <svg viewBox="0 0 60 36" width={w} height={h}>
 <rect width="60" height="36" fill="#009FE3" />
 <text x="30" y="22" textAnchor="middle" fill="#fff" fontWeight="bold" fontSize={textLg} fontFamily="Arial">IDFC</text>
 </svg>
 </div>
 );
 }

 // International Banks
 if (n.includes('chase') || n.includes('jpmorgan')) {
 return (
 <div className={cn(size === 'sm' ? 'w-[52px] h-8' : 'w-16 h-10',"flex items-center justify-center rounded-lg overflow-hidden bg-[#117ACA]")}>
 <svg viewBox="0 0 60 36" width={w} height={h}>
 <rect width="60" height="36" fill="#117ACA" />
 <text x="30" y="22" textAnchor="middle" fill="#fff" fontWeight="bold" fontSize={textLg} fontFamily="Arial">Chase</text>
 </svg>
 </div>
 );
 }
 if (n.includes('bank of america') || n.includes('bofa')) {
 return (
 <div className={cn(size === 'sm' ? 'w-[52px] h-8' : 'w-16 h-10',"flex items-center justify-center rounded-lg overflow-hidden bg-[#E31937]")}>
 <svg viewBox="0 0 60 36" width={w} height={h}>
 <rect width="60" height="36" fill="#E31937" />
 <text x="30" y="15" textAnchor="middle" fill="#fff" fontWeight="bold" fontSize={textSm} fontFamily="Arial">Bank of</text>
 <text x="30" y="27" textAnchor="middle" fill="#fff" fontWeight="bold" fontSize={textSm} fontFamily="Arial">America</text>
 </svg>
 </div>
 );
 }
 if (n.includes('citi') || n.includes('citibank')) {
 return (
 <div className={cn(size === 'sm' ? 'w-[52px] h-8' : 'w-16 h-10',"flex items-center justify-center rounded-lg overflow-hidden bg-[#003B8E]")}>
 <svg viewBox="0 0 60 36" width={w} height={h}>
 <rect width="60" height="36" fill="#003B8E" />
 <text x="30" y="22" textAnchor="middle" fill="#fff" fontWeight="bold" fontSize={textLg} fontFamily="Arial">Citi</text>
 </svg>
 </div>
 );
 }

 // Digital Wallets
 if (n.includes('phonepe')) {
 return (
 <div className={cn(size === 'sm' ? 'w-[52px] h-8' : 'w-16 h-10',"flex items-center justify-center rounded-lg overflow-hidden bg-[#5F259F]")}>
 <svg viewBox="0 0 60 36" width={w} height={h}>
 <rect width="60" height="36" fill="#5F259F" />
 <text x="30" y="22" textAnchor="middle" fill="#fff" fontWeight="bold" fontSize={textSm} fontFamily="Arial">PhonePe</text>
 </svg>
 </div>
 );
 }
 if (n.includes('paytm')) {
 return (
 <div className={cn(size === 'sm' ? 'w-[52px] h-8' : 'w-16 h-10',"flex items-center justify-center rounded-lg overflow-hidden bg-[#00BAF2]")}>
 <svg viewBox="0 0 60 36" width={w} height={h}>
 <rect width="60" height="36" fill="#00BAF2" />
 <text x="30" y="22" textAnchor="middle" fill="#fff" fontWeight="bold" fontSize={textMd} fontFamily="Arial">Paytm</text>
 </svg>
 </div>
 );
 }

 // Fallback: initials logo
 const initials = name.trim().split(/\s+/).map((word: string) => word[0]?.toUpperCase() ?? '').slice(0, 2).join('');
 const fallbackThemes = [
 { bgClass: 'bg-[#1e3a5f]', textClass: 'text-[#4a9ede]' },
 { bgClass: 'bg-[#3d1f5c]', textClass: 'text-[#a855f7]' },
 { bgClass: 'bg-[#1f4d2f]', textClass: 'text-[#4ade80]' },
 { bgClass: 'bg-[#5c1f1f]', textClass: 'text-[#f87171]' },
 { bgClass: 'bg-[#1f3d5c]', textClass: 'text-[#38bdf8]' },
 ];
 const colorIdx = name.charCodeAt(0) % fallbackThemes.length;
 const theme = fallbackThemes[colorIdx];
 
 return (
 <div className={cn(size === 'sm' ? 'w-[52px] h-8' : 'w-16 h-10', 'flex items-center justify-center rounded-lg', theme.bgClass)}>
 <span className={cn(theme.textClass, size === 'sm' ? 'text-[15px]' : 'text-[18px]', 'font-extrabold font-sans')}>{initials}</span>
 </div>
 );
};
