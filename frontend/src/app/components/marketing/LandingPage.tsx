import React, { useEffect, useRef, useState } from 'react';
import { KANKULogo } from '@/app/components/ui/KANKULogo';
import { PublicNavbar } from '@/app/components/ui/PublicNavbar';

interface LandingPageProps {
 onGetStarted: () => void;
 onLogin: () => void;
 onNavigate: (page: string) => void;
}

// Animated counter hook
function useCounter(target: number, duration = 1800, start = false) {
 const [count, setCount] = useState(0);
 useEffect(() => {
 if (!start) return;
 let startTime: number | null = null;
 const step = (timestamp: number) => {
 if (!startTime) startTime = timestamp;
 const progress = Math.min((timestamp - startTime) / duration, 1);
 const eased = 1 - Math.pow(1 - progress, 3);
 setCount(Math.floor(eased * target));
 if (progress < 1) requestAnimationFrame(step);
 };
 requestAnimationFrame(step);
 }, [target, duration, start]);
 return count;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted, onLogin, onNavigate }) => {
 const [menuOpen, setMenuOpen] = useState(false);
 const [scrolled, setScrolled] = useState(false);
 const [statsVisible, setStatsVisible] = useState(false);
 const statsRef = useRef<HTMLDivElement>(null);
 const blobRef = useRef<HTMLDivElement>(null);

 // Animate counter values
 const users = useCounter(50, 1400, statsVisible);
 const transactions = useCounter(2, 1600, statsVisible);
 const uptime = useCounter(99, 1200, statsVisible);

 // Navbar shadow on scroll
 useEffect(() => {
 const onScroll = () => setScrolled(window.scrollY > 20);
 window.addEventListener('scroll', onScroll, { passive: true });
 return () => window.removeEventListener('scroll', onScroll);
 }, []);

 // Trigger stats counter when section enters viewport
 useEffect(() => {
 const obs = new IntersectionObserver(
 ([entry]) => { if (entry.isIntersecting) setStatsVisible(true); },
 { threshold: 0.3 }
 );
 if (statsRef.current) obs.observe(statsRef.current);
 return () => obs.disconnect();
 }, []);

 // Parallax blob on mouse move
 useEffect(() => {
 const handleMouseMove = (e: MouseEvent) => {
 if (!blobRef.current) return;
 const x = (e.clientX / window.innerWidth - 0.5) * 22;
 const y = (e.clientY / window.innerHeight - 0.5) * 22;
 blobRef.current.style.transform = `translate(${x}px, ${y}px)`;
 };
 window.addEventListener('mousemove', handleMouseMove);
 return () => window.removeEventListener('mousemove', handleMouseMove);
 }, []);

 const scrollToSection = (id: string) => {
 const element = document.getElementById(id);
 if (element) {
 const offset = 80;
 const elementPosition = element.getBoundingClientRect().top + window.scrollY;
 window.scrollTo({
 top: elementPosition - offset,
 behavior: 'smooth'
 });
 setMenuOpen(false);
 } else {
 window.scrollTo({ top: 0, behavior: 'smooth' });
 setMenuOpen(false);
 }
 };

 const navLinks = [
 { name: 'Home', id: 'home' },
 { name: 'About', id: 'about' },
 { name: 'Features', id: 'features' },
 { name: 'Pricing', id: 'pricing' }
 ];

 const features = [
 {
 icon: (
 <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6 text-white" stroke="currentColor" strokeWidth={2}>
 <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
 </svg>
 ),
 color: 'from-orange-400 to-orange-500',
 shadow: 'shadow-orange-200',
 title: 'Smart Analytics',
 desc: 'Visualise spending patterns. Uncover insights and harness data to make proactive financial decisions.',
 },
 {
 icon: (
 <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6 text-white" stroke="currentColor" strokeWidth={2}>
 <path d="M13 10V3L4 14h7v7l9-11h-7z" />
 </svg>
 ),
 color: 'from-violet-500 to-purple-600',
 shadow: 'shadow-purple-200',
 title: 'AI Insights',
 desc: 'AI-powered recommendations to reduce waste, grow savings, and stay ahead of your goals.',
 },
 {
 icon: (
 <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6 text-white" stroke="currentColor" strokeWidth={2}>
 <path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
 </svg>
 ),
 color: 'from-emerald-400 to-teal-500',
 shadow: 'shadow-emerald-200',
 title: 'Budget Tracking',
 desc: 'Set budgets, track limits in real time, and get alerts before you overspend.',
 },
 {
 icon: (
 <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6 text-white" stroke="currentColor" strokeWidth={2}>
 <path d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
 </svg>
 ),
 color: 'from-blue-400 to-cyan-500',
 shadow: 'shadow-blue-200',
 title: 'Investment Tracker',
 desc: 'Monitor stocks, gold, and mutual funds in one place with live market data.',
 },
 {
 icon: (
 <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6 text-white" stroke="currentColor" strokeWidth={2}>
 <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
 </svg>
 ),
 color: 'from-pink-400 to-rose-500',
 shadow: 'shadow-pink-200',
 title: 'Group Expenses',
 desc: 'Split bills with friends effortlessly. Track shared costs and settle debts transparently.',
 },
 {
 icon: (
 <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6 text-white" stroke="currentColor" strokeWidth={2}>
 <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
 </svg>
 ),
 color: 'from-amber-400 to-yellow-500',
 shadow: 'shadow-amber-200',
 title: 'Secure & Offline',
 desc: 'Bank-grade encryption with offline-first sync. Your data is safe, always cached locally.',
 },
 ];

 return (
 <div className="relative min-h-screen bg-white overflow-x-hidden font-sans select-none">
 {/* Background gradients */}
 <div className="pointer-events-none absolute inset-0 overflow-hidden">
 {/* Top-left lavender blob */}
 <div className="absolute -top-32 -left-32 w-[520px] h-[520px] rounded-full bg-violet-100 blur-[120px] opacity-60" />
 {/* Top-right pink blob */}
 <div className="absolute -top-16 right-0 w-[380px] h-[380px] rounded-full bg-pink-100 blur-[100px] opacity-50" />
 {/* Center subtle circle */}
 <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-purple-50 blur-[140px] opacity-40" />
 </div>

 {/* Navbar */}
 <PublicNavbar
 onNavigate={onNavigate}
 onLogin={onLogin}
 onGetStarted={onGetStarted}
 currentPage="landing"
 />

 {/* Hero */}
 <section id="home" className="relative max-w-7xl mx-auto px-6 lg:px-8 pt-40 lg:pt-52 pb-16">
 <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
 {/* Left: copy */}
 <div className="space-y-7 animate-[fadeSlideUp_0.7s_ease_both]">
 {/* Badge */}
 <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-50 border border-violet-200 text-violet-700 text-xs font-semibold">
 <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
 AI-Powered Finance Platform
 </div>

 <h1 className="text-4xl sm:text-5xl lg:text-[3.4rem] font-extrabold text-gray-900 leading-[1.1] tracking-tight">
 Empower Your{' '}
 <span className="relative">
 <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 via-purple-600 to-pink-500">
 Finances
 </span>
 <svg className="absolute -bottom-1 left-0 w-full" height="6" viewBox="0 0 200 6" fill="none" aria-hidden>
 <path d="M0 5 Q50 0 100 5 Q150 10 200 5" stroke="url(#ul)" strokeWidth="2.5" strokeLinecap="round" fill="none" />
 <defs>
 <linearGradient id="ul" x1="0" y1="0" x2="1" y2="0">
 <stop stopColor="#7c3aed" />
 <stop offset="1" stopColor="#ec4899" />
 </linearGradient>
 </defs>
 </svg>
 </span>{' '}
 <br className="hidden sm:block" />
 with AI Excellence
 </h1>

 <p className="text-gray-500 text-base lg:text-lg leading-relaxed max-w-lg">
 At KANKUwe are the architects of your financial future, where smart budgeting meets
 AI intelligence. Our journey began with a shared passion for making money management
 effortless and personal.
 </p>

 <div className="flex flex-col sm:flex-row gap-3">
 <button
 onClick={onGetStarted}
 className="group inline-flex items-center justify-center px-8 py-3.5 rounded-full bg-gray-900 text-white font-bold text-sm hover:bg-gray-800 transition-all duration-250 hover:scale-105 active:scale-95 shadow-lg shadow-gray-200"
 >
 Get Started
 </button>
 <button
 onClick={onGetStarted}
 className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full text-gray-600 font-semibold text-sm hover:bg-gray-100 transition-all duration-200"
 >
 <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-violet-500">
 <path d="M8 5v14l11-7z" />
 </svg>
 Watch Demo
 </button>
 </div>

 {/* Social proof */}
 <div className="flex items-center gap-3 pt-1">
 <div className="flex -space-x-2">
 {['bg-violet-400', 'bg-pink-400', 'bg-amber-400', 'bg-teal-400'].map((c, i) => (
 <div
 key={i}
 className={`w-8 h-8 rounded-full ${c} border-2 border-white flex items-center justify-center text-white text-xs font-bold`}
 >
 {String.fromCharCode(65 + i)}
 </div>
 ))}
 </div>
 <p className="text-sm text-gray-500">
 <span className="font-semibold text-gray-800">4k+</span> real users
 </p>
 </div>
 </div>

 {/* Right: 3D blob visual + stats */}
 <div className="relative flex items-center justify-center h-[360px] lg:h-[480px]">
 {/* Glow rings */}
 <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
 <div className="w-72 h-72 rounded-full border border-violet-200/60 animate-[spin_20s_linear_infinite]" />
 <div className="absolute w-56 h-56 rounded-full border border-pink-200/50 animate-[spin_14s_linear_infinite_reverse]" />
 </div>

 {/* Main blob */}
 <div
 ref={blobRef}
 className="relative z-10 transition-transform duration-[60ms] ease-out will-change-transform"
 >
 <div className="w-52 h-52 lg:w-64 lg:h-64 rounded-[40%_60%_70%_30%_/_45%_45%_55%_55%] bg-gradient-to-br from-cyan-400 via-violet-500 to-purple-600 shadow-2xl shadow-violet-400/40 animate-[morphBlob_8s_ease-in-out_infinite]" />
 {/* Inner glow */}
 <div className="absolute inset-4 rounded-[40%_60%_70%_30%_/_45%_45%_55%_55%] bg-gradient-to-tr from-white/20 to-transparent animate-[morphBlob_8s_ease-in-out_infinite_2s]" />
 {/* Shimmer dots */}
 <div className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-yellow-300 shadow-lg shadow-yellow-200 animate-pulse" />
 <div className="absolute bottom-4 -left-3 w-3 h-3 rounded-full bg-cyan-300 shadow-md shadow-cyan-200 animate-bounce" />
 </div>

 {/* Floating stat cards */}
 <div
 ref={statsRef}
 className="absolute right-0 top-12 lg:top-16 space-y-3 animate-[fadeSlideUp_0.9s_0.3s_ease_both_backwards]"
 >
 <div className="bg-white/90 backdrop-blur-sm rounded-2xl px-5 py-3 shadow-lg shadow-gray-200/60 border border-gray-100 text-right min-w-[140px]">
 <p className="text-2xl font-extrabold text-gray-900">{users}k+</p>
 <p className="text-xs text-gray-500 font-medium mt-0.5">Active users</p>
 </div>
 <div className="bg-white/90 backdrop-blur-sm rounded-2xl px-5 py-3 shadow-lg shadow-gray-200/60 border border-gray-100 text-right">
 <p className="text-2xl font-extrabold text-gray-900">{transactions}M+</p>
 <p className="text-xs text-gray-500 font-medium mt-0.5">Transactions tracked</p>
 </div>
 </div>

 {/* Left floating badge */}
 <div className="absolute left-0 bottom-12 bg-white/90 backdrop-blur-sm rounded-2xl px-4 py-3 shadow-lg shadow-gray-200/60 border border-gray-100 animate-[fadeSlideUp_0.9s_0.5s_ease_both_backwards]">
 <div className="flex items-center gap-2.5">
 <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center">
 <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-white" stroke="currentColor" strokeWidth={2.5}>
 <path d="M13 10V3L4 14h7v7l9-11h-7z" />
 </svg>
 </div>
 <div>
 <p className="text-xs font-bold text-gray-900">{uptime}% Uptime</p>
 <p className="text-[10px] text-gray-500">Always synced</p>
 </div>
 </div>
 </div>
 </div>
 </div>
 </section>

 {/* Marquee logos (trust bar) */}
 <div id="about" className="border-y border-gray-100 bg-white/60 py-5 overflow-hidden">
 <div className="flex gap-12 animate-[marquee_20s_linear_infinite] whitespace-nowrap">
 {['Smart Budgets', 'AI Insights', 'Offline First', 'Bank Security', 'Live Markets', 'Group Splits', 'Goal Tracking', 'PDF Reports',
 'Smart Budgets', 'AI Insights', 'Offline First', 'Bank Security', 'Live Markets', 'Group Splits', 'Goal Tracking', 'PDF Reports'].map((item, i) => (
 <span key={i} className="text-sm font-semibold text-gray-400 flex items-center gap-3 flex-shrink-0">
 <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
 {item}
 </span>
 ))}
 </div>
 </div>

 {/* Features section */}
 <section id="features" className="max-w-7xl mx-auto px-6 lg:px-8 py-20 lg:py-28">
 <div className="text-center mb-14 space-y-4">
 <p className="text-violet-600 font-semibold text-sm tracking-widest uppercase">
 Why choose KANKU
 </p>
 <h2 className="text-3xl lg:text-4xl font-extrabold text-gray-900 tracking-tight">
 AI-Powered Finance Management
 </h2>
 <p className="text-gray-500 max-w-xl mx-auto text-base lg:text-lg leading-relaxed">
 Everything you need to manage money smarter - from daily expenses to long-term
 investments, all in one beautifully designed app.
 </p>
 </div>

 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
 {features.map((feat, i) => (
 <div
 key={i}
 className="group relative bg-white rounded-3xl p-6 border border-gray-100 shadow-sm hover:shadow-xl hover:shadow-gray-200/60 transition-all duration-300 hover:-translate-y-1 cursor-default"
 >
 <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${feat.color} flex items-center justify-center mb-5 shadow-lg ${feat.shadow}`}>
 {feat.icon}
 </div>
 <h3 className="text-base font-bold text-gray-900 mb-2">{feat.title}</h3>
 <p className="text-sm text-gray-500 leading-relaxed">{feat.desc}</p>
 <button
 onClick={onGetStarted}
 className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-violet-600 hover:text-violet-700 group-hover:gap-2.5 transition-all duration-200"
 >
 Learn More
 <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5" stroke="currentColor" strokeWidth={2.5}>
 <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
 </svg>
 </button>
 </div>
 ))}
 </div>
 </section>

 {/* Stats / social proof strip */}
 <section className="bg-gradient-to-br from-gray-900 to-gray-800 py-16">
 <div className="max-w-7xl mx-auto px-6 lg:px-8">
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 text-center">
 {[
 { value: '50k+', label: 'Active Users' },
 { value: '2M+', label: 'Transactions Tracked' },
 { value: '99%', label: 'Uptime SLA' },
 { value: '4.9', label: 'User Rating' },
 ].map((stat, i) => (
 <div key={i} className="space-y-2">
 <p className="text-3xl lg:text-4xl font-extrabold text-white">{stat.value}</p>
 <p className="text-gray-400 text-sm font-medium">{stat.label}</p>
 </div>
 ))}
 </div>
 </div>
 </section>

 {/* CTA banner */}
 <section id="pricing" className="max-w-7xl mx-auto px-6 lg:px-8 py-20 lg:py-28">
 <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-violet-600 via-purple-600 to-pink-500 p-10 lg:p-16 text-center shadow-2xl shadow-purple-300/40">
 {/* Decorative blobs */}
 <div className="pointer-events-none absolute -top-12 -right-12 w-60 h-60 rounded-full bg-white/10 blur-2xl" />
 <div className="pointer-events-none absolute -bottom-10 -left-10 w-48 h-48 rounded-full bg-white/10 blur-2xl" />

 <p className="text-white/80 text-sm font-semibold tracking-widest uppercase mb-4">
 Start for free today
 </p>
 <h2 className="text-3xl lg:text-5xl font-extrabold text-white mb-5 leading-tight">
 Which Financial Future
 <br className="hidden lg:block" />
 Will You Choose?
 </h2>
 <p className="text-white/70 text-base max-w-lg mx-auto mb-8 leading-relaxed">
 Join thousands who have transformed how they manage money. Sign up free - no credit card required.
 </p>

 <button
 onClick={onGetStarted}
 className="inline-flex items-center justify-center px-10 py-4 rounded-full bg-white text-gray-900 font-bold text-sm hover:bg-gray-100 transition-all duration-200 hover:scale-105 active:scale-95 shadow-xl shadow-black/20"
 >
 Yes, Get Started Free
 </button>

 <p className="mt-5 text-white/50 text-xs">
 Free forever plan &nbsp;&nbsp; No credit card &nbsp;&nbsp; 2-minute setup
 </p>
 </div>
 </section>

 {/* Footer */}
 <footer className="border-t border-gray-100 bg-white">
 <div className="max-w-7xl mx-auto px-6 lg:px-8 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
 <div className="flex items-center gap-2">
 <KANKULogo className="w-7 h-7" />
 <span className="text-sm font-bold text-gray-700">KANKU</span>
 </div>
 <p className="text-xs text-gray-400">
 {new Date().getFullYear()} KANKU. All rights reserved.
 </p>
 <div className="flex items-center gap-5">
 {[
 { name: 'Privacy', id: 'privacy' },
 { name: 'Terms', id: 'terms' },
 { name: 'Support', id: 'contact' }
 ].map((link) => (
 <button
 key={link.id}
 onClick={() => onNavigate(link.id)}
 className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
 >
 {link.name}
 </button>
 ))}
 </div>
 </div>
 </footer>

 {/* Keyframe animations (injected via a style tag) */}
 <style>{`
 @keyframes morphBlob {
 0%,100% { border-radius: 40% 60% 70% 30% / 45% 45% 55% 55%; }
 25% { border-radius: 60% 40% 35% 65% / 55% 30% 70% 45%; }
 50% { border-radius: 35% 65% 55% 45% / 60% 55% 45% 40%; }
 75% { border-radius: 55% 45% 65% 35% / 35% 65% 35% 65%; }
 }
 @keyframes fadeSlideUp {
 from { opacity: 0; transform: translateY(28px); }
 to { opacity: 1; transform: translateY(0); }
 }
 @keyframes marquee {
 from { transform: translateX(0); }
 to { transform: translateX(-50%); }
 }
 `}</style>
 </div>
 );
};


