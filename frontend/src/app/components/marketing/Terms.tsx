import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { FileText, Shield, Info, AlertTriangle, Scale, Mail } from 'lucide-react';
import { PublicNavbar } from '@/app/components/ui/PublicNavbar';

interface TermsProps {
 onBack?: () => void;
 onGetStarted?: () => void;
 onNavigate?: (page: string) => void;
 onLogin?: () => void;
 hideNavbar?: boolean;
}

export const Terms: React.FC<TermsProps> = ({
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
 title:"1. Acceptance of Terms",
 icon: <Info className="w-5 h-5 text-blue-500" />,
 content:"By accessing and using KANAKU, you accept and agree to be bound by these Terms and Conditions. If you do not agree to these terms, please do not use the application. Your continued use of the service signifies your agreement to any changes we may make."
 },
 {
 title:"2. Use of the Service",
 icon: <Scale className="w-5 h-5 text-indigo-500" />,
 content:"KANAKUis provided for personal financial management purposes only. You agree to use the service responsibly and not to misuse or attempt to gain unauthorized access to any part of the system. We reserve the right to suspend or terminate access for any violation of these terms."
 },
 {
 title:"3. Account Responsibility",
 icon: <Shield className="w-5 h-5 text-green-500" />,
 content:"You are responsible for maintaining the confidentiality of your account credentials and Security PIN. You are liable for all actions taken under your account. KANAKUuses bank-grade encryption, but the security of your device remains your responsibility."
 },
 {
 title:"4. Financial Data Disclaimer",
 icon: <AlertTriangle className="w-5 h-5 text-amber-500" />,
 content:"The application provides tools for tracking and analyzing your finances. It does not constitute certified financial, investment, or tax advice. Always consult a qualified professional before making significant financial decisions."
 },
 {
 title:"5. Limitation of Liability",
 icon: <AlertTriangle className="w-5 h-5 text-red-500" />,
 content:"We are not liable for any loss or damage arising from your use of the app, including but not limited to data loss, financial decisions made based on app data, or service interruptions. The app is provided 'as is' without warranties."
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
 currentPage="terms"
 />
 )}

 <div className="max-w-4xl mx-auto px-6 pt-40 lg:pt-52 pb-24">
 <div className="mb-16 text-center">
 <motion.div
 initial={{ opacity: 0, scale: 0.9 }}
 animate={{ opacity: 1, scale: 1 }}
 className="inline-flex items-center gap-2 bg-blue-50 px-4 py-2 rounded-full text-blue-600 font-bold text-[10px] uppercase tracking-widest mb-6"
 >
 Legal Documentation
 </motion.div>
 <motion.h1
 initial={{ opacity: 0, y: 20 }}
 animate={{ opacity: 1, y: 0 }}
 className="text-4xl lg:text-5xl font-extrabold tracking-tight mb-4"
 >
 Terms & Conditions
 </motion.h1>
 <motion.p
 initial={{ opacity: 0, y: 20 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ delay: 0.1 }}
 className="text-gray-500"
 >
 Last updated: March 2026 - Version 2.0
 </motion.p>
 </div>

 <div className="space-y-6">
 {sections.map((section, idx) => (
 <motion.div
 key={idx}
 initial={{ opacity: 0, y: 20 }}
 animate={{ opacity: 1, y: 0 }}
 transition={{ delay: 0.1 + idx * 0.05 }}
 className="p-8 bg-white rounded-[2.5rem] border border-gray-100 shadow-sm hover:shadow-xl transition-all group"
 >
 <div className="flex items-center gap-4 mb-4">
 <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center group-hover:scale-110 transition-transform">
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
 className="mt-16 p-10 bg-gradient-to-br from-violet-600 to-indigo-700 rounded-[3rem] text-white text-center"
 >
 <Mail className="w-10 h-10 mx-auto mb-6 text-violet-200" />
 <h3 className="text-2xl font-bold mb-4">Questions about these terms?</h3>
 <p className="text-violet-100 mb-8 max-w-md mx-auto">
 Our legal team is here to clarify any points. Drop us a message and we'll get back to you within 24 hours.
 </p>
 <a
 href={import.meta.env.VITE_LEGAL_EMAIL ? `mailto:${import.meta.env.VITE_LEGAL_EMAIL}` : '#'}
 className="inline-flex items-center gap-2 bg-white text-violet-600 px-8 py-4 rounded-2xl font-bold hover:bg-violet-50 transition-colors"
 >
 Contact Legal Team
 </a>
 </motion.div>
 </div>

 <footer className="py-10 border-t border-gray-100 text-center">
 <p className="text-xs text-gray-400"> {new Date().getFullYear()} KANAKU. All rights reserved.</p>
 </footer>
 </div>
 );
};


