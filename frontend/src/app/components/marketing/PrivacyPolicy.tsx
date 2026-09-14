import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Shield, Lock, Eye, Database, HardDrive, CheckCircle2, FileText, ArrowLeft } from 'lucide-react';
import { PublicNavbar } from '@/app/components/ui/PublicNavbar';

interface PrivacyPolicyProps {
  onBack?: () => void;
  onGetStarted?: () => void;
  onNavigate?: (page: string) => void;
  onLogin?: () => void;
  hideNavbar?: boolean;
}

export const PrivacyPolicy: React.FC<PrivacyPolicyProps> = ({
  onBack = () => {},
  onGetStarted = () => {},
  onNavigate = () => {},
  onLogin = () => {},
  hideNavbar = false,
}) => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const sections = [
    {
      title: '1. Local-First Data Principle',
      icon: <HardDrive className="w-5 h-5 text-violet-600" />,
      content:
        'KANAKU operates under a strict local-first philosophy. Your financial ledger, accounts, budget goals, and personal settings are created and stored directly on your own device in an isolated, sandboxed IndexedDB database. You can manage your finances entirely offline without sending a single byte across the internet.',
    },
    {
      title: '2. Information We Process',
      icon: <Database className="w-5 h-5 text-blue-600" />,
      content:
        'When you register, we collect essential account authentication credentials (your email, name, and hashed credentials). When you enable cloud sync, encrypted database delta snapshots are transmitted via TLS 1.3 to synchronize your data across authorized devices. We do NOT harvest or monitor your private financial habits.',
    },
    {
      title: '3. Zero Data Resale or Advertising',
      icon: <Eye className="w-5 h-5 text-pink-600" />,
      content:
        'We never sell, rent, monetize, or disclose your personal or financial data to third-party advertising brokers, data aggregators, or loan originators. KANAKU is supported strictly through transparent subscription plans, aligning our success directly with your privacy.',
    },
    {
      title: '4. Bank-Grade Encryption & PIN Gateway',
      icon: <Lock className="w-5 h-5 text-emerald-600" />,
      content:
        'Your local database is protected by a client-derived AES-256 master key. Access is gated by your chosen 6-digit PIN and optional biometric lock. We never store your raw PIN on our servers; only a salted, computationally intensive one-way verifier is used.',
    },
    {
      title: '5. GDPR & DPDP Compliance Rights',
      icon: <Shield className="w-5 h-5 text-amber-600" />,
      content:
        'Under applicable privacy statutes including GDPR and the Digital Personal Data Protection (DPDP) Act, you have absolute rights to inspect, export your complete transaction history (via PDF/CSV/JSON), and permanently delete your account and cloud records at any moment.',
    },
  ];

  return (
    <div className="relative min-h-screen bg-[#FDFEFE] text-slate-900 font-sans select-none overflow-x-hidden">
      {!hideNavbar && (
        <PublicNavbar
          onNavigate={onNavigate}
          onLogin={onLogin}
          onGetStarted={onGetStarted}
          currentPage="privacy"
        />
      )}

      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-36 sm:pt-44 lg:pt-48 pb-24">
        {/* Header */}
        <div className="mb-14 text-center">
          <div className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-3.5 py-1.5 rounded-full text-emerald-700 font-extrabold text-xs uppercase tracking-widest mb-4">
            <Shield className="w-3.5 h-3.5" />
            <span>Zero-Knowledge Privacy Architecture</span>
          </div>

          <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-slate-900 mb-4">
            Privacy Policy
          </h1>
          <p className="text-sm sm:text-base text-slate-500 max-w-lg mx-auto">
            Your data belongs exclusively to you. Last updated: September 2026.
          </p>
        </div>

        {/* Section Cards */}
        <div className="space-y-6">
          {sections.map((sec, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="rounded-3xl bg-white border border-slate-200/80 p-6 sm:p-8 shadow-sm hover:shadow-md transition-all"
            >
              <div className="flex items-center gap-3.5 mb-3">
                <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
                  {sec.icon}
                </div>
                <h3 className="text-lg font-bold text-slate-900">{sec.title}</h3>
              </div>
              <p className="text-sm sm:text-base text-slate-600 leading-relaxed pl-12">{sec.content}</p>
            </motion.div>
          ))}
        </div>

        {/* Contact info box */}
        <div className="mt-12 p-6 rounded-3xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-500 space-y-2">
          <p className="font-bold text-slate-700">Questions regarding data protection or compliance?</p>
          <p>
            Reach our Data Protection Officer at{' '}
            <a
              href={`mailto:${import.meta.env.VITE_SUPPORT_EMAIL || 'support@kanaku.in'}`}
              className="text-violet-600 font-bold hover:underline"
            >
              {import.meta.env.VITE_SUPPORT_EMAIL || 'support@kanaku.in'}
            </a>
          </p>
        </div>
      </div>

      <footer className="border-t border-slate-200 py-8 text-center text-xs text-slate-400">
        <p>© {new Date().getFullYear()} KANAKU. Built with pride by Shaik Ashraf K.</p>
      </footer>
    </div>
  );
};
