import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Shield, Lock, Eye, Cloud, Database, Mail, HardDrive } from 'lucide-react';
import { PublicNavbar } from '@/app/components/ui/PublicNavbar';

interface PrivacyPolicyProps {
 onBack?: () => void;
 onGetStarted?: () => void;
 onNavigate?: (page: string) => void;
 onLogin?: () => void;
 hideNavbar?: boolean;
}

export const PrivacyPolicy: React.FC<PrivacyPolicyProps> = ({
 onBack = () => { },
 onGetStarted = () => { },
 onNavigate = () => { },
 onLogin = () => { },
 hideNavbar = false
}) => {
 useEffect(() => {
 window.scrollTo(0, 0);
 }, []);

 const sections = [
 {
 title:"1. Data Collection",
 icon: <Database className="w-5 h-5 text-blue-500" />,
 content:"We collect information you provide directly, such as your profile details and financial transactions. We also collect device information to ensure security and cross-device synchronization. Your financial data is encrypted and handled with the highest level of confidentiality."
 },
 {
 title:"2. How We Use Data",
 icon: <Eye className="w-5 h-5 text-indigo-500" />,
 content:"Your data is used solely to provide and improve KANKUservices, including AI-powered financial insights, personalized budgeting, and secure data sync. We DO NOT sell your personal or financial information to third parties."
 },
 {
 title:"3. Data Storage & Security",
 icon: <Lock className="w-5 h-5 text-green-500" />,
 content:"We use bank-grade AES-256 encryption for all data storage. For local-first operations, data is stored securely on your device. Cloud synchronization uses encrypted channels to our protected Supabase infrastructure."
 },
 {
 title:"4. Your Privacy Rights",
 icon: <Shield className="w-5 h-5 text-amber-500" />,
 content:"You have the right to access, export, or delete your data at any time through the app settings. We comply with GDPR and other regional privacy regulations to ensure your data remains under your control."
 },
 {
 title:"5. Offline Sync",
 icon: <HardDrive className="w-5 h-5 text-pink-500" />,
 content:"KANKUoperates with a local-first philosophy. This means your data is primary on your device, ensuring privacy even when you're not connected to the internet."
 }
 ];

 return (
 <div className="min-h-screen bg-white font-sans text-gray-900 select-none pb-20">
 {/* Navbar */}
 {!hideNavbar && (
 <PublicNavbar
 onNavigate={onNavigate}
 onLogin={onLogin}
 onGetStarted={onGetStarted}
 currentPage="privacy"
 />
 )}

 <div className="max-w-4xl mx-auto px-6 pt-40 lg:pt-52 pb-24">
 <div className="mb-16 text-center">
 <motion.div
 initial={{ opacity: 0, scale: 0.9 }}
 animate={{ opacity: 1, scale: 1 }}
 className="inline-flex items-center gap-2 bg-green-50 px-4 py-2 rounded-full text-green-600 font-bold text-[10px] uppercase tracking-widest mb-6"
 >
 Privacy Commitment
 </motion.div>
 <motion.h1
 initial={{ opacity: 0, y: 20 }}
 animate={{ opacity: 1, y: 0 }}
 className="text-4xl lg:text-5xl font-extrabold tracking-tight mb-4"
 >
 Privacy Policy
 </motion.h1>
 <motion.p
 initial={{ opacity: 0, y: 20 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ delay: 0.1 }}
 className="text-gray-500"
 >
 Your data is yours. We're just here to help you manage it.
 </motion.p>
 </div>

 <div className="space-y-6">
 {sections.map((section, idx) => (
 <motion.div
 key={idx}
 initial={{ opacity: 0, y: 20 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ delay: 0.1 + idx * 0.05 }}
 className="p-8 bg-white/50 rounded-[2.5rem] border border-gray-100/50 hover:bg-white hover:shadow-xl hover:border-white transition-all group"
 >
 <div className="flex items-center gap-4 mb-4">
 <div className="w-10 h-10 rounded-2xl bg-white shadow-sm flex items-center justify-center group-hover:scale-110 transition-transform">
 {section.icon}
 </div>
 <h2 className="text-xl font-bold text-gray-900">{section.title}</h2>
 </div>
 <p className="text-gray-600 leading-relaxed pl-14">
 {section.content}
 </p>
 </motion.div>
 ))}
 </div>

 <motion.div
 initial={{ opacity: 0 }}
 animate={{ opacity: 1 }}
 transition={{ delay: 0.5 }}
 className="mt-16 p-10 bg-gray-900 rounded-[3rem] text-white text-center relative overflow-hidden"
 >
 <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
 <div className="absolute -top-[50%] -left-[20%] w-[100%] h-[100%] bg-blue-500 rounded-full blur-[120px]" />
 <div className="absolute -bottom-[50%] -right-[20%] w-[100%] h-[100%] bg-purple-500 rounded-full blur-[120px]" />
 </div>

 <Lock className="w-10 h-10 mx-auto mb-6 text-gray-400" />
 <h3 className="text-2xl font-bold mb-4">Secure by Design</h3>
 <p className="text-gray-400 mb-8 max-w-md mx-auto">
 We believe privacy is a fundamental right. KANKUis built from the ground up to be the most private financial tool you've ever used.
 </p>
 <div className="flex items-center justify-center gap-4">
 <div className="px-4 py-2 rounded-xl border border-gray-800 text-xs font-bold text-gray-500 uppercase tracking-widest">End-to-End Encrypted</div>
 <div className="px-4 py-2 rounded-xl border border-gray-800 text-xs font-bold text-gray-500 uppercase tracking-widest">Local First</div>
 </div>
 </motion.div>
 </div>

 <footer className="py-10 border-t border-gray-100 text-center">
 <p className="text-xs text-gray-400"> {new Date().getFullYear()} KANKU. All rights reserved.</p>
 </footer>
 </div>
 );
};


