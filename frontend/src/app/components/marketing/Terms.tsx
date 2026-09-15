import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { FileText, Shield, Info, AlertTriangle, Scale, CheckCircle2 } from 'lucide-react';
import { PublicNavbar } from '@/app/components/ui/PublicNavbar';

interface TermsProps {
  onBack?: () => void;
  onGetStarted?: () => void;
  onNavigate?: (page: string) => void;
  onLogin?: () => void;
  hideNavbar?: boolean;
}

export const Terms: React.FC<TermsProps> = ({
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
      title: '1. Acceptance of Terms',
      icon: <Info className="w-5 h-5 text-blue-600" />,
      content:
        'By creating an account or accessing the KANAKU application, you enter into a binding agreement with KANAKU and accept these Terms of Service. If you do not agree, please discontinue using the service immediately.',
    },
    {
      title: '2. Personal Financial Management Scope',
      icon: <Scale className="w-5 h-5 text-indigo-600" />,
      content:
        'KANAKU is provided to assist individuals and households in tracking personal budgets, analyzing expenses, and organizing accounts. You agree not to use the application for illegal purposes, financial fraud, unauthorized credential sharing, or malicious penetration testing.',
    },
    {
      title: '3. Keeping Your Account Secure',
      icon: <Shield className="w-5 h-5 text-emerald-600" />,
      content:
        'You are responsible for keeping your password, 6-digit PIN and devices secure. In guest mode your data exists only on your device, so KANAKU cannot recover it if the device is lost, the app data is cleared, or you are locked out.',
    },
    {
      title: '4. Non-Advisory Financial Disclaimer',
      icon: <AlertTriangle className="w-5 h-5 text-amber-600" />,
      content:
        'Calculations, automated categorizations, and generative insights produced by KANAKU are for informational purposes only. They do not constitute formal fiduciary, investment, legal, or tax advice. Always consult certified financial planners before executing substantial financial transactions.',
    },
    {
      title: '5. Limitation of Liability',
      icon: <FileText className="w-5 h-5 text-rose-600" />,
      content:
        'To the fullest extent permitted by law, KANAKU and its creators shall not be held liable for indirect, incidental, or consequential damages resulting from network interruptions, third-party API disruptions, or personal financial decisions based upon app insights.',
    },
  ];

  return (
    <div className="relative min-h-screen bg-[#FDFEFE] text-slate-900 font-sans select-none overflow-x-hidden">
      {!hideNavbar && (
        <PublicNavbar
          onNavigate={onNavigate}
          onLogin={onLogin}
          onGetStarted={onGetStarted}
          currentPage="terms"
        />
      )}

      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-36 sm:pt-44 lg:pt-48 pb-24">
        {/* Header */}
        <div className="mb-14 text-center">
          <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200 px-3.5 py-1.5 rounded-full text-blue-700 font-extrabold text-xs uppercase tracking-widest mb-4">
            <FileText className="w-3.5 h-3.5" />
            <span>Terms of Service & Usage</span>
          </div>

          <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-slate-900 mb-4">
            Terms & Conditions
          </h1>
          <p className="text-sm sm:text-base text-slate-500 max-w-lg mx-auto">
            Clear, transparent expectations for everyone who uses KANAKU. Last updated: September 2026.
          </p>
        </div>

        {/* Sections */}
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
      </div>

      <footer className="border-t border-slate-200 py-8 text-center text-xs text-slate-400">
        <p>© {new Date().getFullYear()} KANAKU. All rights reserved.</p>
      </footer>
    </div>
  );
};
