import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Check, Shield, Zap, Target, Star, Crown } from 'lucide-react';
import { PublicNavbar } from '@/app/components/ui/PublicNavbar';

interface PricingPageProps {
 onBack: () => void;
 onGetStarted: () => void;
 onNavigate: (page: string) => void;
 onLogin: () => void;
}

export const PricingPage: React.FC<PricingPageProps> = ({ onBack, onGetStarted, onNavigate, onLogin }) => {
 useEffect(() => {
 window.scrollTo(0, 0);
 }, []);

 const plans = [
 {
 name:"Free Forever",
 price:"INR0",
 desc:"Perfect for secondary accounts and casual tracking.",
 features: [
"Unlimited Transactions",
"Up to 3 Bank Accounts",
"Basic AI Insights",
"Target Goal Tracking",
"Manual Data Export",
"Local-Only Storage"
 ],
 cta:"Get Started",
 popular: false,
 color:"blue"
 },
 {
 name:"Pro Master",
 price:"INR199",
 period:"/month",
 desc:"For serious individuals managing complex portfolios.",
 features: [
"Everything in Free",
"Unlimited Accounts",
"Advanced AI Analysis",
"Real-time Market Data",
"Cross-Device Sync",
"Priority Support",
"Auto-Sms Detection"
 ],
 cta:"Try Pro Free",
 popular: true,
 color:"violet"
 },
 {
 name:"Family Suite",
 price:"INR499",
 period:"/month",
 desc:"Shared finances for couples and small households.",
 features: [
"Everything in Pro",
"Up to 5 Users",
"Shared Group Budgets",
"Bill Splitting AI",
"Household Analytics",
"Dedicated Advisor Chat"
 ],
 cta:"Contact Sales",
 popular: false,
 color:"pink"
 }
 ];

 return (
 <div className="min-h-screen bg-white font-sans text-gray-900 select-none">
 {/* Navbar */}
 <PublicNavbar
 onNavigate={onNavigate}
 onLogin={onLogin}
 onGetStarted={onGetStarted}
 currentPage="pricing"
 />

 <section className="pt-40 lg:pt-52 pb-20">
 <div className="max-w-7xl mx-auto px-6 lg:px-8">
 <div className="text-center mb-16">
 <motion.h1
 initial={{ opacity: 0, y: 20 }}
 animate={{ opacity: 1, y: 0 }}
 className="text-4xl lg:text-6xl font-extrabold tracking-tight mb-6"
 >
 Simple, transparent <br />
 <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-pink-500">
 pricing for everyone.
 </span>
 </motion.h1>
 <motion.p
 initial={{ opacity: 0, y: 20 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ delay: 0.1 }}
 className="text-lg text-gray-500"
 >
 Choose the plan that fits your financial journey. No hidden fees, ever.
 </motion.p>
 </div>

 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
 {plans.map((p, i) => (
 <motion.div
 key={i}
 initial={{ opacity: 0, y: 20 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ delay: 0.2 + i * 0.1 }}
 className={`relative bg-white rounded-[2.5rem] p-10 border ${p.popular ? 'border-violet-300 ring-4 ring-violet-50 shadow-2xl shadow-violet-100' : 'border-gray-100 shadow-sm'} flex flex-col`}
 >
 {p.popular && (
 <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-[10px] font-bold uppercase tracking-widest px-4 py-1.5 rounded-full shadow-lg">
 Most Popular
 </div>
 )}

 <div className="mb-8">
 <h3 className="text-xl font-bold mb-2">{p.name}</h3>
 <div className="flex items-baseline gap-1 mb-4">
 <span className="text-4xl font-black">{p.price}</span>
 <span className="text-gray-400 font-medium">{p.period}</span>
 </div>
 <p className="text-sm text-gray-500 leading-relaxed">{p.desc}</p>
 </div>

 <div className="space-y-4 mb-10 flex-1">
 {p.features.map((f, j) => (
 <div key={j} className="flex items-start gap-3">
 <div className={`mt-0.5 w-5 h-5 rounded-full bg-${p.color}-50 flex items-center justify-center shrink-0`}>
 <Check className={`w-3 h-3 text-${p.color}-600`} />
 </div>
 <span className="text-sm text-gray-600">{f}</span>
 </div>
 ))}
 </div>

 <button
 onClick={onGetStarted}
 className={`w-full py-4 rounded-2xl font-bold text-sm transition-all hover:scale-[1.02] active:scale-[0.98] ${p.popular
 ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-xl shadow-violet-200'
 : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
 }`}
 >
 {p.cta}
 </button>
 </motion.div>
 ))}
 </div>
 </div>
 </section>

 {/* Comparisons / Security */}
 <section className="bg-white py-20 lg:py-32">
 <div className="max-w-4xl mx-auto px-6 text-center">
 <Shield className="w-12 h-12 text-violet-600 mx-auto mb-6" />
 <h2 className="text-3xl font-bold mb-4">Security without compromise</h2>
 <p className="text-gray-500 mb-12">
 All plans include bank-grade encryption and regional data compliance.
 Even on our free plan, your data is yours and remains private.
 </p>
 <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
 {['PCI Compliant', 'SSL Encrypted', 'GDPR Ready', 'ISO Certified'].map((item, i) => (
 <div key={i} className="bg-white py-3 px-4 rounded-xl text-xs font-bold text-gray-600 border border-gray-100 uppercase tracking-tight">
 {item}
 </div>
 ))}
 </div>
 </div>
 </section>

 {/* Footer Minimal */}
 <footer className="py-10 border-t border-gray-100 text-center">
 <p className="text-xs text-gray-400"> {new Date().getFullYear()} KANAKU. All rights reserved.</p>
 </footer>
 </div>
 );
};


