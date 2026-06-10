import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Shield, Users, Target, Heart, Zap, Globe, Lock } from 'lucide-react';
import { KANAKULogo } from '@/app/components/ui/KANAKULogo';
import { PublicNavbar } from '@/app/components/ui/PublicNavbar';

interface AboutPageProps {
 onBack: () => void;
 onGetStarted: () => void;
 onNavigate: (page: string) => void;
 onLogin: () => void;
}

export const AboutPage: React.FC<AboutPageProps> = ({ onBack, onGetStarted, onNavigate, onLogin }) => {
 useEffect(() => {
 window.scrollTo(0, 0);
 }, []);

 const values = [
 {
 icon: <Shield className="w-6 h-6 text-violet-600" />,
 title:"Security First",
 desc:"We use bank-grade encryption and local-first data storage to ensure your financial life remains private and secure."
 },
 {
 icon: <Zap className="w-6 h-6 text-pink-600" />,
 title:"AI Intelligence",
 desc:"Harnessing the power of AI to provide personalized insights, categorized spending, and smart budgeting advice."
 },
 {
 icon: <Users className="w-6 h-6 text-blue-600" />,
 title:"User Centric",
 desc:"Built with the feedback of thousands of users to ensure the most intuitive and powerful financial management experience."
 },
 {
 icon: <Globe className="w-6 h-6 text-emerald-600" />,
 title:"Offline Sync",
 desc:"Your data stays with you. Work offline and sync seamlessly across all your devices whenever you're connected."
 }
 ];

 const milestones = [
  { year: "November 2025", event: "KANAKU was founded by Shaik Ashraf K to build a secure, local-first finance manager." },
  { year: "Early 2026", event: "Launched advanced AI-powered transaction analysis, offline-first sync engine, and receipt OCR." },
  { year: "Mid 2026", event: "Grown to support cooperative advisor-client planning sessions, live commodity tracking, and group expenses." }
 ];

 return (
 <div className="min-h-screen bg-white font-sans text-gray-900 select-none pb-20">
 {/* Navbar */}
 <PublicNavbar
 onNavigate={onNavigate}
 onLogin={onLogin}
 onGetStarted={onGetStarted}
 currentPage="about"
 />

 {/* Hero Section */}
 <section className="relative pt-40 lg:pt-52 pb-20 overflow-hidden">
 <div className="absolute inset-0 pointer-events-none">
 <div className="absolute top-0 right-0 w-96 h-96 bg-violet-100 rounded-full blur-[120px] opacity-40 -translate-y-1/2 translate-x-1/2" />
 <div className="absolute bottom-0 left-0 w-96 h-96 bg-pink-100 rounded-full blur-[120px] opacity-40 translate-y-1/2 -translate-x-1/2" />
 </div>

 <div className="relative max-w-4xl mx-auto px-6 text-center">
 <motion.h1
 initial={{ opacity: 0, y: 20 }}
 animate={{ opacity: 1, y: 0 }}
 className="text-4xl lg:text-6xl font-extrabold tracking-tight mb-8"
 >
 We're on a mission to <br />
 <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-pink-500">
 democratize financial freedom.
 </span>
 </motion.h1>
    <motion.p
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="text-lg lg:text-xl text-gray-500 leading-relaxed max-w-2xl mx-auto"
    >
      KANAKU was founded in November 2025 by Shaik Ashraf K (Founder & CEO) with a mission to solve the fragmentation and security concerns inherent in personal finance management. Frustrated by complex spreadsheets, clunky banking software, and the fear of cloud data leakage, Shaik envisioned an intelligent, local-first finance companion that puts the user completely in control of their wealth.
    </motion.p>
 </div>
 </section>

 {/* Values Grid */}
 <section className="py-20 bg-white">
 <div className="max-w-7xl mx-auto px-6 lg:px-8">
 <div className="text-center mb-16">
 <h2 className="text-3xl font-bold mb-4">Our Core Values</h2>
 <div className="w-12 h-1.5 bg-violet-600 mx-auto rounded-full" />
 </div>
 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
 {values.map((v, i) => (
 <motion.div
 key={i}
 initial={{ opacity: 0, y: 20 }}
 whileInView={{ opacity: 1, y: 0 }}
 viewport={{ once: true }}
 transition={{ delay: i * 0.1 }}
 className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 hover:shadow-xl hover:shadow-gray-200/50 transition-all"
 >
 <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center mb-6">
 {v.icon}
 </div>
 <h3 className="text-lg font-bold mb-3">{v.title}</h3>
 <p className="text-sm text-gray-500 leading-relaxed">{v.desc}</p>
 </motion.div>
 ))}
 </div>
 </div>
 </section>

 {/* Story / Timeline */}
 <section className="py-20 lg:py-32">
 <div className="max-w-3xl mx-auto px-6">
 <div className="text-center mb-16">
 <h2 className="text-3xl font-bold mb-4">Our Story</h2>
 <p className="text-gray-500">How we grew from a small idea to a global platform.</p>
 </div>
 <div className="relative border-l-2 border-gray-100 ml-4 space-y-12">
 {milestones.map((m, i) => (
 <div key={i} className="relative pl-10">
 <div className="absolute left-[-9px] top-2 w-4 h-4 rounded-full bg-violet-600 border-4 border-white shadow-sm" />
 <span className="text-sm font-bold text-violet-600">{m.year}</span>
 <p className="mt-2 text-lg text-gray-700 font-medium leading-relaxed">{m.event}</p>
 </div>
 ))}
 </div>
 </div>
 </section>

 {/* Team CTA */}
 <section className="py-20">
 <div className="max-w-7xl mx-auto px-6 lg:px-8">
 <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-[3rem] p-10 lg:p-20 flex flex-col items-center text-center text-white overflow-hidden relative">
 <div className="absolute bottom-0 right-0 w-64 h-64 bg-violet-500/20 rounded-full blur-3xl" />
 <KANAKULogo className="w-16 h-16 mb-6 mx-auto" />
 <h2 className="text-3xl lg:text-5xl font-bold mb-6">Join the Revolution</h2>
 <p className="text-gray-400 max-w-xl mx-auto mb-10 text-lg">
 Start managing your wealth smarter today. Join over 50k users who trust KANAKUfor their financial journey.
 </p>
 <button
 onClick={onGetStarted}
 className="px-8 py-4 rounded-full bg-white text-gray-900 font-bold text-sm lg:text-base hover:bg-gray-100 transition-all hover:scale-105 active:scale-95 shadow-xl shadow-black/20"
 >
 Get Started for Free
 </button>
 </div>
 </div>
 </section>

  {/* Footer Minimal */}
  <footer className="py-12 border-t border-gray-100 text-center bg-gray-50/50">
    <div className="max-w-4xl mx-auto px-6 text-sm text-gray-400 space-y-2">
      <p className="font-semibold text-gray-600">Project Created By: Shaik Ashraf K</p>
      <p>Initial Project Creation: November 2025 | Organization: KANAKU</p>
      <p className="text-xs text-gray-400">© {new Date().getFullYear()} KANAKU. All rights reserved by KANAKU.</p>
    </div>
  </footer>
 </div>
 );
};
