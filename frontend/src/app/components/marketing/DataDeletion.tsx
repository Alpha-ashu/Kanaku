import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Trash2, ShieldAlert, Mail, CheckCircle2, UserX } from 'lucide-react';
import { PublicNavbar } from '@/app/components/ui/PublicNavbar';

interface DataDeletionProps {
  onBack?: () => void;
  onGetStarted?: () => void;
  onNavigate?: (page: string) => void;
  onLogin?: () => void;
  hideNavbar?: boolean;
}

export const DataDeletion: React.FC<DataDeletionProps> = ({
  onGetStarted = () => {},
  onNavigate = () => {},
  onLogin = () => {},
  hideNavbar = false,
}) => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const steps = [
    {
      title: '1. In-App Account Deletion',
      icon: <Trash2 className="w-5 h-5 text-red-500" />,
      content:
        'Log in to Kanaku, open your Profile Settings, scroll to the bottom, and click "Delete Account". All your synced data, accounts, transactions, and cloud backups will be purged immediately.',
    },
    {
      title: '2. Email Request',
      icon: <Mail className="w-5 h-5 text-blue-500" />,
      content:
        'If you cannot log in, send an email to shaik.job.details@gmail.com with the subject "Account & Data Deletion Request" from your registered email address. Our team will verify and execute the deletion within 48 hours.',
    },
    {
      title: '3. Data Purged',
      icon: <CheckCircle2 className="w-5 h-5 text-green-500" />,
      content:
        'All associated personal identifiable information (PII), database records, local caches, and analytical identifiers are permanently destroyed.',
    },
  ];

  return (
    <div className="relative min-h-screen bg-[#FDFEFE] text-slate-900 font-sans select-none overflow-x-hidden">
      {/* Ambient background glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[450px] pointer-events-none overflow-hidden -z-10">
        <div className="absolute top-[-20%] left-1/4 w-[500px] h-[500px] bg-red-100/40 rounded-full blur-3xl" />
        <div className="absolute top-[10%] right-1/4 w-[400px] h-[400px] bg-violet-100/30 rounded-full blur-3xl" />
      </div>

      {!hideNavbar && (
        <PublicNavbar
          onNavigate={onNavigate}
          onLogin={onLogin}
          onGetStarted={onGetStarted}
          currentPage="data-deletion"
        />
      )}

      <div className="max-w-4xl mx-auto px-6 pt-36 lg:pt-48 pb-24">
        <div className="mb-14 text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="inline-flex items-center gap-2 bg-red-50 border border-red-200/60 px-4 py-1.5 rounded-full text-red-600 font-bold text-xs uppercase tracking-widest mb-5"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-red-500" />
            Data Rights & Absolute Control
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl lg:text-5xl font-extrabold tracking-tight text-slate-900 mb-4"
          >
            Account & Data Deletion Policy
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-slate-600 text-base lg:text-lg max-w-xl mx-auto"
          >
            We strictly uphold your right to control, revoke, and permanently delete your personal financial records anytime.
          </motion.p>
        </div>

        <div className="space-y-6">
          {steps.map((step, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + idx * 0.08 }}
              className="p-8 bg-white/80 backdrop-blur-xl rounded-3xl border border-slate-200/80 shadow-sm hover:shadow-md transition-all group"
            >
              <div className="flex items-center gap-4 mb-3">
                <div className="w-11 h-11 rounded-2xl bg-slate-50 border border-slate-100 shadow-sm flex items-center justify-center group-hover:scale-105 transition-transform">
                  {step.icon}
                </div>
                <h2 className="text-xl font-bold text-slate-900">{step.title}</h2>
              </div>
              <p className="text-slate-600 leading-relaxed pl-15 text-sm lg:text-base">{step.content}</p>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-14 p-10 bg-slate-900 rounded-[2.5rem] text-white text-center relative overflow-hidden shadow-2xl border border-slate-800"
        >
          <div className="w-14 h-14 mx-auto mb-5 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
            <UserX className="w-7 h-7" />
          </div>
          <h3 className="text-2xl font-bold mb-3">Immediate Permanent Erasure</h3>
          <p className="text-slate-400 mb-7 max-w-md mx-auto text-sm leading-relaxed">
            Once deletion is initiated, your transaction history, account details, and AI intelligence profile cannot be retrieved or recovered by anyone—including our engineering team.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <div className="px-4 py-2 rounded-xl bg-slate-800/80 border border-slate-700/60 text-xs font-semibold text-slate-300">
              Zero Residual Backups
            </div>
            <div className="px-4 py-2 rounded-xl bg-slate-800/80 border border-slate-700/60 text-xs font-semibold text-slate-300">
              GDPR & DPDP Compliant
            </div>
            <div className="px-4 py-2 rounded-xl bg-slate-800/80 border border-slate-700/60 text-xs font-semibold text-slate-300">
              Immediate Token Revocation
            </div>
          </div>
        </motion.div>
      </div>

      <footer className="py-10 border-t border-slate-200/80 text-center">
        <p className="text-xs text-slate-400 font-medium">
          © {new Date().getFullYear()} KANAKU Technologies. All rights reserved.
        </p>
      </footer>
    </div>
  );
};

