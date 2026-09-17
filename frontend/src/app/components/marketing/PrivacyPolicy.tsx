import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Shield, Lock, Eye, Database, HardDrive, CheckCircle2, FileText, ArrowLeft } from 'lucide-react';
import { PublicNavbar } from '@/app/components/ui/PublicNavbar';
import { SUPPORT_EMAIL, supportMailto } from '@/config/support';

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
      title: '1. Where Your Data Lives',
      icon: <HardDrive className="w-5 h-5 text-violet-600" />,
      content:
        'KANAKU is offline-first. Your accounts, transactions, budgets and settings are stored on your device so the app works without a connection. When you sign in, those records also sync to your KANAKU account in our cloud database so they are available on your other devices.',
    },
    {
      title: '2. Information We Process',
      icon: <Database className="w-5 h-5 text-blue-600" />,
      content:
        'To run your account we store your name, email address, a hashed password, and the financial records you add or sync. Receipts and bills you upload are kept in secure cloud storage. On Android, bank SMS detection (only in the directly downloaded app, and only if you enable it) reads messages on your device; the SMS text is not uploaded — only transactions you save are synced.',
    },
    {
      title: '3. AI Features and Service Providers',
      icon: <FileText className="w-5 h-5 text-indigo-600" />,
      content:
        'When you use KAI or bill scanning, the text, voice recording or image you submit, along with the necessary financial context, is sent to AI providers (such as Google Gemini, Groq, OpenRouter, OpenAI, and AI proxy inference partners like xkiro) to process that request. When primary AI models are unavailable or rate-limited, fallback vision models (including community and free tier models via services like xkiro) may analyze receipt images to extract totals and merchants; such third-party providers may log inference requests per their respective privacy terms. You can also toggle On-device OCR in the scanner for 100% private, local processing.',
    },
    {
      title: '4. No Ads, No Data Selling',
      icon: <Eye className="w-5 h-5 text-pink-600" />,
      content:
        'We never sell, rent or share your personal or financial data with advertisers, data brokers or lenders, and KANAKU does not show ads.',
    },
    {
      title: '5. Security',
      icon: <Lock className="w-5 h-5 text-emerald-600" />,
      content:
        'Data travelling between the app and our servers is encrypted over HTTPS. You can lock the app with a 6-digit PIN and, on supported devices, biometrics. Your PIN is never stored in plain text — only a salted, one-way hash is kept. Records stored on your device are protected by your device and browser security, so keep your device locked.',
    },
    {
      title: '6. Your Rights and Choices',
      icon: <Shield className="w-5 h-5 text-amber-600" />,
      content:
        "You can view and edit your records at any time, export reports as PDF or CSV, and permanently delete your account and synced data from your Profile. Depending on where you live, laws such as the GDPR or India's Digital Personal Data Protection Act may give you further rights; contact us to exercise them.",
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
            <span>Your Data, Your Control</span>
          </div>

          <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-slate-900 mb-4">
            Privacy Policy
          </h1>
          <p className="text-sm sm:text-base text-slate-500 max-w-lg mx-auto">
            How KANAKU handles your information. Last updated: September 2026.
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
          <p className="font-bold text-slate-700">Questions about your data or this policy?</p>
          <p>
            Email us at{' '}
            <a
              href={supportMailto('Privacy question')}
              className="text-violet-600 font-bold hover:underline"
            >
              {SUPPORT_EMAIL}
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
